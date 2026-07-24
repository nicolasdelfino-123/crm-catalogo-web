import os

import click
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_jwt_extended import JWTManager, verify_jwt_in_request
from sqlalchemy import inspect, text

from models import User, db
from auth import auth, users
from routes import api

bcrypt = Bcrypt()
jwt = JWTManager()


def create_app(test_config=None):
    load_dotenv()
    frontend_folder = os.getenv("STATIC_FOLDER")
    jwt_secret = (
        test_config.get("JWT_SECRET_KEY")
        if test_config and test_config.get("JWT_SECRET_KEY")
        else os.getenv("JWT_SECRET_KEY")
    )
    if not jwt_secret:
        raise RuntimeError("Falta JWT_SECRET_KEY en el archivo .env")
    database_uri = (
        test_config.get("SQLALCHEMY_DATABASE_URI")
        if test_config
        else os.getenv("SQLALCHEMY_DATABASE_URI")
    )
    if not database_uri:
        raise RuntimeError("Falta SQLALCHEMY_DATABASE_URI en el archivo .env")

    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=database_uri,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JSON_SORT_KEYS=False,
        JWT_SECRET_KEY=jwt_secret,
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    CORS(app)
    app.register_blueprint(api, url_prefix="/api")
    app.register_blueprint(auth, url_prefix="/auth")
    app.register_blueprint(users, url_prefix="/user")

    @app.before_request
    def protect_crm_api():
        if (
            request.path.startswith("/api/")
            and request.path != "/api/health"
            and not app.config.get("AUTH_DISABLED", False)
        ):
            verify_jwt_in_request()

    @app.get("/api/health")
    def health():
        return jsonify({"success": True, "data": {"status": "ok"}})

    @app.cli.command("create-admin")
    @click.option("--email", prompt="Email")
    @click.option("--name", prompt="Nombre", default="Administrador")
    @click.password_option(prompt="Contraseña", confirmation_prompt=True)
    def create_admin(email, name, password):
        """Crea el administrador inicial sin exponer la contraseña."""
        normalized_email = email.strip().lower()
        if User.query.filter(db.func.lower(User.email) == normalized_email).first():
            raise click.ClickException("Ya existe un usuario con ese email.")
        user = User(
            email=normalized_email,
            name=name.strip() or "Administrador",
            password=bcrypt.generate_password_hash(password).decode("utf-8"),
            role="admin",
            is_admin=True,
            is_active=True,
        )
        db.session.add(user)
        db.session.commit()
        click.echo("Administrador creado correctamente.")

    with app.app_context():
        db.create_all()
        inspector = inspect(db.engine)
        if "message_log" in inspector.get_table_names():
            message_columns = {column["name"] for column in inspector.get_columns("message_log")}
            if "entry_type" not in message_columns:
                db.session.execute(text("ALTER TABLE message_log ADD COLUMN entry_type VARCHAR(20) DEFAULT 'daily' NOT NULL"))
                db.session.commit()
        if "standalone_action" in inspector.get_table_names():
            action_columns = {column["name"] for column in inspector.get_columns("standalone_action")}
            if "description" not in action_columns:
                db.session.execute(text("ALTER TABLE standalone_action ADD COLUMN description TEXT"))
                db.session.commit()
            if "implementation_date" not in action_columns:
                db.session.execute(text("ALTER TABLE standalone_action ADD COLUMN implementation_date DATE"))
                db.session.commit()
        if "client_action" in inspector.get_table_names():
            client_action_columns = {column["name"] for column in inspector.get_columns("client_action")}
            if "implementation_date" not in client_action_columns:
                db.session.execute(text("ALTER TABLE client_action ADD COLUMN implementation_date DATE"))
                db.session.commit()
        columns = {column["name"] for column in inspect(db.engine).get_columns("client")}
        if "sale_date" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN sale_date DATE"))
            db.session.commit()
        if "acquisition_source" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN acquisition_source VARCHAR(60)"))
            db.session.commit()
        if "twelve_products_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN twelve_products_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "active_products_count" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN active_products_count INTEGER DEFAULT 0"))
            db.session.commit()
        if "domain_purchased_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN domain_purchased_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "web_sales_count" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN web_sales_count INTEGER DEFAULT 0"))
            db.session.commit()
        if "service_stage_manual" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN service_stage_manual BOOLEAN DEFAULT FALSE"))
            db.session.commit()
        if "google_analytics_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN google_analytics_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "story_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN story_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "qr_generated_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN qr_generated_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "carousel_installed_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN carousel_installed_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "coupon_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN coupon_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()
        if "best_sellers_status" not in columns:
            db.session.execute(text("ALTER TABLE client ADD COLUMN best_sellers_status VARCHAR(10) DEFAULT 'no'"))
            db.session.commit()

    if frontend_folder:
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def frontend(path):
            requested_file = os.path.join(frontend_folder, path)
            if path.startswith("api/"):
                abort(404)
            if path and os.path.isfile(requested_file):
                return send_from_directory(frontend_folder, path)
            return send_from_directory(frontend_folder, "index.html")

    return app


__all__ = ["create_app", "db", "bcrypt", "jwt"]
