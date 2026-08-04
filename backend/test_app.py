import calendar
import pytest
from datetime import date, datetime, timedelta
from app import create_app
from models import db, Client, ClientAction, Payment, User, ClientCredential


def test_cancelled_client_pending_items_are_hidden_from_dashboard_and_calendar(client, app):
    yesterday = date.today() - timedelta(days=1)
    with app.app_context():
        customer = Client(
            name="Cancelado con pendientes", business_name="Cancelado SA",
            signup_date=date.today() - timedelta(days=60), next_renewal_date=yesterday,
            country="Argentina", currency="ARS", payment_amount=27000, status="cancelled",
        )
        db.session.add(customer)
        db.session.flush()
        payment = Payment(
            client=customer, amount=27000, currency="ARS", payment_type="monthly",
            due_date=yesterday, status="overdue",
        )
        action = ClientAction(
            client=customer, title="Acción vencida cancelada", due_date=yesterday,
            status="pending", priority="urgent",
        )
        db.session.add_all([payment, action])
        db.session.commit()

    summary = client.get("/api/dashboard/summary").get_json()["data"]
    assert not any(item.get("client_name") == "Cancelado con pendientes" for item in summary["details"]["pending_payments"])
    assert not any(item.get("client_name") == "Cancelado con pendientes" for item in summary["details"]["overdue_actions"])
    overdue = client.get("/api/actions?view=calendar&scope=overdue&status=pending&month=" + date.today().strftime("%Y-%m")).get_json()["data"]
    assert not any(item.get("client_name") == "Cancelado con pendientes" for item in overdue)


def test_calendar_collection_mode_includes_paid_and_pending_monthlies(client, app):
    month_start = date.today().replace(day=1)
    paid_due = month_start
    pending_due = month_start + timedelta(days=min(10, calendar.monthrange(month_start.year, month_start.month)[1] - 1))
    with app.app_context():
        paid_client = Client(name="Cobro pagado", business_name="Pagado SA", signup_date=month_start - timedelta(days=60), country="Argentina", currency="ARS", status="active")
        pending_client = Client(name="Cobro pendiente", business_name="Pendiente SA", signup_date=month_start - timedelta(days=60), country="Argentina", currency="ARS", status="active")
        db.session.add_all([paid_client, pending_client])
        db.session.flush()
        db.session.add_all([
            Payment(client=paid_client, amount=12000, currency="ARS", payment_type="monthly", due_date=paid_due, paid_at=datetime.now(), status="paid"),
            Payment(client=pending_client, amount=18000, currency="ARS", payment_type="monthly", due_date=pending_due, status="pending"),
        ])
        db.session.commit()
    month = month_start.strftime("%Y-%m")
    items = client.get(f"/api/actions?view=calendar&scope=all&month={month}&status=pending&collections=all").get_json()["data"]
    statuses = {item["client_name"]: item["status"] for item in items if item.get("action_type") == "collection_payment"}
    assert statuses["Cobro pagado"] == "paid"
    assert statuses["Cobro pendiente"] == "pending"
from routes import advance_service_stage, sync_overdue_monthly_payments, sync_service_stages


def test_monthly_payment_is_created_as_pending_on_its_due_date(app):
    today = date.today()
    with app.app_context():
        customer = Client(
            name="Cobro de hoy", business_name="Hoy SA", signup_date=today - timedelta(days=31),
            country="Argentina", currency="ARS", payment_amount=25000, status="active",
        )
        db.session.add(customer)
        db.session.flush()
        # Fuerza un alta cuyo primer aniversario mensual sea exactamente hoy.
        customer.signup_date = date(today.year - (1 if today.month == 1 else 0), 12 if today.month == 1 else today.month - 1, min(today.day, 28))
        expected_due_date = date(today.year, today.month, min(customer.signup_date.day, 28))
        sync_overdue_monthly_payments([customer], expected_due_date)
        payment = Payment.query.filter_by(client_id=customer.id, due_date=expected_due_date).one()
        assert payment.status == "pending"


def test_current_month_payment_is_created_before_its_due_date(app):
    reference_date = date(2026, 8, 1)
    with app.app_context():
        customer = Client(
            name="Pago anticipado", business_name="Anticipado SA",
            signup_date=date(2026, 7, 20), country="Argentina", currency="ARS",
            payment_amount=32000, status="active",
        )
        db.session.add(customer)
        db.session.flush()
        sync_overdue_monthly_payments([customer], reference_date)
        payment = Payment.query.filter_by(
            client_id=customer.id, due_date=date(2026, 8, 20),
        ).one()
        assert payment.status == "pending"
        assert payment.amount == 32000


