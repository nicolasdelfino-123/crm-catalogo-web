import csv
import io
import calendar
import base64
import hashlib
from datetime import date, datetime, timedelta
from flask import Blueprint, jsonify, request, Response, current_app
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Integer, case, cast, func, or_
from models import db, iso, Client, ClientAction, StandaloneAction, Payment, Expense, VpsAssignment, ClientMetric, ClientNote, ClientCredential, MessageLog, ActionTemplate

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
    """Materializa mensualidades vencidas y actualiza su estado visible."""
    today = today or date.today()
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
        while due_date < today:
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
                    status="overdue",
                    notes="Generado automáticamente al vencer la mensualidad.",
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
    latest_paid_period = max(
        (
            payment.due_date
            for payment in client.payments
            if payment.status == "paid" and payment.payment_type == "monthly" and payment.due_date
        ),
        default=None,
    )
    renewal_month = (
        (client.next_renewal_date.year, client.next_renewal_date.month)
        if client.next_renewal_date else None
    )
    paid_month = (latest_paid_period.year, latest_paid_period.month) if latest_paid_period else None
    if latest_paid_period and (
        not renewal_month or paid_month >= renewal_month
    ):
        client.next_renewal_date = next_billing_date(client, latest_paid_period)
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
    text_fields = ["name", "business_name", "website_url", "instagram_username", "email", "phone", "country", "city", "acquisition_source", "currency", "status", "service_stage", "page_status", "link_in_bio_status", "story_status", "prices_status", "images_status", "google_analytics_status", "qr_generated_status", "carousel_installed_status", "coupon_status", "best_sellers_status", "admin_load_status", "twelve_products_status", "domain_purchased_status", "notes_summary"]
    for field in text_fields:
        if field in data:
            setattr(client, field, data[field] or None)
    for field in ["sale_date", "signup_date", "next_renewal_date"]:
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
        query = query.filter(or_(Client.name.ilike(term), Client.business_name.ilike(term), Client.instagram_username.ilike(term), Client.email.ilike(term)))
    requested_status = request.args.get("status")
    if requested_status == "active_no_signup":
        query = query.filter(Client.status.in_(("active", "at_risk", "no_signup")))
    elif requested_status == "active":
        query = query.filter(Client.status.in_(("active", "at_risk")))
    elif requested_status:
        query = query.filter(Client.status == requested_status)
    for field in ["service_stage", "country", "currency", "acquisition_source"]:
        if request.args.get(field): query = query.filter(getattr(Client, field) == request.args[field])
    sort_by = request.args.get("sort_by", "name")
    if sort_by == "billing_day":
        # Ordena solamente por el número de día (1-31), sin considerar mes ni año.
        column = func.extract("day", Client.signup_date)
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
    return ok({"items": [c.summary() for c in result.items], "pagination": {"page": page, "per_page": per_page, "total": result.total, "pages": result.pages}})


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
        apply_client(client, data)
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


@api.post("/clients/<int:client_id>/generate-actions")
def actions_generate(client_id):
    client = Client.query.get_or_404(client_id); count = generate_schedule(client); db.session.commit(); return ok({"created": count}, f"Se crearon {count} acciones")


