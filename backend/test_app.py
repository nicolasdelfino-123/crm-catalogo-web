import pytest
from datetime import date
from app import create_app
from models import db, Client, Payment, User, ClientCredential
from routes import advance_service_stage, sync_service_stages

@pytest.fixture()
def app():
    app = create_app({"TESTING": True, "AUTH_DISABLED": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "JWT_SECRET_KEY": "test-secret-key-with-at-least-32-chars"})
    with app.app_context(): db.create_all()
    return app


@pytest.fixture()
def client(app):
    return app.test_client()

def test_health(client): assert client.get("/api/health").status_code == 200


def test_message_logs_can_be_created_listed_and_deleted(client):
    created = client.post("/api/messages", json={
        "sent_date": "2026-07-21", "channel": "business_whatsapp",
        "quantity": 14, "notes": "Primera tanda",
    })
    assert created.status_code == 201
    message_id = created.get_json()["data"]["id"]
    listed = client.get("/api/messages").get_json()["data"]
    assert listed[0]["quantity"] == 14
    assert listed[0]["channel"] == "business_whatsapp"
    assert client.delete(f"/api/messages/{message_id}").status_code == 200
    assert client.get("/api/messages").get_json()["data"] == []


def test_monthly_message_total_uses_selected_month(client):
    created = client.post("/api/messages", json={
        "entry_type": "monthly", "month": "2026-04",
        "channel": "business_instagram", "quantity": 320,
    })
    assert created.status_code == 201
    data = created.get_json()["data"]
    assert data["sent_date"] == "2026-04-01"
    assert data["entry_type"] == "monthly"
    updated = client.patch(f'/api/messages/{data["id"]}', json={
        "entry_type": "monthly", "month": "2026-05",
        "channel": "business_whatsapp", "quantity": 450,
    })
    assert updated.status_code == 200
    assert updated.get_json()["data"]["sent_date"] == "2026-05-01"
    assert updated.get_json()["data"]["quantity"] == 450


def test_expenses_monthly_balance_uses_paid_ars_income(client):
    today = date.today()
    month = today.strftime("%Y-%m")
    created_client = client.post("/api/clients", json={
        "name": "Cliente balance", "business_name": "Balance SA",
        "signup_date": today.isoformat(), "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    client.post(f'/api/clients/{created_client["id"]}/payments', json={
        "amount": 100000, "currency": "ARS", "status": "paid", "payment_type": "extra_work",
    })
    client.post(f'/api/clients/{created_client["id"]}/payments', json={
        "amount": 500, "currency": "USD", "status": "paid", "payment_type": "extra_work",
    })
    expense = client.post("/api/expenses", json={
        "expense_date": today.isoformat(), "category": "server",
        "description": "Servidor", "amount": 25000,
    })
    assert expense.status_code == 201
    expense_id = expense.get_json()["data"]["id"]

    result = client.get(f"/api/expenses?month={month}").get_json()["data"]
    assert result["summary"] == {
        "income_ars": 100000.0, "expenses_ars": 25000.0, "balance_ars": 75000.0,
    }
    updated = client.patch(f"/api/expenses/{expense_id}", json={"amount": 30000})
    assert updated.status_code == 200
    assert updated.get_json()["data"]["amount"] == 30000.0
    assert client.delete(f"/api/expenses/{expense_id}").status_code == 200


