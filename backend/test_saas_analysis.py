from datetime import date, datetime
from types import SimpleNamespace as NS
from saas_analysis import build_saas_analysis


def customer(id, status='active', signup=date(2026, 1, 1), cancel=None, currency='ARS', amount=100):
    return NS(id=id, status=status, signup_date=signup, sale_date=signup, cancelled_date=cancel,
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
    assert feb['churn'] == 33.3
    assert feb['new_cancellations'] == 1
    assert data['current']['mrr'] == {'ARS': 100.0, 'USD': 20.0}
    assert feb['collected'] == {'ARS': 80.0, 'USD': 20.0}
    for row in data['monthly']:
        assert row['active_start'] + row['signups'] - row['cancellations'] == row['active_end']
        for u in data['currencies']:
            assert row['mrr_end'][u] is None  # No historical price snapshots.
    assert data['cohorts'][0]['size'] == 3
    assert data['cohorts'][0]['retention'][1]['eligible'] == 3
    assert data['cohorts'][0]['retention'][2]['retained'] == 2


def test_missing_dates_pauses_reactivation_are_not_invented():
    data = build_saas_analysis([customer(1, 'cancelled'), customer(2, 'paused'),
                                customer(3, cancel=date(2026, 2, 1))], [], date(2026, 3, 10))
    assert data['current']['active'] == 1
    assert data['monthly'][-1]['active_end'] == 1
    assert data['cancellation_count'] == 1
    assert data['duration_mean_days'] is None
    assert data['nrr'] is None
    assert data['cohorts'][0]['size'] == 1
    assert any('reactivaciones' in q for q in data['quality'])


def test_empty():
    data = build_saas_analysis([], [], date(2026, 3, 10))
    assert data['monthly'] == []
    assert data['collected_total'] == {'ARS': 0, 'USD': 0}


def test_endpoint_is_read_only_and_excludes_archived_history(client, app):
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
    assert result.get_json()['data']['collected_total']['USD'] == 0
    with app.app_context():
        assert (Client.query.count(), Payment.query.count(), Client.query.first().updated_at) == before


from test_app import app, client  # noqa: E402,F401 - shared test fixtures


def test_shared_summary_scope_and_mrr_exclude_archived_and_no_signup(client, app):
    from models import db, Client
    with app.app_context():
        db.session.add_all([
            Client(name='ARS', business_name='ARS', status='active', currency='ARS', payment_amount=30000, signup_date=date(2026, 1, 1)),
            Client(name='USD', business_name='USD', status='at_risk', currency='USD', payment_amount=20, signup_date=date(2026, 1, 1)),
            Client(name='Pending', business_name='Pending', status='no_signup', currency='USD', payment_amount=50, signup_date=date(2026, 1, 1)),
            Client(name='Archived', business_name='Archived', status='active', currency='USD', payment_amount=100, signup_date=date(2026, 1, 1), archived_at=datetime(2026, 2, 1)),
        ])
        db.session.commit()
    analysis = client.get('/api/saas-analysis').get_json()['data']
    summary = client.get('/api/dashboard/summary').get_json()['data']
    statistics = client.get('/api/clients/statistics').get_json()['data']
    listing = client.get('/api/clients?status=active').get_json()['data']
    assert analysis['current']['active'] == summary['active_clients'] == 3
    assert analysis['current']['subscriptions'] == listing['pagination']['total'] == 2
    assert sum(analysis['current']['counts'].values()) == 2
    assert analysis['current']['mrr'] == {'ARS': 30000, 'USD': 20}
    for row, shared in zip(analysis['monthly'], statistics['monthly']):
        for key in ['month', 'active_start', 'active_end', 'signups', 'cancellations', 'net']:
            assert row[key] == shared[key]
    assert client.get('/api/saas-analysis?currency=USD').get_json()['data']['current']['subscriptions'] == 1


def test_all_state_filters_scope_clients_tariffs_and_payments(client, app):
    from models import db, Client, Payment
    statuses = ['active', 'at_risk', 'no_signup', 'cancelled', 'paused', 'lead']
    with app.app_context():
        for i, status in enumerate(statuses, 1):
            c = Client(name=status, business_name=status, status=status,
                       signup_date=date(2026, 1, 1), sale_date=date(2026, 1, 1),
                       cancelled_date=date(2026, 2, 1) if status == 'cancelled' else None,
                       currency='ARS', payment_amount=i * 100)
            db.session.add(c)
            db.session.flush()
            db.session.add(Payment(client_id=c.id, status='paid', currency='ARS',
                                   amount=i * 10, paid_at=datetime(2026, 1, 1), payment_type='monthly'))
        db.session.commit()
    cases = {'all': statuses, 'active': ['active', 'at_risk'],
             'active_no_signup': ['active', 'at_risk', 'no_signup'],
             **{s: [s] for s in statuses if s != 'active'}}
    for status, included in cases.items():
        result = client.get('/api/saas-analysis' + ('' if status == 'all' else '?status=' + status)).get_json()['data']
        expected_indexes = [statuses.index(s) + 1 for s in included]
        assert result['selected_count'] == len(included)
        assert {s['status'] for s in result['status_breakdown']} == set(included)
        assert sum(result['selected_counts'].values()) == result['selected_count']
        assert result['selected_tariffs']['ARS'] == sum(expected_indexes) * 100
        assert result['collected_total']['ARS'] == sum(expected_indexes) * 10
        assert sum(r['collected']['ARS'] for r in result['monthly']) == result['collected_total']['ARS']
        assert result['current']['mrr']['ARS'] == sum((statuses.index(s)+1)*100 for s in included if s in ['active', 'at_risk'])
        assert result['scope']['status'] == status
    with app.app_context():
        assert Client.query.count() == 6
        assert Payment.query.count() == 6
        assert {c.status for c in Client.query.all()} == set(statuses)


def test_income_month_matches_dashboard_due_date_and_deposit_rules(client, app):
    from models import db, Client, Payment
    with app.app_context():
        c = Client(name='Monthly', business_name='Monthly', status='active',
                   signup_date=date(2026, 1, 1), sale_date=date(2026, 1, 1), currency='ARS')
        db.session.add(c)
        db.session.flush()
        # Late receipt, early receipt, deposit, missing due date, missing receipt date,
        # unpaid item and a payment period predating the client registration.
        for kind, amount, due, receipt, status in [
            ('monthly', 100, date(2026, 1, 10), datetime(2026, 2, 2), 'paid'),
            ('monthly', 200, date(2026, 2, 28), datetime(2026, 1, 5), 'paid'),
            ('deposit', 30, date(2026, 1, 10), datetime(2026, 2, 3), 'paid'),
            ('extra_work', 40, None, datetime(2026, 2, 4), 'paid'),
            ('monthly', 50, date(2026, 2, 5), None, 'paid'),
            ('monthly', 999, date(2026, 2, 5), None, 'pending'),
            ('monthly', 10, date(2025, 12, 10), datetime(2026, 1, 5), 'paid'),
        ]:
            db.session.add(Payment(client_id=c.id, payment_type=kind, amount=amount,
                                   currency='ARS', due_date=due, paid_at=receipt, status=status))
        db.session.commit()
    analysis = client.get('/api/saas-analysis').get_json()['data']
    rows = {r['month']: r for r in analysis['monthly']}
    for month, expected in [('2025-12', 10), ('2026-01', 100), ('2026-02', 320)]:
        summary = client.get(f'/api/dashboard/income?month={month}&payment_type=all').get_json()['data']
        assert rows[month]['collected']['ARS'] == summary['totals']['ARS'] == expected
    assert analysis['collected_total']['ARS'] == 430


def test_signup_cohorts_month_end_censoring_and_paid_records():
    clients = [customer(1, 'cancelled', date(2025, 12, 31), date(2026, 1, 31)),
               customer(2, 'cancelled', date(2025, 12, 31), date(2026, 1, 10)),
               customer(3, signup=date(2026, 2, 25)),
               customer(4, signup=date(2025, 12, 31), cancel=date(2026, 1, 5))]
    payments = [NS(client_id=1, status='paid', paid_at=datetime(2026, 1, 1), currency='ARS', amount=100, payment_type='monthly'),
                NS(client_id=1, status='paid', paid_at=datetime(2026, 2, 1), currency='ARS', amount=100, payment_type='monthly')]
    data = build_saas_analysis(clients, payments, date(2026, 3, 1))
    assert data['cohorts'][0]['month'] == '2025-12'  # Receipt was in January.
    assert data['cohorts'][0]['size'] == 3
    assert data['cohorts'][0]['retention'][0]['retained'] == 3
    assert data['cohorts'][0]['retention'][1]['retained'] == 1
    assert len(data['cohorts'][1]['retention']) == 1  # Recent customer: month zero only.
    assert data['hazards'][0]['eligible'] == 3  # Recent customer excluded.
    assert data['hazards'][0]['cancellations'] == 1
    assert data['hazards'][1]['cancellations'] == 1
    details = {c['id']: c for c in data['cancellations']}
    assert details[1]['completed_months'] == 1
    assert details[1]['life_month'] == 2
    assert details[1]['paid_monthly_records'] == 1
    assert sum(data['duration_distribution'].values()) == 2
    assert sum(data['paid_monthly_distribution'].values()) == 2
    assert data['early_cancellations']['1'] == 1
    assert data['current']['subscriptions'] == 2  # No invented reactivation event.
    assert any('reactivaci' in q for q in data['quality'])


def test_simulation_can_include_no_signup_independently_of_report_filter(client, app):
    from models import db, Client
    with app.app_context():
        for name, status, amount, currency, archived in [
            ('Active', 'active', 30000, 'ARS', False),
            ('Risk', 'at_risk', 20, 'USD', False),
            ('Pending1', 'no_signup', 25000, 'ARS', False),
            ('Pending2', 'no_signup', 15, 'USD', False),
            ('Cancelled', 'cancelled', 99999, 'ARS', False),
            ('Archived', 'no_signup', 99999, 'ARS', True),
        ]:
            db.session.add(Client(name=name, business_name=name, status=status,
                                  payment_amount=amount, currency=currency,
                                  archived_at=datetime(2026, 1, 1) if archived else None))
        db.session.commit()
    data = client.get('/api/saas-analysis?status=active').get_json()['data']
    assert data['selected_count'] == 2
    assert data['current']['mrr'] == {'ARS': 30000, 'USD': 20}
    assert data['simulation_base']['active'] == {'count': 2, 'no_signup_count': 0, 'tariffs': {'ARS': 30000, 'USD': 20}}
    assert data['simulation_base']['active_no_signup'] == {'count': 4, 'no_signup_count': 2, 'tariffs': {'ARS': 55000, 'USD': 35}}
