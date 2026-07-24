from datetime import date, datetime
from decimal import Decimal
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint

db = SQLAlchemy()


def iso(value):
    return value.isoformat() if value else None


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(160), unique=True, nullable=False, index=True)
    password = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(30), nullable=False, default="admin")
    last_login = db.Column(db.DateTime)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    is_premium = db.Column(db.Boolean, nullable=False, default=True)
    is_admin = db.Column(db.Boolean, nullable=False, default=True)
    must_reset_password = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Client(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, index=True)
    business_name = db.Column(db.String(160), nullable=False, index=True)
    website_url = db.Column(db.String(300))
    instagram_username = db.Column(db.String(120))
    email = db.Column(db.String(160))
    phone = db.Column(db.String(80))
    country = db.Column(db.String(80), nullable=False, default="Argentina", index=True)
    city = db.Column(db.String(100))
    acquisition_source = db.Column(db.String(60), index=True)
    currency = db.Column(db.String(8), nullable=False, default="ARS")
    payment_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    sale_date = db.Column(db.Date, index=True)
    signup_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    next_renewal_date = db.Column(db.Date, index=True)
    status = db.Column(db.String(30), nullable=False, default="active", index=True)
    service_stage = db.Column(db.String(30), nullable=False, default="onboarding")
    service_stage_manual = db.Column(db.Boolean, default=False)
    page_status = db.Column(db.String(30), default="pending")
    link_in_bio_status = db.Column(db.String(20), default="pending")
    story_status = db.Column(db.String(10), default="no")
    prices_status = db.Column(db.String(20), default="pending")
    images_status = db.Column(db.String(30), default="pending")
    google_analytics_status = db.Column(db.String(10), default="no")
    qr_generated_status = db.Column(db.String(10), default="no")
    carousel_installed_status = db.Column(db.String(10), default="no")
    coupon_status = db.Column(db.String(10), default="no")
    best_sellers_status = db.Column(db.String(10), default="no")
    admin_load_status = db.Column(db.String(30), default="pending")
    twelve_products_status = db.Column(db.String(10), default="no")
    active_products_count = db.Column(db.Integer, default=0)
    domain_purchased_status = db.Column(db.String(10), default="no")
    web_sales_count = db.Column(db.Integer, default=0)
    followers_count = db.Column(db.Integer, default=0)
    publications_count = db.Column(db.Integer, default=0)
    notes_summary = db.Column(db.Text)
    archived_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    actions = db.relationship("ClientAction", backref="client", cascade="all, delete-orphan", lazy=True)
    payments = db.relationship("Payment", backref="client", cascade="all, delete-orphan", lazy=True)
    metrics = db.relationship("ClientMetric", backref="client", cascade="all, delete-orphan", lazy=True)
    notes = db.relationship("ClientNote", backref="client", cascade="all, delete-orphan", lazy=True)
    credential = db.relationship("ClientCredential", backref="client", cascade="all, delete-orphan", uselist=False, lazy=True)
    vps_assignment = db.relationship(
        "VpsAssignment",
        back_populates="client",
        cascade="all, delete-orphan",
        uselist=False,
        lazy=True,
    )

    def summary(self):
        today = date.today()
        pending = sorted([a for a in self.actions if a.status in ("pending", "in_progress")], key=lambda a: a.due_date or date.max)
        overdue = [a for a in pending if a.due_date and a.due_date < today]
        last_payment = max((p for p in self.payments if p.status == "paid"), key=lambda p: p.paid_at or datetime.min, default=None)
        return {
            "id": self.id, "name": self.name, "business_name": self.business_name,
            "country": self.country, "city": self.city, "acquisition_source": self.acquisition_source, "currency": self.currency,
            "payment_amount": float(self.payment_amount or 0), "sale_date": iso(self.sale_date), "signup_date": iso(self.signup_date),
            "next_renewal_date": iso(self.next_renewal_date), "status": self.status,
            "service_stage": self.service_stage, "link_in_bio_status": self.link_in_bio_status,
            "story_status": self.story_status or "no",
            "service_stage_manual": bool(self.service_stage_manual),
            "prices_status": self.prices_status, "followers_count": self.followers_count or 0,
            "publications_count": self.publications_count or 0,
            "days_as_client": max(0, (today - self.signup_date).days),
            "next_action": pending[0].short() if pending else None,
            "overdue_actions_count": len(overdue),
            "last_payment": last_payment.short() if last_payment else None,
        }

    def detail(self):
        result = self.summary()
        result.update({
            "website_url": self.website_url, "instagram_username": self.instagram_username,
            "email": self.email, "phone": self.phone, "page_status": self.page_status,
            "images_status": self.images_status,
            "google_analytics_status": self.google_analytics_status or "no",
            "qr_generated_status": self.qr_generated_status or "no",
            "carousel_installed_status": self.carousel_installed_status or "no",
            "coupon_status": self.coupon_status or "no",
            "best_sellers_status": self.best_sellers_status or "no",
            "admin_load_status": self.admin_load_status,
            "twelve_products_status": self.twelve_products_status,
            "active_products_count": self.active_products_count or 0,
            "domain_purchased_status": self.domain_purchased_status,
            "web_sales_count": self.web_sales_count or 0,
            "vps_name": self.vps_assignment.vps_name if self.vps_assignment else None,
            "notes_summary": self.notes_summary,
            "actions": [a.to_dict() for a in sorted(self.actions, key=lambda x: x.due_date or date.max)],
            "payments": [p.to_dict() for p in sorted(self.payments, key=lambda x: x.due_date or date.min, reverse=True)],
            "metrics": [m.to_dict() for m in sorted(self.metrics, key=lambda x: x.recorded_at, reverse=True)],
            "notes": [n.to_dict() for n in sorted(self.notes, key=lambda x: (not x.is_pinned, -x.id))],
        })
        return result


