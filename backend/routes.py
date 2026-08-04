import csv
import io
import calendar
import base64
import hashlib
import zipfile
from xml.sax.saxutils import escape
from datetime import date, datetime, timedelta
from flask import Blueprint, jsonify, request, Response, current_app
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Integer, case, cast, func, or_
from models import db, iso, Client, ClientAction, StandaloneAction, Payment, Expense, VpsAssignment, ClientMetric, ClientNote, ClientCredential, MessageLog, WorkLog, ProspectingGoal, ProspectingLog, ProspectingOutcome, ActionTemplate

api = Blueprint("api", __name__)

STATUSES = {"lead", "active", "at_risk", "paused", "cancelled", "no_signup"}


def credential_cipher():
    """Deriva una clave de cifrado estable sin guardar otra clave en la base."""
    secret = current_app.config["JWT_SECRET_KEY"].encode("utf-8")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret).digest()))


def encrypt_credential(value):
    return credential_cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_credential(value):
    return credential_cipher().decrypt(value.encode("ascii")).decode("utf-8")


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


def next_billing_date(client, paid_period):
    """Conserva el día de alta al abrir el período posterior al pagado."""
    next_month = add_calendar_months(paid_period.replace(day=1), 1)
    signup_day = client.signup_date.day if client.signup_date else paid_period.day
    day = min(signup_day, calendar.monthrange(next_month.year, next_month.month)[1])
    return date(next_month.year, next_month.month, day)


