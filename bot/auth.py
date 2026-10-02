"""
QuartzPlay — autenticación para casino_api.py

Variables de entorno necesarias (Railway → Variables):
  ADMIN_API_KEY   = <string largo aleatorio>   # panel /admin
  SESSION_TTL_H   = 8                          # opcional, horas de sesión

Instalar: pip install "passlib[bcrypt]"
"""
import os, hmac, secrets, hashlib, logging
from fastapi import Header, HTTPException

log = logging.getLogger(__name__)

ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")

# Horas que vive una sesión. Único reloj: lo lee `sesion_guardar` para
# escribir `expira_at`, y la base es el único lugar donde una sesión existe.
SESSION_TTL_H = int(os.environ.get("SESSION_TTL_H", "8"))

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


# ── SESIONES ──────────────────────────────────────────────────
# Acá solo se emite el token. Quién lo tiene por válido se decide en
# `agencia_sesiones`, en la base, en cada pedido: ver `requiere_agencia` y
# `requiere_cliente` en casino_api.py.
#
# Antes había además una tabla en memoria, `_sessions`, con su propio
# vencimiento, y una dependencia `require_agencia` que la leía. Validar
# contra ella dejaba el token vivo aunque la fila ya no estuviera en la
# base: dar de baja una sesión no desalojaba a nadie. Se fue entera, junto
# con `destroy_session` —que solo sacaba de esa tabla y por eso nunca
# revocó nada— y con la purga que la acompañaba. Lo que no existe no puede
# volver a contestar por la base.
#
# El único reloj de una sesión es `SESSION_TTL_H`, y vive acá: lo lee
# `sesion_guardar` al escribir `expira_at`. Antes estaba en dos lados —ocho
# horas en memoria, doce en la base— y la vida real de una sesión dependía
# de qué camino contestaba primero.


def nuevo_token() -> str:
    """Sortea un token de sesión. No registra nada y no sabe de quién es.

    Se llamaba `create_session(agencia_code)`, y las dos mitades del nombre
    mentían: no creaba ninguna sesión, y el `agencia_code` que recibía no lo
    usaba para nada desde que se fue la tabla en memoria. Un parámetro de
    autenticación que se acepta y se ignora hace creer que el token queda
    atado a alguien; no lo está. El dueño del token lo escribe
    `sesion_guardar`, en la base, y ahí se decide quién es.

    Un token que no llegó a la base no abre nada, y quien emite tiene que
    tratar ese fallo como un login fallido (ver `SesionNoGuardada`).
    """
    return secrets.token_urlsafe(32)


# ── ADMIN ─────────────────────────────────────────────────────
def require_admin(x_admin_key: str = Header(None)):
    if not ADMIN_API_KEY:
        log.error("ADMIN_API_KEY no configurada — bloqueando acceso admin")
        raise HTTPException(503, "Admin no configurado")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(401, "No autorizado")
    return True