class ClientAction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False, index=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    action_type = db.Column(db.String(50), default="custom")
    status = db.Column(db.String(30), default="pending", index=True)
    priority = db.Column(db.String(20), default="medium")
    due_date = db.Column(db.Date)
    implementation_date = db.Column(db.Date)
    completed_at = db.Column(db.DateTime)
    result_notes = db.Column(db.Text)
    template_key = db.Column(db.String(80))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("client_id", "template_key", name="uq_client_template"),)

    def short(self):
        return {
            "id": self.id, "title": self.title, "due_date": iso(self.due_date),
            "implementation_date": iso(self.implementation_date),
            "status": self.status, "priority": self.priority,
        }

    def to_dict(self):
        return {**self.short(), "description": self.description, "action_type": self.action_type, "completed_at": iso(self.completed_at), "result_notes": self.result_notes}


class StandaloneAction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    context_name = db.Column(db.String(180), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(30), nullable=False, default="pending", index=True)
    priority = db.Column(db.String(20), default="medium")
    due_date = db.Column(db.Date, index=True)
    implementation_date = db.Column(db.Date)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": f"standalone-{self.id}", "title": self.title, "description": self.description,
            "action_type": "standalone", "status": self.status, "priority": self.priority,
            "due_date": iso(self.due_date), "implementation_date": iso(self.implementation_date),
            "completed_at": iso(self.completed_at),
            "result_notes": None, "client_name": self.context_name,
            "business_name": "Acción personalizada", "standalone": True,
        }


class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    currency = db.Column(db.String(8), nullable=False)
    payment_type = db.Column(db.String(30), default="monthly")
    period_year = db.Column(db.Integer)
    period_month = db.Column(db.Integer)
    due_date = db.Column(db.Date)
    paid_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default="pending", index=True)
    payment_method = db.Column(db.String(60))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def short(self):
        return {"id": self.id, "amount": float(self.amount), "currency": self.currency, "status": self.status, "paid_at": iso(self.paid_at)}

    def to_dict(self):
        return {**self.short(), "client_id": self.client_id, "client_name": self.client.name, "payment_type": self.payment_type, "period_year": self.period_year, "period_month": self.period_month, "due_date": iso(self.due_date), "payment_method": self.payment_method, "notes": self.notes}


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    expense_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    category = db.Column(db.String(30), nullable=False, default="extra", index=True)
    description = db.Column(db.String(180), nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "expense_date": iso(self.expense_date),
            "category": self.category, "description": self.description,
            "amount": float(self.amount), "currency": "ARS", "notes": self.notes,
            "created_at": iso(self.created_at),
        }


class VpsAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vps_name = db.Column(db.String(20), nullable=False, index=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), unique=True, index=True)
    custom_name = db.Column(db.String(180))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    client = db.relationship("Client", back_populates="vps_assignment")

    def to_dict(self):
        return {
            "id": self.id, "vps_name": self.vps_name, "client_id": self.client_id,
            "name": self.client.name if self.client else self.custom_name,
            "business_name": self.client.business_name if self.client else "Aplicación personalizada",
            "custom": self.client_id is None, "created_at": iso(self.created_at),
        }


class ClientMetric(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    recorded_at = db.Column(db.Date, default=date.today)
    followers_count = db.Column(db.Integer, default=0)
    publications_count = db.Column(db.Integer, default=0)
    notes = db.Column(db.Text)
    def to_dict(self): return {"id": self.id, "recorded_at": iso(self.recorded_at), "followers_count": self.followers_count, "publications_count": self.publications_count, "notes": self.notes}


class ClientNote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    def to_dict(self): return {"id": self.id, "content": self.content, "is_pinned": self.is_pinned, "created_at": iso(self.created_at)}


class ClientCredential(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey("client.id"), nullable=False, unique=True, index=True)
    username_encrypted = db.Column(db.Text, nullable=False)
    password_encrypted = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MessageLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sent_date = db.Column(db.Date, nullable=False, default=date.today, index=True)
    channel = db.Column(db.String(60), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)
    entry_type = db.Column(db.String(20), nullable=False, default="daily")
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "sent_date": iso(self.sent_date), "channel": self.channel,
            "quantity": self.quantity, "entry_type": self.entry_type or "daily",
            "notes": self.notes, "created_at": iso(self.created_at),
        }


class ActionTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False)
    title = db.Column(db.String(180), nullable=False)
    day_offset = db.Column(db.Integer)
    priority = db.Column(db.String(20), default="medium")
    action_type = db.Column(db.String(50), default="custom")
    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    def to_dict(self): return {"id": self.id, "key": self.key, "title": self.title, "day_offset": self.day_offset, "priority": self.priority, "action_type": self.action_type, "is_active": self.is_active}