def test_monthly_generation_respects_configured_renewal_day(app):
    with app.app_context():
        customer = Client(
            name="Vence el treinta", business_name="Día configurado SA",
            signup_date=date(2026, 6, 12), next_renewal_date=date(2026, 7, 30),
            country="Argentina", currency="ARS", payment_amount=44000, status="active",
        )
        db.session.add(customer)
        db.session.flush()
        sync_overdue_monthly_payments([customer], date(2026, 8, 1))
        august_payment = Payment.query.filter_by(
            client_id=customer.id, due_date=date(2026, 8, 30),
        ).one()
        assert august_payment.status == "pending"


def test_initial_payment_misassigned_to_first_renewal_is_repaired(app):
    signup = date(2026, 7, 30)
    renewal = date(2026, 8, 30)
    with app.app_context():
        customer = Client(
            name="Primer mes", business_name="Primer mes SA", signup_date=signup,
            next_renewal_date=renewal, country="Argentina", currency="ARS",
            payment_amount=30000, status="active",
        )
        db.session.add(customer)
        db.session.flush()
        first_payment = Payment(
            client=customer, amount=10000, currency="ARS", payment_type="monthly",
            due_date=renewal, paid_at=datetime(2026, 7, 30, 12, 0), status="paid",
            notes="Primer mes",
        )
        db.session.add(first_payment)
        db.session.flush()
        sync_overdue_monthly_payments([customer], date(2026, 8, 4))
        assert first_payment.due_date == signup
        august_payment = Payment.query.filter_by(client_id=customer.id, due_date=renewal).one()
        assert august_payment.status == "pending"
        assert august_payment.amount == 30000


def test_creating_client_materializes_current_month_payment_immediately(client):
    today = date.today()
    previous_year = today.year - 1 if today.month == 1 else today.year
    previous_month_number = 12 if today.month == 1 else today.month - 1
    previous_day = min(30, calendar.monthrange(previous_year, previous_month_number)[1])
    previous_month = date(previous_year, previous_month_number, previous_day)
    expected_day = min(previous_day, calendar.monthrange(today.year, today.month)[1])
    expected_due_date = date(today.year, today.month, expected_day)
    response = client.post("/api/clients", json={
        "name": "Alta con mensualidad", "business_name": "Mensualidad inmediata SA",
        "sale_date": previous_month.isoformat(), "signup_date": previous_month.isoformat(),
        "next_renewal_date": expected_due_date.isoformat(), "status": "active",
        "country": "Argentina", "currency": "ARS", "payment_amount": 51000,
    })
    assert response.status_code == 201
    payments = response.get_json()["data"]["payments"]
    assert any(
        payment["due_date"] == expected_due_date.isoformat() and payment["status"] == "pending"
        for payment in payments
    )


def test_calendar_can_mark_projected_monthly_payment_as_paid(client, app):
    today = date.today()
    with app.app_context():
        customer = Client(
            name="Pago calendario", business_name="Calendario SA", signup_date=today,
            country="Argentina", currency="ARS", payment_amount=18000, status="active",
        )
        db.session.add(customer)
        db.session.commit()
        customer_id = customer.id
    response = client.post(f"/api/clients/{customer_id}/monthly-payments/{today.isoformat()}/pay")
    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["status"] == "paid"
    assert data["due_date"] == today.isoformat()
    detail = client.get(f"/api/clients/{customer_id}").get_json()["data"]
    assert any(payment["status"] == "paid" and payment["due_date"] == today.isoformat() for payment in detail["payments"])

@pytest.fixture()
def app():
    app = create_app({"TESTING": True, "AUTH_DISABLED": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "JWT_SECRET_KEY": "test-secret-key-with-at-least-32-chars"})
    with app.app_context(): db.create_all()
    return app


@pytest.fixture()
def client(app):
    return app.test_client()

def test_health(client): assert client.get("/api/health").status_code == 200


def test_cancelled_clients_are_excluded_from_weekly_renewals(client, app):
    monday = date.today() - timedelta(days=date.today().weekday())
    renewal_date = monday + timedelta(days=2)
    with app.app_context():
        db.session.add_all([
            Client(
                name="Cliente activo", business_name="Activo",
                signup_date=monday, next_renewal_date=renewal_date,
                country="Argentina", currency="ARS", status="active",
            ),
            Client(
                name="Cliente cancelado", business_name="Cancelado",
                signup_date=monday, next_renewal_date=renewal_date,
                country="Argentina", currency="ARS", status="cancelled",
            ),
        ])
        db.session.commit()

    summary = client.get("/api/dashboard/summary").get_json()["data"]
    assert summary["renewals_week"] == 1
    assert [item["name"] for item in summary["details"]["renewals_week"]] == ["Cliente activo"]

    weekly = client.get(f"/api/dashboard/renewals?start={monday.isoformat()}").get_json()["data"]
    assert [item["name"] for item in weekly] == ["Cliente activo"]