def test_vps_assignments_support_clients_and_custom_apps(client):
    customer = client.post("/api/clients", json={
        "name": "Cliente VPS", "business_name": "Tienda VPS",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    assigned = client.post("/api/vps", json={"vps_name": "vape", "client_id": customer["id"]})
    assert assigned.status_code == 201
    assignment_id = assigned.get_json()["data"]["id"]
    custom = client.post("/api/vps", json={
        "vps_name": "shatha", "custom_name": "Aplicación interna",
    })
    assert custom.status_code == 201

    duplicate = client.post("/api/vps", json={"vps_name": "shatha", "client_id": customer["id"]})
    assert duplicate.status_code == 422
    moved = client.patch(f"/api/vps/{assignment_id}", json={"vps_name": "shatha"})
    assert moved.status_code == 200
    listed = client.get("/api/vps").get_json()["data"]
    assert listed["counts"] == {"vape": 0, "shatha": 2}
    assert {item["name"] for item in listed["items"]} == {"Cliente VPS", "Aplicación interna"}
    assert client.delete(f"/api/vps/{assignment_id}").status_code == 200


def test_login_and_protected_api():
    secured_app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-secret-key-with-at-least-32-chars",
    })
    with secured_app.app_context():
        db.create_all()
        from flask_bcrypt import generate_password_hash
        db.session.add(User(
            email="admin@example.com", password=generate_password_hash("secreto").decode(),
            name="Admin", role="admin", is_admin=True,
        ))
        db.session.commit()

    secured_client = secured_app.test_client()
    assert secured_client.get("/api/clients").status_code == 401
    login = secured_client.post("/auth/login-persistent", json={
        "email": "ADMIN@example.com", "password": "secreto",
    })
    assert login.status_code == 200
    token = login.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert secured_client.get("/user/me", headers=headers).get_json()["is_admin"] is True
    assert secured_client.get("/api/clients", headers=headers).status_code == 200


def test_login_rejects_invalid_password():
    secured_app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-secret-key-with-at-least-32-chars",
    })
    with secured_app.app_context():
        db.create_all()
        from werkzeug.security import generate_password_hash
        db.session.add(User(email="admin@example.com", password=generate_password_hash("correcta"), name="Admin", role="admin", is_admin=True))
        db.session.commit()
    response = secured_app.test_client().post("/auth/login-persistent", json={"email": "admin@example.com", "password": "incorrecta"})
    assert response.status_code == 401


def test_create_admin_command(app):
    result = app.test_cli_runner().invoke(args=["create-admin"], input="nuevo@example.com\nNuevo Admin\nsegura123\nsegura123\n")
    assert result.exit_code == 0
    with app.app_context():
        user = User.query.filter_by(email="nuevo@example.com").one()
        assert user.is_admin is True

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


def test_client_accepts_no_signup_status(client):
    created = client.post("/api/clients", json={
        "name": "Cliente sin alta",
        "business_name": "Marca pendiente",
        "signup_date": "2026-07-01",
        "country": "Argentina",
        "currency": "ARS",
        "status": "no_signup",
    })

    assert created.status_code == 201
    assert created.get_json()["data"]["status"] == "no_signup"
    filtered = client.get("/api/clients?status=no_signup").get_json()["data"]
    assert filtered["pagination"]["total"] == 1


def test_clients_can_be_filtered_by_cancelled_status(client):
    client.post("/api/clients", json={
        "name": "Cliente cancelado", "business_name": "Marca cancelada",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
        "status": "cancelled",
    })
    filtered = client.get("/api/clients?status=cancelled").get_json()["data"]
    assert filtered["pagination"]["total"] == 1
    assert filtered["items"][0]["status"] == "cancelled"


def test_monthly_forecast_includes_only_billable_client_statuses(client):
    cases = [
        ("Activo ARS", "active", "ARS", 30000),
        ("En riesgo ARS", "at_risk", "ARS", 20000),
        ("Sin alta USD", "no_signup", "USD", 50),
        ("Pausado", "paused", "ARS", 90000),
        ("Cancelado", "cancelled", "ARS", 80000),
        ("Sin importe", "active", "ARS", 0),
    ]
    for name, status, currency, amount in cases:
        client.post("/api/clients", json={
            "name": name, "business_name": name, "signup_date": "2026-07-01",
            "country": "Argentina", "currency": currency,
            "payment_amount": amount, "status": status,
        })
    forecast = client.get("/api/payments/monthly-forecast").get_json()["data"]
    assert forecast["totals"] == {"ARS": 50000.0, "USD": 50.0}
    assert {item["name"] for item in forecast["items"]} == {"Activo ARS", "En riesgo ARS", "Sin alta USD"}


