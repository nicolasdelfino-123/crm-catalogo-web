from datetime import date, datetime
from types import SimpleNamespace as NS
from saas_analysis import build_saas_analysis


def customer(id, status='active', signup=date(2026, 1, 1), cancel=None, currency='ARS', amount=100):
    return NS(id=id, status=status, signup_date=signup, cancelled_date=cancel,
              currency=currency, payment_amount=amount, business_name='Private')


def test_balances_currencies_and_same_month_cancellation():
    clients = [customer(1), customer(2, 'cancelled', cancel=date(2026, 2, 2)),
               customer(3, 'cancelled', date(2026, 2, 1), date(2026, 2, 10)),
               customer(4, currency='USD', amount=20)]
    payments = [NS(client_id=1, status='paid', paid_at=datetime(2026, 2, 3), currency='ARS', amount=80, payment_type='monthly'),
                NS(client_id=4, status='paid', paid_at=datetime(2026, 2, 3), currency='USD', amount=20, payment_type='monthly'),
                NS(client_id=1, status='pending', paid_at=None, currency='ARS', amount=999, payment_type='monthly')]
    data = build_saas_analysis(clients, payments, date(2026, 3, 3))
    feb = data['monthly'][1]
    assert feb['churn'] == 33.33
    assert feb['new_cancellations'] == 1
    assert data['current']['mrr'] == {'ARS': 100.0, 'USD': 20.0}
    assert feb['collected'] == {'ARS': 80.0, 'USD': 20.0}
    for row in data['monthly']:
        assert row['active_start'] + row['signups'] - row['cancellations'] == row['active_end']
        for u in data['currencies']:
            assert row['mrr_start'][u] + row['mrr_new'][u] - row['mrr_lost'][u] == row['mrr_end'][u]
    assert data['cohorts'][0]['retention'][1]['eligible'] == 2
    assert data['cohorts'][0]['retention'][2]['rate'] is None


def test_missing_dates_pauses_reactivation_are_not_invented():
    data = build_saas_analysis([customer(1, 'cancelled'), customer(2, 'paused'),
                                customer(3, cancel=date(2026, 2, 1))], [], date(2026, 3, 10))
    assert data['current']['active'] == 1
    assert data['monthly'][-1]['active_end'] == 1
    assert data['cancellation_count'] == 1
    assert data['duration_mean_days'] is None
    assert data['nrr'] is None
    assert not data['cohorts']
    assert any('reactivaciones' in q for q in data['quality'])


def test_empty():
    data = build_saas_analysis([], [], date(2026, 3, 10))
    assert data['monthly'][0]['churn'] is None
    assert data['collected_total'] == {'ARS': 0, 'USD': 0}


def test_endpoint_is_read_only_and_includes_archived_history(client, app):
    from models import db, Client, Payment
    with app.app_context():
        c = Client(name='Private', business_name='Private', status='cancelled',
                   signup_date=date(2026, 1, 1), cancelled_date=date(2026, 2, 1),
                   archived_at=datetime(2026, 2, 2), currency='USD', payment_amount=20)
        db.session.add(c)
        db.session.flush()
        db.session.add(Payment(client_id=c.id, amount=20, currency='USD', status='paid',
                               paid_at=datetime(2026, 1, 1), payment_type='monthly'))
        db.session.commit()
        before = (Client.query.count(), Payment.query.count(), c.updated_at)
    result = client.get('/api/saas-analysis')
    assert result.status_code == 200
    assert result.get_json()['data']['collected_total']['USD'] == 20
    with app.app_context():
        assert (Client.query.count(), Payment.query.count(), Client.query.first().updated_at) == before


from test_app import app, client  # noqa: E402,F401 - shared test fixtures