def test_dashboard_includes_traffic_light_counts_and_clients(client, app):
    with app.app_context():
        db.session.add_all([
            Client(name="Rojo", business_name="Uno", website_url="https://uno.example.com", country="Argentina", currency="ARS", traffic_light="red"),
            Client(name="Amarillo", business_name="Dos", country="Argentina", currency="ARS", traffic_light="yellow"),
            Client(name="Verde", business_name="Tres", country="Argentina", currency="ARS", traffic_light="green"),
            Client(name="Cancelado", business_name="Cuatro", country="Argentina", currency="ARS", status="cancelled", traffic_light="red"),
        ])
        db.session.commit()
    summary = client.get("/api/dashboard/summary").get_json()["data"]
    assert summary["traffic_lights"] == {"red": 1, "yellow": 1, "green": 1}
    assert {item["traffic_light"] for item in summary["details"]["traffic_lights"]} == {"red", "yellow", "green"}
    assert {item["name"] for item in summary["details"]["traffic_lights"]} == {"Rojo", "Amarillo", "Verde"}
    assert next(item for item in summary["details"]["traffic_lights"] if item["name"] == "Rojo")["website_url"] == "https://uno.example.com"
    assert "payment_amount" in summary["details"]["traffic_lights"][0]
    assert "currency" in summary["details"]["traffic_lights"][0]


def test_traffic_light_patch_does_not_require_missing_legacy_sale_date(client, app):
    with app.app_context():
        legacy_client = Client(
            name="Cliente anterior", business_name="Legado", country="Argentina",
            currency="ARS", traffic_light="red", sale_date=None,
        )
        db.session.add(legacy_client)
        db.session.commit()
        client_id = legacy_client.id
    response = client.patch(f"/api/clients/{client_id}", json={"traffic_light": "green"})
    assert response.status_code == 200
    assert response.get_json()["data"]["traffic_light"] == "green"


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


def test_work_logs_accumulate_multiple_entries_on_the_same_day(client):
    first = client.post("/api/work-logs", json={
        "work_date": "2026-07-21", "hours": 4, "notes": "Diseño",
    })
    second = client.post("/api/work-logs", json={
        "work_date": "2026-07-21", "hours": 2, "notes": "Desarrollo",
    })
    assert first.status_code == 201
    assert second.status_code == 201
    listed = client.get("/api/work-logs").get_json()["data"]
    assert sum(item["hours"] for item in listed if item["work_date"] == "2026-07-21") == 6
    assert client.delete(f'/api/work-logs/{first.get_json()["data"]["id"]}').status_code == 200
    remaining = client.get("/api/work-logs").get_json()["data"]
    assert sum(item["hours"] for item in remaining) == 2


def test_work_logs_reject_invalid_hours(client):
    assert client.post("/api/work-logs", json={
        "work_date": "2026-07-21", "hours": 0,
    }).status_code == 422
    assert client.post("/api/work-logs", json={
        "work_date": "2026-07-21", "hours": 25,
    }).status_code == 422


def test_work_logs_can_be_edited(client):
    created = client.post("/api/work-logs", json={
        "work_date": "2026-07-21", "hours": 2, "notes": "Diseño",
    }).get_json()["data"]
    updated = client.patch(f'/api/work-logs/{created["id"]}', json={
        "work_date": "2026-07-22", "hours": 3.5, "notes": "Desarrollo",
    })
    assert updated.status_code == 200
    assert updated.get_json()["data"] == {
        **created, "work_date": "2026-07-22", "hours": 3.5, "notes": "Desarrollo",
    }
    assert client.patch(f'/api/work-logs/{created["id"]}', json={
        "work_date": "2026-07-22", "hours": 0,
    }).status_code == 422