def test_client_credentials_are_encrypted_and_loaded_separately(client, app):
    created = client.post("/api/clients", json={
        "name": "Cliente Acceso", "business_name": "Marca Acceso",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    client_id = created["id"]

    saved = client.put(f"/api/clients/{client_id}/credentials", json={
        "username": "cliente@example.com", "password": "clave-muy-secreta",
    })
    assert saved.status_code == 200
    assert saved.get_json()["data"]["username"] == "cliente@example.com"

    detail = client.get(f"/api/clients/{client_id}").get_json()["data"]
    assert "password" not in detail
    assert "credential" not in detail

    loaded = client.get(f"/api/clients/{client_id}/credentials").get_json()["data"]
    assert loaded["username"] == "cliente@example.com"
    assert loaded["password"] == "clave-muy-secreta"
    with app.app_context():
        stored = ClientCredential.query.filter_by(client_id=client_id).one()
        assert "cliente@example.com" not in stored.username_encrypted
        assert "clave-muy-secreta" not in stored.password_encrypted

    assert client.delete(f"/api/clients/{client_id}/credentials").status_code == 200
    assert client.get(f"/api/clients/{client_id}/credentials").get_json()["data"]["has_credentials"] is False


def test_acquisition_summary_includes_client_details(client):
    client.post("/api/clients", json={
        "name": "Cliente Instagram", "business_name": "Marca Instagram",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
        "payment_amount": 30000, "acquisition_source": "business_instagram",
    })

    response = client.get("/api/dashboard/acquisition")
    assert response.status_code == 200
    data = response.get_json()["data"]
    channel = next(item for item in data["items"] if item["source"] == "business_instagram")
    assert channel["active_count"] == 1
    assert channel["clients"][0]["name"] == "Cliente Instagram"
    assert channel["clients"][0]["signup_date"] == "2026-07-01"


def test_new_clients_can_be_filtered_by_month(client):
    for name, signup_date in [("Cliente junio", "2026-06-15"), ("Cliente julio", "2026-07-10")]:
        client.post("/api/clients", json={
            "name": name, "business_name": name, "signup_date": signup_date,
            "country": "Argentina", "currency": "ARS",
        })

    june = client.get("/api/dashboard/new-clients?month=2026-06")
    assert june.status_code == 200
    assert [item["name"] for item in june.get_json()["data"]] == ["Cliente junio"]
    assert client.get("/api/dashboard/new-clients?month=junio").status_code == 422


def test_operational_statuses(client):
    created = client.post("/api/clients", json={
        "name": "Cliente Operativo", "business_name": "Marca Operativa",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]
    detail = client.get(f'/api/clients/{created["id"]}').get_json()["data"]
    assert detail["google_analytics_status"] == "no"
    assert detail["story_status"] == "no"
    assert detail["qr_generated_status"] == "no"
    assert detail["carousel_installed_status"] == "no"
    assert detail["coupon_status"] == "no"
    assert detail["best_sellers_status"] == "no"

    updated = client.patch(f'/api/clients/{created["id"]}', json={
        "google_analytics_status": "yes", "qr_generated_status": "yes",
        "story_status": "yes",
        "carousel_installed_status": "yes", "coupon_status": "yes",
        "best_sellers_status": "yes",
    }).get_json()["data"]
    assert updated["google_analytics_status"] == "yes"
    assert updated["story_status"] == "yes"
    assert updated["qr_generated_status"] == "yes"
    assert updated["carousel_installed_status"] == "yes"
    assert updated["coupon_status"] == "yes"
    assert updated["best_sellers_status"] == "yes"

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


def test_general_table_sorts_by_signup_day_ignoring_month_and_year(client):
    common = {"country": "Argentina", "currency": "ARS"}
    for name, signup_date in [
        ("Día veinte", "2024-01-20"),
        ("Día dos", "2026-12-02"),
        ("Día once", "2025-06-11"),
    ]:
        assert client.post("/api/clients", json={
            **common, "name": name, "business_name": name, "signup_date": signup_date,
        }).status_code == 201

    ascending = client.get("/api/clients?sort_by=billing_day&sort_dir=asc").get_json()["data"]["items"]
    descending = client.get("/api/clients?sort_by=billing_day&sort_dir=desc").get_json()["data"]["items"]

    assert [item["name"] for item in ascending] == ["Día dos", "Día once", "Día veinte"]
    assert [item["name"] for item in descending] == ["Día veinte", "Día once", "Día dos"]


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


def test_monthly_collections_only_exist_as_calendar_projections(client, app):
    with app.app_context():
        existing = Client(
            name="Cliente existente", business_name="Existente", signup_date=date(2026, 7, 10),
            next_renewal_date=date(2026, 8, 10), country="Argentina", currency="ARS", status="active",
        )
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id

    manual_actions = client.get("/api/actions?view=all&status=pending").get_json()["data"]
    august = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]
    charges = [action for action in august if action["title"] == "Cobrar a Cliente existente"]

    assert not any(action["title"] == "Cobrar a Cliente existente" for action in manual_actions)
    assert len(charges) == 1
    assert charges[0]["due_date"] == "2026-08-10"

    payment = client.post(f"/api/clients/{existing_id}/payments", json={
        "amount": 1000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-08-10", "status": "pending",
    }).get_json()["data"]
    client.patch(f'/api/payments/{payment["id"]}', json={"status": "paid"})

    september = client.get("/api/actions?view=calendar&month=2026-09&status=pending").get_json()["data"]
    completed = client.get("/api/actions?view=all&status=completed").get_json()["data"]
    next_charge = [action for action in september if action["title"] == "Cobrar a Cliente existente"]

    assert len(next_charge) == 1 and next_charge[0]["due_date"] == "2026-09-10"
    assert not any(action["title"] == "Cobrar a Cliente existente" for action in completed)


def test_scheduled_monthly_payment_suppresses_charge_but_extra_work_does_not(client):
    customer = client.post("/api/clients", json={
        "name": "Gustavo", "business_name": "Gustavo", "signup_date": "2026-05-15",
        "next_renewal_date": "2026-06-15", "country": "Argentina", "currency": "ARS",
        "generate_schedule": False,
    }).get_json()["data"]

    client.post(f'/api/clients/{customer["id"]}/payments', json={
        "amount": 5000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-06-01", "status": "pending",
    })
    pending = client.get("/api/actions?view=all&status=pending").get_json()["data"]
    assert not any(action["title"] == "Cobrar a Gustavo" for action in pending)

    monthly_payment = client.get("/api/payments").get_json()["data"][0]
    client.delete(f'/api/payments/{monthly_payment["id"]}')
    client.post(f'/api/clients/{customer["id"]}/payments', json={
        "amount": 2500, "currency": "ARS", "payment_type": "extra_work",
        "due_date": "2026-06-05", "status": "paid",
    })
    june = client.get("/api/actions?view=calendar&month=2026-06&status=pending").get_json()["data"]
    charge = [action for action in june if action["title"] == "Cobrar a Gustavo"]
    assert len(charge) == 1 and charge[0]["due_date"] == "2026-06-15"


def test_early_payment_moves_charge_to_next_month_on_signup_day(client):
    customer = client.post("/api/clients", json={
        "name": "Gustavo", "business_name": "Gustavo", "signup_date": "2026-05-15",
        "next_renewal_date": "2026-07-15", "country": "Argentina", "currency": "ARS",
        "generate_schedule": False,
    }).get_json()["data"]
    client.post(f'/api/clients/{customer["id"]}/payments', json={
        "amount": 5000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-07-01", "status": "paid",
    })

    july = client.get("/api/actions?view=calendar&month=2026-07&status=pending").get_json()["data"]
    august = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]
    updated = client.get(f'/api/clients/{customer["id"]}').get_json()["data"]

    assert not any(action["title"] == "Cobrar a Gustavo" for action in july)
    august_charge = [action for action in august if action["title"] == "Cobrar a Gustavo"]
    assert len(august_charge) == 1 and august_charge[0]["due_date"] == "2026-08-15"
    assert updated["next_renewal_date"] == "2026-08-15"


def test_existing_payment_in_same_month_advances_calendar_to_signup_day(client, app):
    with app.app_context():
        gustavo = Client(
            name="Gustavo", business_name="Gustavo", signup_date=date(2026, 6, 26),
            next_renewal_date=date(2026, 7, 26), country="Argentina", currency="ARS", status="active",
        )
        db.session.add(gustavo)
        db.session.flush()
        db.session.add(Payment(
            client=gustavo, amount=5000, currency="ARS", payment_type="monthly",
            due_date=date(2026, 7, 6), status="paid",
        ))
        db.session.commit()

    july = client.get("/api/actions?view=calendar&month=2026-07&status=pending").get_json()["data"]
    august = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]

    assert not any(action["title"] == "Cobrar a Gustavo" for action in july)
    charge = [action for action in august if action["title"] == "Cobrar a Gustavo"]
    assert len(charge) == 1 and charge[0]["due_date"] == "2026-08-26"