@api.get("/actions")
def actions_list():
    existing_clients = Client.query.filter(Client.archived_at.is_(None)).all()
    collection_actions_changed = bool(sync_overdue_monthly_payments(existing_clients))
    for client in existing_clients:
        collection_actions_changed = advance_service_stage(client) or collection_actions_changed
        collection_actions_changed = ensure_collection_action(client) or collection_actions_changed
    if collection_actions_changed:
        db.session.commit()
    query = ClientAction.query.join(Client).filter(Client.archived_at.is_(None))
    if request.args.get("view") == "calendar":
        # En el calendario los cobros se proyectan para cada mes; se excluye
        # la única acción persistida para no mostrar el mismo cobro dos veces.
        query = query.filter(ClientAction.action_type != "collection")
    if request.args.get("view") == "undated":
        query = query.filter(ClientAction.due_date.is_(None))
    else:
        query = query.filter(ClientAction.due_date.isnot(None))
    if request.args.get("status") == "pending":
        query = query.filter(ClientAction.status.in_(["pending", "in_progress"]))
    elif request.args.get("status"):
        query = query.filter(ClientAction.status == request.args["status"])
    if request.args.get("view") == "overdue": query = query.filter(ClientAction.due_date < date.today())
    if request.args.get("view") == "today": query = query.filter(ClientAction.due_date == date.today())
    if request.args.get("view") == "week": query = query.filter(ClientAction.due_date.between(date.today(), date.today() + timedelta(days=7)))
    if request.args.get("view") == "calendar" and request.args.get("month"):
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
    if request.args.get("view") == "undated":
        standalone_query = standalone_query.filter(StandaloneAction.due_date.is_(None))
    else:
        standalone_query = standalone_query.filter(StandaloneAction.due_date.isnot(None))
    if request.args.get("status") == "pending":
        standalone_query = standalone_query.filter(StandaloneAction.status.in_(["pending", "in_progress"]))
    elif request.args.get("status"):
        standalone_query = standalone_query.filter(StandaloneAction.status == request.args["status"])
    if request.args.get("view") == "overdue": standalone_query = standalone_query.filter(StandaloneAction.due_date < date.today())
    if request.args.get("view") == "today": standalone_query = standalone_query.filter(StandaloneAction.due_date == date.today())
    if request.args.get("view") == "week": standalone_query = standalone_query.filter(StandaloneAction.due_date.between(date.today(), date.today() + timedelta(days=7)))
    if request.args.get("view") == "calendar" and request.args.get("month"):
        month_start = date.fromisoformat(f'{request.args["month"]}-01')
        standalone_query = standalone_query.filter(
            StandaloneAction.due_date >= month_start,
            StandaloneAction.due_date < add_calendar_months(month_start, 1),
        )
    result.extend(action.to_dict() for action in standalone_query.order_by(StandaloneAction.due_date.asc()).limit(250).all())
    if request.args.get("status") == "pending" and request.args.get("view") == "overdue":
        overdue_payments = Payment.query.join(Client).filter(
            Client.archived_at.is_(None), Payment.payment_type == "monthly",
            Payment.status.in_(("pending", "partial", "overdue")),
            Payment.due_date < date.today(),
        ).order_by(Payment.due_date.asc()).all()
        result.extend(payment_collection_item(payment) for payment in overdue_payments)
        result.sort(key=lambda item: (item["due_date"] or "9999-12-31", str(item["id"])))
    if request.args.get("view") == "calendar" and request.args.get("status") == "pending" and request.args.get("month"):
        year, month = request.args["month"].split("-")
        result.extend(projected_collection_items(existing_clients, int(year), int(month)))
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
    if "priority" in data: action.priority = data["priority"]
    if "status" in data:
        action.status = data["status"]
        action.completed_at = datetime.utcnow() if action.status == "completed" else None
    db.session.commit()
    return ok(action.to_dict(), "Acción actualizada")


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
        due_date = parse_date(data.get("due_date")) or client.next_renewal_date or add_calendar_months(client.signup_date, 1)
        payment = Payment(client=client, amount=amount, currency=data.get("currency", client.currency), payment_type=data.get("payment_type", "monthly"), period_year=data.get("period_year"), period_month=data.get("period_month"), due_date=due_date, status=data.get("status", "pending"), payment_method=data.get("payment_method"), notes=data.get("notes"))
        if payment.status == "paid": payment.paid_at = datetime.utcnow()
        db.session.add(payment)
        if payment.status == "paid": advance_renewal_after_payment(payment)
        else: ensure_collection_action(client)
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
    for item in items:
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
    at_risk_clients = [c for c in clients if c.status == "at_risk"]
    pending_actions = [a for a in actions if a.status in ("pending", "in_progress")]
    overdue_payments = [p for p in payments if p.payment_type == "monthly" and p.status in ("pending", "partial", "overdue") and p.due_date and p.due_date < today]
    overdue_actions = [a for a in pending_actions if a.due_date and a.due_date < today]
    renewals_week = [c for c in clients if c.next_renewal_date and today <= c.next_renewal_date <= today + timedelta(days=7)]
    next_month_start = add_calendar_months(month_start, 1)
    new_clients_month = [c for c in clients if month_start <= c.signup_date < next_month_start]
    sold_clients_month = [c for c in clients if c.sale_date and month_start <= c.sale_date < next_month_start]

    def client_item(client):
        return {
            "id": client.id, "name": client.name, "business_name": client.business_name,
            "status": client.status, "service_stage": client.service_stage,
            "sale_date": iso(client.sale_date),
            "signup_date": client.signup_date.isoformat() if client.signup_date else None,
            "next_renewal_date": client.next_renewal_date.isoformat() if client.next_renewal_date else None,
        }

    def action_item(action):
        return {
            "id": action.id, "title": action.title, "status": action.status,
            "due_date": action.due_date.isoformat() if action.due_date else None,
            "client_id": action.client.id, "client_name": action.client.name,
            "business_name": action.client.business_name,
        }

    data = {
        "active_clients": len(active_clients), "at_risk_clients": len(at_risk_clients),
        "pending_actions": len(pending_actions) + len(overdue_payments), "overdue_actions": len(overdue_actions) + len(overdue_payments),
        "renewals_week": len(renewals_week), "new_clients_month": len(new_clients_month),
        "sold_clients_month": len(sold_clients_month),
        "collected": money,
        "details": {
            "active_clients": [client_item(c) for c in active_clients],
            "at_risk_clients": [client_item(c) for c in at_risk_clients],
            "pending_actions": [action_item(a) for a in pending_actions] + [payment_collection_item(p) for p in overdue_payments],
            "overdue_actions": [action_item(a) for a in overdue_actions] + [payment_collection_item(p) for p in overdue_payments],
            "renewals_week": [client_item(c) for c in renewals_week],
            "new_clients_month": [client_item(c) for c in new_clients_month],
            "sold_clients_month": [client_item(c) for c in sold_clients_month],
        },
    }
    return ok(data)


