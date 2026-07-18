from datetime import date, datetime, timedelta
from app import create_app
from models import db, Client, ClientAction, Payment, ClientMetric, ClientNote, ActionTemplate

TEMPLATES = [
    ("delivery", "Entrega y puesta en marcha", 0, "high", "delivery"), ("silent_check", "Control silencioso", 7, "medium", "silent_check"),
    ("price_review", "Revisión de precios", 15, "high", "price_review"), ("free_prices", "Carga de precios gratis", 19, "medium", "free_shipping_setup"),
    ("paid_products", "Carga de productos con cobro", 20, "medium", "product_upload"), ("analytics_1", "Reporte Analytics: productos más vistos", 30, "medium", "analytics_report"),
    ("story", "Historia de Instagram", 40, "medium", "instagram_story"), ("cover", "Revisión de portada", 45, "low", "cover_review"),
    ("carousel", "Carrusel de fotos", 55, "medium", "carousel"), ("analytics_2", "Segundo reporte Analytics", 61, "medium", "analytics_report"),
    ("categories", "Tarjetas de categorías por marcas", 72, "medium", "category_cards"), ("best_sellers", "Productos más vendidos", 82, "medium", "best_sellers"),
    ("analytics_3", "Reporte Analytics de mes 4", 92, "medium", "analytics_report"), ("coupon", "Crear cupón de retención", 107, "high", "coupon"),
    ("qr", "Generar código QR", None, "medium", "qr"), ("link_bio", "Configurar link en bio", None, "medium", "link_in_bio"),
]

CLIENTS = [
    ("Sofía Méndez", "Casa Nativa", "Argentina", "ARS", 35000, "active", "first_month"),
    ("Mateo Rivas", "Norte Estudio", "Argentina", "ARS", 35000, "active", "second_month"),
    ("Valentina Cruz", "Marea Accesorios", "Chile", "USD", 45, "at_risk", "first_month"),
    ("Tomás Silva", "Origen Café", "Uruguay", "USD", 40, "active", "third_month"),
    ("Camila Torres", "Luma Deco", "Colombia", "USD", 35, "active", "recurring"),
    ("Joaquín Paz", "Taller Sur", "Argentina", "ARS", 30000, "paused", "recurring"),
    ("Martina Acosta", "Alma Botánica", "Paraguay", "USD", 40, "active", "onboarding"),
    ("Lucas Herrera", "Distrito Hombre", "Perú", "USD", 45, "at_risk", "second_month"),
    ("Renata Vega", "Mimo Kids", "Costa Rica", "USD", 50, "active", "third_month"),
    ("Bruno Castro", "Fuego Cocina", "Argentina", "ARS", 35000, "active", "recurring"),
    ("Julieta Soto", "Pausa Home", "Argentina", "ARS", 30000, "active", "first_month"),
    ("Emilia Núñez", "Viva Swim", "Uruguay", "USD", 40, "active", "onboarding"),
]

app = create_app()
with app.app_context():
    db.create_all()
    if Client.query.count():
        print("La base ya contiene datos; no se modificó.")
    else:
        for i, (key, title, offset, priority, kind) in enumerate(TEMPLATES): db.session.add(ActionTemplate(key=key, title=title, day_offset=offset, priority=priority, action_type=kind, sort_order=i))
        db.session.flush(); today = date.today()
        for index, row in enumerate(CLIENTS):
            name, business, country, currency, amount, status, stage = row
            signup = today - timedelta(days=(index * 9) + 4)
            renewal = today + timedelta(days=(index % 10) - 3)
            client = Client(name=name, business_name=business, country=country, city="Córdoba" if country == "Argentina" else None, currency=currency, payment_amount=amount, signup_date=signup, next_renewal_date=renewal, status=status, service_stage=stage, page_status="published" if index > 1 else "in_progress", link_in_bio_status="yes" if index % 3 else "pending", prices_status="yes" if index % 4 else "no", images_status="optimized", admin_load_status="completed", followers_count=80 + index * 37, publications_count=9 + index * 3, instagram_username="@" + business.lower().replace(" ", ""), notes_summary="Seguimiento comercial y operativo activo.")
            db.session.add(client); db.session.flush()
            for template in ActionTemplate.query.filter(ActionTemplate.day_offset.isnot(None)).limit(7):
                due = signup + timedelta(days=template.day_offset); completed = due < today - timedelta(days=10)
                db.session.add(ClientAction(client=client, title=template.title, action_type=template.action_type, priority=template.priority, template_key=template.key, due_date=due, status="completed" if completed else "pending", completed_at=datetime.combine(due, datetime.min.time()) if completed else None))
            pay_status = ["paid", "pending", "overdue", "partial"][index % 4]
            db.session.add(Payment(client=client, amount=amount, currency=currency, payment_type="monthly", period_year=today.year, period_month=today.month, due_date=renewal, status=pay_status, paid_at=datetime.utcnow() if pay_status == "paid" else None))
            db.session.add(ClientMetric(client=client, recorded_at=today - timedelta(days=20), followers_count=max(0, client.followers_count - 22), publications_count=max(0, client.publications_count - 2)))
            db.session.add(ClientNote(client=client, content="Revisar avance y conversar sobre la próxima acción de retención.", is_pinned=index % 4 == 0))
        db.session.commit(); print(f"Seed listo: {len(CLIENTS)} clientes ficticios.")
