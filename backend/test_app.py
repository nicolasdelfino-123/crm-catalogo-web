import pytest
from datetime import date
from app import create_app
from models import db, Client
from routes import advance_service_stage

@pytest.fixture()
def client():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.app_context(): db.create_all()
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
    customer.service_stage = "first_month"
    customer.service_stage_manual = True
    advance_service_stage(customer, date(2026, 7, 1))
    assert customer.service_stage == "first_month"
