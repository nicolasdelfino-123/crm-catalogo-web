from datetime import date, datetime
from types import SimpleNamespace

from client_statistics import anniversary, build_client_statistics
from models import Client, db
from test_app import app, client  # noqa: F401 - shared application fixtures


def customer(identifier, status="active", sale=date(2026, 1, 5),
             signup=date(2026, 1, 31), cancellation=None):
    return SimpleNamespace(id=identifier, status=status, sale_date=sale,
                           signup_date=signup, cancelled_date=cancellation)


def test_retention_uses_completed_anniversaries_and_not_service_stage():
    customers = [
        customer(1),
        customer(2, "cancelled", cancellation=date(2026, 2, 28)),
        customer(3, signup=date(2026, 3, 15)),
        customer(4, "no_signup"),
        customer(5, "cancelled"),
    ]
    data = build_client_statistics(customers, date(2026, 3, 31))
    assert anniversary(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert anniversary(date(2024, 1, 31), 1) == date(2024, 2, 29)
    cohort = data["cohorts"][0]
    assert cohort["sales"] == 5
    assert cohort["active"] == 2
    assert cohort["cancelled"] == 2
    assert cohort["no_signup"] == 1
    assert cohort["retention"] == [
        {"month": 1, "eligible": 2, "retained": 1, "rate": 50.0},
        {"month": 2, "eligible": 2, "retained": 1, "rate": 50.0},
    ]
    assert data["summary"]["missing_cancellation_date"] == 1


def test_monthly_health_uses_each_event_date_and_carries_empty_months():
    customers = [
        customer(1, sale=date(2026, 1, 5), signup=date(2026, 2, 1)),
        customer(2, "cancelled", cancellation=date(2026, 3, 10)),
        customer(3, "cancelled", sale=date(2026, 3, 1), signup=date(2026, 3, 1),
                 cancellation=date(2026, 3, 5)),
        customer(4, "no_signup", sale=date(2026, 3, 2)),
    ]
    data = build_client_statistics(customers, date(2026, 5, 10))
    rows = {row["month"]: row for row in data["monthly"]}
    assert rows["2026-01"]["sales"] == 2
    assert rows["2026-01"]["signups"] == 1
    assert rows["2026-02"]["sales"] == 0
    assert rows["2026-02"]["active_end"] == 2
    march = rows["2026-03"]
    assert march["sales"] == 2
    assert march["signups"] == 1
    assert march["cancellations"] == 2
    assert march["net"] == -1
    assert march["active_start"] == 2
    assert march["active_end"] == 1
    assert march["churn_rate"] == 50.0  # Only cancellations from the opening base.
    assert rows["2026-04"]["sales"] == 0
    assert rows["2026-04"]["active_end"] == 1
    assert rows["2026-05"]["partial"] is True


def test_empty_statistics_and_cohorts_too_recent_to_measure():
    assert build_client_statistics([], date(2026, 3, 10))["monthly"] == []
    data = build_client_statistics([
        customer(1, sale=date(2026, 3, 1), signup=date(2026, 3, 1)),
        customer(2, sale=date(2026, 1, 1), signup=date(2026, 1, 1)),
        customer(3, sale=None),
    ], date(2026, 3, 10))
    assert data["cohorts"][1]["retention"][0] == {
        "month": 1, "eligible": 0, "retained": 0, "rate": None,
    }
    assert data["summary"]["missing_sale_date"] == 1


def test_statistics_share_table_filters_and_use_all_results(client, app):
    with app.app_context():
        for index in range(105):
            db.session.add(Client(
                name=f"Córdoba {index}", business_name=f"Negocio {index}",
                status="at_risk" if index == 0 else "active",
                sale_date=date(2026, 1, 1), signup_date=date(2026, 1, 1),
                next_renewal_date=date(2026, 3, 1), acquisition_source="instagram",
            ))
        db.session.add_all([
            Client(name="Cancelado", business_name="Cancelado", status="cancelled",
                   sale_date=date(2026, 1, 1), signup_date=date(2026, 1, 1),
                   cancelled_date=date(2026, 2, 5), acquisition_source="instagram"),
            Client(name="Otro canal", business_name="Otro", status="active",
                   sale_date=date(2026, 1, 1), signup_date=date(2026, 1, 1),
                   next_renewal_date=date(2026, 3, 1), acquisition_source="referral"),
            Client(name="Archivado", business_name="Archivado", archived_at=datetime(2026, 2, 1)),
        ])
        db.session.commit()
    filters = "status=active&acquisition_source=instagram&service_stage=second_month&search=cordoba"
    statistics = client.get(f"/api/clients/statistics?{filters}").get_json()["data"]
    table = client.get(f"/api/clients?{filters}&per_page=1").get_json()["data"]
    assert statistics["summary"]["total"] == table["pagination"]["total"] == 105
    assert statistics["summary"]["active"] == 105
    assert statistics["cohorts"][0]["sales"] == 105
    cancelled = client.get("/api/clients/statistics?status=cancelled&service_stage=second_month").get_json()["data"]
    assert cancelled["summary"]["total"] == 1
    assert cancelled["summary"]["cancelled"] == 1
    assert sum(row["cancellations"] for row in cancelled["monthly"]) == 1