def billing_date_in_month(client, year, month):
    signup_day = client.signup_date.day
    day = min(signup_day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def sync_overdue_monthly_payments(clients, today=None):
    """Materializa al iniciar el mes todas las mensualidades de ese período."""
    today = today or date.today()
    next_month_start = add_calendar_months(today.replace(day=1), 1)
    changed = []
    for client in clients:
        if client.status not in ("active", "at_risk") or not client.signup_date:
            continue
        for payment in client.payments:
            if (payment.payment_type == "monthly" and payment.status == "pending"
                    and payment.due_date and payment.due_date < today):
                payment.status = "overdue"
                changed.append(payment)
        existing_months = {
            (payment.due_date.year, payment.due_date.month)
            for payment in client.payments
            if payment.payment_type == "monthly" and payment.due_date
        }
        due_date = add_calendar_months(client.signup_date, 1)
        while due_date < next_month_start:
            period = (due_date.year, due_date.month)
            if period not in existing_months:
                payment = Payment(
                    client=client,
                    amount=client.payment_amount or 0,
                    currency=client.currency,
                    payment_type="monthly",
                    period_year=due_date.year,
                    period_month=due_date.month,
                    due_date=due_date,
                    status="overdue" if due_date < today else "pending",
                    notes="Generado automáticamente al iniciar el mes de la mensualidad.",
                )
                db.session.add(payment)
                changed.append(payment)
                existing_months.add(period)
            due_date = add_calendar_months(due_date, 1)
    return changed


def payment_collection_item(payment):
    return {
        "id": f"payment-collection-{payment.id}",
        "title": f"Cobrar a {payment.client.name}",
        "description": "Mensualidad pendiente de pago.",
        "action_type": "collection_payment",
        "status": "pending",
        "priority": "urgent" if payment.due_date and payment.due_date < date.today() else "high",
        "due_date": iso(payment.due_date),
        "completed_at": None,
        "result_notes": None,
        "client_id": payment.client_id,
        "client_name": payment.client.name,
        "business_name": payment.client.business_name,
        "projected": True,
        "payment_id": payment.id,
    }


def projected_collection_items(clients, year, month):
    """Proyecta cobros mensuales sin persistir doce acciones por cliente."""
    items = []
    target_month = (year, month)
    for client in clients:
        if client.status not in ("active", "at_risk") or not client.signup_date:
            continue
        first_billing = add_calendar_months(client.signup_date, 1)
        if target_month < (first_billing.year, first_billing.month):
            continue
        monthly_payment = next((payment for payment in client.payments
            if payment.payment_type == "monthly" and payment.due_date
            and (payment.due_date.year, payment.due_date.month) == target_month), None)
        if (monthly_payment and monthly_payment.status in ("pending", "partial", "overdue")
                and monthly_payment.due_date < date.today()):
            items.append(payment_collection_item(monthly_payment))
            continue
        if monthly_payment:
            continue
        due_date = billing_date_in_month(client, year, month)
        items.append({
            "id": f"projected-collection-{client.id}-{due_date.isoformat()}",
            "title": f"Cobrar a {client.name}",
            "description": "Cobro mensual proyectado desde la fecha de alta.",
            "action_type": "collection_projection",
            "status": "pending",
            "priority": "high",
            "due_date": due_date.isoformat(),
            "completed_at": None,
            "result_notes": None,
            "client_id": client.id,
            "client_name": client.name,
            "business_name": client.business_name,
            "projected": True,
        })
    return items


def advance_service_stage(client, today=None):
    """Sincroniza la etapa con el mes indicado por la próxima renovación."""
    today = today or date.today()
    if not client.signup_date:
        return False
    original = client.service_stage
    original_renewal = client.next_renewal_date
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


def apply_client(client, data, partial=False):
    if not partial:
        required = {"name", "business_name", "sale_date", "signup_date", "country", "currency"}
        missing = [key for key in required if not data.get(key) and not getattr(client, key, None)]
        if missing:
            raise ValueError("Completá los campos obligatorios: " + ", ".join(missing))
    if data.get("status") and data["status"] not in STATUSES:
        raise ValueError("Estado inválido")
    if data.get("traffic_light") and data["traffic_light"] not in ("red", "yellow", "green"):
        raise ValueError("Semáforo inválido")
    text_fields = ["name", "business_name", "website_url", "instagram_username", "email", "phone", "country", "city", "acquisition_source", "currency", "status", "traffic_light", "service_stage", "page_status", "link_in_bio_status", "story_status", "prices_status", "images_status", "google_analytics_status", "qr_generated_status", "carousel_installed_status", "coupon_status", "best_sellers_status", "admin_load_status", "twelve_products_status", "domain_purchased_status", "notes_summary"]
    for field in text_fields:
        if field in data:
            setattr(client, field, data[field] or None)
    for field in ["sale_date", "signup_date", "next_renewal_date"]:
        if field in data:
            setattr(client, field, parse_date(data[field]))
    client.commercial_signup_date = client.sale_date or date.today()
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
    complete_collection_action(client, paid_period)
    next_renewal = next_billing_date(client, paid_period)
    if not client.next_renewal_date or next_renewal > client.next_renewal_date:
        client.next_renewal_date = next_renewal
    advance_service_stage(client)
    ensure_collection_action(client)


def collection_action_key(due_date):
    return f"monthly_collection:{due_date.isoformat()}"


def ensure_collection_action(client):
    """Retira cobros persistidos antiguos; ahora se proyectan en el calendario."""
    automatic_pending = [
        action for action in client.actions
        if action.action_type == "collection" and action.status in ("pending", "in_progress")
    ]
    for action in automatic_pending:
        db.session.delete(action)
    return bool(automatic_pending)


def complete_collection_action(client, paid_period):
    action = next((
        item for item in client.actions
        if item.action_type == "collection" and item.due_date
        and item.due_date.year == paid_period.year and item.due_date.month == paid_period.month
    ), None)
    if action and action.status != "completed":
        action.status = "completed"
        action.completed_at = datetime.utcnow()


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
    listed_clients = query.all()
    sync_service_stages(listed_clients)
    removed_legacy_collections = False
    for client in listed_clients:
        removed_legacy_collections = ensure_collection_action(client) or removed_legacy_collections
    if removed_legacy_collections:
        db.session.commit()
    search = request.args.get("search", "").strip()
    if search:
        term = f"%{search}%"
        query = query.filter(or_(
            Client.name.ilike(term),
            Client.business_name.ilike(term),
            Client.instagram_username.ilike(term),
            Client.email.ilike(term),
            Client.city.ilike(term),
            Client.country.ilike(term),
        ))
    requested_status = request.args.get("status")
    if requested_status == "active_no_signup":
        query = query.filter(Client.status.in_(("active", "at_risk", "no_signup")))
    elif requested_status == "active":
        query = query.filter(Client.status.in_(("active", "at_risk")))
    elif requested_status:
        query = query.filter(Client.status == requested_status)
    for field in ["service_stage", "country", "currency", "acquisition_source"]:
        if request.args.get(field): query = query.filter(getattr(Client, field) == request.args[field])
    renewal_totals = {"ARS": 0.0, "USD": 0.0}
    totals_query = query.with_entities(
        Client.currency,
        func.coalesce(func.sum(Client.payment_amount), 0),
    ).group_by(Client.currency)
    for currency, total in totals_query.all():
        if currency in renewal_totals:
            renewal_totals[currency] = float(total or 0)
    sort_by = request.args.get("sort_by", "name")
    if sort_by == "billing_day":
        # Ordena solamente por el número de día (1-31), sin considerar mes ni año.
        column = func.extract("day", Client.signup_date)
    elif sort_by == "traffic_light":
        column = case(
            (Client.traffic_light == "red", 1),
            (Client.traffic_light == "yellow", 2),
            (Client.traffic_light == "green", 3),
            else_=1,
        )
    elif sort_by == "service_stage":
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
    return ok({
        "items": [c.summary() for c in result.items],
        "pagination": {"page": page, "per_page": per_page, "total": result.total, "pages": result.pages},
        "renewal_totals": renewal_totals,
    })


@api.post("/clients")
def clients_create():
    try:
        data = request.get_json() or {}; client = Client(); apply_client(client, data)
        db.session.add(client); db.session.flush()
        if "followers_count" in data or "publications_count" in data:
            record_client_metric(client)
        if data.get("generate_schedule", False): generate_schedule(client)
        ensure_collection_action(client)
        db.session.commit(); return ok(client.detail(), "Cliente creado", 201)
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.get("/clients/<int:client_id>")
def clients_detail(client_id):
    client = Client.query.get_or_404(client_id)
    overdue_created = sync_overdue_monthly_payments([client])
    stage_changed = advance_service_stage(client)
    collections_changed = ensure_collection_action(client)
    if overdue_created or stage_changed or collections_changed:
        db.session.commit()
    return ok(client.detail())


@api.patch("/clients/<int:client_id>")
def clients_update(client_id):
    client = Client.query.get_or_404(client_id)
    try:
        data = request.get_json() or {}
        previous_counts = (client.followers_count or 0, client.publications_count or 0)
        apply_client(client, data, partial=True)
        current_counts = (client.followers_count or 0, client.publications_count or 0)
        if current_counts != previous_counts:
            record_client_metric(client)
        ensure_collection_action(client)
        db.session.commit(); return ok(client.detail(), "Cliente actualizado")
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.delete("/clients/<int:client_id>")
def clients_archive(client_id):
    client = Client.query.get_or_404(client_id); client.archived_at = datetime.utcnow(); db.session.commit(); return ok(None, "Cliente archivado")


@api.get("/clients/<int:client_id>/credentials")
def credentials_get(client_id):
    client = Client.query.get_or_404(client_id)
    if not client.credential:
        return ok({"username": "", "password": "", "has_credentials": False})
    try:
        return ok({
            "username": decrypt_credential(client.credential.username_encrypted),
            "password": decrypt_credential(client.credential.password_encrypted),
            "has_credentials": True,
            "updated_at": iso(client.credential.updated_at),
        })
    except InvalidToken:
        return error("No se pudieron descifrar las credenciales. Verificá la clave del servidor.", 500)


@api.put("/clients/<int:client_id>/credentials")
def credentials_save(client_id):
    client = Client.query.get_or_404(client_id)
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not username or not password:
        return error("Completá el usuario y la contraseña", 422)
    credential = client.credential or ClientCredential(client=client)
    credential.username_encrypted = encrypt_credential(username)
    credential.password_encrypted = encrypt_credential(password)
    db.session.add(credential)
    db.session.commit()
    return ok({"username": username, "password": password, "has_credentials": True, "updated_at": iso(credential.updated_at)}, "Credenciales guardadas")


@api.delete("/clients/<int:client_id>/credentials")
def credentials_delete(client_id):
    client = Client.query.get_or_404(client_id)
    if client.credential:
        db.session.delete(client.credential)
        db.session.commit()
    return ok(None, "Credenciales eliminadas")


@api.get("/messages")
def messages_list():
    items = MessageLog.query.order_by(MessageLog.sent_date.desc(), MessageLog.id.desc()).limit(500).all()
    return ok([item.to_dict() for item in items])


@api.post("/messages")
def messages_create():
    data = request.get_json(silent=True) or {}
    channel = str(data.get("channel") or "").strip()
    entry_type = str(data.get("entry_type") or "daily")
    if entry_type not in {"daily", "monthly"}:
        return error("Tipo de carga inválido", 422)
    try:
        quantity = int(data.get("quantity") or 0)
        sent_date = (
            date.fromisoformat(f'{data.get("month")}-01')
            if entry_type == "monthly" and data.get("month")
            else parse_date(data.get("sent_date")) or date.today()
        )
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad", 422)
    if not channel:
        return error("Elegí un canal", 422)
    if quantity <= 0:
        return error("La cantidad debe ser mayor que cero", 422)
    item = MessageLog(sent_date=sent_date, channel=channel, quantity=quantity, entry_type=entry_type, notes=str(data.get("notes") or "").strip() or None)
    db.session.add(item); db.session.commit()
    return ok(item.to_dict(), "Mensajes registrados", 201)


@api.delete("/messages/<int:message_id>")
def messages_delete(message_id):
    item = MessageLog.query.get_or_404(message_id)
    db.session.delete(item); db.session.commit()
    return ok(None, "Registro eliminado")


@api.patch("/messages/<int:message_id>")
def messages_update(message_id):
    item = MessageLog.query.get_or_404(message_id)
    data = request.get_json(silent=True) or {}
    entry_type = str(data.get("entry_type") or item.entry_type or "daily")
    channel = str(data.get("channel") or "").strip()
    try:
        quantity = int(data.get("quantity") or 0)
        sent_date = (
            date.fromisoformat(f'{data.get("month")}-01')
            if entry_type == "monthly" and data.get("month")
            else parse_date(data.get("sent_date"))
        )
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad", 422)
    if entry_type not in {"daily", "monthly"} or not sent_date:
        return error("Completá correctamente el período", 422)
    if not channel or quantity <= 0:
        return error("Elegí un canal y una cantidad mayor que cero", 422)
    item.entry_type = entry_type; item.sent_date = sent_date; item.channel = channel
    item.quantity = quantity; item.notes = str(data.get("notes") or "").strip() or None
    db.session.commit()
    return ok(item.to_dict(), "Registro actualizado")


@api.get("/work-logs")
def work_logs_list():
    items = WorkLog.query.order_by(WorkLog.work_date.desc(), WorkLog.id.desc()).limit(2000).all()
    return ok([item.to_dict() for item in items])


@api.post("/work-logs")
def work_logs_create():
    data = request.get_json(silent=True) or {}
    try:
        work_date = parse_date(data.get("work_date")) or date.today()
        hours = float(data.get("hours") or 0)
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad de horas", 422)
    if hours <= 0 or hours > 24:
        return error("Las horas deben ser mayores que 0 y no superar 24", 422)
    item = WorkLog(
        work_date=work_date, hours=hours,
        notes=str(data.get("notes") or "").strip() or None,
    )
    db.session.add(item); db.session.commit()
    return ok(item.to_dict(), "Horas registradas", 201)


@api.patch("/work-logs/<int:work_log_id>")
def work_logs_update(work_log_id):
    item = WorkLog.query.get_or_404(work_log_id)
    data = request.get_json(silent=True) or {}
    try:
        work_date = parse_date(data.get("work_date"))
        hours = float(data.get("hours") or 0)
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad de horas", 422)
    if not work_date:
        return error("Elegí una fecha válida", 422)
    if hours <= 0 or hours > 24:
        return error("Las horas deben ser mayores que 0 y no superar 24", 422)
    item.work_date = work_date
    item.hours = hours
    item.notes = str(data.get("notes") or "").strip() or None
    db.session.commit()
    return ok(item.to_dict(), "Horas actualizadas")


@api.delete("/work-logs/<int:work_log_id>")
def work_logs_delete(work_log_id):
    item = WorkLog.query.get_or_404(work_log_id)
    db.session.delete(item); db.session.commit()
    return ok(None, "Registro eliminado")


PROSPECTING_CHANNELS = {
    "facebook_marketplace", "business_instagram", "instagram_nicodelfino",
    "instagram_nicod123", "business_whatsapp", "personal_whatsapp",
}


@api.get("/prospecting")
def prospecting_list():
    goals = ProspectingGoal.query.order_by(ProspectingGoal.weekday, ProspectingGoal.channel).all()
    logs = ProspectingLog.query.order_by(ProspectingLog.activity_date.desc(), ProspectingLog.id.desc()).limit(3000).all()
    outcomes = ProspectingOutcome.query.order_by(ProspectingOutcome.activity_date.desc(), ProspectingOutcome.channel).limit(3000).all()
    return ok({
        "goals": [item.to_dict() for item in goals],
        "logs": [item.to_dict() for item in logs],
        "outcomes": [item.to_dict() for item in outcomes],
    })


@api.put("/prospecting/goals")
def prospecting_goals_save():
    data = request.get_json(silent=True) or {}
    goals = data.get("goals")
    if not isinstance(goals, list):
        return error("La planificación semanal es inválida", 422)
    for value in goals:
        try:
            weekday = int(value.get("weekday"))
            target = int(value.get("target") or 0)
            channel = str(value.get("channel") or "").strip()
        except (ValueError, TypeError, AttributeError):
            return error("Revisá las cantidades planificadas", 422)
        if weekday not in range(7) or channel not in PROSPECTING_CHANNELS or target < 0:
            return error("La planificación contiene valores inválidos", 422)
        goal = ProspectingGoal.query.filter_by(weekday=weekday, channel=channel).first()
        if goal is None:
            goal = ProspectingGoal(weekday=weekday, channel=channel)
            db.session.add(goal)
        goal.target = target
    db.session.commit()
    return ok([item.to_dict() for item in ProspectingGoal.query.all()], "Planificación guardada")


@api.post("/prospecting/logs")
def prospecting_logs_create():
    data = request.get_json(silent=True) or {}
    channel = str(data.get("channel") or "").strip()
    try:
        activity_date = parse_date(data.get("activity_date")) or date.today()
        quantity = int(data.get("quantity") or 0)
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad", 422)
    if channel not in PROSPECTING_CHANNELS:
        return error("Elegí un canal válido", 422)
    if quantity <= 0:
        return error("La cantidad debe ser mayor que cero", 422)
    item = ProspectingLog(
        activity_date=activity_date, channel=channel, quantity=quantity,
        notes=str(data.get("notes") or "").strip() or None,
    )
    db.session.add(item); db.session.commit()
    return ok(item.to_dict(), "Avance registrado", 201)


@api.patch("/prospecting/logs/<int:log_id>")
def prospecting_logs_update(log_id):
    item = ProspectingLog.query.get_or_404(log_id)
    data = request.get_json(silent=True) or {}
    channel = str(data.get("channel", item.channel) or "").strip()
    try:
        activity_date = parse_date(data.get("activity_date")) if "activity_date" in data else item.activity_date
        quantity = int(data.get("quantity", item.quantity) or 0)
    except (ValueError, TypeError):
        return error("Revisá la fecha y la cantidad", 422)
    if not activity_date:
        return error("Elegí una fecha válida", 422)
    if channel not in PROSPECTING_CHANNELS:
        return error("Elegí un canal válido", 422)
    if quantity <= 0:
        return error("La cantidad debe ser mayor que cero", 422)
    item.activity_date = activity_date
    item.channel = channel
    item.quantity = quantity
    if "notes" in data:
        item.notes = str(data.get("notes") or "").strip() or None
    db.session.commit()
    return ok(item.to_dict(), "Carga actualizada")


@api.delete("/prospecting/logs/<int:log_id>")
def prospecting_logs_delete(log_id):
    item = ProspectingLog.query.get_or_404(log_id)
    db.session.delete(item); db.session.commit()
    return ok(None, "Registro eliminado")


@api.put("/prospecting/outcomes")
def prospecting_outcomes_save():
    data = request.get_json(silent=True) or {}
    channel = str(data.get("channel") or "").strip()
    try:
        activity_date = parse_date(data.get("activity_date"))
        demos = int(data.get("demos") or 0)
        sales = int(data.get("sales") or 0)
    except (ValueError, TypeError):
        return error("Revisá la fecha, las demos y las ventas", 422)
    if not activity_date:
        return error("Elegí una fecha válida", 422)
    if channel not in PROSPECTING_CHANNELS:
        return error("Elegí un canal válido", 422)
    if demos < 0 or sales < 0:
        return error("Las demos y las ventas no pueden ser negativas", 422)
    if sales > demos:
        return error("Las ventas no pueden superar las demos enviadas", 422)
    item = ProspectingOutcome.query.filter_by(activity_date=activity_date, channel=channel).first()
    if item is None:
        item = ProspectingOutcome(activity_date=activity_date, channel=channel)
        db.session.add(item)
    item.demos = demos
    item.sales = sales
    db.session.commit()
    return ok(item.to_dict(), "Resultados actualizados")


@api.post("/clients/<int:client_id>/generate-actions")
def actions_generate(client_id):
    client = Client.query.get_or_404(client_id); count = generate_schedule(client); db.session.commit(); return ok({"created": count}, f"Se crearon {count} acciones")


@api.get("/actions")
def actions_list():
    requested_view = request.args.get("view")
    requested_scope = request.args.get("scope", requested_view)
    existing_clients = Client.query.filter(Client.archived_at.is_(None)).all()
    collection_actions_changed = bool(sync_overdue_monthly_payments(existing_clients))
    for client in existing_clients:
        collection_actions_changed = advance_service_stage(client) or collection_actions_changed
        collection_actions_changed = ensure_collection_action(client) or collection_actions_changed
    if collection_actions_changed:
        db.session.commit()
    query = ClientAction.query.join(Client).filter(Client.archived_at.is_(None))
    if requested_view == "calendar":
        # En el calendario los cobros se proyectan para cada mes; se excluye
        # la única acción persistida para no mostrar el mismo cobro dos veces.
        query = query.filter(ClientAction.action_type != "collection")
    if requested_scope == "undated":
        query = query.filter(ClientAction.due_date.is_(None))
    else:
        query = query.filter(ClientAction.due_date.isnot(None))
    if request.args.get("status") == "pending":
        query = query.filter(ClientAction.status.in_(["pending", "in_progress"]))
    elif request.args.get("status"):
        query = query.filter(ClientAction.status == request.args["status"])
    if requested_scope == "overdue": query = query.filter(ClientAction.due_date < date.today())
    if requested_scope == "today": query = query.filter(ClientAction.due_date == date.today())
    if requested_scope == "week": query = query.filter(ClientAction.due_date.between(date.today(), date.today() + timedelta(days=7)))
    if requested_view == "calendar" and request.args.get("month") and requested_scope not in {"today", "week"}:
        try:
            month_start = date.fromisoformat(f'{request.args["month"]}-01')
            query = query.filter(
                ClientAction.due_date >= month_start,
                ClientAction.due_date < add_calendar_months(month_start, 1),
            )
        except ValueError:
            return error("Mes inválido", 422)
    items = query.order_by(ClientAction.due_date.asc()).limit(250).all()
    result = [{**a.to_dict(), "client_id": a.client.id, "client_name": a.client.name, "business_name": a.client.business_name} for a in items]
    standalone_query = StandaloneAction.query
    if requested_scope == "undated":
        standalone_query = standalone_query.filter(StandaloneAction.due_date.is_(None))
    else:
        standalone_query = standalone_query.filter(StandaloneAction.due_date.isnot(None))
    if request.args.get("status") == "pending":
        standalone_query = standalone_query.filter(StandaloneAction.status.in_(["pending", "in_progress"]))
    elif request.args.get("status"):
        standalone_query = standalone_query.filter(StandaloneAction.status == request.args["status"])
    if requested_scope == "overdue": standalone_query = standalone_query.filter(StandaloneAction.due_date < date.today())
    if requested_scope == "today": standalone_query = standalone_query.filter(StandaloneAction.due_date == date.today())
    if requested_scope == "week": standalone_query = standalone_query.filter(StandaloneAction.due_date.between(date.today(), date.today() + timedelta(days=7)))
    if requested_view == "calendar" and request.args.get("month") and requested_scope not in {"today", "week"}:
        month_start = date.fromisoformat(f'{request.args["month"]}-01')
        standalone_query = standalone_query.filter(
            StandaloneAction.due_date >= month_start,
            StandaloneAction.due_date < add_calendar_months(month_start, 1),
        )
    result.extend(action.to_dict() for action in standalone_query.order_by(StandaloneAction.due_date.asc()).limit(250).all())
    if (
        requested_view != "calendar"
        and requested_scope == "all"
        and request.args.get("status") == "pending"
    ):
        # La lista general también necesita el próximo cobro de cada cliente.
        # Se proyecta únicamente su siguiente vencimiento para evitar una lista
        # infinita de mensualidades futuras.
        for client in existing_clients:
            renewal_date = client.next_renewal_date
            if not renewal_date:
                continue
            result.extend(projected_collection_items(
                [client], renewal_date.year, renewal_date.month,
            ))
        result.sort(key=lambda item: (item["due_date"] or "9999-12-31", str(item["id"])))
    if request.args.get("status") == "pending" and requested_scope == "overdue":
        overdue_payments = Payment.query.join(Client).filter(
            Client.archived_at.is_(None), Payment.payment_type == "monthly",
            Payment.status.in_(("pending", "partial", "overdue")),
            Payment.due_date < date.today(),
        ).order_by(Payment.due_date.asc()).all()
        result.extend(payment_collection_item(payment) for payment in overdue_payments)
        result.sort(key=lambda item: (item["due_date"] or "9999-12-31", str(item["id"])))
    if requested_view == "calendar" and request.args.get("status") == "pending" and request.args.get("month"):
        projection_months = {request.args["month"]}
        if requested_scope in {"today", "week"}:
            projection_months = {date.today().strftime("%Y-%m")}
            if requested_scope == "week":
                projection_months.add((date.today() + timedelta(days=7)).strftime("%Y-%m"))
        for projection_month in projection_months:
            year, month = projection_month.split("-")
            result.extend(projected_collection_items(existing_clients, int(year), int(month)))
        if requested_scope in {"today", "week", "overdue"}:
            today_iso = date.today().isoformat()
            week_end_iso = (date.today() + timedelta(days=7)).isoformat()
            result = [
                item for item in result
                if item.get("due_date") and (
                    requested_scope == "today" and item["due_date"] == today_iso
                    or requested_scope == "week" and today_iso <= item["due_date"] <= week_end_iso
                    or requested_scope == "overdue" and item["due_date"] < today_iso
                )
            ]
        result.sort(key=lambda item: (item["due_date"] or "9999-12-31", str(item["id"])))
    return ok(result)


@api.post("/standalone-actions")
def standalone_actions_create():
    data = request.get_json() or {}
    if not data.get("title", "").strip():
        return error("El título es obligatorio", 422)
    context_name = (data.get("context_name") or "").strip()
    if data.get("due_date") and not context_name:
        return error("Completá para quién o para qué es", 422)
    action = StandaloneAction(
        context_name=context_name or "Tarea sin fecha", title=data["title"].strip(),
        description=(data.get("description") or "").strip() or None,
        due_date=parse_date(data.get("due_date")), priority=data.get("priority", "medium"),
        implementation_date=parse_date(data.get("implementation_date")),
        status="pending",
    )
    db.session.add(action); db.session.commit()
    return ok(action.to_dict(), "Acción creada", 201)


@api.patch("/standalone-actions/<int:action_id>")
def standalone_actions_update(action_id):
    action = StandaloneAction.query.get_or_404(action_id); data = request.get_json() or {}
    if "context_name" in data:
        if not data["context_name"].strip(): return error("Indicá para quién o para qué es", 422)
        action.context_name = data["context_name"].strip()
    if "title" in data:
        if not data["title"].strip(): return error("El título es obligatorio", 422)
        action.title = data["title"].strip()
    if "description" in data: action.description = (data["description"] or "").strip() or None
    if "due_date" in data: action.due_date = parse_date(data["due_date"])
    if "implementation_date" in data: action.implementation_date = parse_date(data["implementation_date"])
    if "priority" in data: action.priority = data["priority"]
    if "status" in data:
        action.status = data["status"]
        completed_date = parse_date(data.get("completed_date"))
        action.completed_at = (
            datetime.combine(completed_date, datetime.min.time())
            if action.status == "completed" and completed_date
            else datetime.utcnow() if action.status == "completed" else None
        )
    elif "completed_date" in data and action.status == "completed":
        completed_date = parse_date(data.get("completed_date"))
        if completed_date:
            action.completed_at = datetime.combine(completed_date, datetime.min.time())
    db.session.commit()
    return ok(action.to_dict(), "Acción actualizada")


@api.post("/clients/<int:client_id>/actions")
def actions_create(client_id):
    client = Client.query.get_or_404(client_id); data = request.get_json() or {}
    if not data.get("title"): return error("El título es obligatorio", 422)
    action = ClientAction(
        client=client, title=data["title"], description=data.get("description"),
        action_type=data.get("action_type", "custom"), priority=data.get("priority", "medium"),
        due_date=parse_date(data.get("due_date")),
        implementation_date=parse_date(data.get("implementation_date")),
    )
    db.session.add(action); db.session.commit(); return ok(action.to_dict(), "Acción creada", 201)


@api.patch("/actions/<int:action_id>")
def actions_update(action_id):
    action = ClientAction.query.get_or_404(action_id); data = request.get_json() or {}
    for field in ["title", "description", "action_type", "priority", "status", "result_notes"]:
        if field in data: setattr(action, field, data[field])
    if "due_date" in data: action.due_date = parse_date(data["due_date"])
    if "implementation_date" in data: action.implementation_date = parse_date(data["implementation_date"])
    if data.get("status") == "completed":
        completed_date = parse_date(data.get("completed_date"))
        if completed_date:
            action.completed_at = datetime.combine(completed_date, datetime.min.time())
        elif not action.completed_at:
            action.completed_at = datetime.utcnow()
    elif "completed_date" in data and action.status == "completed":
        completed_date = parse_date(data.get("completed_date"))
        if completed_date:
            action.completed_at = datetime.combine(completed_date, datetime.min.time())
    if "status" in data and data["status"] != "completed": action.completed_at = None
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
        payment_type = data.get("payment_type", "monthly")
        due_date = None if payment_type == "deposit" else (
            parse_date(data.get("due_date"))
            or client.next_renewal_date
            or add_calendar_months(client.signup_date, 1)
        )
        payment = Payment(client=client, amount=amount, currency=data.get("currency", client.currency), payment_type=payment_type, period_year=data.get("period_year"), period_month=data.get("period_month"), due_date=due_date, status=data.get("status", "pending"), payment_method=data.get("payment_method"), notes=data.get("notes"))
        if payment.status == "paid":
            paid_date = parse_date(data.get("paid_at"))
            payment.paid_at = (
                datetime.combine(paid_date, datetime.min.time())
                if paid_date else datetime.utcnow()
            )
        db.session.add(payment)
        if payment.status == "paid": advance_renewal_after_payment(payment)
        else: ensure_collection_action(client)
        db.session.commit(); return ok(payment.to_dict(), "Pago registrado", 201)
    except (ValueError, TypeError) as exc: db.session.rollback(); return error(str(exc), 422)


@api.post("/clients/<int:client_id>/monthly-payments/<due_date>/pay")
def monthly_payment_pay(client_id, due_date):
    """Marca una mensualidad como pagada, creándola si aún era una proyección."""
    client = Client.query.get_or_404(client_id)
    try:
        billing_date = date.fromisoformat(due_date)
    except ValueError:
        return error("La fecha de cobro debe tener el formato AAAA-MM-DD", 422)
    next_month_start = add_calendar_months(date.today().replace(day=1), 1)
    if billing_date >= next_month_start:
        return error("Sólo se pueden anticipar mensualidades del mes actual", 422)
    payment = Payment.query.filter(
        Payment.client_id == client.id,
        Payment.payment_type == "monthly",
        Payment.due_date == billing_date,
    ).order_by(Payment.id.desc()).first()
    if payment is None:
        payment = Payment(
            client=client,
            amount=client.payment_amount or 0,
            currency=client.currency,
            payment_type="monthly",
            period_year=billing_date.year,
            period_month=billing_date.month,
            due_date=billing_date,
        )
        db.session.add(payment)
    payment.status = "paid"
    payment.paid_at = datetime.utcnow()
    advance_renewal_after_payment(payment)
    db.session.commit()
    return ok(payment.to_dict(), "Mensualidad marcada como pagada")


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
    if payment.payment_type == "deposit":
        payment.due_date = None
    if payment.status == "paid":
        if "paid_at" in data:
            paid_date = parse_date(data.get("paid_at"))
            payment.paid_at = (
                datetime.combine(paid_date, datetime.min.time())
                if paid_date else datetime.utcnow()
            )
        elif not payment.paid_at:
            payment.paid_at = datetime.utcnow()
    else:
        payment.paid_at = None
    if payment.status == "paid" and not was_paid:
        advance_renewal_after_payment(payment)
    else:
        ensure_collection_action(payment.client)
    db.session.commit(); return ok(payment.to_dict(), "Pago actualizado")


@api.delete("/payments/<int:payment_id>")
def payments_delete(payment_id):
    payment = Payment.query.get_or_404(payment_id)
    client = payment.client
    db.session.delete(payment)
    db.session.flush()
    ensure_collection_action(client)
    db.session.commit()
    return ok(None, "Pago eliminado")


@api.get("/payments")
def payments_list():
    clients = Client.query.filter(Client.archived_at.is_(None)).all()
    if sync_overdue_monthly_payments(clients):
        db.session.commit()
    items = (
        Payment.query.join(Client)
        .filter(Client.archived_at.is_(None))
        .order_by(Client.name.asc(), Payment.due_date.asc().nullslast(), Payment.id.asc())
        .limit(300)
        .all()
    )
    return ok([p.to_dict() for p in items])


@api.get("/payments/monthly-forecast")
def payments_monthly_forecast():
    clients = Client.query.filter(
        Client.archived_at.is_(None),
        Client.status.in_(("active", "at_risk", "no_signup")),
    ).order_by(Client.name.asc()).all()
    items = [{
        "id": client.id, "name": client.name, "business_name": client.business_name,
        "status": client.status, "amount": float(client.payment_amount or 0),
        "currency": client.currency,
    } for client in clients]
    totals = {}
    for item in (item for item in items if item["status"] in ("active", "at_risk")):
        totals[item["currency"]] = totals.get(item["currency"], 0) + item["amount"]
    return ok({"items": items, "totals": totals})


def apply_expense(expense, data):
    if "amount" in data:
        amount = float(data.get("amount") or 0)
        if amount <= 0:
            raise ValueError("El importe debe ser mayor que cero")
        expense.amount = amount
    if "expense_date" in data:
        expense.expense_date = parse_date(data.get("expense_date"))
    if not expense.expense_date:
        raise ValueError("Elegí la fecha del gasto")
    if "category" in data:
        if data["category"] not in {"server", "extra", "server_income"}:
            raise ValueError("Tipo de gasto inválido")
        expense.category = data["category"]
    if "description" in data:
        expense.description = (data.get("description") or "").strip()
    if not expense.description:
        raise ValueError("Escribí el concepto del gasto")
    if "notes" in data:
        expense.notes = (data.get("notes") or "").strip() or None


@api.get("/expenses")
def expenses_list():
    scope = request.args.get("scope", "month")
    month = request.args.get("month") or date.today().strftime("%Y-%m")
    expense_query = Expense.query
    if scope == "month":
        try:
            month_start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
            month_end = add_calendar_months(month_start, 1)
        except ValueError:
            return error("Mes inválido", 422)
        expense_query = expense_query.filter(
            Expense.expense_date >= month_start, Expense.expense_date < month_end,
        )
    elif scope != "all":
        return error("Filtro inválido", 422)
    expenses = expense_query.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
    server_expenses = sum(float(item.amount) for item in expenses if item.category == "server")
    extra_expenses = sum(float(item.amount) for item in expenses if item.category == "extra")
    server_income = sum(float(item.amount) for item in expenses if item.category == "server_income")
    spent = server_expenses + extra_expenses
    return ok({
        "month": month if scope == "month" else None, "scope": scope,
        "items": [expense.to_dict() for expense in expenses],
        "summary": {
            "server_income_ars": server_income,
            "server_expenses_ars": server_expenses,
            "net_server_cost_ars": server_expenses - server_income,
            "extra_expenses_ars": extra_expenses, "expenses_ars": spent,
            "balance_ars": server_income - spent,
        },
    })


@api.post("/expenses")
def expenses_create():
    try:
        expense = Expense()
        apply_expense(expense, request.get_json() or {})
        db.session.add(expense); db.session.commit()
        return ok(expense.to_dict(), "Gasto registrado", 201)
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.patch("/expenses/<int:expense_id>")
def expenses_update(expense_id):
    expense = Expense.query.get_or_404(expense_id)
    try:
        apply_expense(expense, request.get_json() or {})
        db.session.commit(); return ok(expense.to_dict(), "Gasto actualizado")
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return error(str(exc), 422)


@api.delete("/expenses/<int:expense_id>")
def expenses_delete(expense_id):
    expense = Expense.query.get_or_404(expense_id)
    db.session.delete(expense); db.session.commit()
    return ok(None, "Gasto eliminado")


VPS_NAMES = {"vape", "shatha"}


@api.get("/vps")
def vps_list():
    items = VpsAssignment.query.order_by(VpsAssignment.vps_name, VpsAssignment.id).all()
    return ok({
        "items": [item.to_dict() for item in items],
        "counts": {name: sum(item.vps_name == name for item in items) for name in VPS_NAMES},
    })


@api.post("/vps")
def vps_create():
    data = request.get_json() or {}
    vps_name = data.get("vps_name")
    if vps_name not in VPS_NAMES:
        return error("Elegí un VPS válido", 422)
    client_id = data.get("client_id")
    custom_name = (data.get("custom_name") or "").strip()
    if client_id:
        client = Client.query.filter_by(id=client_id, archived_at=None).first_or_404()
        if VpsAssignment.query.filter_by(client_id=client.id).first():
            return error("Ese cliente ya está asignado a un VPS", 422)
        assignment = VpsAssignment(vps_name=vps_name, client=client)
    elif custom_name:
        assignment = VpsAssignment(vps_name=vps_name, custom_name=custom_name)
    else:
        return error("Elegí un cliente o escribí un nombre personalizado", 422)
    db.session.add(assignment); db.session.commit()
    return ok(assignment.to_dict(), "Asignación agregada", 201)


@api.patch("/vps/<int:assignment_id>")
def vps_update(assignment_id):
    assignment = VpsAssignment.query.get_or_404(assignment_id)
    vps_name = (request.get_json() or {}).get("vps_name")
    if vps_name not in VPS_NAMES:
        return error("Elegí un VPS válido", 422)
    assignment.vps_name = vps_name
    db.session.commit(); return ok(assignment.to_dict(), "Asignación movida")


@api.delete("/vps/<int:assignment_id>")
def vps_delete(assignment_id):
    assignment = VpsAssignment.query.get_or_404(assignment_id)
    db.session.delete(assignment); db.session.commit()
    return ok(None, "Asignación eliminada")


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
    clients = Client.query.filter(Client.archived_at.is_(None)).all()
    if sync_overdue_monthly_payments(clients, today):
        db.session.commit()
    actions = ClientAction.query.join(Client).filter(
        Client.archived_at.is_(None),
        or_(ClientAction.action_type != "collection", ClientAction.action_type.is_(None)),
    ).all()
    payments = Payment.query.all()
    money = {}
    for p in payments:
        if p.status == "paid" and p.paid_at and p.paid_at.date() >= month_start: money[p.currency] = money.get(p.currency, 0) + float(p.amount)
    active_clients = [c for c in clients if c.status in ("active", "at_risk", "no_signup")]
    active_clients_detail = [c for c in clients if c.status in ("active", "at_risk", "no_signup", "cancelled")]
    tenure_clients = [c for c in clients if c.status in ("active", "at_risk") and c.signup_date]
    at_risk_clients = [c for c in clients if c.status == "at_risk"]
    pending_actions = [a for a in actions if a.status in ("pending", "in_progress")]
    urgent_actions = [
        a for a in pending_actions
        if a.priority == "urgent"
    ]
    urgent_standalone_actions = StandaloneAction.query.filter(
        StandaloneAction.status.in_(("pending", "in_progress")),
        StandaloneAction.priority == "urgent",
    ).all()
    pending_payments = [
        p for p in payments
        if p.client.archived_at is None and p.status in ("pending", "partial", "overdue")
    ]
    overdue_payments = [p for p in payments if p.payment_type == "monthly" and p.status in ("pending", "partial", "overdue") and p.due_date and p.due_date < today]
    overdue_actions = [a for a in pending_actions if a.due_date and a.due_date < today]
    renewals_week_start = today - timedelta(days=today.weekday())
    renewals_week_end = renewals_week_start + timedelta(days=7)
    renewals_week = [
        c for c in clients
        if c.status in ("active", "at_risk")
        and c.next_renewal_date
        and renewals_week_start <= c.next_renewal_date < renewals_week_end
    ]
    next_month_start = add_calendar_months(month_start, 1)
    new_clients_month = [
        c for c in clients
        if c.signup_date
        and month_start <= c.signup_date < next_month_start
    ]
    sold_clients_month = [c for c in clients if c.sale_date and month_start <= c.sale_date < next_month_start]
    traffic_light_clients = [c for c in clients if c.status != "cancelled"]
    traffic_light_counts = {
        color: sum(1 for client in traffic_light_clients if (client.traffic_light or "red") == color)
        for color in ("red", "yellow", "green")
    }

    def client_item(client):
        days_active = max(0, (today - client.signup_date).days) if client.signup_date else 0
        elapsed_months = 0
        if client.signup_date:
            elapsed_months = max(
                0,
                (today.year - client.signup_date.year) * 12 + today.month - client.signup_date.month,
            )
            if today < add_calendar_months(client.signup_date, elapsed_months):
                elapsed_months = max(0, elapsed_months - 1)
        return {
            "id": client.id, "name": client.name, "business_name": client.business_name,
            "website_url": client.website_url,
            "payment_amount": float(client.payment_amount or 0),
            "currency": client.currency,
            "status": client.status, "service_stage": client.service_stage,
            "sale_date": iso(client.sale_date),
            "commercial_signup_date": iso(client.commercial_signup_date),
            "signup_date": client.signup_date.isoformat() if client.signup_date else None,
            "next_renewal_date": client.next_renewal_date.isoformat() if client.next_renewal_date else None,
            "days_active": days_active,
            "active_month": elapsed_months + 1 if client.signup_date else None,
            "traffic_light": client.traffic_light or "red",
            "monthly_payments": [
                {
                    "id": payment.id,
                    "due_date": iso(payment.due_date),
                    "status": payment.status,
                    "paid_at": iso(payment.paid_at),
                    "amount": float(payment.amount or 0),
                    "currency": payment.currency,
                }
                for payment in client.payments
                if payment.payment_type == "monthly" and payment.due_date
            ],
        }

    def action_item(action):
        return {
            "id": action.id, "title": action.title, "status": action.status,
            "due_date": action.due_date.isoformat() if action.due_date else None,
            "client_id": action.client.id, "client_name": action.client.name,
            "business_name": action.client.business_name,
        }

    def standalone_action_item(action):
        return {
            **action.to_dict(),
            "client_id": None,
            "client_name": action.context_name,
            "business_name": "Acción independiente",
        }

    data = {
        "active_clients": len(active_clients), "at_risk_clients": len(at_risk_clients),
        "pending_actions": len(pending_actions) + len(overdue_payments), "overdue_actions": len(overdue_actions) + len(overdue_payments),
        "pending_payments": len(pending_payments),
        "urgent_actions": len(urgent_actions) + len(urgent_standalone_actions),
        "active_client_days_average": (
            round(sum((today - client.signup_date).days for client in tenure_clients) / len(tenure_clients))
            if tenure_clients else 0
        ),
        "renewals_week": len(renewals_week), "new_clients_month": len(new_clients_month),
        "sold_clients_month": len(sold_clients_month),
        "traffic_lights": traffic_light_counts,
        "collected": money,
        "details": {
            "active_clients": [client_item(c) for c in active_clients_detail],
            "active_client_days": [client_item(c) for c in tenure_clients],
            "at_risk_clients": [client_item(c) for c in at_risk_clients],
            "pending_actions": [action_item(a) for a in pending_actions] + [payment_collection_item(p) for p in overdue_payments],
            "overdue_actions": [action_item(a) for a in overdue_actions] + [payment_collection_item(p) for p in overdue_payments],
            "pending_payments": [
                {
                    **payment_collection_item(payment),
                    "status": payment.status,
                    "amount": float(payment.amount),
                    "currency": payment.currency,
                }
                for payment in pending_payments
            ],
            "urgent_actions": (
                [action_item(action) for action in urgent_actions]
                + [standalone_action_item(action) for action in urgent_standalone_actions]
            ),
            "renewals_week": [client_item(c) for c in renewals_week],
            "new_clients_month": [client_item(c) for c in new_clients_month],
            "sold_clients_month": [client_item(c) for c in sold_clients_month],
            "traffic_lights": [client_item(c) for c in traffic_light_clients],
        },
    }
    return ok(data)


@api.get("/dashboard/renewals")
def renewals_by_week():
    try:
        week_start = date.fromisoformat(request.args.get("start", ""))
    except ValueError:
        return error("La fecha de inicio debe tener el formato AAAA-MM-DD", 422)
    week_end = week_start + timedelta(days=7)
    clients = Client.query.filter(
        Client.archived_at.is_(None),
        Client.status.in_(("active", "at_risk")),
        Client.next_renewal_date >= week_start,
        Client.next_renewal_date < week_end,
    ).order_by(Client.next_renewal_date.asc(), Client.name.asc()).all()
    return ok([
        {
            "id": client.id,
            "name": client.name,
            "business_name": client.business_name,
            "status": client.status,
            "service_stage": client.service_stage,
            "signup_date": iso(client.signup_date),
            "next_renewal_date": iso(client.next_renewal_date),
        }
        for client in clients
    ])


@api.get("/dashboard/income")
def dashboard_income():
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    payment_type = request.args.get("payment_type", "all")
    if payment_type not in {"all", "monthly", "extra_work", "monthly_forecast"}:
        return error("El tipo de pago debe ser all, monthly, extra_work o monthly_forecast", 422)
    if payment_type == "monthly_forecast":
        try:
            forecast_month = date.fromisoformat(f"{month}-01")
        except ValueError:
            return error("El mes debe tener el formato AAAA-MM", 422)
        totals = {"ARS": 0, "USD": 0}
        billable_clients = Client.query.filter(
            Client.archived_at.is_(None),
            Client.status.in_(("active", "at_risk")),
        ).all()
        for client in billable_clients:
            totals[client.currency] = totals.get(client.currency, 0) + float(client.payment_amount or 0)
        available_months = sorted({
            (
                payment.paid_at.date()
                if payment.payment_type == "deposit" and payment.paid_at
                else payment.due_date or (payment.paid_at.date() if payment.paid_at else None)
            ).strftime("%Y-%m")
            for payment in Payment.query.filter(Payment.status == "paid").all()
            if payment.due_date or payment.paid_at
        }, reverse=True)
        return ok({
            "month": month,
            "payment_type": payment_type,
            "totals": totals,
            "items": [{
                "id": f"forecast-{client.id}", "client_id": client.id,
                "client_name": client.name, "business_name": client.business_name,
                "amount": float(client.payment_amount or 0), "currency": client.currency,
                "payment_type": "monthly_forecast",
                "due_date": billing_date_in_month(
                    client, forecast_month.year, forecast_month.month,
                ).isoformat() if client.signup_date else forecast_month.isoformat(),
                "notes": f"Mensualidad prevista · {forecast_month.strftime('%m/%Y')}",
            } for client in billable_clients],
            "available_months": available_months,
        })
    month_start = month_end = None
    if month != "all":
        try:
            month_start = date.fromisoformat(f"{month}-01")
        except ValueError:
            return error("El mes debe tener el formato AAAA-MM o ser all", 422)
        month_end = add_calendar_months(month_start, 1)
    query = Payment.query.filter(Payment.status == "paid")
    if payment_type == "monthly":
        query = query.filter(Payment.payment_type.in_(("monthly", "deposit")))
    elif payment_type == "extra_work":
        query = query.filter(Payment.payment_type == "extra_work")
    totals = {"ARS": 0, "USD": 0}
    paid_payments = query.all()
    matching_payments = []
    available_months = sorted({
        (
            payment.paid_at.date()
            if payment.payment_type == "deposit" and payment.paid_at
            else payment.due_date or (payment.paid_at.date() if payment.paid_at else None)
        ).strftime("%Y-%m")
        for payment in Payment.query.filter(Payment.status == "paid").all()
        if payment.due_date or payment.paid_at
    }, reverse=True)
    for payment in paid_payments:
        payment_date = (
            payment.paid_at.date()
            if payment.payment_type == "deposit" and payment.paid_at
            else payment.due_date or (payment.paid_at.date() if payment.paid_at else None)
        )
        if month_start and (not payment_date or not month_start <= payment_date < month_end):
            continue
        totals[payment.currency] = totals.get(payment.currency, 0) + float(payment.amount)
        matching_payments.append({
            **payment.to_dict(),
            "business_name": payment.client.business_name,
            "display_date": payment_date.isoformat() if payment_date else None,
        })
    return ok({
        "month": month,
        "payment_type": payment_type,
        "totals": totals,
        "items": matching_payments,
        "available_months": available_months,
    })


@api.get("/dashboard/acquisition")
def acquisition_summary():
    clients = Client.query.filter(Client.archived_at.is_(None)).all()
    grouped = {}
    for client in clients:
        key = client.acquisition_source or "not_set"
        grouped.setdefault(key, []).append(client)
    total = len(clients)
    items = [
        {
            "source": source,
            "count": len(source_clients),
            "percentage": round((len(source_clients) / total) * 100, 1) if total else 0,
            "active_count": sum(client.status == "active" for client in source_clients),
            "clients": [
                {
                    "id": client.id,
                    "name": client.name,
                    "business_name": client.business_name,
                    "status": client.status,
                    "service_stage": client.service_stage,
                    "signup_date": iso(client.signup_date),
                    "city": client.city,
                    "country": client.country,
                    "website_url": client.website_url,
                    "instagram_username": client.instagram_username,
                    "email": client.email,
                    "phone": client.phone,
                    "payment_amount": float(client.payment_amount or 0),
                    "currency": client.currency,
                }
                for client in sorted(source_clients, key=lambda item: item.name.lower())
            ],
        }
        for source, source_clients in sorted(grouped.items(), key=lambda item: len(item[1]), reverse=True)
    ]
    return ok({"total": total, "items": items})


@api.get("/dashboard/new-clients")
def new_clients_by_month():
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    try:
        month_start = date.fromisoformat(f"{month}-01")
    except ValueError:
        return error("El mes debe tener el formato AAAA-MM", 422)
    month_end = add_calendar_months(month_start, 1)
    clients = Client.query.filter(
        Client.archived_at.is_(None),
        Client.signup_date >= month_start,
        Client.signup_date < month_end,
    ).order_by(Client.signup_date.desc(), Client.name.asc()).all()
    return ok([
        {
            "id": client.id,
            "name": client.name,
            "business_name": client.business_name,
            "status": client.status,
            "service_stage": client.service_stage,
            "commercial_signup_date": iso(client.commercial_signup_date),
            "signup_date": iso(client.signup_date),
            "next_renewal_date": iso(client.next_renewal_date),
        }
        for client in clients
    ])


@api.get("/dashboard/sold-clients")
def sold_clients_by_month():
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    try:
        month_start = date.fromisoformat(f"{month}-01")
    except ValueError:
        return error("El mes debe tener el formato AAAA-MM", 422)
    month_end = add_calendar_months(month_start, 1)
    clients = Client.query.filter(
        Client.archived_at.is_(None),
        Client.sale_date >= month_start,
        Client.sale_date < month_end,
    ).order_by(Client.sale_date.desc(), Client.name.asc()).all()
    return ok([
        {
            "id": client.id,
            "name": client.name,
            "business_name": client.business_name,
            "status": client.status,
            "service_stage": client.service_stage,
            "sale_date": iso(client.sale_date),
            "signup_date": iso(client.signup_date),
        }
        for client in clients
    ])


@api.get("/action-templates")
def templates_list(): return ok([t.to_dict() for t in ActionTemplate.query.order_by(ActionTemplate.sort_order).all()])


@api.get("/exports/clients.csv")
def export_clients():
    output = io.StringIO(); output.write("\ufeff"); writer = csv.writer(output)
    writer.writerow(["Cliente", "Negocio", "Estado", "Alta", "Renovación", "País", "Adquisición", "Moneda", "Mensualidad", "Seguidores", "Publicaciones"])
    for c in Client.query.filter(Client.archived_at.is_(None)).order_by(Client.name).all(): writer.writerow([c.name, c.business_name, c.status, c.signup_date, c.next_renewal_date, c.country, c.acquisition_source, c.currency, c.payment_amount, c.followers_count, c.publications_count])
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=clientes.csv"})


def simple_xlsx_workbook(sheets):
    def column_name(index):
        result = ""
        while index:
            index, remainder = divmod(index - 1, 26)
            result = chr(65 + remainder) + result
        return result

    def cell_xml(reference, value):
        if isinstance(value, (int, float)):
            return f'<c r="{reference}"><v>{value}</v></c>'
        return f'<c r="{reference}" t="inlineStr"><is><t>{escape(str(value or ""))}</t></is></c>'

    worksheet_xml = []
    for _, headers, rows in sheets:
        sheet_rows = []
        for row_index, values in enumerate([headers, *rows], start=1):
            cells = "".join(
                cell_xml(f"{column_name(column_index)}{row_index}", value)
                for column_index, value in enumerate(values, start=1)
            )
            sheet_rows.append(f'<row r="{row_index}">{cells}</row>')
        worksheet_xml.append(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
        )
    content_overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(sheets) + 1)
    )
    workbook_sheets = "".join(
        f'<sheet name="{escape(name[:31])}" sheetId="{index}" r:id="rId{index}"/>'
        for index, (name, _, _) in enumerate(sheets, start=1)
    )
    workbook_relationships = "".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, len(sheets) + 1)
    )
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f'{content_overrides}</Types>'
        ))
        workbook.writestr("_rels/.rels", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        ))
        workbook.writestr("xl/workbook.xml", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets>{workbook_sheets}</sheets></workbook>'
        ))
        workbook.writestr("xl/_rels/workbook.xml.rels", (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{workbook_relationships}</Relationships>'
        ))
        for index, sheet in enumerate(worksheet_xml, start=1):
            workbook.writestr(f"xl/worksheets/sheet{index}.xml", sheet)
    return output.getvalue()


