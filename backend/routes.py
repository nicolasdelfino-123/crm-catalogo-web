import csv
import io
import calendar
from datetime import date, datetime, timedelta
from flask import Blueprint, jsonify, request, Response
from sqlalchemy import Integer, case, cast, func, or_
from models import db, Client, ClientAction, Payment, ClientMetric, ClientNote, ActionTemplate

api = Blueprint("api", __name__)

STATUSES = {"lead", "active", "at_risk", "paused", "cancelled"}


def ok(data=None, message=None, status=200):
    return jsonify({"success": True, "data": data, "message": message}), status


def error(message, status=400, fields=None):
    return jsonify({"success": False, "error": {"code": "VALIDATION_ERROR", "message": message, "fields": fields or {}}}), status


def parse_date(value):
    return date.fromisoformat(value) if value else None


def add_calendar_months(value, months):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def advance_service_stage(client, today=None):
    """Sincroniza la etapa con el mes indicado por la próxima renovación."""
    today = today or date.today()
    if not client.signup_date:
        return False
    original = client.service_stage
    original_renewal = client.next_renewal_date
    latest_paid_period = max(
        (
            payment.due_date
            for payment in client.payments
            if payment.status == "paid" and payment.payment_type == "monthly" and payment.due_date
        ),
        default=None,
    )
    if latest_paid_period and (
        not client.next_renewal_date or client.next_renewal_date <= latest_paid_period
    ):
        client.next_renewal_date = add_calendar_months(latest_paid_period, 1)
    reference_date = client.next_renewal_date or today
    elapsed_months = max(0, (reference_date.year - client.signup_date.year) * 12 + reference_date.month - client.signup_date.month)
    if reference_date < add_calendar_months(client.signup_date, elapsed_months):
        elapsed_months = max(0, elapsed_months - 1)
    month_number = max(1, elapsed_months if client.next_renewal_date else elapsed_months + 1)
    stages = {1: "first_month", 2: "second_month", 3: "third_month"}
    client.service_stage = stages.get(month_number, f"month_{month_number}")
    client.service_stage_manual = False
    return client.service_stage != original or client.next_renewal_date != original_renewal


def sync_service_stages(clients):
    # No usar any(): se detiene en el primer True y deja clientes sin sincronizar.
    changed = False
    for client in clients:
        changed = advance_service_stage(client) or changed
    if changed:
        db.session.commit()


def apply_client(client, data):
    required = {"name", "business_name", "signup_date", "country", "currency"}
    missing = [key for key in required if not data.get(key) and not getattr(client, key, None)]
    if missing:
        raise ValueError("Completá los campos obligatorios: " + ", ".join(missing))
    if data.get("status") and data["status"] not in STATUSES:
        raise ValueError("Estado inválido")
    text_fields = ["name", "business_name", "website_url", "instagram_username", "email", "phone", "country", "city", "acquisition_source", "currency", "status", "service_stage", "page_status", "link_in_bio_status", "prices_status", "images_status", "admin_load_status", "twelve_products_status", "domain_purchased_status", "notes_summary"]
    for field in text_fields:
        if field in data:
            setattr(client, field, data[field] or None)
    for field in ["signup_date", "next_renewal_date"]:
        if field in data:
            setattr(client, field, parse_date(data[field]))
    if "signup_date" in data and client.signup_date and not data.get("next_renewal_date"):
        client.next_renewal_date = add_calendar_months(client.signup_date, 1)
    for field in ["payment_amount"]:
        if field in data:
            setattr(client, field, data[field] or 0)
    for field in ["followers_count", "publications_count", "active_products_count", "web_sales_count"]:
        if field in data:
            setattr(client, field, max(0, int(data[field] or 0)))
    if "service_stage_manual" in data:
        client.service_stage_manual = bool(data["service_stage_manual"])
    if "signup_date" in data or "next_renewal_date" in data:
        advance_service_stage(client)


def record_client_metric(client):
    """Guarda los contadores de la ficha en la evolución del día."""
    metric = ClientMetric.query.filter_by(
        client_id=client.id, recorded_at=date.today()
    ).order_by(ClientMetric.id.desc()).first()
    if metric is None:
        metric = ClientMetric(client=client, recorded_at=date.today())
        db.session.add(metric)
    metric.followers_count = client.followers_count or 0
    metric.publications_count = client.publications_count or 0


def advance_renewal_after_payment(payment):
    """Al pagar una mensualidad, abre el período siguiente del cliente."""
    if payment.payment_type != "monthly":
        return
    client = payment.client
    paid_period = payment.due_date or client.next_renewal_date
    if not paid_period:
        return
    next_renewal = add_calendar_months(paid_period, 1)
    if not client.next_renewal_date or next_renewal > client.next_renewal_date:
        client.next_renewal_date = next_renewal
    advance_service_stage(client)


