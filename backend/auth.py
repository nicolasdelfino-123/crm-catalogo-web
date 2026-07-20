from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_bcrypt import check_password_hash
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from werkzeug.security import check_password_hash as check_werkzeug_password

from models import User, db


auth = Blueprint("auth", __name__)
users = Blueprint("users", __name__)


def password_matches(stored_password, supplied_password):
    """Acepta hashes bcrypt de la otra app y hashes Werkzeug ya existentes."""
    if not stored_password:
        return False
    if stored_password.startswith(("$2a$", "$2b$", "$2y$")):
        return check_password_hash(stored_password, supplied_password)
    return check_werkzeug_password(stored_password, supplied_password)


@auth.post("/login-persistent")
def login_persistent():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")

    if not email or not password:
        return jsonify({"error": "Email y contraseña son requeridos"}), 400

    user = User.query.filter(db.func.lower(User.email) == email).first()
    if not user or not user.is_active or not password_matches(user.password, password):
        return jsonify({"error": "Credenciales incorrectas"}), 401
    if not user.is_admin:
        return jsonify({"error": "No tenés permisos de administrador"}), 403

    expires = timedelta(days=30)
    user.last_login = datetime.utcnow()
    db.session.commit()
    token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role},
        expires_delta=expires,
    )
    return jsonify({
        "access_token": token,
        "role": user.role,
        "user_id": user.id,
        "expires_in_days": expires.days,
    })


@users.get("/me")
@jwt_required()
def current_user():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "is_admin": bool(user.is_admin),
    })
