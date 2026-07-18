import os
from flask import Flask, jsonify
from sqlalchemy import inspect, text
from flask_cors import CORS
from dotenv import load_dotenv

from models import db
from routes import api


def create_app(test_config=None):
    load_dotenv()
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=os.getenv("DATABASE_URL", "sqlite:///crm.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)
    # No se usan cookies ni autenticacion. Permitir origenes de la red local hace
    # posible abrir Vite desde un celular sin mantener una lista de IPs privadas.
    CORS(app)
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/api/health")
    def health():
        return jsonify({"success": True, "data": {"status": "ok"}})

    with app.app_context():
        db.create_all()
        # SQLite no agrega columnas nuevas con create_all. Esta actualización
        # conserva la base existente y evita exigir una migración manual.
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
            db.session.execute(text("ALTER TABLE client ADD COLUMN service_stage_manual BOOLEAN DEFAULT 0"))
            db.session.commit()
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