def generate_schedule(client):
    count = 0
    existing = {a.template_key for a in client.actions}
    for template in ActionTemplate.query.filter_by(is_active=True).all():
        if template.key in existing:
            continue
        action = ClientAction(client=client, title=template.title, action_type=template.action_type, priority=template.priority, template_key=template.key)
        if template.day_offset is not None:
            action.due_date = client.signup_date + timedelta(days=template.day_offset)
        db.session.add(action)
        count += 1
    return count


@api.get("/clients")
def clients_list():
    query = Client.query.filter(Client.archived_at.is_(None))
    sync_service_stages(query.all())
    search = request.args.get("search", "").strip()
    if search:
        term = f"%{search}%"
        query = query.filter(or_(Client.name.ilike(term), Client.business_name.ilike(term), Client.instagram_username.ilike(term), Client.email.ilike(term)))
    for field in ["status", "service_stage", "country", "currency", "acquisition_source"]:
        if request.args.get(field): query = query.filter(getattr(Client, field) == request.args[field])
    sort_by = request.args.get("sort_by", "name")
    if sort_by == "service_stage":
        # Las etapas se guardan como texto, pero en la tabla deben seguir el
        # orden natural de los meses (mes 2 antes que mes 10).
        column = case(
            (Client.service_stage == "first_month", 1),
            (Client.service_stage == "second_month", 2),
            (Client.service_stage == "third_month", 3),
            (Client.service_stage.like("month_%"), cast(func.substr(Client.service_stage, 7), Integer)),
            # Cualquier etapa no mensual se muestra después de la secuencia
            # 1, 2, 3... cuando el orden es ascendente.
            else_=2147483647,
        )
    else:
        column = getattr(Client, sort_by, Client.name)
    direction = column.desc() if request.args.get("sort_dir") == "desc" else column.asc()
    query = query.order_by(direction, Client.name.asc())
    page = max(1, request.args.get("page", 1, type=int)); per_page = min(100, request.args.get("per_page", 25, type=int))
    result = query.paginate(page=page, per_page=per_page, error_out=False)
    return ok({"items": [c.summary() for c in result.items], "pagination": {"page": page, "per_page": per_page, "total": result.total, "pages": result.pages}})


@api.post("/clients")
def clients_create():
    try:
        data = request.get_json() or {}; client = Client(); apply_client(client, data)
        db.session.add(client); db.session.flush()
        if "followers_count" in data or "publications_count" in data:
            record_client_metric(client)
        if data.get("generate_schedule", True): generate_schedule(client)
        db.session.commit(); return ok(client.detail(), "Cliente creado", 201)
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.get("/clients/<int:client_id>")
def clients_detail(client_id):
    client = Client.query.get_or_404(client_id)
    if advance_service_stage(client):
        db.session.commit()
    return ok(client.detail())


@api.patch("/clients/<int:client_id>")
def clients_update(client_id):
    client = Client.query.get_or_404(client_id)
    try:
        data = request.get_json() or {}
        previous_counts = (client.followers_count or 0, client.publications_count or 0)
        apply_client(client, data)
        current_counts = (client.followers_count or 0, client.publications_count or 0)
        if current_counts != previous_counts:
            record_client_metric(client)
        db.session.commit(); return ok(client.detail(), "Cliente actualizado")
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.delete("/clients/<int:client_id>")
def clients_archive(client_id):
    client = Client.query.get_or_404(client_id); client.archived_at = datetime.utcnow(); db.session.commit(); return ok(None, "Cliente archivado")


@api.post("/clients/<int:client_id>/generate-actions")
def actions_generate(client_id):
    client = Client.query.get_or_404(client_id); count = generate_schedule(client); db.session.commit(); return ok({"created": count}, f"Se crearon {count} acciones")


@api.get("/actions")
def actions_list():
    query = ClientAction.query.join(Client).filter(Client.archived_at.is_(None))
    if request.args.get("status") == "pending":
        query = query.filter(ClientAction.status.in_(["pending", "in_progress"]))
    elif request.args.get("status"):
        query = query.filter(ClientAction.status == request.args["status"])
    if request.args.get("view") == "overdue": query = query.filter(ClientAction.due_date < date.today())
    if request.args.get("view") == "today": query = query.filter(ClientAction.due_date == date.today())
    if request.args.get("view") == "week": query = query.filter(ClientAction.due_date.between(date.today(), date.today() + timedelta(days=7)))
    items = query.order_by(ClientAction.due_date.asc()).limit(250).all()
    return ok([{**a.to_dict(), "client_name": a.client.name, "business_name": a.client.business_name} for a in items])


