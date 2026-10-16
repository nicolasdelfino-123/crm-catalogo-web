"""Read-only SaaS reporting from recorded clients and payments."""
from collections import Counter
from datetime import date, timedelta
from statistics import mean, median
from client_statistics import anniversary, build_client_statistics


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
    paid = [p for p in payments if p.status == 'paid' and p.paid_at and p.paid_at.date() <= today]
    currencies = sorted({'ARS', 'USD'} | {c.currency for c in clients} | {p.currency for p in paid})

    def money(items, amount):
        return {unit: round(sum(float(getattr(x, amount) or 0) for x in items if x.currency == unit), 2) for unit in currencies}

    def alive(c, day):
        return c.signup_date <= day and (c.status != 'cancelled' or c.cancelled_date > day)

    monthly = []
    for source in statistics['monthly']:
        details = statistics['monthly_details'][source['month']]
        opening = [by_id[i] for i in details['active_start']]
        added = [by_id[i] for i in details['signups']]
        lost = [by_id[i] for i in details['cancellations']]
        closing = [by_id[i] for i in details['active_end']]
        lost_base = [by_id[i] for i in details['churn_rate']]
        cursor = date.fromisoformat(source['month'] + '-01')
        end = min(anniversary(cursor, 1) - timedelta(days=1), today)
        initial, final = money(opening, 'payment_amount'), money(closing, 'payment_amount')
        base_loss = money(lost_base, 'payment_amount')
        monthly.append(dict(month=source['month'], partial=source['partial'],
                            active_start=source['active_start'], signups=source['signups'], cancellations=source['cancellations'],
                            new_cancellations=len([c for c in lost if c in added]), active_end=source['active_end'],
                            net=source['net'], mrr_start=initial, mrr_new=money(added, 'payment_amount'),
                            mrr_lost=money(lost, 'payment_amount'), mrr_end=final,
                            mrr_net={u: round(final[u]-initial[u], 2) for u in currencies},
                            mrr_change_percent={u: round((final[u]-initial[u])/initial[u]*100, 2) if initial[u] else None for u in currencies},
                            collected=money([p for p in paid if cursor <= p.paid_at.date() <= end], 'amount'),
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
    # First monthly payment identifies acquisition; payment period is not a receipt date.
    starts = {}
    for p in paid:
        if p.payment_type == 'monthly':
            starts[p.client_id] = min(starts.get(p.client_id, p.paid_at.date()), p.paid_at.date())
    cohorts = []
    for key in sorted({d.strftime('%Y-%m') for d in starts.values()}):
        members = [c for c in subscriptions if c.id in starts and starts[c.id].strftime('%Y-%m') == key]
        if not members:
            continue
        cells = []
        max_age = max((today.year-starts[c.id].year)*12+today.month-starts[c.id].month for c in members)
        for n in range(max(6, max_age)+1):
            eligible = [c for c in members if anniversary(starts[c.id], n) <= today]
            retained = sum(alive(c, anniversary(starts[c.id], n)) for c in eligible)
            cells.append(dict(month=n, eligible=len(eligible), retained=retained, rate=round(retained/len(eligible)*100, 1) if eligible else None))
        cohorts.append(dict(month=key, size=len(members), retention=cells))
    current_mrr = money(active, 'payment_amount')
    quality = [
        'Exactos según registros: estado y tarifa actuales; cobros con estado paid y fecha paid_at, por moneda. Clientes archivados excluidos, como en Clientes y Resumen. Cobros: sólo pagos de los clientes seleccionados por su estado actual. No incluye pagos de archivados.',
        'El filtro selecciona por estado ACTUAL: el historial describe ese grupo, no sus cambios de estado pasados. Tarifas del grupo no equivalen a MRR ni a cobros; sólo active/at_risk genera MRR actual.',
        'Historia de clientes: misma reconstrucción de altas/bajas que Resumen. MRR histórico, variaciones, ARPA histórico y churn de ingresos: sin datos suficientes; no se extrapolan tarifas actuales.',
        'Activos de Resumen incluyen sin alta; suscripciones activas y MRR sólo active/at_risk. Historia de clientes reutiliza build_client_statistics, igual que Resumen. Las tarifas históricas reales no están disponibles.',
        'Sin datos suficientes: cambios de precios, NRR, motivos de baja e historial de pausas/reactivaciones. No se inventan períodos de reactivación.',
        'Cohortes por primer cobro mensual registrado (puede no ser el primer pago real). Sólo suscripciones con fechas utilizables; retención por aniversarios cumplidos.',
        f'{len(clients)-len(subscriptions)} clientes fuera de reconstrucción (leads, sin alta, pausados o fechas incompletas/inconsistentes). Estado activo actual: {len(active)}; cierre reconstruido: {monthly[-1]["active_end"] if monthly else 0}.',
        f'{sum(p.status == "paid" and not p.paid_at for p in payments)} pagos marcados pagados sin fecha excluidos de cobros por período.',
        'Los cobros incluyen todos los conceptos registrados, no sólo mensualidades. Cero significa ningún cobro registrado, no prueba de ausencia de ingresos.',
    ]
    collected_by_type = {kind: money([p for p in paid if p.payment_type == kind], 'amount')
                         for kind in sorted({p.payment_type for p in paid}, key=str)}
    state_counts = Counter(c.status for c in clients)
    status_breakdown = [dict(status=status, count=state_counts[status],
                             counts={u: sum(c.status == status and c.currency == u for c in clients) for u in currencies},
                             recorded_tariffs=money([c for c in clients if c.status == status], 'payment_amount'))
                        for status in sorted(state_counts)]
    return dict(status_breakdown=status_breakdown, selected_count=len(clients),
                selected_counts={u: sum(c.currency == u for c in clients) for u in currencies},
                selected_tariffs=money(clients, 'payment_amount'), collected_by_type=collected_by_type, as_of=today.isoformat(), currencies=currencies, monthly=monthly, cohorts=cohorts,
                current=dict(active=len(dashboard_active), subscriptions=len(active), mrr=current_mrr, counts={u: sum(c.currency == u for c in active) for u in currencies},
                             arpa={u: round(current_mrr[u]/sum(c.currency == u for c in active), 2) if any(c.currency == u for c in active) else None for u in currencies}),
                collected_total=money(paid, 'amount'), cancellation_count=sum(c.status == 'cancelled' for c in clients),
                cancellation_mrr={u: None for u in currencies}, duration_mean_days=round(mean(durations), 1) if durations else None,
                duration_median_days=median(durations) if durations else None,
                duration_distribution={str(n): distribution[n] for n in range(1, 7)},
                tariffs=[dict(currency=u, amount=a, count=count) for (u, a), count in sorted(Counter((c.currency, float(c.payment_amount or 0)) for c in clients).items())],
                cancellations=[dict(name=c.business_name, signup=c.signup_date.isoformat(), cancelled=c.cancelled_date.isoformat(), currency=c.currency, amount=float(c.payment_amount or 0)) for c in cancelled],
                quality=quality, price_changes=None, nrr=None, cancellation_reasons=None)
