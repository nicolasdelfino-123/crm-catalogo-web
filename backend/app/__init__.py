import os

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy import inspect, text
from werkzeug.security import generate_password_hash

from models import db
from routes import api


class _PasswordHasher:
    @staticmethod
    def generate_password_hash(password):
        return generate_password_hash(password).encode("utf-8")


bcrypt = _PasswordHasher()


def create_app(test_config=None):
    load_dotenv()
    frontend_folder = os.getenv("STATIC_FOLDER")
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
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY"),
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    CORS(app)
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/api/health")
    def health():
        return jsonify({"success": True, "data": {"status": "ok"}})

    with app.app_context():
        db.create_all()
        columns = {column["name"] for column in inspect(db.engine).get_columns("client")}
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


__all__ = ["create_app", "db", "bcrypt"]