@api.post("/clients/<int:client_id>/actions")
def actions_create(client_id):
    client = Client.query.get_or_404(client_id); data = request.get_json() or {}
    if not data.get("title"): return error("El título es obligatorio", 422)
    action = ClientAction(client=client, title=data["title"], description=data.get("description"), action_type=data.get("action_type", "custom"), priority=data.get("priority", "medium"), due_date=parse_date(data.get("due_date")))
    db.session.add(action); db.session.commit(); return ok(action.to_dict(), "Acción creada", 201)


@api.patch("/actions/<int:action_id>")
def actions_update(action_id):
    action = ClientAction.query.get_or_404(action_id); data = request.get_json() or {}
    for field in ["title", "description", "action_type", "priority", "status", "result_notes"]:
        if field in data: setattr(action, field, data[field])
    if "due_date" in data: action.due_date = parse_date(data["due_date"])
    if data.get("status") == "completed" and not action.completed_at: action.completed_at = datetime.utcnow()
    if data.get("status") != "completed": action.completed_at = None
    db.session.commit(); return ok(action.to_dict(), "Acción actualizada")


@api.delete("/actions/<int:action_id>")
def actions_delete(action_id):
    action = ClientAction.query.get_or_404(action_id)
    db.session.delete(action)
    db.session.commit()
    return ok(None, "Acción eliminada")


@api.post("/clients/<int:client_id>/payments")
def payments_create(client_id):
    client = Client.query.get_or_404(client_id); data = request.get_json() or {}
    try:
        amount = float(data.get("amount", 0))
        if amount < 0: raise ValueError("El importe no puede ser negativo")
        due_date = parse_date(data.get("due_date")) or client.next_renewal_date or add_calendar_months(client.signup_date, 1)
        payment = Payment(client=client, amount=amount, currency=data.get("currency", client.currency), payment_type=data.get("payment_type", "monthly"), period_year=data.get("period_year"), period_month=data.get("period_month"), due_date=due_date, status=data.get("status", "pending"), payment_method=data.get("payment_method"), notes=data.get("notes"))
        if payment.status == "paid": payment.paid_at = datetime.utcnow()
        db.session.add(payment)
        if payment.status == "paid": advance_renewal_after_payment(payment)
        db.session.commit(); return ok(payment.to_dict(), "Pago registrado", 201)
    except (ValueError, TypeError) as exc: db.session.rollback(); return error(str(exc), 422)


@api.patch("/payments/<int:payment_id>")
def payments_update(payment_id):
    payment = Payment.query.get_or_404(payment_id); data = request.get_json() or {}
    was_paid = payment.status == "paid"
    if "amount" in data:
        amount = float(data["amount"])
        if amount < 0: return error("El importe no puede ser negativo", 422)
        payment.amount = amount
    for field in ["currency", "payment_type", "status", "payment_method", "notes", "period_year", "period_month"]:
        if field in data: setattr(payment, field, data[field])
    if "due_date" in data: payment.due_date = parse_date(data["due_date"])
    payment.paid_at = datetime.utcnow() if payment.status == "paid" else None
    if payment.status == "paid" and not was_paid:
        advance_renewal_after_payment(payment)
    db.session.commit(); return ok(payment.to_dict(), "Pago actualizado")


@api.delete("/payments/<int:payment_id>")
def payments_delete(payment_id):
    payment = Payment.query.get_or_404(payment_id)
    db.session.delete(payment)
    db.session.commit()
    return ok(None, "Pago eliminado")


@api.get("/payments")
def payments_list():
    items = (
        Payment.query.join(Client)
        .filter(Client.archived_at.is_(None))
        .order_by(Client.name.asc(), Payment.due_date.asc().nullslast(), Payment.id.asc())
        .limit(300)
        .all()
    )
    return ok([p.to_dict() for p in items])


@api.post("/clients/<int:client_id>/metrics")
def metrics_create(client_id):
    client = Client.query.get_or_404(client_id); data = request.get_json() or {}
    followers = max(0, int(data.get("followers_count", 0))); publications = max(0, int(data.get("publications_count", 0)))
    metric = ClientMetric(client=client, recorded_at=parse_date(data.get("recorded_at")) or date.today(), followers_count=followers, publications_count=publications, notes=data.get("notes"))
    client.followers_count = followers; client.publications_count = publications
    db.session.add(metric); db.session.commit(); return ok(metric.to_dict(), "Métrica registrada", 201)