def simple_xlsx(headers, rows):
    return simple_xlsx_workbook([("Dias activos", headers, rows)])


@api.get("/exports/active-client-days.xlsx")
def export_active_client_days():
    today = date.today()
    clients = Client.query.filter(
        Client.archived_at.is_(None),
        Client.status.in_(("active", "at_risk")),
        Client.signup_date.isnot(None),
    ).order_by(Client.signup_date.asc(), Client.name.asc()).all()
    rows = []
    for client in clients:
        elapsed_months = max(
            0,
            (today.year - client.signup_date.year) * 12 + today.month - client.signup_date.month,
        )
        if today < add_calendar_months(client.signup_date, elapsed_months):
            elapsed_months = max(0, elapsed_months - 1)
        rows.append([
            client.name,
            client.business_name,
            {"active": "Activo", "at_risk": "En riesgo"}.get(client.status, client.status),
            client.signup_date.isoformat(),
            max(0, (today - client.signup_date).days),
            elapsed_months + 1,
        ])
    content = simple_xlsx(
        ["Cliente", "Negocio", "Estado", "Fecha de alta", "Días activos", "Mes de servicio"],
        rows,
    )
    return Response(
        content,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dias-activos-clientes.xlsx"},
    )


def build_business_master_export():
    today = date.today()
    clients = Client.query.filter(Client.archived_at.is_(None)).order_by(Client.name.asc()).all()
    client_ids = [client.id for client in clients]
    payments = Payment.query.filter(Payment.client_id.in_(client_ids)).order_by(Payment.due_date.desc()).all() if client_ids else []
    actions = ClientAction.query.filter(ClientAction.client_id.in_(client_ids)).order_by(ClientAction.due_date.desc()).all() if client_ids else []
    standalone_actions = StandaloneAction.query.order_by(StandaloneAction.due_date.desc()).all()
    expenses = Expense.query.order_by(Expense.expense_date.desc()).all()
    prospecting_logs = ProspectingLog.query.order_by(ProspectingLog.activity_date.desc()).all()
    prospecting_outcomes = ProspectingOutcome.query.order_by(ProspectingOutcome.activity_date.desc()).all()
    prospecting_goals = ProspectingGoal.query.order_by(ProspectingGoal.weekday.asc()).all()
    messages = MessageLog.query.order_by(MessageLog.sent_date.desc()).all()
    work_logs = WorkLog.query.order_by(WorkLog.work_date.desc()).all()

    active_statuses = {"active", "at_risk"}
    churn_clients = [client for client in clients if client.status == "cancelled"]
    churn_base = [client for client in clients if client.status in active_statuses | {"paused", "cancelled"}]
    paid_payments = [payment for payment in payments if payment.status == "paid"]
    pending_payments = [payment for payment in payments if payment.status in ("pending", "partial", "overdue")]
    overview = [
        ["Fecha de exportación", today.isoformat()],
        ["Clientes totales", len(clients)],
        ["Clientes activos", sum(client.status == "active" for client in clients)],
        ["Clientes en riesgo", sum(client.status == "at_risk" for client in clients)],
        ["Clientes sin alta", sum(client.status == "no_signup" for client in clients)],
        ["Clientes pausados", sum(client.status == "paused" for client in clients)],
        ["Churn / cancelados", len(churn_clients)],
        ["Tasa de churn (%)", round(len(churn_clients) * 100 / len(churn_base), 2) if churn_base else 0],
        ["Definición tasa churn", "Cancelados / (activos + en riesgo + pausados + cancelados)"],
        ["Mensualidad activa ARS", sum(float(client.payment_amount or 0) for client in clients if client.status in active_statuses and client.currency == "ARS")],
        ["Mensualidad activa USD", sum(float(client.payment_amount or 0) for client in clients if client.status in active_statuses and client.currency == "USD")],
        ["Cobrado histórico ARS", sum(float(payment.amount) for payment in paid_payments if payment.currency == "ARS")],
        ["Cobrado histórico USD", sum(float(payment.amount) for payment in paid_payments if payment.currency == "USD")],
        ["Pendiente de cobro ARS", sum(float(payment.amount) for payment in pending_payments if payment.currency == "ARS")],
        ["Pendiente de cobro USD", sum(float(payment.amount) for payment in pending_payments if payment.currency == "USD")],
        ["Gastos históricos ARS", sum(float(expense.amount) for expense in expenses)],
        ["Mensajes enviados", sum(message.quantity or 0 for message in messages)],
        ["Contactos de prospección", sum(log.quantity or 0 for log in prospecting_logs)],
        ["Demos registradas", sum(outcome.demos or 0 for outcome in prospecting_outcomes)],
        ["Ventas de prospección", sum(outcome.sales or 0 for outcome in prospecting_outcomes)],
        ["Horas trabajadas", sum(float(log.hours or 0) for log in work_logs)],
    ]

    client_rows = []
    for client in clients:
        client_payments = [payment for payment in payments if payment.client_id == client.id]
        client_actions = [action for action in actions if action.client_id == client.id]
        client_paid = [payment for payment in client_payments if payment.status == "paid"]
        client_pending = [
            payment for payment in client_payments
            if payment.status in ("pending", "partial", "overdue")
        ]
        last_paid_at = max(
            (payment.paid_at for payment in client_paid if payment.paid_at),
            default=None,
        )
        days_active = max(0, (today - client.signup_date).days) if client.signup_date else 0
        elapsed_months = 0
        if client.signup_date:
            elapsed_months = max(0, (today.year - client.signup_date.year) * 12 + today.month - client.signup_date.month)
            if today < add_calendar_months(client.signup_date, elapsed_months):
                elapsed_months = max(0, elapsed_months - 1)
        client_rows.append([
            client.id, client.name, client.business_name, client.status,
            "Sí" if client.status == "cancelled" else "No",
            iso(client.sale_date), iso(client.commercial_signup_date), iso(client.signup_date),
            days_active, elapsed_months + 1 if client.signup_date else "", client.service_stage,
            iso(client.next_renewal_date),
            (client.next_renewal_date - today).days if client.next_renewal_date else "",
            float(client.payment_amount or 0), client.currency,
            float(client.payment_amount or 0) if client.status in active_statuses else 0,
            len(client_paid),
            sum(float(payment.amount) for payment in client_paid if payment.currency == "ARS"),
            sum(float(payment.amount) for payment in client_paid if payment.currency == "USD"),
            iso(last_paid_at),
            len(client_pending),
            sum(float(payment.amount) for payment in client_pending if payment.currency == "ARS"),
            sum(float(payment.amount) for payment in client_pending if payment.currency == "USD"),
            sum(action.status in ("pending", "in_progress") for action in client_actions),
            sum(
                bool(action.status in ("pending", "in_progress") and action.due_date and action.due_date < today)
                for action in client_actions
            ),
            sum(
                action.status in ("pending", "in_progress") and action.priority == "urgent"
                for action in client_actions
            ),
            client.acquisition_source, client.country, client.city, client.email, client.phone,
            client.instagram_username, client.website_url, client.followers_count,
            client.publications_count, client.web_sales_count,
            client.page_status, client.prices_status, client.images_status,
            client.google_analytics_status, client.notes_summary,
            iso(client.updated_at),
        ])

    payment_rows = [[
        payment.id, payment.client.name, payment.client.business_name, payment.payment_type,
        float(payment.amount), payment.currency, payment.status, iso(payment.due_date),
        iso(payment.paid_at), payment.payment_method, payment.period_year,
        payment.period_month, payment.notes,
    ] for payment in payments]
    action_rows = [[
        action.id, action.client.name, action.client.business_name, action.title,
        action.action_type, action.status, action.priority, iso(action.due_date),
        iso(action.implementation_date), iso(action.completed_at), action.description,
        action.result_notes,
    ] for action in actions]
    action_rows.extend([
        action.id, action.context_name, "Acción independiente", action.title,
        "standalone", action.status, action.priority, iso(action.due_date),
        iso(action.implementation_date), iso(action.completed_at), action.description, "",
    ] for action in standalone_actions)
    weekday_labels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    prospecting_rows = [
        ["Actividad", iso(log.activity_date), "", log.channel, log.quantity, "", "", "", log.notes]
        for log in prospecting_logs
    ] + [
        ["Resultado", iso(outcome.activity_date), "", outcome.channel, "", "", outcome.demos, outcome.sales, ""]
        for outcome in prospecting_outcomes
    ] + [
        [
            "Objetivo semanal", "",
            weekday_labels[goal.weekday] if goal.weekday is not None and 0 <= goal.weekday < 7 else str(goal.weekday or ""),
            goal.channel, "", goal.target, "", "", "",
        ]
        for goal in prospecting_goals
    ]

    content = simple_xlsx_workbook([
        ("Base maestra clientes", [
            "ID", "Cliente", "Negocio", "Estado", "Es churn", "Fecha de venta",
            "Alta comercial", "Fecha de alta", "Días activos", "Mes de servicio",
            "Etapa CRM", "Próxima renovación", "Días hasta renovar",
            "Mensualidad contratada", "Moneda", "Ingreso mensual activo",
            "Pagos realizados", "Cobrado histórico ARS", "Cobrado histórico USD",
            "Última fecha de pago", "Pagos pendientes", "Pendiente ARS", "Pendiente USD",
            "Acciones pendientes", "Acciones vencidas", "Acciones urgentes",
            "Canal de adquisición", "País", "Ciudad", "Email", "Teléfono",
            "Instagram", "Web", "Seguidores", "Publicaciones", "Ventas web",
            "Estado de página", "Estado de precios", "Estado de imágenes",
            "Google Analytics", "Notas", "Última actualización",
        ], client_rows),
        ("Resumen", ["Indicador", "Valor"], overview),
        ("Pagos", [
            "ID", "Cliente", "Negocio", "Tipo", "Importe", "Moneda", "Estado",
            "Vencimiento", "Fecha de pago", "Método", "Año período", "Mes período", "Notas",
        ], payment_rows),
        ("Acciones", [
            "ID", "Cliente o contexto", "Negocio", "Acción", "Tipo", "Estado",
            "Prioridad", "Fecha prevista", "Implementación", "Completada", "Descripción", "Resultado",
        ], action_rows),
        ("Prospección", [
            "Tipo", "Fecha", "Día", "Canal", "Cantidad", "Objetivo",
            "Demos", "Ventas", "Notas",
        ], prospecting_rows),
        ("Mensajes", ["Fecha", "Canal", "Cantidad", "Tipo", "Notas"], [
            [iso(item.sent_date), item.channel, item.quantity, item.entry_type, item.notes]
            for item in messages
        ]),
        ("Gastos", ["Fecha", "Categoría", "Descripción", "Importe ARS", "Notas"], [
            [iso(item.expense_date), item.category, item.description, float(item.amount), item.notes]
            for item in expenses
        ]),
        ("Horas trabajadas", ["Fecha", "Horas", "Notas"], [
            [iso(item.work_date), float(item.hours), item.notes] for item in work_logs
        ]),
    ])
    return Response(
        content,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=maestro-negocio-crm.xlsx"},
    )


@api.get("/exports/business-master.xlsx")
def export_business_master():
    try:
        return build_business_master_export()
    except Exception as exc:
        current_app.logger.exception("No se pudo generar el Excel maestro")
        return error(
            f"No se pudo generar el Excel maestro: {type(exc).__name__}: {exc}",
            500,
        )