def test_calendar_projects_future_charges_and_hides_scheduled_month(client):
    customer = client.post("/api/clients", json={
        "name": "Calendario anual", "business_name": "Calendario anual",
        "signup_date": "2026-01-31", "country": "Argentina", "currency": "ARS",
        "generate_schedule": False,
    }).get_json()["data"]

    february = client.get("/api/actions?view=calendar&month=2026-02&status=pending").get_json()["data"]
    august = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]
    assert any(action["title"] == "Cobrar a Calendario anual" and action["due_date"] == "2026-02-28" for action in february)
    assert any(action["title"] == "Cobrar a Calendario anual" and action["due_date"] == "2026-08-31" for action in august)

    client.post(f'/api/clients/{customer["id"]}/payments', json={
        "amount": 5000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-08-04", "status": "pending",
    })
    august_after_payment = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]
    september = client.get("/api/actions?view=calendar&month=2026-09&status=pending").get_json()["data"]

    assert not any(action["title"] == "Cobrar a Calendario anual" for action in august_after_payment)
    assert any(action["title"] == "Cobrar a Calendario anual" and action["due_date"] == "2026-09-30" for action in september)


def test_standalone_action_appears_in_calendar_and_can_be_completed(client):
    created = client.post("/api/standalone-actions", json={
        "context_name": "Trámite interno", "title": "Presentar documentación",
        "due_date": "2026-08-20", "priority": "high",
    })
    assert created.status_code == 201
    action = created.get_json()["data"]

    pending = client.get("/api/actions?view=calendar&month=2026-08&status=pending").get_json()["data"]
    assert any(item["id"] == action["id"] and item["client_name"] == "Trámite interno" for item in pending)

    action_id = action["id"].replace("standalone-", "")
    edited = client.patch(f"/api/standalone-actions/{action_id}", json={
        "context_name": "Proveedor externo", "title": "Enviar documentación",
        "due_date": "2026-09-02", "priority": "urgent",
    }).get_json()["data"]
    assert edited["client_name"] == "Proveedor externo"
    assert edited["title"] == "Enviar documentación"
    assert edited["due_date"] == "2026-09-02"

    client.patch(f"/api/standalone-actions/{action_id}", json={"status": "completed"})
    completed = client.get("/api/actions?view=calendar&month=2026-09&status=completed").get_json()["data"]
    assert any(item["id"] == action["id"] for item in completed)
