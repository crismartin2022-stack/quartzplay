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
# Usamos la librería bcrypt directamente. passlib 1.7 con bcrypt 4.x
# lanza "password cannot be longer than 72 bytes" en vez de manejarlo,
# y eso tumbaba el login entero.
try:
    import bcrypt as _bcrypt
    _HAS_BCRYPT = True
except ImportError:
    _HAS_BCRYPT = False
    log.warning("bcrypt no instalado — usando SHA256 (inseguro)")


def _bytes72(p: str) -> bytes:
    """bcrypt solo mira los primeros 72 bytes. Cortamos ahí, cuidando
    de no partir un carácter UTF-8 por la mitad."""
    b = (p or "").encode("utf-8")
    if len(b) <= 72:
        return b
    corte = b[:72]
    while corte:
        try:
            corte.decode("utf-8"); break
        except UnicodeDecodeError:
            corte = corte[:-1]
    return corte


def hash_password(p: str) -> str:
    if _HAS_BCRYPT:
        return _bcrypt.hashpw(_bytes72(p), _bcrypt.gensalt()).decode("utf-8")
    return hashlib.sha256((p or "").encode()).hexdigest()


def verify_password(plain: str, stored: str) -> bool:
    """Verifica contra bcrypt o contra el SHA256 legacy."""
    if not stored:
        return False
    if stored.startswith("$2"):          # bcrypt
        if not _HAS_BCRYPT:
            return False
        try:
            return _bcrypt.checkpw(_bytes72(plain), stored.encode("utf-8"))
        except Exception as e:
            log.error(f"Error verificando bcrypt: {e}")
            return False
    # legacy sha256 — comparación en tiempo constante
    legacy = hashlib.sha256((plain or "").encode()).hexdigest()
    return hmac.compare_digest(legacy, stored)


def needs_rehash(stored: str) -> bool:
    """True si el hash guardado es legacy y conviene migrarlo al hacer login."""
    return _HAS_BCRYPT and not (stored or "").startswith("$2")


# ── SESIONES DE AGENCIA ───────────────────────────────────────
# En memoria: la API corre en un solo proceso (ver main.py).
# Si algún día escalás a varias réplicas, mové esto a Postgres o Redis.
_sessions: dict[str, dict] = {}


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


def _bearer(authorization: str | None) -> str:
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
