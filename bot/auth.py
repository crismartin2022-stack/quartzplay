"""
QuartzPlay — autenticación para casino_api.py

Variables de entorno necesarias (Railway → Variables):
  ADMIN_API_KEY   = <string largo aleatorio>   # panel /admin
  SESSION_TTL_H   = 8                          # opcional

Instalar: pip install "passlib[bcrypt]"
"""
import os, time, hmac, secrets, hashlib, logging
from fastapi import Header, HTTPException

log = logging.getLogger(__name__)

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
SESSION_TTL = int(os.environ.get("SESSION_TTL_H", "8")) * 3600

# ── HASHING ───────────────────────────────────────────────────
try:
    from passlib.hash import bcrypt
    _HAS_BCRYPT = True
except ImportError:
    _HAS_BCRYPT = False
    log.warning("passlib no instalado — usando SHA256 (inseguro)")


def hash_password(p: str) -> str:
    if _HAS_BCRYPT:
        return bcrypt.hash(p)
    return hashlib.sha256(p.encode()).hexdigest()


def verify_password(plain: str, stored: str) -> bool:
    """Verifica contra bcrypt o contra el SHA256 legacy."""
    if not stored:
        return False
    if stored.startswith("$2"):          # bcrypt
        if not _HAS_BCRYPT:
            return False
        try:
            return bcrypt.verify(plain, stored)
        except Exception:
            return False
    # legacy sha256 — comparación en tiempo constante
    legacy = hashlib.sha256(plain.encode()).hexdigest()
    return hmac.compare_digest(legacy, stored)


def needs_rehash(stored: str) -> bool:
    """True si el hash guardado es legacy y conviene migrarlo al hacer login."""
    return _HAS_BCRYPT and not (stored or "").startswith("$2")


# ── SESIONES DE AGENCIA ───────────────────────────────────────
# En memoria: la API corre en un solo proceso (ver main.py).
# Si algún día escalás a varias réplicas, mové esto a Postgres o Redis.
_sessions = {}


def _purge():
    now = time.time()
    for t in [t for t, s in _sessions.items() if s["exp"] < now]:
        _sessions.pop(t, None)


def create_session(agencia_code: str) -> str:
    _purge()
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"code": agencia_code, "exp": time.time() + SESSION_TTL}
    return token


def destroy_session(token: str):
    _sessions.pop(token, None)


def _bearer(authorization):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta token de sesión")
    return authorization[7:].strip()


def require_agencia(authorization: str = Header(None)) -> str:
    """Dependencia FastAPI. Devuelve el código de agencia autenticada."""
    token = _bearer(authorization)
    sess = _sessions.get(token)
    if not sess or sess["exp"] < time.time():
        _sessions.pop(token, None)
        raise HTTPException(401, "Sesión expirada")
    return sess["code"]


# ── ADMIN ─────────────────────────────────────────────────────
def require_admin(x_admin_key: str = Header(None)):
    if not ADMIN_API_KEY:
        log.error("ADMIN_API_KEY no configurada — bloqueando acceso admin")
        raise HTTPException(503, "Admin no configurado")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(401, "No autorizado")
    return True