def test_prospecting_stores_weekly_goals_and_accumulates_actual_messages(client):
    saved = client.put("/api/prospecting/goals", json={"goals": [
        {"weekday": 0, "channel": "facebook_marketplace", "target": 20},
        {"weekday": 0, "channel": "business_instagram", "target": 10},
    ]})
    assert saved.status_code == 200
    first = client.post("/api/prospecting/logs", json={
        "activity_date": "2026-07-20", "channel": "facebook_marketplace", "quantity": 12,
    })
    second = client.post("/api/prospecting/logs", json={
        "activity_date": "2026-07-20", "channel": "facebook_marketplace", "quantity": 9,
    })
    assert first.status_code == 201
    assert second.status_code == 201
    data = client.get("/api/prospecting").get_json()["data"]
    assert sum(goal["target"] for goal in data["goals"]) == 30
    assert sum(log["quantity"] for log in data["logs"]) == 21
    updated = client.patch(f'/api/prospecting/logs/{second.get_json()["data"]["id"]}', json={
        "activity_date": "2026-07-21",
        "channel": "business_instagram",
        "quantity": 15,
        "notes": "Carga corregida",
    })
    assert updated.status_code == 200
    updated_data = updated.get_json()["data"]
    assert updated_data["activity_date"] == "2026-07-21"
    assert updated_data["channel"] == "business_instagram"
    assert updated_data["quantity"] == 15
    assert updated_data["notes"] == "Carga corregida"
    assert client.delete(f'/api/prospecting/logs/{first.get_json()["data"]["id"]}').status_code == 200


def test_prospecting_rejects_unknown_channels(client):
    assert client.post("/api/prospecting/logs", json={
        "activity_date": "2026-07-20", "channel": "unknown", "quantity": 10,
    }).status_code == 422


def test_prospecting_rejects_invalid_log_edits(client):
    created = client.post("/api/prospecting/logs", json={
        "activity_date": "2026-07-20", "channel": "facebook_marketplace", "quantity": 10,
    }).get_json()["data"]
    assert client.patch(f'/api/prospecting/logs/{created["id"]}', json={"quantity": 0}).status_code == 422
    assert client.patch(f'/api/prospecting/logs/{created["id"]}', json={"channel": "unknown"}).status_code == 422


def test_prospecting_stores_demos_and_sales_by_day_and_channel(client):
    saved = client.put("/api/prospecting/outcomes", json={
        "activity_date": "2026-07-20", "channel": "business_instagram",
        "demos": 4, "sales": 2,
    })
    assert saved.status_code == 200
    assert saved.get_json()["data"]["demos"] == 4
    updated = client.put("/api/prospecting/outcomes", json={
        "activity_date": "2026-07-20", "channel": "business_instagram",
        "demos": 5, "sales": 3,
    })
    assert updated.status_code == 200
    outcomes = client.get("/api/prospecting").get_json()["data"]["outcomes"]
    assert len(outcomes) == 1
    assert outcomes[0]["sales"] == 3
    assert client.put("/api/prospecting/outcomes", json={
        "activity_date": "2026-07-20", "channel": "business_instagram",
        "demos": 2, "sales": 3,
    }).status_code == 422


def test_expenses_balance_is_independent_from_client_payments(client):
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
    client.post("/api/expenses", json={
        "expense_date": today.isoformat(), "category": "server_income",
        "description": "Aporte cliente VPS", "amount": 7000,
    })
    client.post("/api/expenses", json={
        "expense_date": today.isoformat(), "category": "extra",
        "description": "Dominio", "amount": 3000,
    })
    client.post("/api/expenses", json={
        "expense_date": "2020-01-10", "category": "server",
        "description": "Servidor anterior", "amount": 10000,
    })

    result = client.get(f"/api/expenses?month={month}").get_json()["data"]
    assert result["summary"] == {
        "server_income_ars": 7000.0,
        "server_expenses_ars": 25000.0, "net_server_cost_ars": 18000.0,
        "extra_expenses_ars": 3000.0, "expenses_ars": 28000.0,
        "balance_ars": -21000.0,
    }
    accumulated = client.get("/api/expenses?scope=all").get_json()["data"]
    assert accumulated["summary"]["server_expenses_ars"] == 35000.0
    assert accumulated["summary"]["net_server_cost_ars"] == 28000.0
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
    assert client.get(f'/api/clients/{customer["id"]}').get_json()["data"]["vps_name"] == "vape"
    custom = client.post("/api/vps", json={
        "vps_name": "shatha", "custom_name": "Aplicación interna",
    })
    assert custom.status_code == 201

    duplicate = client.post("/api/vps", json={"vps_name": "shatha", "client_id": customer["id"]})
    assert duplicate.status_code == 422
    moved = client.patch(f"/api/vps/{assignment_id}", json={"vps_name": "shatha"})
    assert moved.status_code == 200
    assert client.get(f'/api/clients/{customer["id"]}').get_json()["data"]["vps_name"] == "shatha"
    listed = client.get("/api/vps").get_json()["data"]
    assert listed["counts"] == {"vape": 0, "shatha": 2}
    assert {item["name"] for item in listed["items"]} == {"Cliente VPS", "Aplicación interna"}
    assert client.delete(f"/api/vps/{assignment_id}").status_code == 200
    assert client.get(f'/api/clients/{customer["id"]}').get_json()["data"]["vps_name"] is None


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