@api.get("/dashboard/income")
def dashboard_income():
    month = request.args.get("month", date.today().strftime("%Y-%m"))
    payment_type = request.args.get("payment_type", "all")
    if payment_type not in {"all", "monthly", "extra_work", "monthly_forecast"}:
        return error("El tipo de pago debe ser all, monthly, extra_work o monthly_forecast", 422)
    if payment_type == "monthly_forecast":
        totals = {"ARS": 0, "USD": 0}
        active_clients = Client.query.filter(
            Client.archived_at.is_(None),
            Client.status.in_(("active", "at_risk")),
        ).all()
        for client in active_clients:
            totals[client.currency] = totals.get(client.currency, 0) + float(client.payment_amount or 0)
        available_months = sorted({
            (payment.due_date or (payment.paid_at.date() if payment.paid_at else None)).strftime("%Y-%m")
            for payment in Payment.query.filter(Payment.status == "paid").all()
            if payment.due_date or payment.paid_at
        }, reverse=True)
        return ok({
            "month": None,
            "payment_type": payment_type,
            "totals": totals,
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
        query = query.filter(Payment.payment_type == "monthly")
    elif payment_type == "extra_work":
        query = query.filter(Payment.payment_type == "extra_work")
    totals = {"ARS": 0, "USD": 0}
    paid_payments = query.all()
    available_months = sorted({
        (payment.due_date or (payment.paid_at.date() if payment.paid_at else None)).strftime("%Y-%m")
        for payment in Payment.query.filter(Payment.status == "paid").all()
        if payment.due_date or payment.paid_at
    }, reverse=True)
    for payment in paid_payments:
        payment_date = payment.due_date or (payment.paid_at.date() if payment.paid_at else None)
        if month_start and (not payment_date or not month_start <= payment_date < month_end):
            continue
        totals[payment.currency] = totals.get(payment.currency, 0) + float(payment.amount)
    return ok({
        "month": month,
        "payment_type": payment_type,
        "totals": totals,
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