def sync_latest_metric(client):
    latest = ClientMetric.query.filter_by(client_id=client.id).order_by(ClientMetric.recorded_at.desc(), ClientMetric.id.desc()).first()
    client.followers_count = latest.followers_count if latest else 0
    client.publications_count = latest.publications_count if latest else 0


@api.patch("/metrics/<int:metric_id>")
def metrics_update(metric_id):
    metric = ClientMetric.query.get_or_404(metric_id); data = request.get_json() or {}
    try:
        if "recorded_at" in data: metric.recorded_at = parse_date(data["recorded_at"])
        if "followers_count" in data: metric.followers_count = max(0, int(data["followers_count"] or 0))
        if "publications_count" in data: metric.publications_count = max(0, int(data["publications_count"] or 0))
        if "notes" in data: metric.notes = data["notes"] or None
        db.session.flush(); sync_latest_metric(metric.client); db.session.commit()
        return ok(metric.to_dict(), "Métrica actualizada")
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.delete("/metrics/<int:metric_id>")
def metrics_delete(metric_id):
    metric = ClientMetric.query.get_or_404(metric_id); client = metric.client
    db.session.delete(metric); db.session.flush(); sync_latest_metric(client); db.session.commit()
    return ok(None, "Métrica eliminada")


@api.post("/clients/<int:client_id>/notes")
def notes_create(client_id):
    client = Client.query.get_or_404(client_id); data = request.get_json() or {}
    if not data.get("content", "").strip(): return error("La nota no puede estar vacía", 422)
    note = ClientNote(client=client, content=data["content"].strip(), is_pinned=bool(data.get("is_pinned")))
    db.session.add(note); db.session.commit(); return ok(note.to_dict(), "Nota guardada", 201)


@api.patch("/notes/<int:note_id>")
def notes_update(note_id):
    note = ClientNote.query.get_or_404(note_id); data = request.get_json() or {}
    if "content" in data:
        if not data["content"].strip(): return error("La nota no puede estar vacía", 422)
        note.content = data["content"].strip()
    if "is_pinned" in data: note.is_pinned = bool(data["is_pinned"])
    db.session.commit(); return ok(note.to_dict(), "Nota actualizada")


@api.delete("/notes/<int:note_id>")
def notes_delete(note_id):
    note = ClientNote.query.get_or_404(note_id); db.session.delete(note); db.session.commit()
    return ok(None, "Nota eliminada")


@api.get("/dashboard/summary")
def dashboard():
    today = date.today(); month_start = today.replace(day=1)
    clients = Client.query.filter(Client.archived_at.is_(None)).all(); actions = ClientAction.query.all(); payments = Payment.query.all()
    money = {}
    for p in payments:
        if p.status == "paid" and p.paid_at and p.paid_at.date() >= month_start: money[p.currency] = money.get(p.currency, 0) + float(p.amount)
    data = {"active_clients": sum(c.status == "active" for c in clients), "at_risk_clients": sum(c.status == "at_risk" for c in clients), "pending_actions": sum(a.status in ("pending", "in_progress") for a in actions), "overdue_actions": sum(a.status in ("pending", "in_progress") and a.due_date and a.due_date < today for a in actions), "renewals_week": sum(c.next_renewal_date and today <= c.next_renewal_date <= today + timedelta(days=7) for c in clients), "new_clients_month": sum(c.signup_date >= month_start for c in clients), "collected": money}
    return ok(data)


@api.get("/dashboard/acquisition")
def acquisition_summary():
    clients = Client.query.filter(Client.archived_at.is_(None)).all()
    counts = {}
    for client in clients:
        key = client.acquisition_source or "not_set"
        counts[key] = counts.get(key, 0) + 1
    total = len(clients)
    items = [
        {"source": source, "count": count, "percentage": round((count / total) * 100, 1) if total else 0}
        for source, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)
    ]
    return ok({"total": total, "items": items})


@api.get("/action-templates")
def templates_list(): return ok([t.to_dict() for t in ActionTemplate.query.order_by(ActionTemplate.sort_order).all()])


@api.get("/exports/clients.csv")
def export_clients():
    output = io.StringIO(); output.write("\ufeff"); writer = csv.writer(output)
    writer.writerow(["Cliente", "Negocio", "Estado", "Alta", "Renovación", "País", "Adquisición", "Moneda", "Mensualidad", "Seguidores", "Publicaciones"])
    for c in Client.query.filter(Client.archived_at.is_(None)).order_by(Client.name).all(): writer.writerow([c.name, c.business_name, c.status, c.signup_date, c.next_renewal_date, c.country, c.acquisition_source, c.currency, c.payment_amount, c.followers_count, c.publications_count])
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=clientes.csv"})