def test_client_list_renewal_totals_follow_filters_and_include_no_signup(client, app):
    with app.app_context():
        db.session.add_all([
            Client(name="Activo ARS", business_name="Marca Norte", signup_date=date(2026, 7, 1), status="active", currency="ARS", payment_amount=30000),
            Client(name="Riesgo USD", business_name="Marca Norte", signup_date=date(2026, 7, 2), status="at_risk", currency="USD", payment_amount=250),
            Client(name="Otro ARS", business_name="Marca Sur", signup_date=date(2026, 7, 3), status="active", currency="ARS", payment_amount=12000),
            Client(name="Sin alta", business_name="Marca Norte", sale_date=date(2026, 7, 4), status="no_signup", currency="ARS", payment_amount=99999),
        ])
        db.session.commit()

    all_totals = client.get("/api/clients").get_json()["data"]["renewal_totals"]
    assert all_totals == {"ARS": 141999.0, "USD": 250.0}

    filtered = client.get("/api/clients?search=Norte&status=active").get_json()["data"]
    assert filtered["pagination"]["total"] == 2
    assert filtered["renewal_totals"] == {"ARS": 30000.0, "USD": 250.0}

    no_signup = client.get("/api/clients?status=no_signup").get_json()["data"]
    assert no_signup["renewal_totals"] == {"ARS": 99999.0, "USD": 0.0}


