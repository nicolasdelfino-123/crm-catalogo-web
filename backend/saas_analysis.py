"""Read-only SaaS reporting from recorded clients and payments."""
from collections import Counter
from datetime import date
from statistics import mean, median
from client_statistics import anniversary, build_client_statistics


def payment_month_date(payment):
    """Same month assignment as dashboard_income; receipts are not reassigned."""
    if payment.payment_type == 'deposit' and payment.paid_at:
        return payment.paid_at.date()
    return getattr(payment, 'due_date', None) or (payment.paid_at.date() if payment.paid_at else None)


def build_saas_analysis(clients, payments, today):
    clients = [c for c in clients if not getattr(c, 'archived_at', None)]
    client_ids = {c.id for c in clients}
    payments = [p for p in payments if p.client_id in client_ids]
    statistics = build_client_statistics(clients, today)
    by_id = {c.id: c for c in clients}
    active = [c for c in clients if c.status in {'active', 'at_risk'}]
    dashboard_active = [c for c in clients if c.status in {'active', 'at_risk', 'no_signup'}]
    subscriptions = [c for c in clients if c.status in {'active', 'at_risk', 'cancelled'}
                     and c.signup_date and c.signup_date <= today
                     and (c.status != 'cancelled' or c.cancelled_date and c.signup_date <= c.cancelled_date <= today)]
    paid = [p for p in payments if p.status == 'paid']
    currencies = sorted({'ARS', 'USD'} | {c.currency for c in clients} | {p.currency for p in paid})

    def money(items, amount):
        return {unit: round(sum(float(getattr(x, amount) or 0) for x in items if x.currency == unit), 2) for unit in currencies}

    def alive(c, day):
        return c.signup_date <= day and (c.status != 'cancelled' or c.cancelled_date > day)

    monthly = []
    sources = {r['month']: r for r in statistics['monthly']}
    payment_months = {payment_month_date(p).strftime('%Y-%m') for p in paid
                      if payment_month_date(p) and payment_month_date(p).strftime('%Y-%m') <= today.strftime('%Y-%m')}
    for month in payment_months - sources.keys():
        sources[month] = dict(month=month, partial=month == today.strftime('%Y-%m'),
                              active_start=0, active_end=0, signups=0, cancellations=0,
                              net=0, churn_rate=None)
    for source in sorted(sources.values(), key=lambda r: r['month']):
        details = statistics['monthly_details'].get(source['month'], {key: [] for key in ('active_start', 'signups', 'cancellations', 'active_end', 'churn_rate')})
        opening = [by_id[i] for i in details['active_start']]
        added = [by_id[i] for i in details['signups']]
        lost = [by_id[i] for i in details['cancellations']]
        closing = [by_id[i] for i in details['active_end']]
        lost_base = [by_id[i] for i in details['churn_rate']]
        cursor = date.fromisoformat(source['month'] + '-01')
        initial, final = money(opening, 'payment_amount'), money(closing, 'payment_amount')
        base_loss = money(lost_base, 'payment_amount')
        monthly.append(dict(month=source['month'], partial=source['partial'],
                            active_start=source['active_start'], signups=source['signups'], cancellations=source['cancellations'],
                            new_cancellations=len([c for c in lost if c in added]), active_end=source['active_end'],
                            net=source['net'], mrr_start=initial, mrr_new=money(added, 'payment_amount'),
                            mrr_lost=money(lost, 'payment_amount'), mrr_end=final,
                            mrr_net={u: round(final[u]-initial[u], 2) for u in currencies},
                            mrr_change_percent={u: round((final[u]-initial[u])/initial[u]*100, 2) if initial[u] else None for u in currencies},
                            collected=money([p for p in paid if payment_month_date(p) and cursor <= payment_month_date(p) < anniversary(cursor, 1)], 'amount'),
                            arpa={u: round(final[u]/sum(c.currency == u for c in closing), 2) if any(c.currency == u for c in closing) else None for u in currencies},
                            churn=source['churn_rate'],
                            revenue_churn={u: round(base_loss[u]/initial[u]*100, 2) if initial[u] else None for u in currencies}))
    # No price snapshots exist. Never present current tariffs as historical MRR.
    for row in monthly:
        for field in ('mrr_start', 'mrr_new', 'mrr_lost', 'mrr_end', 'mrr_net',
                      'mrr_change_percent', 'arpa', 'revenue_churn'):
            row[field] = {u: None for u in currencies}
    cancelled = [c for c in subscriptions if c.status == 'cancelled']
    durations = [(c.cancelled_date-c.signup_date).days for c in cancelled]
    distribution = Counter(min(6, next((n for n in range(1, 6) if c.cancelled_date < anniversary(c.signup_date, n)), 6)) for c in cancelled)
    # Effective signup is the same event used by Resumen, never first receipt.
    def cancelled_before(c, day):
        return c.status == 'cancelled' and c.cancelled_date <= day

    cohorts = []
    for key in sorted({c.signup_date.strftime('%Y-%m') for c in subscriptions}):
        members = [c for c in subscriptions if c.signup_date.strftime('%Y-%m') == key]
        cells = []
        max_age = max((today.year-c.signup_date.year)*12+today.month-c.signup_date.month for c in members)
        for n in range(max_age+1):
            eligible = [c for c in members if anniversary(c.signup_date, n) <= today]
            if not eligible:
                continue
            retained = sum(not cancelled_before(c, anniversary(c.signup_date, n)) for c in eligible)
            cells.append(dict(month=n, eligible=len(eligible), retained=retained,
                              rate=round(retained/len(eligible)*100, 1)))
        cohorts.append(dict(month=key, size=len(members), retention=cells))

    def lifetime_months(c):
        n = (c.cancelled_date.year-c.signup_date.year)*12+c.cancelled_date.month-c.signup_date.month
        return max(0, n - (anniversary(c.signup_date, n) > c.cancelled_date))

    cancellation_details = []
    payment_counts = Counter()
    for c in cancelled:
        completed = lifetime_months(c)
        receipts = [p for p in paid if p.client_id == c.id and p.payment_type == 'monthly'
                    and p.paid_at and p.paid_at.date() <= c.cancelled_date]
        payment_counts[min(len(receipts), 5)] += 1
        cancellation_details.append(dict(id=c.id, name=c.business_name, signup=c.signup_date.isoformat(),
            cancelled=c.cancelled_date.isoformat(), days=(c.cancelled_date-c.signup_date).days,
            completed_months=completed, life_month=completed+1, paid_monthly_records=len(receipts),
            currency=c.currency, amount=float(c.payment_amount or 0), reason=None))
    cancellations_monthly = []
    for row in monthly:
        members = [c for c in cancelled if c.cancelled_date.strftime('%Y-%m') == row['month']]
        cancellations_monthly.append(dict(month=row['month'], active_start=row['active_start'],
            signups=row['signups'], cancellations=row['cancellations'], net=row['net'], churn=row['churn'],
            age_counts=[sum(lifetime_months(c) == n for c in members) for n in range(3)] +
                       [sum(lifetime_months(c) >= 3 for c in members)],
            reference_lost_mrr=money(members, 'payment_amount'),
            client_ids=[c.id for c in members]))
    hazards = []
    for n in range(6):
        eligible = [c for c in subscriptions
                    if not (c.status == 'cancelled' and c.cancelled_date < anniversary(c.signup_date, n))
                    and (anniversary(c.signup_date, n+1) <= today or
                         c.status == 'cancelled' and anniversary(c.signup_date, n) <= c.cancelled_date < anniversary(c.signup_date, n+1))]
        events = sum(c.status == 'cancelled' and anniversary(c.signup_date, n) <= c.cancelled_date < anniversary(c.signup_date, n+1) for c in eligible)
        hazards.append(dict(life_month=n+1, eligible=len(eligible), cancellations=events,
                            rate=round(events/len(eligible)*100, 1) if eligible else None))
    day_retention = []
    from datetime import timedelta
    for days in (30, 60, 90):
        eligible = [c for c in subscriptions if c.signup_date + timedelta(days=days) <= today]
        retained = sum(not cancelled_before(c, c.signup_date + timedelta(days=days)) for c in eligible)
        day_retention.append(dict(days=days, eligible=len(eligible), retained=retained,
                                  rate=round(retained/len(eligible)*100, 1) if eligible else None))
    early = {str(n): sum(c.cancelled_date < anniversary(c.signup_date, n) for c in cancelled) for n in (1, 2, 3)}
    risks = []
    for c in clients:
        if c.status != 'at_risk':
            continue
        receipts = [p for p in paid if p.client_id == c.id and p.paid_at]
        last = max(receipts, key=lambda p: p.paid_at, default=None)
        due = getattr(c, 'next_renewal_date', None)
        risks.append(dict(id=c.id, name=c.business_name, status=c.status,
                          days=max(0, (today-c.signup_date).days) if c.signup_date else None,
                          amount=float(c.payment_amount or 0), currency=c.currency,
                          last_paid_at=last.paid_at.isoformat() if last else None,
                          next_due=due.isoformat() if due else None,
                          overdue_days=max(0, (today-due).days) if due else None))
    current_mrr = money(active, 'payment_amount')
    quality = [
        'Exactos según registros: estado y tarifa actuales; pagos con estado paid, asignados al mes por vencimiento; sin vencimiento se usa fecha de pago. Señas: fecha de pago, igual que Resumen. Clientes archivados excluidos, como en Clientes y Resumen. Cobros: sólo pagos de los clientes seleccionados por su estado actual. No incluye pagos de archivados.',
        'El filtro selecciona por estado ACTUAL: el historial describe ese grupo, no sus cambios de estado pasados. Tarifas del grupo no equivalen a MRR ni a cobros; sólo active/at_risk genera MRR actual.',
        'Historia de clientes: misma reconstrucción de altas/bajas que Resumen. MRR histórico, variaciones, ARPA histórico y churn de ingresos: sin datos suficientes; no se extrapolan tarifas actuales.',
        'Activos de Resumen incluyen sin alta; suscripciones activas y MRR sólo active/at_risk. Historia de clientes reutiliza build_client_statistics, igual que Resumen. Las tarifas históricas reales no están disponibles.',
        'Sin datos suficientes: cambios de precios, NRR, motivos de baja e historial de pausas/reactivaciones. No se inventan períodos de reactivación.',
        'Cohortes por alta efectiva (signup_date), igual que Resumen. Mes 0: al alta; mes 1: primer aniversario. Sólo active/at_risk/cancelled con fechas válidas. Sin historial de reactivación no puede garantizarse retención continua. Las cohortes recientes tienen denominadores parciales, comparar sólo antigüedades maduras.',
        'Mensualidades pagadas: cantidad de registros monthly con paid_at hasta la baja; no meses de servicio únicos. Tarifas al cancelar: sólo referencia actual estimada, no pérdida histórica exacta ni salida de caja.',
        'Tasa por etapa: bajas del intervalo / clientes que lo completaron o cancelaron dentro. Clientes recientes aún sin observación completa se excluyen. No se calcula curva de supervivencia por falta de historial fiable de estados.',
        f'{len(clients)-len(subscriptions)} clientes fuera de reconstrucción (leads, sin alta, pausados o fechas incompletas/inconsistentes). Estado activo actual: {len(active)}; cierre reconstruido: {monthly[-1]["active_end"] if monthly else 0}.',
        f'{sum(p.status == "paid" and not payment_month_date(p) for p in payments)} pagos marcados pagados sin fecha excluidos de cobros por período.',
        'Los cobros incluyen todos los conceptos registrados, no sólo mensualidades. Cero significa ningún cobro registrado, no prueba de ausencia de ingresos.',
    ]
    collected_by_type = {kind: money([p for p in paid if p.payment_type == kind], 'amount')
                         for kind in sorted({p.payment_type for p in paid}, key=str)}
    state_counts = Counter(c.status for c in clients)
    status_breakdown = [dict(status=status, count=state_counts[status],
                             counts={u: sum(c.status == status and c.currency == u for c in clients) for u in currencies},
                             recorded_tariffs=money([c for c in clients if c.status == status], 'payment_amount'))
                        for status in sorted(state_counts)]
    return dict(cancellations_monthly=cancellations_monthly, hazards=hazards,
                day_retention=day_retention, early_cancellations=early,
                consolidated_cancellations=len(cancelled)-early['3'],
                paid_monthly_distribution={str(n): payment_counts[n] for n in range(6)},
                at_risk=risks, at_risk_summary=dict(count=len(risks), tariffs=money([c for c in clients if c.status == 'at_risk'], 'payment_amount')),
                status_breakdown=status_breakdown, selected_count=len(clients),
                selected_counts={u: sum(c.currency == u for c in clients) for u in currencies},
                selected_tariffs=money(clients, 'payment_amount'), collected_by_type=collected_by_type, as_of=today.isoformat(), currencies=currencies, monthly=monthly, cohorts=cohorts,
                current=dict(active=len(dashboard_active), subscriptions=len(active), mrr=current_mrr, counts={u: sum(c.currency == u for c in active) for u in currencies},
                             arpa={u: round(current_mrr[u]/sum(c.currency == u for c in active), 2) if any(c.currency == u for c in active) else None for u in currencies}),
                collected_total=money(paid, 'amount'), cancellation_count=sum(c.status == 'cancelled' for c in clients),
                cancellation_mrr={u: None for u in currencies}, duration_mean_days=round(mean(durations), 1) if durations else None,
                duration_median_days=median(durations) if durations else None,
                duration_distribution={str(n): distribution[n] for n in range(1, 7)},
                tariffs=[dict(currency=u, amount=a, count=count) for (u, a), count in sorted(Counter((c.currency, float(c.payment_amount or 0)) for c in clients).items())],
                cancellations=cancellation_details,
                quality=quality, price_changes=None, nrr=None, cancellation_reasons=None)
