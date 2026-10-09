"""Informative sales, cancellations and cohort retention from recorded client dates."""
import calendar
from datetime import date


def anniversary(start, months):
    year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
    month += 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def build_client_statistics(clients, today):
    active_statuses = {"active", "at_risk"}
    subscriptions = [c for c in clients if c.status in active_statuses | {"cancelled"}
                     and c.signup_date and c.signup_date <= today
                     and (c.status != "cancelled" or c.cancelled_date
                          and c.cancelled_date >= c.signup_date)]

    def alive(customer, day):
        return customer.signup_date <= day and (
            customer.status != "cancelled" or customer.cancelled_date > day)

    dates = [value for c in clients for value in (
        c.sale_date, c.signup_date if c.status != "no_signup" else None,
        c.cancelled_date if c.status == "cancelled" else None,
    ) if value and value <= today]
    monthly = []
    if dates:
        first = min(dates).replace(day=1)
        cursor = first
        while cursor <= today:
            next_month = anniversary(cursor, 1)
            end = min(date.fromordinal(next_month.toordinal() - 1), today)
            opening = [c for c in subscriptions if c.signup_date < cursor
                       and (c.status != "cancelled" or c.cancelled_date >= cursor)]
            sales = sum(bool(c.sale_date and cursor <= c.sale_date <= end) for c in clients)
            signups = sum(bool(c.status != "no_signup" and c.signup_date
                               and cursor <= c.signup_date <= end) for c in clients)
            cancellations = sum(bool(c.status == "cancelled" and c.cancelled_date
                                     and cursor <= c.cancelled_date <= end) for c in clients)
            lost = sum(c.status == "cancelled" and c.cancelled_date <= end for c in opening)
            monthly.append({
                "month": cursor.strftime("%Y-%m"), "sales": sales, "signups": signups,
                "cancellations": cancellations, "net": signups - cancellations,
                "active_start": len(opening), "active_end": sum(alive(c, end) for c in subscriptions),
                "churn_rate": round(lost / len(opening) * 100, 1) if opening else None,
                "partial": next_month > today,
            })
            cursor = next_month

    max_month = max(((today.year - c.signup_date.year) * 12 + today.month - c.signup_date.month
                     for c in subscriptions), default=0)
    retention_months = list(range(1, max_month + 1))
    cohorts = []
    sale_months = sorted({c.sale_date.strftime("%Y-%m") for c in clients
                         if c.sale_date and c.sale_date <= today})
    for month in sale_months:
        members = [c for c in clients if c.sale_date and c.sale_date.strftime("%Y-%m") == month
                   and c.sale_date <= today]
        member_ids = {c.id for c in members}
        measured = [c for c in subscriptions if c.id in member_ids]
        retention = []
        for number in retention_months:
            eligible = [c for c in measured if anniversary(c.signup_date, number) <= today]
            retained = sum(alive(c, anniversary(c.signup_date, number)) for c in eligible)
            retention.append({"month": number, "eligible": len(eligible), "retained": retained,
                              "rate": round(retained / len(eligible) * 100, 1) if eligible else None})
        cohorts.append({"month": month, "sales": len(members),
                        "active": sum(c.status in active_statuses for c in members),
                        "cancelled": sum(c.status == "cancelled" for c in members),
                        "no_signup": sum(c.status == "no_signup" for c in members),
                        "retention": retention})

    return {
        "as_of": today.isoformat(), "monthly": monthly, "cohorts": cohorts,
        "retention_months": retention_months,
        "summary": {"total": len(clients),
                    "sales": sum(bool(c.sale_date and c.sale_date <= today) for c in clients),
                    "active": sum(c.status in active_statuses for c in clients),
                    "cancelled": sum(c.status == "cancelled" for c in clients),
                    "no_signup": sum(c.status == "no_signup" for c in clients),
                    "missing_sale_date": sum(not c.sale_date for c in clients),
                    "missing_cancellation_date": sum(c.status == "cancelled" and not c.cancelled_date for c in clients)},
    }
