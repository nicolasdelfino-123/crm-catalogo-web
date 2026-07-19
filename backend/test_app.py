import pytest
from datetime import date
from app import create_app
from models import db, Client
from routes import advance_service_stage, sync_service_stages

@pytest.fixture()
def app():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context(): db.create_all()
    return app


@pytest.fixture()
def client(app):
    return app.test_client()

def test_health(client): assert client.get("/api/health").status_code == 200

def test_create_and_list_client(client):
    payload = {"name": "Cliente Prueba", "business_name": "Marca Prueba", "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS", "payment_amount": 30000}
    created = client.post("/api/clients", json=payload)
    assert created.status_code == 201
    assert created.get_json()["data"]["next_renewal_date"] == "2026-08-01"
    response = client.get("/api/clients?search=Marca").get_json()
    assert response["data"]["pagination"]["total"] == 1

    payment = client.post(f'/api/clients/{created.get_json()["data"]["id"]}/payments', json={"amount": 30000, "currency": "ARS"})
    assert payment.status_code == 201
    assert payment.get_json()["data"]["due_date"] == "2026-08-01"

def test_service_stage_changes_only_on_monthly_date():
    customer = Client(name="Etapas", business_name="Prueba", signup_date=date(2026, 1, 31), service_stage="second_month")
    advance_service_stage(customer, date(2026, 2, 27))
    assert customer.service_stage == "first_month"
    advance_service_stage(customer, date(2026, 2, 28))
    assert customer.service_stage == "second_month"
    advance_service_stage(customer, date(2026, 3, 31))
    assert customer.service_stage == "third_month"
    advance_service_stage(customer, date(2026, 7, 31))
    assert customer.service_stage == "month_7"


def test_service_stage_uses_next_renewal_date(client):
    created = client.post("/api/clients", json={
        "name": "Cliente Etapa", "business_name": "Marca Etapa",
        "signup_date": "2026-01-15", "next_renewal_date": "2026-05-15",
        "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    assert created["service_stage"] == "month_4"


def test_monthly_payment_advances_renewal_and_stage(client):
    created = client.post("/api/clients", json={
        "name": "Jonathan", "business_name": "Negocio Jonathan",
        "signup_date": "2026-06-04", "next_renewal_date": "2026-07-04",
        "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    payment = client.post(f'/api/clients/{created["id"]}/payments', json={
        "amount": 30000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-07-04", "status": "pending",
    }).get_json()["data"]

    client.patch(f'/api/payments/{payment["id"]}', json={"status": "paid"})
    updated = client.get(f'/api/clients/{created["id"]}').get_json()["data"]

    assert updated["next_renewal_date"] == "2026-08-04"
    assert updated["service_stage"] == "second_month"


def test_general_table_syncs_every_client(app):
    with app.app_context():
        first = Client(
            name="Primero", business_name="Primero", signup_date=date(2026, 1, 1),
            next_renewal_date=date(2026, 3, 1), country="Argentina", currency="ARS",
            service_stage="first_month",
        )
        second = Client(
            name="Segundo", business_name="Segundo", signup_date=date(2026, 1, 1),
            next_renewal_date=date(2026, 4, 1), country="Argentina", currency="ARS",
            service_stage="first_month",
        )
        db.session.add_all([first, second])
        db.session.commit()

        sync_service_stages([first, second])

        assert first.service_stage == "second_month"
        assert second.service_stage == "third_month"


def test_general_table_sorts_stages_by_month(client):
    common = {"country": "Argentina", "currency": "ARS"}
    for name, renewal in [
        ("Mes cinco", "2026-06-01"),
        ("Mes uno", "2026-02-01"),
        ("Mes cuatro", "2026-05-01"),
        ("Mes tres", "2026-04-01"),
        ("Mes dos", "2026-03-01"),
    ]:
        response = client.post("/api/clients", json={
            **common, "name": name, "business_name": name,
            "signup_date": "2026-01-01", "next_renewal_date": renewal,
        })
        assert response.status_code == 201

    ascending = client.get("/api/clients?sort_by=service_stage&sort_dir=asc").get_json()["data"]["items"]
    descending = client.get("/api/clients?sort_by=service_stage&sort_dir=desc").get_json()["data"]["items"]

    assert [item["name"] for item in ascending] == ["Mes uno", "Mes dos", "Mes tres", "Mes cuatro", "Mes cinco"]
    assert [item["name"] for item in descending] == ["Mes cinco", "Mes cuatro", "Mes tres", "Mes dos", "Mes uno"]


def test_editing_client_counts_updates_account_evolution(client):
    created = client.post("/api/clients", json={
        "name": "Cliente Métricas", "business_name": "Marca Métricas",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]

    updated = client.patch(f'/api/clients/{created["id"]}', json={
        "followers_count": 125, "publications_count": 18,
    })

    assert updated.status_code == 200
    data = updated.get_json()["data"]
    assert data["followers_count"] == 125
    assert data["publications_count"] == 18
    assert len(data["metrics"]) == 1
    assert data["metrics"][0]["followers_count"] == 125
    assert data["metrics"][0]["publications_count"] == 18

    updated_again = client.patch(f'/api/clients/{created["id"]}', json={
        "followers_count": 130, "publications_count": 20,
    }).get_json()["data"]
    assert len(updated_again["metrics"]) == 1
    assert updated_again["metrics"][0]["followers_count"] == 130


def test_actions_can_be_filtered_as_pending_or_completed(client):
    customer = client.post("/api/clients", json={
        "name": "Agenda", "business_name": "Agenda", "signup_date": "2026-07-01",
        "country": "Argentina", "currency": "ARS", "generate_schedule": False,
    }).get_json()["data"]
    action_ids = []
    for title in ["Pendiente", "En curso", "Completada"]:
        action = client.post(f'/api/clients/{customer["id"]}/actions', json={
            "title": title, "due_date": date.today().isoformat(),
        }).get_json()["data"]
        action_ids.append(action["id"])
    client.patch(f"/api/actions/{action_ids[1]}", json={"status": "in_progress"})
    client.patch(f"/api/actions/{action_ids[2]}", json={"status": "completed"})

    pending = client.get("/api/actions?view=today&status=pending").get_json()["data"]
    completed = client.get("/api/actions?view=today&status=completed").get_json()["data"]

    assert {action["title"] for action in pending} == {"Pendiente", "En curso"}
    assert [action["title"] for action in completed] == ["Completada"]