def test_actions_store_planned_and_implementation_dates_separately(client):
    created_client = client.post("/api/clients", json={
        "name": "Cliente acciones", "business_name": "Marca acciones",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]

    created = client.post(f'/api/clients/{created_client["id"]}/actions', json={
        "title": "Instalar mejora",
        "due_date": "2026-07-20",
        "implementation_date": "2026-07-22",
    })
    assert created.status_code == 201
    action = created.get_json()["data"]
    assert action["due_date"] == "2026-07-20"
    assert action["implementation_date"] == "2026-07-22"

    updated = client.patch(f'/api/actions/{action["id"]}', json={
        "implementation_date": "2026-07-23",
    })
    assert updated.status_code == 200
    assert updated.get_json()["data"]["due_date"] == "2026-07-20"
    assert updated.get_json()["data"]["implementation_date"] == "2026-07-23"

    standalone = client.post("/api/standalone-actions", json={
        "context_name": "Tarea interna", "title": "Actualizar proceso",
        "due_date": "2026-07-25", "implementation_date": "2026-07-26",
    })
    assert standalone.status_code == 201
    assert standalone.get_json()["data"]["implementation_date"] == "2026-07-26"


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


def test_clients_can_be_filtered_by_active_and_no_signup(client):
    for name, status in [
        ("Cliente activo", "active"),
        ("Cliente en riesgo", "at_risk"),
        ("Cliente sin alta", "no_signup"),
        ("Cliente pausado", "paused"),
    ]:
        client.post("/api/clients", json={
            "name": name, "business_name": name, "signup_date": "2026-07-01",
            "country": "Argentina", "currency": "ARS", "status": status,
        })
    filtered = client.get("/api/clients?status=active_no_signup").get_json()["data"]
    assert filtered["pagination"]["total"] == 3
    assert {item["status"] for item in filtered["items"]} == {"active", "at_risk", "no_signup"}


def test_active_client_filter_includes_at_risk_clients(client):
    for name, status in [
        ("Cliente activo", "active"),
        ("Cliente en riesgo", "at_risk"),
        ("Cliente pausado", "paused"),
    ]:
        client.post("/api/clients", json={
            "name": name, "business_name": name, "signup_date": "2026-07-01",
            "country": "Argentina", "currency": "ARS", "status": status,
        })
    filtered = client.get("/api/clients?status=active").get_json()["data"]
    assert filtered["pagination"]["total"] == 2
    assert {item["status"] for item in filtered["items"]} == {"active", "at_risk"}


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
    assert {item["name"] for item in forecast["items"]} == {"Activo ARS", "En riesgo ARS", "Sin alta USD", "Sin importe"}
    assert next(item for item in forecast["items"] if item["name"] == "Sin importe")["amount"] == 0


def test_monthly_forecast_sums_active_and_multiple_no_signup_clients_together(client):
    for name, status, amount in [
        ("Activo mensual", "active", 30000),
        ("Sin alta uno", "no_signup", 18000),
        ("Sin alta dos", "no_signup", 22000),
    ]:
        response = client.post("/api/clients", json={
            "name": name, "business_name": name, "signup_date": "2026-07-01",
            "country": "Argentina", "currency": "ARS",
            "payment_amount": amount, "status": status,
        })
        assert response.status_code == 201

    forecast = client.get("/api/payments/monthly-forecast").get_json()["data"]
    assert forecast["totals"]["ARS"] == 70000.0
    assert {item["name"] for item in forecast["items"]} == {
        "Activo mensual", "Sin alta uno", "Sin alta dos",
    }


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


def test_new_clients_can_be_filtered_by_signup_month(client):
    for name, commercial_date, signup_date in [
        ("Cliente junio", "2026-06-15", "2026-09-01"),
        ("Cliente julio", "2026-07-10", "2026-10-01"),
    ]:
        client.post("/api/clients", json={
            "name": name, "business_name": name,
            "commercial_signup_date": commercial_date, "signup_date": signup_date,
            "country": "Argentina", "currency": "ARS",
        })

    june = client.get("/api/dashboard/new-clients?month=2026-06")
    assert june.status_code == 200
    assert june.get_json()["data"] == []
    september = client.get("/api/dashboard/new-clients?month=2026-09")
    assert [item["name"] for item in september.get_json()["data"]] == ["Cliente junio"]
    assert client.get("/api/dashboard/new-clients?month=junio").status_code == 422


def test_sold_clients_and_signups_use_their_own_dates(client):
    created = client.post("/api/clients", json={
        "name": "Cliente vendido en junio",
        "business_name": "Venta junio alta julio",
        "sale_date": "2026-06-29",
        "commercial_signup_date": "2026-06-29",
        "signup_date": "2026-07-05",
        "country": "Argentina",
        "currency": "ARS",
    })
    assert created.status_code == 201
    assert created.get_json()["data"]["sale_date"] == "2026-06-29"
    june_sales = client.get("/api/dashboard/sold-clients?month=2026-06")
    july_sales = client.get("/api/dashboard/sold-clients?month=2026-07")
    june_signups = client.get("/api/dashboard/new-clients?month=2026-06")
    july_signups = client.get("/api/dashboard/new-clients?month=2026-07")

    assert [item["name"] for item in june_sales.get_json()["data"]] == ["Cliente vendido en junio"]
    assert july_sales.get_json()["data"] == []
    assert june_signups.get_json()["data"] == []
    assert [item["name"] for item in july_signups.get_json()["data"]] == ["Cliente vendido en junio"]
    assert client.get("/api/dashboard/sold-clients?month=junio").status_code == 422


def test_dashboard_income_filters_month_type_and_currency(client, app):
    created = client.post("/api/clients", json={
        "name": "Cliente ingresos",
        "business_name": "Ingresos separados",
        "signup_date": "2026-06-01",
        "country": "Argentina",
        "currency": "ARS",
        "payment_amount": 80000,
    }).get_json()["data"]
    client.post("/api/clients", json={
        "name": "Cliente en riesgo USD", "business_name": "Riesgo",
        "signup_date": "2026-06-01", "country": "Argentina", "currency": "USD",
        "payment_amount": 40, "status": "at_risk",
    })
    client.post("/api/clients", json={
        "name": "Cliente todavía sin alta", "business_name": "Sin alta",
        "signup_date": "2026-06-17", "country": "Argentina", "currency": "ARS",
        "payment_amount": 90000, "status": "no_signup",
    })
    with app.app_context():
        db.session.add_all([
            Payment(client_id=created["id"], amount=100000, currency="ARS", payment_type="monthly", status="paid", due_date=date(2026, 6, 5), paid_at=datetime(2026, 7, 2)),
            Payment(client_id=created["id"], amount=50, currency="USD", payment_type="extra_work", status="paid", due_date=date(2026, 6, 12), paid_at=datetime(2026, 7, 2)),
            Payment(client_id=created["id"], amount=25000, currency="ARS", payment_type="extra_work", status="paid", due_date=date(2026, 7, 1), paid_at=datetime(2026, 7, 1)),
            Payment(client_id=created["id"], amount=5000, currency="ARS", payment_type="deposit", status="paid", due_date=date(2026, 6, 20), paid_at=datetime(2026, 7, 3)),
            Payment(client_id=created["id"], amount=99999, currency="ARS", payment_type="monthly", status="pending", due_date=date(2026, 6, 20), paid_at=datetime(2026, 6, 20)),
        ])
        db.session.commit()

    june_total = client.get("/api/dashboard/income?month=2026-06&payment_type=all").get_json()["data"]["totals"]
    june_monthly = client.get("/api/dashboard/income?month=2026-06&payment_type=monthly").get_json()["data"]["totals"]
    june_extras_data = client.get("/api/dashboard/income?month=2026-06&payment_type=extra_work").get_json()["data"]
    june_extras = june_extras_data["totals"]
    july_total = client.get("/api/dashboard/income?month=2026-07&payment_type=all").get_json()["data"]["totals"]
    all_months = client.get("/api/dashboard/income?month=all&payment_type=all").get_json()["data"]
    monthly_forecast_data = client.get("/api/dashboard/income?month=2026-08&payment_type=monthly_forecast").get_json()["data"]
    monthly_forecast = monthly_forecast_data["totals"]

    assert june_total == {"ARS": 100000.0, "USD": 50.0}
    assert june_monthly == {"ARS": 100000.0, "USD": 0}
    assert june_extras == {"ARS": 0, "USD": 50.0}
    assert len(june_extras_data["items"]) == 1
    assert june_extras_data["items"][0]["client_name"] == "Cliente ingresos"
    assert june_extras_data["items"][0]["amount"] == 50.0
    july_monthly = client.get("/api/dashboard/income?month=2026-07&payment_type=monthly").get_json()["data"]
    assert july_monthly["totals"] == {"ARS": 5000.0, "USD": 0}
    assert {item["payment_type"] for item in july_monthly["items"]} == {"deposit"}
    assert next(
        item for item in july_monthly["items"] if item["payment_type"] == "deposit"
    )["display_date"] == "2026-07-03"
    assert july_total == {"ARS": 30000.0, "USD": 0}
    assert all_months["totals"] == {"ARS": 130000.0, "USD": 50.0}
    assert all_months["available_months"] == ["2026-07", "2026-06"]
    assert monthly_forecast == {"ARS": 170000.0, "USD": 40.0}
    assert monthly_forecast_data["month"] == "2026-08"
    assert all(item["due_date"].startswith("2026-08") for item in monthly_forecast_data["items"])
    no_signup_forecast = next(
        item for item in monthly_forecast_data["items"]
        if item["client_name"] == "Cliente todavía sin alta"
    )
    assert no_signup_forecast["due_date"] == "2026-08-17"
    assert client.get("/api/dashboard/income?month=junio").status_code == 422
    assert client.get("/api/dashboard/income?payment_type=otro").status_code == 422


def test_deposit_has_no_due_date_and_uses_paid_date(client):
    created = client.post("/api/clients", json={
        "name": "Cliente seña", "business_name": "Reserva",
        "signup_date": "2026-07-01", "country": "Argentina",
        "currency": "ARS", "payment_amount": 30000,
    }).get_json()["data"]
    deposit = client.post(f'/api/clients/{created["id"]}/payments', json={
        "amount": 5000, "currency": "ARS", "payment_type": "deposit",
        "status": "paid", "due_date": "2026-08-01", "paid_at": "2026-07-15",
    }).get_json()["data"]
    assert deposit["due_date"] is None
    income = client.get(
        "/api/dashboard/income?month=2026-07&payment_type=monthly"
    ).get_json()["data"]
    assert income["totals"]["ARS"] == 5000
    assert income["items"][0]["display_date"] == "2026-07-15"

    updated = client.patch(f'/api/payments/{deposit["id"]}', json={
        "payment_type": "deposit", "due_date": "2026-09-01",
    }).get_json()["data"]
    assert updated["due_date"] is None


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


def test_manual_renewal_correction_is_not_overridden_by_paid_first_month(client):
    created = client.post("/api/clients", json={
        "name": "Amadeo", "business_name": "Auro Fragancias",
        "sale_date": "2026-07-17", "signup_date": "2026-07-30",
        "next_renewal_date": "2026-08-30",
        "country": "Argentina", "currency": "ARS", "payment_amount": 30000,
    }).get_json()["data"]
    client.post(f'/api/clients/{created["id"]}/payments', json={
        "amount": 10000, "currency": "ARS", "payment_type": "monthly",
        "due_date": "2026-08-30", "paid_at": "2026-07-30",
        "status": "paid", "notes": "primer mes al 50%",
    })

    corrected = client.patch(f'/api/clients/{created["id"]}', json={
        "signup_date": "2026-07-30",
        "next_renewal_date": "2026-08-30",
    }).get_json()["data"]
    assert corrected["next_renewal_date"] == "2026-08-30"
    assert corrected["service_stage"] == "first_month"

    reopened = client.get(f'/api/clients/{created["id"]}').get_json()["data"]
    assert reopened["next_renewal_date"] == "2026-08-30"
    assert reopened["service_stage"] == "first_month"


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


def test_monthly_collections_appear_in_all_list_and_calendar(client, app):
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

    listed_charges = [
        action for action in manual_actions
        if action["title"] == "Cobrar a Cliente existente"
    ]
    assert len(listed_charges) == 1
    assert listed_charges[0]["due_date"] == "2026-08-10"
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


def test_overdue_calendar_charge_becomes_pending_payment_and_overdue_action(client):
    today = date.today()
    signup = today - timedelta(days=32)
    customer = client.post("/api/clients", json={
        "name": "José", "business_name": "José tienda",
        "signup_date": signup.isoformat(), "country": "Argentina", "currency": "ARS",
        "payment_amount": 15000, "status": "active", "generate_schedule": False,
    }).get_json()["data"]

    payments = client.get("/api/payments").get_json()["data"]
    overdue_payments = [p for p in payments if p["client_id"] == customer["id"] and p["status"] == "overdue"]
    assert overdue_payments
    payment = overdue_payments[-1]
    assert payment["amount"] == 15000

    overdue = client.get("/api/actions?view=overdue&status=pending").get_json()["data"]
    assert any(item.get("payment_id") == payment["id"] and item["client_name"] == "José" for item in overdue)

    month = payment["due_date"][:7]
    calendar_items = client.get(f"/api/actions?view=calendar&month={month}&status=pending").get_json()["data"]
    assert any(item.get("payment_id") == payment["id"] for item in calendar_items)

    client.patch(f'/api/payments/{payment["id"]}', json={"status": "paid"})
    detail = client.get(f'/api/clients/{customer["id"]}').get_json()["data"]
    assert any(p["id"] == payment["id"] and p["status"] == "paid" for p in detail["payments"])


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
    listed_charge = next(action for action in pending if action["title"] == "Cobrar a Gustavo")
    assert listed_charge["payment_id"]
    assert listed_charge["due_date"] == "2026-06-01"

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


def test_undated_actions_are_separate_and_support_description_and_status(client):
    created = client.post("/api/standalone-actions", json={
        "title": "Revisar integración", "description": "Comprobar el acceso y documentar cambios",
        "due_date": None, "priority": "medium",
    })
    assert created.status_code == 201
    action = created.get_json()["data"]
    assert action["description"] == "Comprobar el acceso y documentar cambios"
    assert action["due_date"] is None

    undated = client.get("/api/actions?view=undated&status=pending").get_json()["data"]
    dated = client.get("/api/actions?view=all&status=pending").get_json()["data"]
    assert any(item["id"] == action["id"] for item in undated)
    assert not any(item["id"] == action["id"] for item in dated)

    action_id = action["id"].replace("standalone-", "")
    client.patch(f"/api/standalone-actions/{action_id}", json={"status": "completed"})
    completed = client.get("/api/actions?view=undated&status=completed").get_json()["data"]
    assert any(item["id"] == action["id"] for item in completed)
    reopened = client.patch(f"/api/standalone-actions/{action_id}", json={
        "status": "pending", "description": "Descripción actualizada",
    }).get_json()["data"]
    assert reopened["description"] == "Descripción actualizada"
    assert reopened["status"] == "pending"
    assert reopened["completed_at"] is None


def test_completing_actions_keeps_due_date_and_tracks_completion_date(client):
    customer = client.post("/api/clients", json={
        "name": "Fechas", "business_name": "Fechas SA",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
        "generate_schedule": False,
    }).get_json()["data"]
    action = client.post(f'/api/clients/{customer["id"]}/actions', json={
        "title": "Acción con fecha", "due_date": "2026-08-20",
    }).get_json()["data"]

    completed = client.patch(f'/api/actions/{action["id"]}', json={
        "status": "completed", "completed_date": "2026-07-29",
    }).get_json()["data"]

    assert completed["due_date"] == "2026-08-20"
    assert completed["completed_at"].startswith("2026-07-29")

    edited = client.patch(f'/api/actions/{action["id"]}', json={
        "completed_date": "2026-07-28",
    }).get_json()["data"]
    assert edited["due_date"] == "2026-08-20"
    assert edited["completed_at"].startswith("2026-07-28")


def test_undated_action_can_be_assigned_to_a_client(client):
    customer = client.post("/api/clients", json={
        "name": "Cliente agenda", "business_name": "Agenda SA",
        "signup_date": "2026-07-01", "country": "Argentina", "currency": "ARS",
    }).get_json()["data"]

    created = client.post(f'/api/clients/{customer["id"]}/actions', json={
        "title": "Nota pendiente del cliente", "description": "Resolver cuando sea posible",
        "due_date": None, "priority": "medium",
    })
    assert created.status_code == 201
    action_id = created.get_json()["data"]["id"]

    undated = client.get("/api/actions?view=undated&status=pending").get_json()["data"]
    dated = client.get("/api/actions?view=all&status=pending").get_json()["data"]
    assigned = next(item for item in undated if item["id"] == action_id)
    assert assigned["client_id"] == customer["id"]
    assert assigned["client_name"] == "Cliente agenda"
    assert not any(item["id"] == action_id for item in dated)
