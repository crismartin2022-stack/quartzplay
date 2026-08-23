import os, re, time, hashlib, asyncio, hmac, json, logging, ast, secrets, random
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import asyncpg
import httpx
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import auth

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

# Saldo de créditos de The Odds API (se llena solo al consultar el feed)
_odds_credits = {"remaining": None, "used": None, "last_check": None}

def sync_get(url, params=None, headers=None, timeout=30):
    """HTTP GET sincrónico usando urllib para evitar conflictos de event loop"""
    import urllib.request, urllib.parse, json as _json
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            # The Odds API informa el saldo de créditos en los headers
            rem = r.headers.get("x-requests-remaining")
            if rem is not None:
                _odds_credits["remaining"] = rem
                _odds_credits["used"] = r.headers.get("x-requests-used")
                _odds_credits["last_check"] = time.strftime("%d/%m %H:%M")
            return _json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        # Sin esto, un 422 por mercado inválido se veía igual que un timeout
        cuerpo = ""
        try:
            cuerpo = e.read().decode()[:300]
        except Exception:
            pass
        log.error(f"sync_get HTTP {e.code} en {url.split('?')[0]}: {cuerpo}")
        return None
    except Exception as e:
        log.error(f"sync_get error {url.split('?')[0]}: {e}")
        return None

DATABASE_URL = os.environ.get("DATABASE_URL","")
X_CODE       = os.environ.get("CASINO_X_CODE","")
SECRET_KEY   = os.environ.get("CASINO_SECRET_KEY","")

# Límites de apuesta — configurables por entorno
MIN_STAKE = int(os.environ.get("MIN_STAKE", "500"))
MAX_STAKE = int(os.environ.get("MAX_STAKE", "500000"))

app = FastAPI(title="QuartzPlay API")

# Solo los dominios propios pueden llamar a la API desde un navegador.
# Si algún panel deja de cargar datos, revisá la consola: un error de CORS
# significa que falta agregar su dominio acá.
# Zona horaria de la casa. El servidor corre en UTC: sin esto,
# astimezone() sin argumento devuelve UTC y los partidos aparecen
# 3 horas mas tarde. El frontend igual convierte a la hora del
# dispositivo; esto es el respaldo para quien no pueda hacerlo.
try:
    from zoneinfo import ZoneInfo
    TZ_CASA = ZoneInfo(os.environ.get("TZ_CASA", "America/Argentina/Buenos_Aires"))
except Exception:
    TZ_CASA = timezone(timedelta(hours=-3))

ALLOWED_ORIGINS = [
    # Dominio propio. Es lo que permite mudar de proveedor sin que los
    # clientes ni las agencias cambien de direccion.
    "https://iaqp.lat",
    "https://juego.iaqp.lat",
    # El dominio viejo de Railway queda por ahora: si algo quedo con la
    # direccion anterior, sigue andando. Se saca cuando este todo migrado.
    "https://valiant-gentleness-production-a779.up.railway.app",
    "https://web.telegram.org",
    "http://localhost:3000",
]

app.add_middleware(CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # DELETE faltaba: el navegador bloqueaba esas peticiones antes de
    # enviarlas y todo lo que fuera "quitar" fallaba con Failed to fetch.
    allow_methods=["GET","POST","PUT","DELETE"],
    allow_headers=["Content-Type","Authorization","X-Admin-Key"],
    allow_credentials=False,
)

# ── LIMITE DE PETICIONES ──────────────────────────────────────
# Ventana deslizante por IP, en memoria del proceso. Sin dependencias
# nuevas. Limitaciones honestas: se reinicia en cada deploy y no se
# comparte entre workers. Con un worker alcanza; si algun dia corres
# varios, esto tiene que mudarse a Redis.
#
# Los topes van por costo real, no parejos:
#   - crear boletos: es anonimo, es lo que se puede abusar mas barato
#   - mejorar: cada llamada gasta creditos de IA, es lo mas caro
#   - login: freno de fuerza bruta contra contrasenas

LIMITES = {
    "/api/betslip":           (20,  60),   # 20 por minuto
    "/api/apuesta":           (30,  60),
    "/api/mejorar-combinada": (5,  300),   # 5 cada 5 minutos
    "/api/agencias/login":    (20, 300),   # el admin entra por clave en
                                           # cabecera, no tiene login
    # Billetera de IAQP: es servicio a servicio y entra toda desde una
    # sola IP. Con el techo general quedaria frenada al llenarse las mesas.
    "/api/wallet/":           (3000, 60),
    # Subir imagenes: pocas veces, pero el cuerpo es grande
    "/api/admin/web/banners": (30,   60),
}
LIMITE_GENERAL = (240, 60)   # techo para cualquier otro POST/PUT

_peticiones = {}          # (ip, ruta) -> [timestamps]
_ultima_limpieza = 0.0


def _ip_cliente(request: Request) -> str:
    """IP real detras del proxy de Railway."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()[:45]
    return (request.client.host if request.client else "?")[:45]


def _huella_dispositivo(request: Request) -> str:
    """
    Identifica un dispositivo sin cookies ni permisos: combina el
    navegador declarado con el idioma y la codificación aceptados.
    No es infalible —dos celulares iguales dan la misma huella— pero
    alcanza para notar que veinte cuentas juegan desde el mismo lugar.
    """
    partes = [
        request.headers.get("user-agent", "")[:200],
        request.headers.get("accept-language", "")[:60],
        request.headers.get("accept-encoding", "")[:60],
    ]
    return hashlib.sha256("|".join(partes).encode()).hexdigest()[:24]


def _limite_de(ruta: str):
    for prefijo, tope in LIMITES.items():
        if ruta.startswith(prefijo):
            return tope
    return LIMITE_GENERAL


@app.middleware("http")
async def limitar_peticiones(request: Request, call_next):
    global _ultima_limpieza

    # Las lecturas no se limitan: son las que sirven cuotas y salen de cache
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)

    ahora = time.time()
    ruta = request.url.path
    cupo, ventana = _limite_de(ruta)
    clave = (_ip_cliente(request), ruta)

    marcas = [t for t in _peticiones.get(clave, []) if ahora - t < ventana]

    if len(marcas) >= cupo:
        espera = int(ventana - (ahora - marcas[0])) + 1
        log.warning(f"[LIMITE] {clave[0]} freno en {ruta}")
        # Las cabeceras de CORS van a mano. Este middleware corre ANTES
        # que el de CORS, asi que sin esto el navegador bloquea la
        # respuesta, el fetch tira excepcion y el panel muestra "sin
        # conexion" en vez de "demasiados intentos". Diagnostico
        # imposible para quien lo sufre.
        cabeceras = {"Retry-After": str(espera)}
        origen = request.headers.get("origin", "")
        if origen in ALLOWED_ORIGINS:
            cabeceras["Access-Control-Allow-Origin"] = origen
            cabeceras["Vary"] = "Origin"
        return JSONResponse(
            status_code=429,
            headers=cabeceras,
            content={"detail": f"Demasiados intentos. Probá de nuevo en {espera} segundos."},
        )

    marcas.append(ahora)
    _peticiones[clave] = marcas

    # Limpieza periodica: sin esto el diccionario crece para siempre
    if ahora - _ultima_limpieza > 300:
        _ultima_limpieza = ahora
        muertas = [k for k, v in _peticiones.items()
                   if not v or ahora - v[-1] > 3600]
        for k in muertas:
            _peticiones.pop(k, None)
        log.info(f"[LIMITE] limpieza: {len(muertas)} entradas, "
                 f"quedan {len(_peticiones)}")

    return await call_next(request)


_db_pool = None

async def get_db():
    global _db_pool
    if not _db_pool:
        # 30 conexiones. El servidor admite 100: quedan de sobra para el
        # bot, para otro worker y para entrar por la consola.
        # Los dos tiempos importan más que el número: sin ellos, una
        # consulta trabada se queda con su conexión hasta el reinicio y
        # el pool se va muriendo de a una.
        _db_pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=5, max_size=30,
            timeout=10,              # esperar conexión libre, máx 10s
            command_timeout=15,      # cortar la consulta trabada
            max_inactive_connection_lifetime=300)
    return _db_pool

def make_sign(body_json, x_code, x_time):
    if body_json:
        payload = f"{body_json}X-Code={x_code}&X-Time={x_time}"
    else:
        payload = f"X-Code={x_code}&X-Time={x_time}"
    return hmac.new(
        SECRET_KEY.encode(), payload.encode(), hashlib.sha1
    ).hexdigest()

def validate_sign(body_raw, x_code, x_time, x_sign):
    try:
        if abs(time.time() - int(x_time)) > 30:
            return False
    except:
        return False
    expected = make_sign(
        body_raw.decode() if body_raw else None, x_code, x_time)
    return hmac.compare_digest(expected, x_sign)



# ── SESIONES PERSISTENTES ─────────────────────────────────────
# Las sesiones vivían en memoria: cada deploy o reinicio echaba a todas
# las agencias. Ahora quedan en la base.
async def sesion_guardar(token: str, agencia_code: str, horas: int = 12):
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO agencia_sesiones (token, agencia_code, expira_at)
                VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
                ON CONFLICT (token) DO NOTHING
            """, token, agencia_code, str(horas))
    except Exception as e:
        log.error(f"No se pudo guardar la sesión: {e}")


async def sesion_buscar(token: str):
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT agencia_code FROM agencia_sesiones
                WHERE token = $1 AND expira_at > NOW()
            """, token)
            return row["agencia_code"] if row else None
    except Exception as e:
        log.error(f"No se pudo leer la sesión: {e}")
        return None


async def requiere_agencia(authorization: str = Header(None)) -> str:
    """
    Igual que auth.require_agencia pero mirando también la base,
    así una sesión sigue viva después de un reinicio.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta token de sesión")
    token = authorization[7:].strip()

    try:
        return auth.require_agencia(authorization)   # memoria: instantáneo
    except HTTPException:
        pass

    code = await sesion_buscar(token)                # base: sobrevive deploys
    if not code:
        raise HTTPException(401, "Sesión expirada")
    auth._sessions[token] = {"code": code,
                             "exp": time.time() + auth.SESSION_TTL}
    return code


# ── ERRORES: que nunca se vean como "sin conexión" ────────────
@app.exception_handler(Exception)
async def error_no_manejado(request: Request, exc: Exception):
    log.exception(f"500 en {request.method} {request.url.path}: {exc}")
    origen = request.headers.get("origin", "")
    cabeceras = {}
    if origen in ALLOWED_ORIGINS:
        cabeceras["Access-Control-Allow-Origin"] = origen
        cabeceras["Vary"] = "Origin"
    return JSONResponse(
        {"detail": "Error interno del servidor"},
        status_code=500, headers=cabeceras)


@app.exception_handler(HTTPException)
async def error_http(request: Request, exc: HTTPException):
    origen = request.headers.get("origin", "")
    cabeceras = dict(getattr(exc, "headers", None) or {})
    if origen in ALLOWED_ORIGINS:
        cabeceras["Access-Control-Allow-Origin"] = origen
        cabeceras["Vary"] = "Origin"
    return JSONResponse({"detail": exc.detail},
                        status_code=exc.status_code, headers=cabeceras)


# ── HEALTH ────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status":"ok","service":"QuartzPlay API"}

# ── AGENCIAS — LOGIN (público) ────────────────────────────────
@app.post("/api/agencias/login")
async def agencia_login(request: Request):
    body     = await request.json()
    username = body.get("username","")
    password = body.get("password","")
    pool     = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM agencias
            WHERE username=$1 AND status='active'
        """, username)
        if not row or not auth.verify_password(password, row["password_hash"]):
            raise HTTPException(status_code=401,
                detail="Usuario o contraseña incorrectos")
        # Migra el hash viejo (sha256) a bcrypt en el primer login
        if auth.needs_rehash(row["password_hash"]):
            await conn.execute(
                "UPDATE agencias SET password_hash=$2 WHERE code=$1",
                row["code"], auth.hash_password(password))
        await conn.execute(
            "UPDATE agencias SET last_login=NOW() WHERE code=$1", row["code"])
    token = auth.create_session(row["code"])
    await sesion_guardar(token, row["code"])
    return {
        "token":   token,
        "code":    row["code"],
        "name":    row["name"],
        "address": row["address"],
        "phone":   row["phone"],
        "status":  row["status"],
        # La moneda define los montos sugeridos y el símbolo. Sin esto,
        # una agencia en USD veía montos pensados para pesos.
        "moneda":  row.get("moneda") or "ARS",
        "tipo":    row.get("tipo") or "agencia",
        "codigo_ref": row.get("codigo_ref"),
        "nivel":   row.get("nivel") or 0,
        "debe_cambiar_pass": bool(row.get("debe_cambiar_pass")),
        "permiso": row.get("permiso") or "ambos",
    }

# ── CONTRASEÑAS — cambio propio y reset en cascada ────────────
@app.post("/api/agencias/me/password")
async def cambiar_mi_password(request: Request,
                              agencia_code: str = Depends(requiere_agencia)):
    """Cada agencia/influencer cambia su propia contraseña (solo la nueva)."""
    body = await request.json()
    nueva = body.get("nueva") or ""
    if len(nueva) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE agencias SET password_hash=$2, debe_cambiar_pass=false
            WHERE code=$1
        """, agencia_code, auth.hash_password(nueva))
    return {"ok": True}


@app.post("/api/agencias/me/reset-password")
async def reset_password_rama(request: Request,
                              agencia_code: str = Depends(requiere_agencia)):
    """
    Una agencia resetea la contraseña de alguien de su rama:
    otra agencia/sub/influencer (por code) o un cliente (por user_id).
    No pide la contraseña actual del otro.
    """
    body = await request.json()
    nueva = body.get("nueva") or ""
    objetivo_code = (body.get("code") or "").upper() or None
    user_id = body.get("user_id")
    if len(nueva) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        if objetivo_code:
            # Agencia/sub/influencer: debe estar en la rama (y no ser uno mismo salvo admin)
            obj = await conn.fetchrow(
                "SELECT parent_code, ruta FROM agencias WHERE code=$1", objetivo_code)
            if not obj:
                raise HTTPException(404, "No encontrado")
            if objetivo_code not in rama:
                raise HTTPException(403, "Esa cuenta no es de tu rama")
            await conn.execute("""
                UPDATE agencias SET password_hash=$2, debe_cambiar_pass=true
                WHERE code=$1
            """, objetivo_code, auth.hash_password(nueva))
            return {"ok": True, "tipo": "agencia", "code": objetivo_code}
        elif user_id:
            # Cliente: su creado_por debe estar en la rama
            u = await conn.fetchrow(
                "SELECT creado_por FROM users WHERE id=$1", int(user_id))
            if not u:
                raise HTTPException(404, "Cliente no encontrado")
            if u["creado_por"] not in rama:
                raise HTTPException(403, "Ese cliente no es de tu rama")
            await conn.execute("""
                UPDATE users SET password_hash=$2, debe_cambiar_pass=true
                WHERE id=$1
            """, int(user_id), auth.hash_password(nueva))
            return {"ok": True, "tipo": "cliente", "user_id": user_id}
    raise HTTPException(400, "Indicá a quién resetear (code o user_id)")


@app.post("/api/admin/reset-password")
async def admin_reset_password(request: Request, _=Depends(auth.require_admin)):
    """El admin resetea la contraseña de cualquiera (agencia/influencer o cliente)."""
    body = await request.json()
    nueva = body.get("nueva") or ""
    objetivo_code = (body.get("code") or "").upper() or None
    user_id = body.get("user_id")
    if len(nueva) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        if objetivo_code:
            ok = await conn.fetchval(
                "SELECT 1 FROM agencias WHERE code=$1", objetivo_code)
            if not ok:
                raise HTTPException(404, "No encontrado")
            await conn.execute("""
                UPDATE agencias SET password_hash=$2, debe_cambiar_pass=true
                WHERE code=$1
            """, objetivo_code, auth.hash_password(nueva))
            return {"ok": True, "tipo": "agencia", "code": objetivo_code}
        elif user_id:
            ok = await conn.fetchval("SELECT 1 FROM users WHERE id=$1", int(user_id))
            if not ok:
                raise HTTPException(404, "Cliente no encontrado")
            await conn.execute("""
                UPDATE users SET password_hash=$2, debe_cambiar_pass=true
                WHERE id=$1
            """, int(user_id), auth.hash_password(nueva))
            return {"ok": True, "tipo": "cliente", "user_id": user_id}
    raise HTTPException(400, "Indicá a quién resetear (code o user_id)")


# ── AGENCIAS — LISTAR (solo admin) ────────────────────────────
@app.get("/api/agencias")
async def list_agencias(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.code, a.name, a.username, a.status,
                   a.address, a.phone, a.created_at, a.last_login,
                   a.saldo_cc, a.moneda, a.pct_ggr, a.pct_ventas,
                   COALESCE(a.pct_ggr_casino,0) AS pct_ggr_casino,
                   a.nivel, a.parent_code,
                   COUNT(at.id) as total_tickets,
                   COALESCE(SUM(at.stake),0) as total_cobrado
            FROM agencias a
            LEFT JOIN agencia_tickets at ON at.agencia_code=a.code
            WHERE COALESCE(a.tipo,'agencia') <> 'influencer'
            GROUP BY a.id, a.code, a.name, a.username,
                     a.status, a.address, a.phone,
                     a.created_at, a.last_login, a.saldo_cc, a.moneda,
                     a.pct_ggr, a.pct_ventas, a.nivel, a.parent_code
            ORDER BY a.created_at DESC
        """)
    return [dict(r) for r in rows]

# ── ÁRBOL DE AGENCIAS — helpers ───────────────────────────────
async def agencia_por_code(conn, code):
    return await conn.fetchrow("SELECT * FROM agencias WHERE code=$1", code)

async def codes_de_la_rama(conn, code):
    """
    Devuelve la lista de codes que cuelgan de 'code' (incluido él mismo).
    Usa la columna ruta: cualquier agencia cuya ruta empiece con la ruta
    de 'code' está en su rama hacia abajo.
    """
    row = await conn.fetchrow("SELECT ruta FROM agencias WHERE code=$1", code)
    if not row or not row["ruta"]:
        return [code]
    ruta = row["ruta"]
    hijos = await conn.fetch(
        "SELECT code FROM agencias WHERE ruta = $1 OR ruta LIKE $2",
        ruta, ruta + "/%")
    return [r["code"] for r in hijos]

async def puede_ver(conn, agencia_code, objetivo_code):
    """True si agencia_code puede ver a objetivo_code (está en su rama)."""
    if agencia_code == objetivo_code:
        return True
    rama = await codes_de_la_rama(conn, agencia_code)
    return objetivo_code in rama


# ── AGENCIAS — CREAR (solo admin) ─────────────────────────────
@app.post("/api/agencias")
async def create_agencia(request: Request, _=Depends(auth.require_admin)):
    body     = await request.json()
    name     = body.get("name","")
    username = body.get("username","")
    password = body.get("password","")
    address  = body.get("address","")
    phone    = body.get("phone","")
    # Árbol y configuración
    parent_code = (body.get("parent_code") or "").strip().upper() or None
    try:
        pct_ggr    = float(body.get("pct_ggr") or 0)
        pct_ventas = float(body.get("pct_ventas") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentajes inválidos")
    moneda = (body.get("moneda") or "ARS").strip().upper()[:4]
    permiso = (body.get("permiso") or "ambos").strip().lower()
    if permiso not in ("solo_agencia","crea_agencias","crea_influencers","ambos"):
        permiso = "ambos"

    if not name or not username or not password:
        raise HTTPException(status_code=400, detail="Faltan campos requeridos")
    if len(password) < 8:
        raise HTTPException(status_code=400,
            detail="La contraseña debe tener al menos 8 caracteres")
    if not (0 <= pct_ggr <= 100) or not (0 <= pct_ventas <= 100):
        raise HTTPException(400, "Los porcentajes deben estar entre 0 y 100")

    pool = await get_db()
    async with pool.acquire() as conn:
        # Resolver el padre y calcular ruta / nivel / moneda de la rama
        if parent_code:
            padre = await agencia_por_code(conn, parent_code)
            if not padre:
                raise HTTPException(404, "La agencia superior no existe")
            padre_ruta  = padre["ruta"] or padre["code"]
            nivel       = (padre["nivel"] or 0) + 1
            moneda      = padre["moneda"] or moneda   # la rama define la moneda
        else:
            padre_ruta  = None
            nivel       = 0

        count = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        code  = f"AGE{str(count+1).zfill(3)}"
        ruta  = f"{padre_ruta}/{code}" if padre_ruta else code

        try:
            await conn.execute("""
                INSERT INTO agencias
                    (code, name, username, password_hash, address, phone,
                     parent_code, ruta, nivel, pct_ggr, pct_ventas, moneda,
                     debe_cambiar_pass, permiso)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13)
            """, code, name, username, auth.hash_password(password), address, phone,
                 parent_code, ruta, nivel, pct_ggr, pct_ventas, moneda, permiso)
        except Exception:
            raise HTTPException(status_code=409, detail="Usuario ya existe")
    return {"code":code, "name":name, "username":username,
            "parent_code":parent_code, "nivel":nivel, "moneda":moneda,
            "pct_ggr":pct_ggr, "pct_ventas":pct_ventas}

@app.post("/api/influencers")
async def crear_influencer(request: Request):
    """
    Crea un influencer. Puede crearlo el admin (X-Admin-Key) o una agencia
    (token) dentro de su rama. El influencer NO maneja saldo.
    body: {name, username, password, pct_ggr, pct_ventas, parent_code?}
    """
    body = await request.json()
    name     = (body.get("name") or "").strip()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    try:
        pct_ggr    = float(body.get("pct_ggr") or 0)
        pct_ventas = float(body.get("pct_ventas") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentajes inválidos")
    alcance = (body.get("alcance") or "").strip().lower()
    if alcance not in ("solo_agencia", "rama", "global"):
        alcance = ""   # se define más abajo según tenga o no agencia asignada

    if not name or not username or not password:
        raise HTTPException(400, "Faltan campos requeridos")
    if len(password) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    if not (0 <= pct_ggr <= 100) or not (0 <= pct_ventas <= 100):
        raise HTTPException(400, "Los porcentajes deben estar entre 0 y 100")

    # ¿Quién crea? admin o agencia
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    parent_code = (body.get("parent_code") or "").strip().upper() or None
    if not es_admin:
        token = request.headers.get("Authorization","").replace("Bearer ","")
        solicitante = await sesion_buscar(token) if token else None
        if not solicitante:
            raise HTTPException(401, "No autorizado")
        # La agencia crea el influencer colgando de sí misma
        parent_code = solicitante

    pool = await get_db()
    async with pool.acquire() as conn:
        # Si crea una agencia, validar que tenga permiso para influencers
        if not es_admin:
            quien = await agencia_por_code(conn, parent_code)
            permiso = (quien.get("permiso") if quien else "ambos") or "ambos"
            if permiso not in ("crea_influencers", "ambos"):
                raise HTTPException(403, "Tu agencia no tiene permiso para crear influencers")
        if parent_code:
            padre = await agencia_por_code(conn, parent_code)
            if not padre:
                raise HTTPException(404, "La agencia superior no existe")
            padre_ruta = padre["ruta"] or padre["code"]
            nivel      = (padre["nivel"] or 0) + 1
            moneda     = padre["moneda"] or "ARS"
        else:
            padre_ruta = None; nivel = 0; moneda = "ARS"

        # Alcance por defecto:
        #  - admin sin agencia asignada  -> global (vale en todos lados)
        #  - admin/agencia CON agencia   -> solo_agencia (solo esa agencia)
        if not alcance:
            alcance = "global" if not parent_code else "solo_agencia"

        count = await conn.fetchval(
            "SELECT COUNT(*) FROM agencias WHERE tipo='influencer'")
        code = f"INF{str(count+1).zfill(3)}"
        ruta = f"{padre_ruta}/{code}" if padre_ruta else code
        # Código de referido corto y único para compartir
        codigo_ref = "REF" + secrets.token_hex(3).upper()

        try:
            await conn.execute("""
                INSERT INTO agencias
                    (code, name, username, password_hash, parent_code, ruta, nivel,
                     pct_ggr, pct_ventas, moneda, tipo, codigo_ref, saldo_cc, alcance,
                     debe_cambiar_pass, status)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'influencer',$11,0,$12,true,'active')
            """, code, name, username, auth.hash_password(password),
                 parent_code, ruta, nivel, pct_ggr, pct_ventas, moneda, codigo_ref, alcance)
        except Exception:
            raise HTTPException(409, "Usuario ya existe")
    return {"code": code, "name": name, "codigo_ref": codigo_ref,
            "pct_ggr": pct_ggr, "pct_ventas": pct_ventas, "nivel": nivel,
            "alcance": alcance}


@app.get("/api/influencers")
async def listar_influencers(request: Request):
    """Lista influencers. Admin ve todos; agencia ve los de su rama."""
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    pool = await get_db()
    async with pool.acquire() as conn:
        if es_admin:
            rows = await conn.fetch("""
                SELECT code, name, username, codigo_ref, pct_ggr, pct_ventas,
                       parent_code, nivel, status
                FROM agencias WHERE tipo='influencer' ORDER BY ruta
            """)
        else:
            token = request.headers.get("Authorization","").replace("Bearer ","")
            solicitante = await sesion_buscar(token) if token else None
            if not solicitante:
                raise HTTPException(401, "No autorizado")
            rama = await codes_de_la_rama(conn, solicitante)
            rows = await conn.fetch("""
                SELECT code, name, username, codigo_ref, pct_ggr, pct_ventas,
                       parent_code, nivel, status
                FROM agencias WHERE tipo='influencer' AND parent_code = ANY($1)
                ORDER BY ruta
            """, rama)
    return {"influencers": [{
        "code": r["code"], "name": r["name"], "username": r["username"],
        "codigo_ref": r["codigo_ref"], "pct_ggr": float(r["pct_ggr"] or 0),
        "pct_ventas": float(r["pct_ventas"] or 0), "parent_code": r["parent_code"],
        "nivel": r["nivel"], "status": r["status"],
    } for r in rows]}




# ── AGENCIA: CIERRE de su rama ────────────────────────────────
@app.get("/api/agencias/me/cierre")
async def agencia_cierre(desde: str = "", hasta: str = "", cliente: str = "",
                         agencia_code: str = Depends(requiere_agencia)):
    """
    Cierre de la agencia: su propio resumen + desglose por cada
    sub-agencia de su rama + total consolidado.
    Si viene 'cliente', devuelve la rentabilidad de ese cliente (de la rama).
    """
    from datetime import date as _date
    hoy = _date.today()
    if not desde: desde = hoy.isoformat()
    if not hasta: hasta = hoy.isoformat()

    pool = await get_db()
    async with pool.acquire() as conn:
        # Filtro por cliente: validar que sea de la rama y devolver su rentabilidad
        if cliente:
            cid = int(cliente)
            rama = await codes_de_la_rama(conn, agencia_code)
            u = await conn.fetchrow(
                "SELECT nombre_completo, creado_por FROM users WHERE id=$1", cid)
            if not u or u["creado_por"] not in rama:
                raise HTTPException(403, "Ese cliente no es de tu rama")
            d1 = _date.fromisoformat(desde); d2 = _date.fromisoformat(hasta)
            apostado = await conn.fetchval("""
                SELECT COALESCE(SUM(stake),0) FROM betslips
                WHERE user_id=$1 AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2) or 0
            premios = await conn.fetchval("""
                SELECT COALESCE(SUM(potential_win),0) FROM betslips
                WHERE user_id=$1 AND lower(status) IN ('won','ganada','paid')
                  AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2) or 0
            n = await conn.fetchrow("""
                SELECT
                  COUNT(*) FILTER (WHERE lower(status) IN ('won','ganada','paid')) AS gan,
                  COUNT(*) FILTER (WHERE lower(status) IN ('lost','perdida')) AS perd,
                  COUNT(*) FILTER (WHERE lower(status) IN ('pending','pendiente','active')) AS pend
                FROM betslips
                WHERE user_id=$1 AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2)
            return {
                "desde": desde, "hasta": hasta, "es_cliente": True,
                "cliente_nombre": u["nombre_completo"] or "—",
                "moneda": "ARS",
                "total": {
                    "apostado": float(apostado), "premios": float(premios),
                    "ggr": float(apostado) - float(premios), "comisiones": 0,
                },
                "rendimiento": {
                    "ganadas": n["gan"] or 0, "perdidas": n["perd"] or 0,
                    "pendientes": n["pend"] or 0,
                },
                "agencias": [],
            }
        yo = await agencia_por_code(conn, agencia_code)
        if not yo:
            raise HTTPException(404, "Agencia no encontrada")
        ruta = yo["ruta"] or yo["code"]
        # La agencia + todas las de su rama (SIN influencers)
        rama = await conn.fetch("""
            SELECT code, name, pct_ggr, pct_ventas, moneda, saldo_cc,
                   nivel, ruta, parent_code
            FROM agencias
            WHERE (code=$1 OR ruta LIKE $2)
              AND COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY ruta
        """, agencia_code, ruta + "/%")

        # ── COMISIONES EN CASCADA ──────────────────────────────
        # Cada nivel cobra sobre lo que QUEDA después de pagarle a los
        # de abajo, no sobre el GGR completo.
        #
        # Antes se sumaba plano: con 5 niveles al 20% las comisiones se
        # llevaban el 100% del GGR y la casa no ganaba nada. Con 6,
        # pagaba más de lo que había ganado.
        #
        # Cascada: la madre le paga a la hija de SU parte. Por eso ya no
        # hace falta que la hija tenga un porcentaje menor que la madre:
        # sale de su porción, no del bolsillo de la casa.
        #
        # El % sobre VENTAS no entra en la cascada: se calcula sobre el
        # volumen apostado de cada uno, que es un concepto distinto del
        # margen y no se reparte entre niveles.

        por_code = {a["code"]: a for a in rama}
        # Hijas directas de cada agencia, para recorrer de abajo hacia arriba
        hijas = {a["code"]: [] for a in rama}
        for a in rama:
            p = a["parent_code"]
            if p in hijas and p != a["code"]:
                hijas[p].append(a["code"])

        datos = {}
        for a in rama:
            apostado, premios = await _calcular_ggr(conn, [a["code"]], desde, hasta)
            datos[a["code"]] = {"apostado": apostado, "premios": premios,
                                "ggr": apostado - premios}

        comisiones = {}

        def resolver(code):
            """
            Devuelve el margen que este nivel entrega HACIA ARRIBA, ya
            descontada su comisión y la de todos los que cuelgan de él.
            """
            if code in comisiones:
                return comisiones[code]["sube"]

            a = por_code[code]
            propio = datos[code]["ggr"]           # GGR de sus clientes directos
            # Lo que suben las hijas, ya neto de sus comisiones
            de_abajo = sum(resolver(h) for h in hijas.get(code, []))
            base = propio + de_abajo

            pg = float(a["pct_ggr"] or 0)
            pv = float(a["pct_ventas"] or 0)
            com_ggr = base * pg / 100 if base > 0 else 0.0
            com_ventas = datos[code]["apostado"] * pv / 100
            com = round(com_ggr + com_ventas, 2)

            comisiones[code] = {"com": com, "base": base, "sube": base - com_ggr}
            return comisiones[code]["sube"]

        for a in rama:
            resolver(a["code"])

        filas = []
        tot_apostado = tot_premios = tot_com = 0.0
        for a in rama:
            d = datos[a["code"]]
            c = comisiones[a["code"]]
            tot_apostado += d["apostado"]
            tot_premios += d["premios"]
            tot_com += c["com"]
            filas.append({
                "code": a["code"], "name": a["name"], "moneda": a["moneda"],
                "nivel": a["nivel"], "saldo_cc": float(a["saldo_cc"] or 0),
                "es_mia": a["code"] == agencia_code,
                "apostado": d["apostado"], "premios": d["premios"],
                "ggr": d["ggr"],
                # base_comision: sobre qué se calculó, incluyendo lo que
                # sube de las agencias que cuelgan de esta.
                "base_comision": round(c["base"], 2),
                "comision": c["com"],
            })

        # Comisión de influencers que jugaron en la caja de esta rama
        from datetime import date as _d
        _d1 = _d.fromisoformat(desde); _d2 = _d.fromisoformat(hasta)
        codes_rama = [a["code"] for a in rama]
        com_inf = await _comision_influencers_en(conn, codes_rama, _d1, _d2)

    ggr_total = round(tot_apostado - tot_premios, 2)
    neto_sin_inf = round(ggr_total - tot_com, 2)
    neto_con_inf = round(neto_sin_inf - com_inf, 2)
    # Casino y ruleta de su rama: el cierre tiene que dar el total de
    # todos los productos, no solo de las deportivas.
    casino = {"apostado": 0.0, "premios": 0.0, "ggr": 0.0, "comisiones": 0.0}
    por_producto = []
    try:
        async with pool.acquire() as conn:
            codes = await codes_de_la_rama(conn, agencia_code)
            por_producto = await _actividad_por_producto(conn, d1, d2, codes)
            for p in por_producto:
                if p["producto"] in ("casino", "ruleta"):
                    casino["apostado"] += p["apostado"]
                    casino["premios"] += p["pagado"]
                    casino["ggr"] += p["ggr"]
            arb = await _comision_casino_cascada(conn, agencia_code, d1, d2)
            # Lo que le queda a ella: su parte, no la de toda la rama
            casino["comisiones"] = arb["comision"]
    except Exception as e:
        log.error(f"[CIERRE] casino de {agencia_code}: {e}")
        casino["error"] = str(e)[:160]

    casino = {k: (round(v, 2) if isinstance(v, float) else v)
              for k, v in casino.items()}

    # Lo que ESTA agencia puso en bonos y recompensas. Solo su parte:
    # lo que pagó la casa no le corresponde ver ni descontar.
    bonos_mios = 0.0
    try:
        async with pool.acquire() as conn:
            codes2 = await codes_de_la_rama(conn, agencia_code)
            bm = await conn.fetchval("""
                SELECT COALESCE(SUM(costo_agencia),0) FROM bonos_costos
                WHERE created_at::date BETWEEN $1 AND $2
                  AND agencia_code = ANY($3)
            """, d1, d2, codes2) or 0
            rm = await conn.fetchval("""
                SELECT COALESCE(SUM(costo_agencia),0) FROM recompensas
                WHERE created_at::date BETWEEN $1 AND $2
                  AND agencia_code = ANY($3)
            """, d1, d2, codes2) or 0
            bonos_mios = round(float(bm) + float(rm), 2)
    except Exception as e:
        log.error(f"[CIERRE] bonos de {agencia_code}: {e}")

    return {
        "desde": desde, "hasta": hasta,
        "moneda": yo["moneda"],
        "bonos": {"mi_parte": bonos_mios},
        "total": {
            "apostado": round(tot_apostado,2),
            "premios": round(tot_premios,2),
            "ggr": ggr_total,
            "comisiones": round(tot_com,2),
            "comision_influencers": round(com_inf,2),
            "neto_sin_influencers": neto_sin_inf,
            "neto_con_influencers": neto_con_inf,
        },
        "casino": casino,
        "por_producto": por_producto,
        # Deportivas + casino: el resultado real del período
        "total_general": {
            "apostado": round(tot_apostado + casino["apostado"], 2),
            "premios": round(tot_premios + casino["premios"], 2),
            "ggr": round(float(ggr_total) + casino["ggr"], 2),
            "bonos": bonos_mios,
            # Lo que le queda después de lo que puso en bonos
            "mi_comision": round(float(neto_con_inf) + casino["comisiones"]
                                 - bonos_mios, 2),
        },
        "agencias": filas,
    }


# IMPRESIONES Y COMBOS — historial en cascada
@app.post("/api/imprimir")
async def registrar_impresion(request: Request):
    body = await request.json()
    tipo = (body.get("tipo") or "ticket")[:40]
    referencia = (body.get("referencia") or "")[:80] or None
    detalle = (body.get("detalle") or "")[:200] or None
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    if es_admin:
        quien = "admin"; ag = None
    else:
        token = request.headers.get("Authorization","").replace("Bearer ","")
        ag = await sesion_buscar(token) if token else None
        if not ag:
            raise HTTPException(401, "No autorizado")
        quien = ag
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO impresiones_log (tipo, referencia, agencia_code, quien, detalle)
            VALUES ($1,$2,$3,$4,$5)
        """, tipo, referencia, ag, quien, detalle)
    return {"ok": True}


@app.get("/api/admin/historial/combos")
async def admin_hist_combos(agencia: str = "", desde: str = "", hasta: str = "",
                            _=Depends(auth.require_admin)):
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        cond, args = ["1=1"], []
        if agencia:
            args.append(agencia.upper()); cond.append(f"creado_por=${len(args)}")
        if d1:
            args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
        if d2:
            args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT id, origen, creado_por, nombre, odd_total, fuente, visible, created_at
            FROM combos_manuales WHERE {" AND ".join(cond)}
            ORDER BY created_at DESC LIMIT 300
        """, *args)
    return {"combos": [{
        "id": r["id"], "nombre": r["nombre"], "odd": float(r["odd_total"] or 0),
        "creado_por": r["creado_por"], "origen": r["origen"],
        "fuente": r["fuente"] or "manual",
        "es_ia": (r["fuente"] or "").lower() in ("ia","ai","auto"),
        "visible": r["visible"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


@app.get("/api/admin/historial/impresiones")
async def admin_hist_impresiones(agencia: str = "", desde: str = "", hasta: str = "",
                                 _=Depends(auth.require_admin)):
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        cond, args = ["1=1"], []
        if agencia:
            args.append(agencia.upper()); cond.append(f"agencia_code=${len(args)}")
        if d1:
            args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
        if d2:
            args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT tipo, referencia, agencia_code, quien, detalle, created_at
            FROM impresiones_log WHERE {" AND ".join(cond)}
            ORDER BY created_at DESC LIMIT 400
        """, *args)
    return {"impresiones": [{
        "tipo": r["tipo"], "referencia": r["referencia"],
        "agencia": r["agencia_code"] or "admin", "quien": r["quien"],
        "detalle": r["detalle"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


@app.get("/api/agencias/me/historial/combos")
async def agencia_hist_combos(desde: str = "", hasta: str = "",
                              agencia_code: str = Depends(requiere_agencia)):
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        cond, args = ["creado_por = ANY($1)"], [rama]
        if d1:
            args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
        if d2:
            args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT id, origen, creado_por, nombre, odd_total, fuente, visible, created_at
            FROM combos_manuales WHERE {" AND ".join(cond)}
            ORDER BY created_at DESC LIMIT 300
        """, *args)
    return {"combos": [{
        "id": r["id"], "nombre": r["nombre"], "odd": float(r["odd_total"] or 0),
        "creado_por": r["creado_por"], "origen": r["origen"],
        "fuente": r["fuente"] or "manual",
        "es_ia": (r["fuente"] or "").lower() in ("ia","ai","auto"),
        "visible": r["visible"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


@app.get("/api/agencias/me/historial/impresiones")
async def agencia_hist_impresiones(desde: str = "", hasta: str = "",
                                   agencia_code: str = Depends(requiere_agencia)):
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        cond, args = ["agencia_code = ANY($1)"], [rama]
        if d1:
            args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
        if d2:
            args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT tipo, referencia, agencia_code, quien, detalle, created_at
            FROM impresiones_log WHERE {" AND ".join(cond)}
            ORDER BY created_at DESC LIMIT 400
        """, *args)
    return {"impresiones": [{
        "tipo": r["tipo"], "referencia": r["referencia"],
        "agencia": r["agencia_code"], "quien": r["quien"],
        "detalle": r["detalle"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


# ── ADMIN: CIERRE / RESUMEN por periodo ─
@app.get("/api/admin/cierre")
async def admin_cierre(desde: str = "", hasta: str = "", export: str = "",
                       agencia: str = "", cliente: str = "",
                       _=Depends(auth.require_admin)):
    """
    Cierre del sistema: total global + desglose por agencia.
    Si se pasa 'agencia', muestra esa agencia y toda su rama hacia abajo.
    """
    from datetime import date as _date
    hoy = _date.today()
    if not desde: desde = hoy.isoformat()
    if not hasta: hasta = hoy.isoformat()
    d1 = _date.fromisoformat(desde); d2 = _date.fromisoformat(hasta)

    pool = await get_db()
    async with pool.acquire() as conn:
        # Filtro por cliente: devolver su rentabilidad (no el desglose por agencias)
        if cliente:
            cid = int(cliente)
            apostado = await conn.fetchval("""
                SELECT COALESCE(SUM(stake),0) FROM betslips
                WHERE user_id=$1 AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2) or 0
            premios = await conn.fetchval("""
                SELECT COALESCE(SUM(potential_win),0) FROM betslips
                WHERE user_id=$1 AND lower(status) IN ('won','ganada','paid')
                  AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2) or 0
            n = await conn.fetchrow("""
                SELECT
                  COUNT(*) FILTER (WHERE lower(status) IN ('won','ganada','paid')) AS gan,
                  COUNT(*) FILTER (WHERE lower(status) IN ('lost','perdida')) AS perd,
                  COUNT(*) FILTER (WHERE lower(status) IN ('pending','pendiente','active')) AS pend
                FROM betslips
                WHERE user_id=$1 AND created_at::date>=$2 AND created_at::date<=$3
            """, cid, d1, d2)
            u = await conn.fetchrow("SELECT nombre_completo FROM users WHERE id=$1", cid)
            return {
                "desde": desde, "hasta": hasta, "es_cliente": True,
                "cliente_nombre": (u["nombre_completo"] if u else "—"),
                "global": {
                    "apostado": float(apostado), "premios": float(premios),
                    "ggr": float(apostado) - float(premios),
                    "comisiones": 0,
                    "neto_casa": float(apostado) - float(premios),
                },
                "rendimiento": {
                    "ganadas": n["gan"] or 0, "perdidas": n["perd"] or 0,
                    "pendientes": n["pend"] or 0,
                },
                "agencias": [],
            }
        if agencia:
            # Esa agencia + su rama (por ruta)
            yo = await agencia_por_code(conn, agencia.upper())
            if not yo:
                raise HTTPException(404, "Agencia no encontrada")
            ruta = yo["ruta"] or yo["code"]
            ags = await conn.fetch("""
                SELECT code, name, pct_ggr, pct_ventas, moneda, saldo_cc, nivel
                FROM agencias
                WHERE (code=$1 OR ruta LIKE $2)
                  AND COALESCE(tipo,'agencia') <> 'influencer'
                ORDER BY ruta
            """, agencia.upper(), ruta + "/%")
        else:
            ags = await conn.fetch("""
                SELECT code, name, pct_ggr, pct_ventas, moneda, saldo_cc, nivel
                FROM agencias ORDER BY ruta
            """)
        filas = []
        tot_apostado = tot_premios = tot_com = 0.0
        for a in ags:
            apostado, premios = await _calcular_ggr(conn, [a["code"]], desde, hasta)
            ggr = apostado - premios
            pg = float(a["pct_ggr"] or 0); pv = float(a["pct_ventas"] or 0)
            com = round(ggr * pg / 100 + apostado * pv / 100, 2)
            tot_apostado += apostado; tot_premios += premios; tot_com += com
            filas.append({
                "code": a["code"], "name": a["name"], "moneda": a["moneda"],
                "nivel": a["nivel"], "saldo_cc": float(a["saldo_cc"] or 0),
                "apostado": apostado, "premios": premios, "ggr": ggr,
                "pct_ggr": pg, "pct_ventas": pv, "comision": com,
            })

        # Comisión de influencers de todo el sistema (dentro del with)
        from datetime import date as _dd
        _all_codes = [f["code"] for f in filas]
        com_inf = await _comision_influencers_en(
            conn, _all_codes,
            _dd.fromisoformat(desde), _dd.fromisoformat(hasta)) if _all_codes else 0.0

    if export == "csv":
        lin = ["agencia,code,moneda,apostado,premios,ggr,pct_ggr,pct_ventas,comision,saldo_cc"]
        for f in filas:
            lin.append(f'"{f["name"]}",{f["code"]},{f["moneda"]},{f["apostado"]},'
                       f'{f["premios"]},{f["ggr"]},{f["pct_ggr"]},{f["pct_ventas"]},'
                       f'{f["comision"]},{f["saldo_cc"]}')
        return PlainTextResponse("\n".join(lin), media_type="text/csv",
            headers={"Content-Disposition":"attachment; filename=cierre.csv"})

    ggr_g = round(tot_apostado - tot_premios, 2)
    neto_sin = round(ggr_g - tot_com, 2)
    # ── Casino y ruleta ──
    # El cierre tiene que dar el total de TODOS los productos, no solo
    # de las deportivas. Se calcula aparte porque tiene su propia
    # comisión y su propia cascada.
    casino = {"apostado": 0.0, "premios": 0.0, "ggr": 0.0, "comisiones": 0.0}
    por_producto = []
    try:
        async with pool.acquire() as conn:
            codes = None
            if agencia:
                codes = await codes_de_la_rama(conn, agencia.upper())
            prods = await _actividad_por_producto(conn, d1, d2, codes)
            por_producto = prods
            for p in prods:
                if p["producto"] in ("casino", "ruleta"):
                    casino["apostado"] += p["apostado"]
                    casino["premios"] += p["pagado"]
                    casino["ggr"] += p["ggr"]

            # Comisión de casino en cascada, solo sobre GGR
            if agencia:
                raices = [agencia.upper()]
            else:
                raices = [r["code"] for r in await conn.fetch(
                    "SELECT code FROM agencias WHERE parent_code IS NULL")]
            for c in raices:
                arb = await _comision_casino_cascada(conn, c, d1, d2)
                casino["comisiones"] += arb["comision_total"]
    except Exception as e:
        # Si el casino falla, el cierre deportivo tiene que salir igual:
        # es preferible un cierre parcial y avisado que ninguno.
        log.error(f"[CIERRE] no se pudo sumar el casino: {e}")
        casino["error"] = str(e)[:160]

    casino = {k: (round(v, 2) if isinstance(v, float) else v)
              for k, v in casino.items()}

    # Bonos y recompensas: son plata que salió de la casa, así que
    # restan del resultado. Se muestran separados por quién los paga
    # para que cada parte vea lo suyo.
    bonos = {"total": 0.0, "casa": 0.0, "agencias": 0.0,
             "recompensas": 0.0}
    try:
        async with pool.acquire() as conn:
            b = await conn.fetchrow("""
                SELECT COALESCE(SUM(monto),0) AS total,
                       COALESCE(SUM(costo_casa),0) AS casa,
                       COALESCE(SUM(costo_agencia),0) AS ag
                FROM bonos_costos
                WHERE created_at::date BETWEEN $1 AND $2
                  AND producto='sports'
            """, d1, d2)
            r = await conn.fetchrow("""
                SELECT COALESCE(SUM(monto),0) AS total,
                       COALESCE(SUM(costo_casa),0) AS casa,
                       COALESCE(SUM(costo_agencia),0) AS ag
                FROM recompensas
                WHERE created_at::date BETWEEN $1 AND $2
            """, d1, d2)
            bonos = {
                "total": round(float(b["total"] or 0), 2),
                "casa": round(float(b["casa"] or 0) + float(r["casa"] or 0), 2),
                "agencias": round(float(b["ag"] or 0) + float(r["ag"] or 0), 2),
                "recompensas": round(float(r["total"] or 0), 2),
            }
    except Exception as e:
        log.error(f"[CIERRE] bonos: {e}")

    costo_bonos = bonos["casa"] + bonos["agencias"]

    # El total de la operación: lo deportivo más lo de casino
    total_apostado = round(tot_apostado + casino["apostado"], 2)
    total_premios = round(tot_premios + casino["premios"], 2)
    total_ggr = round(ggr_g + casino["ggr"], 2)
    total_com = round(tot_com + com_inf + casino["comisiones"], 2)

    return {
        "desde": desde, "hasta": hasta,
        # 'global' queda como estaba: solo deportivas, para no romper
        # nada de lo que ya lo consulta.
        "global": {
            "apostado": round(tot_apostado,2),
            "premios": round(tot_premios,2),
            "ggr": ggr_g,
            "comisiones": round(tot_com,2),
            "comision_influencers": round(com_inf,2),
            "neto_casa": neto_sin,
            "neto_final": round(neto_sin - com_inf, 2),
        },
        "casino": casino,
        "por_producto": por_producto,
        "bonos": bonos,
        # El resultado de toda la operación, que es lo que importa
        "total": {
            "apostado": total_apostado,
            "premios": total_premios,
            "ggr": total_ggr,
            "comisiones": total_com,
            "bonos": round(costo_bonos, 2),
            "neto_final": round(total_ggr - total_com - costo_bonos, 2),
            "margen_pct": (round(total_ggr / total_apostado * 100, 2)
                           if total_apostado > 0 else None),
        },
        "agencias": filas,
    }


# ── AUDITORÍA — historial de movimientos y apuestas ───────────
from fastapi.responses import PlainTextResponse

@app.get("/api/admin/historial/movimientos")
async def admin_hist_movimientos(agencia: str = "", desde: str = "",
                                 hasta: str = "", cliente: str = "", export: str = "",
                                 _=Depends(auth.require_admin)):
    """Todos los movimientos: cuenta corriente + cargas/retiros a clientes."""
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        # 1) Movimientos de cuenta corriente entre agencias
        # (si se filtra por cliente, esto no aplica: solo importan sus cargas/retiros)
        cc = []
        if not cliente:
            cond, args = ["1=1"], []
            if agencia:
                args.append(agencia.upper()); cond.append(f"agencia_code=${len(args)}")
            if d1:
                args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
            if d2:
                args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
            cc = await conn.fetch(f"""
                SELECT agencia_code, contra_code, tipo, monto, saldo_luego,
                       detalle, creado_por, created_at
                FROM cc_movimientos WHERE {" AND ".join(cond)}
                ORDER BY created_at DESC LIMIT 800
            """, *args)

        # 2) Cargas/retiros a clientes
        cond2, args2 = ["1=1"], []
        if agencia:
            args2.append(agencia.upper()); cond2.append(f"am.agencia_code=${len(args2)}")
        if cliente:
            args2.append(int(cliente)); cond2.append(f"am.user_id=${len(args2)}")
        if d1:
            args2.append(d1); cond2.append(f"am.created_at::date >= ${len(args2)}")
        if d2:
            args2.append(d2); cond2.append(f"am.created_at::date <= ${len(args2)}")
        cli = await conn.fetch(f"""
            SELECT am.agencia_code, am.tipo, am.monto, am.detalle,
                   am.operador, am.created_at, u.nombre_completo
            FROM agencia_movimientos am
            LEFT JOIN users u ON u.id = am.user_id
            WHERE {" AND ".join(cond2)}
            ORDER BY am.created_at DESC LIMIT 800
        """, *args2)

    datos = []
    for r in cc:
        datos.append({
            "origen": "agencia", "agencia": r["agencia_code"],
            "contra": r["contra_code"], "tipo": r["tipo"],
            "monto": float(r["monto"] or 0), "saldo": float(r["saldo_luego"] or 0),
            "detalle": r["detalle"], "cliente": None, "por": r["creado_por"],
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            "_ts": r["created_at"].timestamp() if r["created_at"] else 0,
        })
    for r in cli:
        signo = 1 if r["tipo"] == "carga" else -1
        datos.append({
            "origen": "cliente", "agencia": r["agencia_code"],
            "contra": None, "tipo": r["tipo"],
            "monto": float(r["monto"] or 0) * signo, "saldo": None,
            "detalle": r["detalle"], "cliente": r["nombre_completo"],
            "por": r["operador"],
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            "_ts": r["created_at"].timestamp() if r["created_at"] else 0,
        })
    datos.sort(key=lambda x: x["_ts"], reverse=True)
    for d in datos: d.pop("_ts", None)
    datos = datos[:1200]

    if export == "csv":
        lineas = ["fecha,origen,agencia,tipo,monto,saldo,cliente,detalle,por"]
        for d in datos:
            lineas.append(f'{d["fecha"]},{d["origen"]},{d["agencia"]},{d["tipo"]},'
                          f'{d["monto"]},{d["saldo"] if d["saldo"] is not None else ""},'
                          f'"{d["cliente"] or ""}",'
                          f'"{(d["detalle"] or "").replace(chr(34),chr(39))}",{d["por"] or ""}')
        return PlainTextResponse("\n".join(lineas), media_type="text/csv",
            headers={"Content-Disposition":"attachment; filename=movimientos.csv"})
    return {"movimientos": datos}


@app.get("/api/admin/historial/apuestas")
async def admin_hist_apuestas(agencia: str = "", desde: str = "",
                              hasta: str = "", cliente: str = "", export: str = "",
                              _=Depends(auth.require_admin)):
    """Historial de apuestas con detalle de picks. Filtra por fecha/agencia/cliente."""
    from datetime import date as _date
    pool = await get_db()
    async with pool.acquire() as conn:
        cond, args = ["1=1"], []
        if agencia:
            args.append(agencia.upper()); cond.append(f"u.creado_por=${len(args)}")
        if cliente:
            args.append(int(cliente)); cond.append(f"b.user_id=${len(args)}")
        if desde:
            args.append(_date.fromisoformat(desde)); cond.append(f"b.created_at::date >= ${len(args)}")
        if hasta:
            args.append(_date.fromisoformat(hasta)); cond.append(f"b.created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.picks, b.created_at, b.cliente_nombre, b.paid_by,
                   u.nombre_completo, u.creado_por, u.id AS uid
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE {" AND ".join(cond)}
            ORDER BY b.created_at DESC LIMIT 500
        """, *args)
    datos = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        datos.append({
            "code": r["code"],
            "cliente": r["nombre_completo"] or r["cliente_nombre"] or "Sin cliente",
            "cliente_id": r["uid"], "agencia": r["creado_por"] or "—",
            "stake": r["stake"] or 0, "odd": float(r["odd_total"] or 0),
            "premio": r["potential_win"] or 0, "status": r["status"],
            "picks": picks,
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
        })
    if export == "csv":
        lineas = ["fecha,code,cliente,agencia,stake,cuota,premio,estado"]
        for d in datos:
            lineas.append(f'{d["fecha"]},{d["code"]},"{d["cliente"]}",{d["agencia"]},'
                          f'{d["stake"]},{d["odd"]},{d["premio"]},{d["status"]}')
        return PlainTextResponse("\n".join(lineas), media_type="text/csv",
            headers={"Content-Disposition":"attachment; filename=apuestas.csv"})
    return {"apuestas": datos}


@app.get("/api/agencias/me/historial/apuestas")
async def agencia_hist_apuestas(desde: str = "", hasta: str = "",
                                cliente: str = "",
                                agencia_code: str = Depends(requiere_agencia)):
    """Apuestas de la rama de la agencia, con detalle de picks."""
    from datetime import date as _date
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        # LEFT JOIN y no JOIN: los boletos que la agencia carga para un
        # cliente ocasional se guardan con user_id NULL y solo el nombre.
        # Con JOIN quedaban fuera del historial y parecía que no se
        # guardaban. Se incluyen los del cliente Y los cobrados por la
        # rama, que son los que corresponden a su caja.
        cond = ["(u.creado_por = ANY($1) OR b.paid_by = ANY($1))"]
        args = [rama]
        if cliente:
            args.append(int(cliente)); cond.append(f"b.user_id=${len(args)}")
        if desde:
            args.append(_date.fromisoformat(desde)); cond.append(f"b.created_at::date >= ${len(args)}")
        if hasta:
            args.append(_date.fromisoformat(hasta)); cond.append(f"b.created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.picks, b.created_at, b.cliente_nombre, b.paid_by,
                   u.nombre_completo, u.creado_por, u.id AS uid
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE {" AND ".join(cond)}
            ORDER BY b.created_at DESC LIMIT 500
        """, *args)
    datos = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        datos.append({
            "code": r["code"],
            "cliente": r["nombre_completo"] or r["cliente_nombre"] or "Sin cliente",
            "cliente_id": r["uid"], "agencia": r["creado_por"] or "—",
            "stake": r["stake"] or 0, "odd": float(r["odd_total"] or 0),
            "premio": r["potential_win"] or 0, "status": r["status"],
            "picks": picks,
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
        })
    return {"apuestas": datos}


@app.get("/api/agencias/me/historial/cashout")
async def agencia_hist_cashout(desde: str = "", hasta: str = "",
                               agencia_code: str = Depends(requiere_agencia)):
    """Cash outs de toda la rama de la agencia (cascada)."""
    from datetime import date as _date
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        cond, args = ["u.creado_por = ANY($1)", "b.resultado = 'cashout'"], [rama]
        if desde:
            args.append(_date.fromisoformat(desde)); cond.append(f"b.created_at::date >= ${len(args)}")
        if hasta:
            args.append(_date.fromisoformat(hasta)); cond.append(f"b.created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.created_at, b.pagado_at, b.pagado_por,
                   u.nombre_completo, u.creado_por, u.moneda
            FROM betslips b
            JOIN users u ON u.id = b.user_id
            WHERE {" AND ".join(cond)}
            ORDER BY b.created_at DESC LIMIT 500
        """, *args)
    return {"cashouts": [{
        "code": r["code"], "cliente": r["nombre_completo"] or "—",
        "agencia": r["creado_por"] or "—", "moneda": r["moneda"] or "ARS",
        "apostado": r["stake"] or 0, "valor": r["potential_win"] or 0,
        "estado": r["status"],
        "pagado_por": r["pagado_por"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


@app.get("/api/admin/historial/cashout")
async def admin_hist_cashout(agencia: str = "", desde: str = "", hasta: str = "",
                             export: str = "", _=Depends(auth.require_admin)):
    """Cash outs de todas las agencias (cascada completa)."""
    from datetime import date as _date
    pool = await get_db()
    async with pool.acquire() as conn:
        cond, args = ["b.resultado = 'cashout'"], []
        if agencia:
            args.append(agencia.upper()); cond.append(f"u.creado_por=${len(args)}")
        if desde:
            args.append(_date.fromisoformat(desde)); cond.append(f"b.created_at::date >= ${len(args)}")
        if hasta:
            args.append(_date.fromisoformat(hasta)); cond.append(f"b.created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.created_at, b.pagado_at, b.pagado_por,
                   u.nombre_completo, u.creado_por, u.moneda
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE {" AND ".join(cond)}
            ORDER BY b.created_at DESC LIMIT 500
        """, *args)
    datos = [{
        "code": r["code"], "cliente": r["nombre_completo"] or "—",
        "agencia": r["creado_por"] or "—", "moneda": r["moneda"] or "ARS",
        "apostado": r["stake"] or 0, "valor": r["potential_win"] or 0,
        "estado": r["status"], "pagado_por": r["pagado_por"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]
    if export == "csv":
        lineas = ["fecha,code,cliente,agencia,moneda,apostado,valor_cashout,estado"]
        for d in datos:
            lineas.append(f'{d["fecha"]},{d["code"]},"{d["cliente"]}",{d["agencia"]},'
                          f'{d["moneda"]},{d["apostado"]},{d["valor"]},{d["estado"]}')
        return PlainTextResponse("\n".join(lineas), media_type="text/csv",
            headers={"Content-Disposition":"attachment; filename=cashouts.csv"})
    return {"cashouts": datos}


@app.get("/api/agencias/me/historial/movimientos")
async def agencia_hist_movimientos(desde: str = "", hasta: str = "",
                                   agencia_code: str = Depends(requiere_agencia)):
    """
    Registro completo de la rama hacia abajo: movimientos entre agencias
    (cuenta corriente) + cargas/retiros a clientes de toda la rama.
    """
    from datetime import date as _date
    d1 = _date.fromisoformat(desde) if desde else None
    d2 = _date.fromisoformat(hasta) if hasta else None
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)

        # 1) Movimientos de cuenta corriente entre agencias de la rama
        cond, args = ["agencia_code = ANY($1)"], [rama]
        if d1:
            args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
        if d2:
            args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
        cc = await conn.fetch(f"""
            SELECT agencia_code, contra_code, tipo, monto, saldo_luego,
                   detalle, created_at
            FROM cc_movimientos WHERE {" AND ".join(cond)}
            ORDER BY created_at DESC LIMIT 400
        """, *args)

        # 2) Cargas/retiros a clientes de toda la rama
        cond2, args2 = ["am.agencia_code = ANY($1)"], [rama]
        if d1:
            args2.append(d1); cond2.append(f"am.created_at::date >= ${len(args2)}")
        if d2:
            args2.append(d2); cond2.append(f"am.created_at::date <= ${len(args2)}")
        cli = await conn.fetch(f"""
            SELECT am.agencia_code, am.tipo, am.monto, am.detalle,
                   am.operador, am.created_at, u.nombre_completo
            FROM agencia_movimientos am
            LEFT JOIN users u ON u.id = am.user_id
            WHERE {" AND ".join(cond2)}
            ORDER BY am.created_at DESC LIMIT 400
        """, *args2)

    movs = []
    for r in cc:
        movs.append({
            "origen": "agencia", "agencia": r["agencia_code"],
            "contra": r["contra_code"], "tipo": r["tipo"],
            "monto": float(r["monto"] or 0), "saldo": float(r["saldo_luego"] or 0),
            "detalle": r["detalle"], "cliente": None,
            "operador": None,
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            "ts": r["created_at"].timestamp() if r["created_at"] else 0,
        })
    for r in cli:
        signo = 1 if r["tipo"] == "carga" else -1
        movs.append({
            "origen": "cliente", "agencia": r["agencia_code"],
            "contra": None, "tipo": r["tipo"],
            "monto": float(r["monto"] or 0) * signo, "saldo": None,
            "detalle": r["detalle"], "cliente": r["nombre_completo"],
            "operador": r["operador"],
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            "ts": r["created_at"].timestamp() if r["created_at"] else 0,
        })
    # Ordenar todo por fecha descendente
    movs.sort(key=lambda x: x["ts"], reverse=True)
    for m in movs: m.pop("ts", None)
    return {"movimientos": movs[:600]}


# ── COMISIONES — cambiar % con historial ─
@app.post("/api/admin/agencias/{code}/comisiones")
async def cambiar_comisiones(code: str, request: Request,
                             _=Depends(auth.require_admin)):
    """Cambia los % GGR y ventas de una agencia, guardando el historial."""
    body = await request.json()
    code = code.upper()
    try:
        ggr_new = float(body.get("pct_ggr"))
        ven_new = float(body.get("pct_ventas"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentajes inválidos")
    if not (0 <= ggr_new <= 100) or not (0 <= ven_new <= 100):
        raise HTTPException(400, "Deben estar entre 0 y 100")

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            ag = await conn.fetchrow(
                "SELECT pct_ggr, pct_ventas FROM agencias WHERE code=$1 FOR UPDATE", code)
            if not ag:
                raise HTTPException(404, "Agencia no encontrada")
            await conn.execute(
                "UPDATE agencias SET pct_ggr=$2, pct_ventas=$3 WHERE code=$1",
                code, ggr_new, ven_new)
            await conn.execute("""
                INSERT INTO comisiones_historial
                    (agencia_code, pct_ggr_ant, pct_ggr_new,
                     pct_ventas_ant, pct_ventas_new, cambiado_por)
                VALUES ($1,$2,$3,$4,$5,'admin')
            """, code, ag["pct_ggr"], ggr_new, ag["pct_ventas"], ven_new)
    return {"ok": True, "pct_ggr": ggr_new, "pct_ventas": ven_new}


@app.get("/api/admin/agencias/{code}/comisiones-historial")
async def comisiones_historial(code: str, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT pct_ggr_ant, pct_ggr_new, pct_ventas_ant, pct_ventas_new,
                   cambiado_por, created_at
            FROM comisiones_historial WHERE agencia_code=$1
            ORDER BY created_at DESC LIMIT 100
        """, code.upper())
    return {"historial": [{
        "ggr_ant": float(r["pct_ggr_ant"] or 0), "ggr_new": float(r["pct_ggr_new"] or 0),
        "ven_ant": float(r["pct_ventas_ant"] or 0), "ven_new": float(r["pct_ventas_new"] or 0),
        "por": r["cambiado_por"],
        "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
    } for r in rows]}


# ── COMISIONES — cálculo y liquidación ────────────────────────
async def _limite_efectivo(conn, agencia_code):
    """Resuelve los límites que aplican a una agencia.
    Prioridad: límite de la agencia > límite de una agencia de su rama hacia
    arriba > límite global. Devuelve dict con monto_min, monto_max, pago_max."""
    # 1) Límite específico de la agencia
    if agencia_code:
        row = await conn.fetchrow("""
            SELECT monto_min, monto_max, pago_max FROM limites_apuesta
            WHERE alcance='agencia' AND agencia_code=$1
        """, agencia_code)
        if row:
            return dict(row)
        # 2) Límite de algún ancestro en la ruta (rama hacia arriba)
        ruta = await conn.fetchval("SELECT ruta FROM agencias WHERE code=$1", agencia_code)
        if ruta:
            # los ancestros son los prefijos de la ruta (ej: A/B/C -> A, A/B)
            partes = [p for p in ruta.split("/") if p]
            ancestros = []
            acc = ""
            for p in partes:
                acc = f"{acc}/{p}" if acc else p
                ancestros.append(p)
            if ancestros:
                row = await conn.fetchrow(f"""
                    SELECT l.monto_min, l.monto_max, l.pago_max
                    FROM limites_apuesta l
                    JOIN agencias a ON a.code = l.agencia_code
                    WHERE l.alcance='agencia' AND l.agencia_code = ANY($1)
                    ORDER BY length(a.ruta) DESC LIMIT 1
                """, ancestros)
                if row:
                    return dict(row)
    # 3) Límite global de la moneda de la agencia.
    #    Un máximo de 50.000 es normal en pesos y una locura en dólares,
    #    así que el global se define por moneda. Si no hay uno para esa
    #    moneda, se cae al de pesos antes que quedar sin límite.
    moneda = "ARS"
    if agencia_code:
        moneda = await conn.fetchval(
            "SELECT moneda FROM agencias WHERE code=$1", agencia_code) or "ARS"
    row = await conn.fetchrow("""
        SELECT monto_min, monto_max, pago_max FROM limites_apuesta
        WHERE alcance='global' AND COALESCE(moneda,'ARS')=$1
        ORDER BY updated_at DESC LIMIT 1
    """, moneda)
    if not row:
        row = await conn.fetchrow("""
            SELECT monto_min, monto_max, pago_max FROM limites_apuesta
            WHERE alcance='global' AND COALESCE(moneda,'ARS')='ARS'
            ORDER BY updated_at DESC LIMIT 1
        """)
    return dict(row) if row else {"monto_min": None, "monto_max": None, "pago_max": None}


@app.get("/api/limite-apuesta")
async def limite_apuesta_publico(agencia: str = ""):
    """Límite efectivo para una agencia (lo usa el box/app para validar antes)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        lim = await _limite_efectivo(conn, agencia.upper() if agencia else None)
    return {"monto_min": lim.get("monto_min"), "monto_max": lim.get("monto_max"),
            "pago_max": lim.get("pago_max")}


# ═══════════════════════════════════════════════════════════════
# CONTROL DE RIESGO IA — asesora al admin sobre config de bonos/límites
# ═══════════════════════════════════════════════════════════════

async def _consultar_claude_texto(prompt, max_tokens=800):
    """Llama a Claude con un prompt de texto y devuelve la respuesta."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Falta configurar ANTHROPIC_API_KEY")
    cuerpo = {
        "model": "claude-sonnet-4-6",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_API_KEY,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json=cuerpo)
    except Exception as e:
        log.error(f"Claude texto error: {e}")
        raise HTTPException(502, "No se pudo consultar la IA")
    if r.status_code != 200:
        log.error(f"Claude HTTP {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, "La IA no respondió bien")
    data = r.json()
    return "".join(b.get("text","") for b in data.get("content",[]) if b.get("type")=="text")


@app.post("/api/admin/riesgo/analizar")
async def admin_riesgo_analizar(request: Request, _=Depends(auth.require_admin)):
    """La IA asesora sobre una configuración de bono o límite antes de aplicarla.
    body: {tipo: 'bono'|'limite', config: {...}}"""
    body = await request.json()
    tipo = body.get("tipo", "bono")
    config = body.get("config", {})

    if tipo == "bono":
        prompt = f"""Sos un analista de riesgo de una plataforma de apuestas deportivas.
Evaluá esta configuración de BONO y asesorá al operador de forma breve y concreta.

Configuración del bono:
{json.dumps(config, ensure_ascii=False, indent=2)}

Analizá:
1. Nivel de riesgo (BAJO / MEDIO / ALTO) para la casa.
2. Si el rollover es adecuado (un rollover bajo = fácil de abusar; alto = poco atractivo).
3. Riesgo de abuso multi-cuenta o arbitraje.
4. Una recomendación concreta de ajuste si hace falta.

Respondé en español, máximo 6 líneas, directo y práctico. Empezá con el nivel de riesgo."""
    else:
        prompt = f"""Sos un analista de riesgo de una plataforma de apuestas deportivas.
Evaluá esta configuración de LÍMITES de apuesta y asesorá brevemente.

Configuración:
{json.dumps(config, ensure_ascii=False, indent=2)}

Analizá el riesgo (BAJO/MEDIO/ALTO), si el pago máximo protege bien a la casa,
y una recomendación si hace falta. Español, máximo 6 líneas, directo."""

    texto = await _consultar_claude_texto(prompt)
    return {"analisis": texto.strip()}


# ═══════════════════════════════════════════════════════════════
# BONOS — solo el admin crea/activa/asigna. Con rollover.
# ═══════════════════════════════════════════════════════════════

@app.get("/api/admin/bonos")
async def admin_listar_bonos(_=Depends(auth.require_admin)):
    """Lista los bonos definidos, con a qué agencias están asignados."""
    pool = await get_db()
    async with pool.acquire() as conn:
        bonos = await conn.fetch("""
            SELECT id, nombre, tipo, monto_fijo, porcentaje, tope, rollover,
                   activo, creado_at, deposito_minimo, cuota_minima,
                   requiere_verificacion, evento, stake_max_tipo, stake_max_valor,
                   cuota_maxima, mercados_excluidos
            FROM bonos ORDER BY creado_at DESC
        """)
        asigs = await conn.fetch("""
            SELECT ba.bono_id, ba.agencia_code, ba.habilitado, a.name AS agencia_nombre
            FROM bonos_agencias ba
            LEFT JOIN agencias a ON a.code = ba.agencia_code
        """)
    por_bono = {}
    for a in asigs:
        por_bono.setdefault(a["bono_id"], []).append({
            "agencia_code": a["agencia_code"],
            "agencia_nombre": a["agencia_nombre"],
            "habilitado": a["habilitado"]})
    return {"bonos": [{
        "id": b["id"], "nombre": b["nombre"], "tipo": b["tipo"],
        "monto_fijo": b["monto_fijo"], "porcentaje": float(b["porcentaje"]) if b["porcentaje"] is not None else None,
        "tope": b["tope"], "rollover": float(b["rollover"]) if b["rollover"] is not None else None,
        "activo": b["activo"],
        "deposito_minimo": b["deposito_minimo"],
        "cuota_minima": float(b["cuota_minima"]) if b["cuota_minima"] is not None else None,
        "requiere_verificacion": b["requiere_verificacion"],
        "evento": b["evento"],
        "stake_max_tipo": b["stake_max_tipo"],
        "stake_max_valor": float(b["stake_max_valor"]) if b["stake_max_valor"] is not None else None,
        "cuota_maxima": float(b["cuota_maxima"]) if b["cuota_maxima"] is not None else None,
        "mercados_excluidos": b["mercados_excluidos"],
        "asignaciones": por_bono.get(b["id"], []),
    } for b in bonos]}


@app.post("/api/admin/bonos")
async def admin_crear_bono(request: Request, _=Depends(auth.require_admin)):
    """Crea o edita un bono. body:
       {id?, nombre, tipo: 'bienvenida'|'carga', monto_fijo?, porcentaje?,
        tope?, rollover, activo?}"""
    body = await request.json()
    def _num(x):
        try: return int(x) if x not in (None, "") else None
        except (TypeError, ValueError): return None
    def _fl(x):
        try: return float(x) if x not in (None, "") else None
        except (TypeError, ValueError): return None
    nombre = (body.get("nombre") or "").strip()[:80]
    tipo = body.get("tipo", "bienvenida")
    if tipo not in ("bienvenida", "carga"):
        raise HTTPException(400, "Tipo inválido")
    if not nombre:
        raise HTTPException(400, "Falta el nombre")
    mf = _num(body.get("monto_fijo"))
    tope = _num(body.get("tope"))
    activo = bool(body.get("activo", True))
    # Condiciones de riesgo
    dep_min = _num(body.get("deposito_minimo")) or 0
    req_verif = bool(body.get("requiere_verificacion", True))
    evento = body.get("evento", "primer_deposito")
    if evento not in ("primer_deposito", "cualquier_deposito", "registro"):
        evento = "primer_deposito"
    # Mitigaciones de riesgo
    from decimal import Decimal as _Dec
    def _dec(x):
        try: return _Dec(str(x)) if x not in (None, "") else None
        except Exception: return None
    stake_max_tipo = body.get("stake_max_tipo", "porcentaje")
    if stake_max_tipo not in ("porcentaje", "fijo"):
        stake_max_tipo = "porcentaje"
    stake_max_valor = _dec(body.get("stake_max_valor"))
    cuota_max = _dec(body.get("cuota_maxima"))
    mercados_excl = (body.get("mercados_excluidos") or "").strip()[:400] or None
    # También convertir los NUMERIC previos a Decimal por consistencia
    pc = _dec(body.get("porcentaje"))
    rollover = _dec(body.get("rollover")) or _Dec("0")
    cuota_min = _dec(body.get("cuota_minima")) or _Dec("1.0")
    bid = body.get("id")

    # Programación: fechas, días de la semana y franja horaria.
    # Todo opcional; vacío = el bono está siempre disponible.
    from datetime import date as _date
    def _fecha(x):
        try:
            return _date.fromisoformat(str(x)) if x else None
        except (TypeError, ValueError):
            return None
    def _hora(x):
        try:
            h = int(x)
            return h if 0 <= h <= 23 else None
        except (TypeError, ValueError):
            return None
    vig_desde = _fecha(body.get("vigente_desde"))
    vig_hasta = _fecha(body.get("vigente_hasta"))
    dias_sem = (body.get("dias_semana") or "").strip()[:20] or None
    h_desde = _hora(body.get("hora_desde"))
    h_hasta = _hora(body.get("hora_hasta"))
    # Una sola de las dos horas no define una franja: se ignoran ambas
    if h_desde is None or h_hasta is None:
        h_desde = h_hasta = None

    pool = await get_db()
    try:
        async with pool.acquire() as conn:
            if bid:
                await conn.execute("""
                    UPDATE bonos SET nombre=$2, tipo=$3, monto_fijo=$4, porcentaje=$5,
                        tope=$6, rollover=$7, activo=$8, deposito_minimo=$9,
                        cuota_minima=$10, requiere_verificacion=$11, evento=$12,
                        stake_max_tipo=$13, stake_max_valor=$14, cuota_maxima=$15,
                        mercados_excluidos=$16, vigente_desde=$17,
                        vigente_hasta=$18, dias_semana=$19, hora_desde=$20,
                        hora_hasta=$21 WHERE id=$1
                """, int(bid), nombre, tipo, mf, pc, tope, rollover, activo,
                     dep_min, cuota_min, req_verif, evento,
                     stake_max_tipo, stake_max_valor, cuota_max, mercados_excl,
                     vig_desde, vig_hasta, dias_sem, h_desde, h_hasta)
                return {"ok": True, "id": int(bid)}

        # Quién paga el bono cuando se libere. Si no suma 100, la casa
        # cubre la diferencia: mejor eso a que quede sin dueño.
        try:
            pct_ag = float(body.get("pct_paga_agencia") or 0)
        except (TypeError, ValueError):
            pct_ag = 0.0
        pct_ag = max(0.0, min(100.0, pct_ag))
        pct_casa = round(100.0 - pct_ag, 2)

        row = await conn.fetchrow("""
                INSERT INTO bonos (nombre, tipo, monto_fijo, porcentaje, tope, rollover, activo,
                    deposito_minimo, cuota_minima, requiere_verificacion, evento,
                    stake_max_tipo, stake_max_valor, cuota_maxima, mercados_excluidos,
                    vigente_desde, vigente_hasta, dias_semana, hora_desde, hora_hasta,
                    pct_paga_casa, pct_paga_agencia)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                        $16,$17,$18,$19,$20,$21,$22) RETURNING id
            """, nombre, tipo, mf, pc, tope, rollover, activo,
                 dep_min, cuota_min, req_verif, evento,
                 stake_max_tipo, stake_max_valor, cuota_max, mercados_excl,
                 vig_desde, vig_hasta, dias_sem, h_desde, h_hasta,
                 pct_casa, pct_ag)
        return {"ok": True, "id": row["id"]}
    except Exception as e:
        log.error(f"[BONO] error al guardar: {e}")
        raise HTTPException(500, f"No se pudo guardar el bono: {str(e)[:200]}")


@app.post("/api/admin/bonos/{bono_id}/activar")
async def admin_activar_bono(bono_id: int, request: Request, _=Depends(auth.require_admin)):
    """Activa o desactiva un bono. body: {activo: bool}"""
    body = await request.json()
    activo = bool(body.get("activo", True))
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE bonos SET activo=$2 WHERE id=$1", bono_id, activo)
    return {"ok": True, "activo": activo}


@app.post("/api/admin/bonos/{bono_id}/asignar")
async def admin_asignar_bono(bono_id: int, request: Request, _=Depends(auth.require_admin)):
    """Asigna un bono a agencias. body:
       {alcance: 'global'|'rama'|'agencia', agencia_code?}
       - global: todas las agencias
       - rama: la agencia + descendientes
       - agencia: solo esa"""
    body = await request.json()
    alcance = body.get("alcance", "agencia")
    code = (body.get("agencia_code") or "").upper() or None
    pool = await get_db()
    async with pool.acquire() as conn:
        if alcance == "global":
            objetivos = [r["code"] for r in await conn.fetch("SELECT code FROM agencias")]
        elif alcance == "rama":
            if not code: raise HTTPException(400, "Falta la agencia")
            objetivos = await codes_de_la_rama(conn, code)
        else:
            if not code: raise HTTPException(400, "Falta la agencia")
            objetivos = [code]
        for ag in objetivos:
            ya = await conn.fetchval(
                "SELECT 1 FROM bonos_agencias WHERE bono_id=$1 AND agencia_code=$2", bono_id, ag)
            if not ya:
                await conn.execute("""
                    INSERT INTO bonos_agencias (bono_id, agencia_code, habilitado)
                    VALUES ($1, $2, TRUE)
                """, bono_id, ag)
    return {"ok": True, "asignado_a": len(objetivos)}


@app.post("/api/admin/bonos/{bono_id}/desasignar")
async def admin_desasignar_bono(bono_id: int, request: Request, _=Depends(auth.require_admin)):
    """Quita la asignación de un bono a una agencia. body: {agencia_code}"""
    body = await request.json()
    code = (body.get("agencia_code") or "").upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM bonos_agencias WHERE bono_id=$1 AND agencia_code=$2", bono_id, code)
    return {"ok": True}


@app.post("/api/admin/bonos/{bono_id}/resetear-cliente")
async def admin_resetear_bono_cliente(bono_id: int, request: Request,
                                      _=Depends(auth.require_admin)):
    """Permite que un cliente vuelva a recibir un bono que ya tuvo.
    Borra su registro de otorgamiento de ese bono. body: {user_id}"""
    body = await request.json()
    user_id = int(body.get("user_id"))
    pool = await get_db()
    async with pool.acquire() as conn:
        # Si tiene saldo de bono pendiente de ese otorgamiento, se limpia también
        otorg = await conn.fetchrow("""
            SELECT id, monto, estado FROM bonos_otorgados
            WHERE bono_id=$1 AND user_id=$2 ORDER BY otorgado_at DESC LIMIT 1
        """, bono_id, user_id)
        if otorg and otorg["estado"] == "activo":
            # Quitar el saldo de bono no liberado
            await conn.execute("""
                UPDATE users SET saldo_bono = GREATEST(0, COALESCE(saldo_bono,0) - $2)
                WHERE id=$1
            """, user_id, int((otorg["monto"] or 0) * 100))
        await conn.execute(
            "DELETE FROM bonos_otorgados WHERE bono_id=$1 AND user_id=$2", bono_id, user_id)
    return {"ok": True, "mensaje": "El cliente puede volver a recibir este bono"}


@app.post("/api/admin/bonos/{bono_id}/resetear")
async def admin_resetear_bono(bono_id: int, _=Depends(auth.require_admin)):
    """Resetea la definición del bono: borra TODOS sus otorgamientos para poder
    reutilizarlo desde cero. No borra el bono en sí."""
    pool = await get_db()
    async with pool.acquire() as conn:
        # Limpiar saldos de bono activos de este bono
        activos = await conn.fetch("""
            SELECT user_id, monto FROM bonos_otorgados
            WHERE bono_id=$1 AND estado='activo'
        """, bono_id)
        for a in activos:
            await conn.execute("""
                UPDATE users SET saldo_bono = GREATEST(0, COALESCE(saldo_bono,0) - $2)
                WHERE id=$1
            """, a["user_id"], int((a["monto"] or 0) * 100))
        await conn.execute("DELETE FROM bonos_otorgados WHERE bono_id=$1", bono_id)
    return {"ok": True, "mensaje": "Bono reseteado, se puede reutilizar"}


@app.delete("/api/admin/bonos/{bono_id}")
async def admin_borrar_bono(bono_id: int, _=Depends(auth.require_admin)):
    """Borra un bono y sus asignaciones."""
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM bonos_agencias WHERE bono_id=$1", bono_id)
        await conn.execute("DELETE FROM bonos WHERE id=$1", bono_id)
    return {"ok": True}


# ── Otorgar bonos a clientes + rollover ───────────────────────

async def _verificar_usuario(conn, user_id):
    """Marca al usuario como verificado si completó sus datos (documento)."""
    u = await conn.fetchrow(
        "SELECT documento, verificado FROM users WHERE id=$1", user_id)
    if u and not u["verificado"] and (u["documento"] or "").strip():
        await conn.execute(
            "UPDATE users SET verificado=TRUE, verificado_at=NOW() WHERE id=$1", user_id)
        return True
    return bool(u and u["verificado"])


async def _intentar_otorgar_bono_auto(conn, user_id, agencia_code, evento, monto_deposito=0):
    """Dispara automáticamente el/los bono(s) que correspondan cuando ocurre un
    evento (primer_deposito, cualquier_deposito, registro). Valida condiciones:
    depósito mínimo, verificación, y un bono activo por usuario."""
    # ¿Ya tiene un bono activo? (regla anti-abuso: uno por usuario)
    ya = await conn.fetchval(
        "SELECT 1 FROM bonos_otorgados WHERE user_id=$1 AND estado='activo'", user_id)
    if ya:
        return None

    # ¿Es su primer depósito? (para el evento primer_deposito)
    if evento == "primer_deposito":
        deps = await conn.fetchval("""
            SELECT COUNT(*) FROM wallet_transactions
            WHERE user_id=$1 AND type IN ('carga','deposito') AND status='done'
        """, user_id) or 0
        # si ya hubo depósitos previos, no es el primero
        es_primero = deps <= 1
        if not es_primero:
            return None

    # Buscar bonos activos, asignados a la agencia, con este evento
    bonos = await conn.fetch("""
        SELECT b.id, b.tipo, b.monto_fijo, b.porcentaje, b.tope, b.rollover,
               b.deposito_minimo, b.requiere_verificacion, b.evento
        FROM bonos b JOIN bonos_agencias ba ON ba.bono_id=b.id
        WHERE b.activo=TRUE AND ba.habilitado=TRUE AND ba.agencia_code=$1
          AND (b.evento=$2 OR (b.evento='cualquier_deposito' AND $2 IN ('primer_deposito','cualquier_deposito')))
        ORDER BY b.id ASC
    """, agencia_code, evento)

    for bono in bonos:
        # Anti-repetición: si el cliente YA recibió este bono alguna vez, no de nuevo
        # (salvo que el admin lo haya reseteado, que borra el registro)
        ya_lo_tuvo = await conn.fetchval(
            "SELECT 1 FROM bonos_otorgados WHERE user_id=$1 AND bono_id=$2",
            user_id, bono["id"])
        if ya_lo_tuvo:
            continue
        # Depósito mínimo
        if (bono["deposito_minimo"] or 0) > 0 and monto_deposito < bono["deposito_minimo"]:
            continue
        # Verificación obligatoria
        if bono["requiere_verificacion"]:
            verificado = await _verificar_usuario(conn, user_id)
            if not verificado:
                continue
        # Calcular monto del bono
        if bono["tipo"] == "bienvenida":
            monto = int(bono["monto_fijo"] or 0)
        else:
            monto = int(monto_deposito * (float(bono["porcentaje"] or 0) / 100))
            if bono["tope"]:
                monto = min(monto, int(bono["tope"]))
        if monto <= 0:
            continue
        rollover_obj = int(monto * float(bono["rollover"] or 0))
        # Acreditar
        await conn.execute("""
            UPDATE users SET saldo_bono = COALESCE(saldo_bono,0) + $2,
                rollover_pendiente = COALESCE(rollover_pendiente,0) + $3
            WHERE id=$1
        """, user_id, monto * 100, rollover_obj * 100)
        await conn.execute("""
            INSERT INTO bonos_otorgados
                (bono_id, user_id, monto, rollover_objetivo, rollover_cumplido,
                 estado, agencia_code)
            VALUES ($1,$2,$3,$4,0,'activo',$5)
        """, bono["id"], user_id, monto, rollover_obj, agencia_code)
        return {"bono_id": bono["id"], "monto": monto, "rollover_objetivo": rollover_obj}
    return None


async def _validar_apuesta_bono(conn, user_id, stake, cuota, mercado=None):
    """Valida que una apuesta con saldo de bono cumpla las reglas del bono activo.
    Devuelve (ok, motivo). Si el usuario no tiene bono activo, ok=True."""
    bono = await conn.fetchrow("""
        SELECT b.cuota_minima, b.cuota_maxima, b.stake_max_tipo, b.stake_max_valor,
               b.mercados_excluidos, bo.monto
        FROM bonos_otorgados bo JOIN bonos b ON b.id = bo.bono_id
        WHERE bo.user_id=$1 AND bo.estado='activo'
        ORDER BY bo.otorgado_at ASC LIMIT 1
    """, user_id)
    if not bono:
        return True, None
    # Cuota mínima
    cmin = float(bono["cuota_minima"] or 1.0)
    if cuota < cmin:
        return False, f"Con el bono activo, la cuota mínima es {cmin}"
    # Cuota máxima
    if bono["cuota_maxima"] is not None and cuota > float(bono["cuota_maxima"]):
        return False, f"Con el bono activo, la cuota máxima es {bono['cuota_maxima']}"
    # Stake máximo por apuesta
    monto_bono = float(bono["monto"] or 0)
    if bono["stake_max_tipo"] == "porcentaje" and bono["stake_max_valor"]:
        tope = monto_bono * float(bono["stake_max_valor"]) / 100
    elif bono["stake_max_tipo"] == "fijo" and bono["stake_max_valor"]:
        tope = float(bono["stake_max_valor"])
    else:
        tope = None
    if tope is not None and stake > tope:
        return False, f"Con el bono activo, el máximo por apuesta es ${tope:,.0f}".replace(",",".")
    # Mercados excluidos
    if bono["mercados_excluidos"] and mercado:
        excl = [m.strip().lower() for m in bono["mercados_excluidos"].split(",") if m.strip()]
        if mercado.lower() in excl:
            return False, f"El mercado '{mercado}' está excluido del bono"
    return True, None


async def _registrar_costo_bono(conn, otorgado_id, user_id, monto,
                                motivo="liberado"):
    """
    Anota cuánto costó el bono y a quién.

    Se llama al LIBERARSE, que es cuando la plata pasa a ser del
    cliente. El reparto se congela con la configuración del momento:
    si mañana cambia quién paga, lo ya liberado no se recalcula.
    """
    try:
        datos = await conn.fetchrow("""
            SELECT bo.bono_id, bo.agencia_code,
                   COALESCE(b.pct_paga_casa, 100) AS pct_casa,
                   COALESCE(b.pct_paga_agencia, 0) AS pct_ag
            FROM bonos_otorgados bo
            LEFT JOIN bonos b ON b.id = bo.bono_id
            WHERE bo.id = $1
        """, otorgado_id)
        if not datos:
            return
        pct_casa = float(datos["pct_casa"] or 100)
        pct_ag = float(datos["pct_ag"] or 0)
        # Si la suma no da 100, se ajusta: la casa cubre el resto.
        # Mejor que la diferencia quede sin dueño.
        if abs(pct_casa + pct_ag - 100) > 0.01:
            pct_casa = max(0.0, 100.0 - pct_ag)

        await conn.execute("""
            INSERT INTO bonos_costos
                (otorgado_id, bono_id, user_id, agencia_code, producto,
                 monto, pct_casa, pct_agencia, costo_casa, costo_agencia,
                 motivo)
            VALUES ($1,$2,$3,$4,'sports',$5,$6,$7,$8,$9,$10)
            ON CONFLICT (otorgado_id) DO NOTHING
        """, otorgado_id, datos["bono_id"], user_id, datos["agencia_code"],
             monto, pct_casa, pct_ag,
             round(monto * pct_casa / 100, 2),
             round(monto * pct_ag / 100, 2), motivo)
        log.warning(f"[BONO] liberado {monto} · casa {pct_casa}% · "
                    f"agencia {pct_ag}% ({datos['agencia_code']})")
    except Exception as e:
        # Que falle el registro no debe impedir que el cliente cobre
        # su bono: se anota el problema y se sigue.
        log.error(f"[BONO] no se pudo registrar el costo: {e}")


async def _procesar_rollover(conn, user_id, monto_apostado, cuota=None):
    """Descuenta del rollover pendiente lo apostado. Si el usuario cumple el
    rollover de un bono, ese bono se LIBERA: su saldo_bono pasa a saldo real.
    monto_apostado en pesos. Solo cuenta si la cuota >= cuota_minima del bono."""
    # Avanzar el cumplimiento de los bonos activos del usuario
    otorgados = await conn.fetch("""
        SELECT bo.id, bo.rollover_objetivo, bo.rollover_cumplido, bo.monto,
               b.cuota_minima
        FROM bonos_otorgados bo
        JOIN bonos b ON b.id = bo.bono_id
        WHERE bo.user_id=$1 AND bo.estado='activo'
        ORDER BY bo.otorgado_at ASC
    """, user_id)
    # Si la apuesta no llega a la cuota mínima de un bono, no cuenta para ese bono
    algun_cuenta = False
    for o in otorgados:
        cmin = float(o["cuota_minima"] or 1.0)
        if cuota is not None and cuota < cmin:
            continue
        algun_cuenta = True
    if algun_cuenta:
        monto_cent = int(monto_apostado * 100)
        await conn.execute("""
            UPDATE users
            SET rollover_pendiente = GREATEST(0, COALESCE(rollover_pendiente,0) - $2)
            WHERE id=$1
        """, user_id, monto_cent)
    restante = monto_apostado
    for o in otorgados:
        if restante <= 0:
            break
        cmin = float(o["cuota_minima"] or 1.0)
        if cuota is not None and cuota < cmin:
            continue   # esta apuesta no cuenta para este bono
        falta = (o["rollover_objetivo"] or 0) - (o["rollover_cumplido"] or 0)
        if falta <= 0:
            continue
        aplica = min(restante, falta)
        nuevo_cumplido = (o["rollover_cumplido"] or 0) + aplica
        restante -= aplica
        if nuevo_cumplido >= (o["rollover_objetivo"] or 0):
            # Bono cumplido: liberar el monto del bono al saldo real.
            # ESTE es el momento en que la casa paga de verdad: hasta
            # acá el cliente jugaba con saldo separado y nadie había
            # puesto nada.
            async with conn.transaction():
                await conn.execute("""
                    UPDATE bonos_otorgados
                    SET rollover_cumplido=$2, estado='liberado', liberado_at=NOW()
                    WHERE id=$1
                """, o["id"], nuevo_cumplido)
                # Pasar el saldo de bono a real (por el monto de este bono)
                await conn.execute("""
                    UPDATE users
                    SET balance = balance + $2,
                        saldo_bono = GREATEST(0, COALESCE(saldo_bono,0) - $2)
                    WHERE id=$1
                """, user_id, int(o["monto"] * 100))
                await _registrar_costo_bono(conn, o["id"], user_id,
                                            float(o["monto"] or 0))
        else:
            await conn.execute(
                "UPDATE bonos_otorgados SET rollover_cumplido=$2 WHERE id=$1",
                o["id"], nuevo_cumplido)


# ── POTENCIALIZADOR DE COMBINADAS ─────────────────────────────
# Un porcentaje extra sobre el premio que crece con la cantidad de
# selecciones. Es el estándar de la industria para que combinar deje
# de ser solo "más riesgo" y pase a tener una recompensa visible.
#
# CUÁNDO SE PAGA: solo si TODAS las patas ganan. Si una falla, el
# boleto pierde y no hay extra. Eso es lo que lo hace sostenible: la
# casa paga más justo en el escenario menos probable.
#
# QUÉ SE MUESTRA: el porcentaje se ve al armar el boleto, para que el
# cliente sepa qué gana si suma otra selección. Se muestra como
# "premio potencial con el extra ya incluido".
#
# La tabla la arma el admin: cantidad de picks → porcentaje. Se guarda
# en app_config como JSON bajo 'boost_tabla'.

async def _boost_config(conn):
    """Tabla del potencializador. Vacía = función apagada."""
    filas = await conn.fetch(
        "SELECT clave, valor FROM app_config WHERE clave LIKE 'boost_%'")
    cfg = {f["clave"]: f["valor"] for f in filas}
    tabla = []
    try:
        tabla = json.loads(cfg.get("boost_tabla") or "[]")
    except Exception:
        tabla = []
    # [{picks: 3, pct: 5}, ...] ordenado por cantidad de picks
    limpia = []
    for t in tabla:
        try:
            p = int(t.get("picks")); pc = float(t.get("pct"))
        except (TypeError, ValueError, AttributeError):
            continue
        if p >= 2 and 0 < pc <= 200:
            limpia.append({"picks": p, "pct": pc})
    limpia.sort(key=lambda x: x["picks"])
    return {
        "activo": cfg.get("boost_activo", "0") == "1" and bool(limpia),
        "tabla": limpia,
        # Cuota mínima por pick: sin esto, alguien suma diez patas de
        # 1.01 y se lleva el extra sin correr riesgo real.
        "cuota_min_pick": float(cfg.get("boost_cuota_min") or 1.20),
        "solo_mismo_boleto": True,
    }


def _boost_pct(cfg, picks_validos):
    """Porcentaje que corresponde a esa cantidad de selecciones."""
    if not cfg.get("activo"):
        return 0.0
    pct = 0.0
    for t in cfg["tabla"]:
        if picks_validos >= t["picks"]:
            pct = t["pct"]      # la tabla está ordenada: gana el último
    return pct


def _boost_calcular(cfg, picks, stake, odd_total):
    """
    (pct, premio_base, premio_con_extra, cuentan).
    Solo cuentan las patas que superan la cuota mínima: así no se
    infla la combinada con selecciones casi seguras.
    """
    minimo = cfg.get("cuota_min_pick", 1.20)
    cuentan = sum(1 for p in picks
                  if float(p.get("odd") or 0) >= minimo)
    pct = _boost_pct(cfg, cuentan)
    base = stake * odd_total
    extra = base * pct / 100 if pct else 0.0
    return pct, base, base + extra, cuentan


# ── BET BEST: TOPE DE MEJORA ──────────────────────────────────
# Cuánto se puede subir sobre la cuota del proveedor para igualar o
# superar el boleto que trae el cliente de otra casa.
#
# CÓMO FUNCIONA: si con el tope se alcanza la cuota del otro, se iguala.
# Si no se llega, se ofrece igual lo máximo alcanzable — el cliente ve
# una mejora aunque no supere del todo a la competencia, que es mejor
# que rechazarlo y perder la jugada.
#
# Es una palanca comercial: más tope capta más boletos y cuesta margen.

@app.get("/api/admin/mejora")
async def mejora_config(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        v = await conn.fetchval(
            "SELECT valor FROM app_config WHERE clave='mejora_max_pct'")
        # Cuánto se viene usando: sirve para saber si el tope alcanza
        stats = await conn.fetchrow("""
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN boost_pct > 0 THEN 1 ELSE 0 END),0) AS con_boost
            FROM betslips
            WHERE created_at > NOW() - interval '30 days'
        """)
    return {
        "pct": float(v) if v else MEJORA_MAX_PCT,
        "pct_por_defecto": MEJORA_MAX_PCT,
        "boletos_30d": int(stats["total"] or 0) if stats else 0,
    }


@app.post("/api/admin/mejora")
async def mejora_guardar(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    try:
        pct = float(body.get("pct"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentaje inválido")
    if not (0 <= pct <= 30):
        raise HTTPException(400,
            "El tope va entre 0 y 30%. Más arriba, la mejora se come el "
            "margen de cualquier cuota.")

    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO app_config (clave, valor, updated_at) VALUES ($1,$2,NOW())
            ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
        """, "mejora_max_pct", str(pct))
    _mejora_cache["pct"] = pct
    _mejora_cache["ts"] = __import__("time").time()
    log.info(f"[MEJORA] tope actualizado a {pct}%")
    return {"ok": True, "pct": pct}


@app.post("/api/admin/mejora/analizar")
async def mejora_analizar(request: Request, _=Depends(auth.require_admin)):
    """La IA opina sobre el tope, con el margen real de la casa a la vista."""
    body = await request.json()
    try:
        pct = float(body.get("pct") or MEJORA_MAX_PCT)
    except (TypeError, ValueError):
        pct = MEJORA_MAX_PCT

    pool = await get_db()
    async with pool.acquire() as conn:
        d = await conn.fetchrow("""
            SELECT COALESCE(SUM(stake),0) AS apostado,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN potential_win ELSE 0 END),0) AS pagado,
                   COUNT(*) AS total
            FROM betslips
            WHERE created_at > NOW() - interval '90 days'
              AND status IN ('won','lost','paid')
        """)
    apostado = float(d["apostado"] or 0)
    pagado = float(d["pagado"] or 0)
    ggr = apostado - pagado
    margen = (ggr / apostado * 100) if apostado > 0 else 0

    prompt = f"""Sos analista de una casa de apuestas deportivas.

El operador tiene una función que llaman Bet Best: el cliente trae la
foto de un boleto de otra casa y el sistema intenta igualar o superar
esa cuota, subiendo hasta un tope sobre la cuota de su proveedor. Si
con el tope no alcanza a igualar, igual ofrece lo máximo que llega.

Tope propuesto: {pct}%

Datos reales de los últimos 90 días:
- Boletos resueltos: {d['total']}
- Apostado: {apostado:,.0f}
- Pagado en premios: {pagado:,.0f}
- GGR: {ggr:,.0f}
- Margen sobre lo apostado: {margen:.2f}%

Respondé en español rioplatense, 3 o 4 frases cortas en prosa, sin
vinetas ni titulos. Decí si ese tope es sostenible con ese margen, qué
pasa si lo suben o lo bajan, y una advertencia concreta si corresponde.
Tené en cuenta que subir el tope capta mas clientes de la competencia
pero reduce el margen de cada jugada mejorada."""

    texto = await _consultar_claude_texto(prompt)
    return {"analisis": texto, "margen_actual": round(margen, 2),
            "ggr_90d": round(ggr, 2)}


@app.post("/api/admin/boost/simular")
async def boost_simular(request: Request, _=Depends(auth.require_admin)):
    """
    Cuánto habría costado una tabla sobre las combinadas YA jugadas.
    
    El número sale de datos propios, no de una estimación: se toman las
    combinadas resueltas del período y se calcula cuánto extra habría
    pagado esa tabla si hubiera estado activa.
    
    Es más confiable que cualquier opinión, porque usa el comportamiento
    real de estos jugadores y no un promedio de la industria.
    """
    body = await request.json()
    tabla = body.get("tabla") or []
    try:
        cmin = float(body.get("cuota_min_pick") or 1.20)
    except (TypeError, ValueError):
        cmin = 1.20
    dias = max(7, min(int(body.get("dias") or 90), 365))

    limpia = []
    for t in tabla:
        try:
            limpia.append({"picks": int(t.get("picks")),
                           "pct": float(t.get("pct"))})
        except (TypeError, ValueError, AttributeError):
            continue
    limpia.sort(key=lambda x: x["picks"])
    if not limpia:
        raise HTTPException(400, "Falta la tabla a simular")

    cfg_sim = {"activo": True, "tabla": limpia, "cuota_min_pick": cmin}

    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT picks, stake, odd_total, potential_win, status
            FROM betslips
            WHERE status IN ('won','lost','paid')
              AND created_at > NOW() - ($1 || ' days')::interval
              AND stake > 0
        """, str(dias))

    total = ganadas = 0
    costo = 0.0
    apostado = 0.0
    pagado = 0.0
    por_picks = {}

    for f in filas:
        try:
            picks = ast.literal_eval(f["picks"]) if isinstance(f["picks"], str) \
                    else (f["picks"] or [])
        except (ValueError, SyntaxError):
            continue
        if len(picks) < 2:
            continue          # las simples no llevan potencializador

        total += 1
        stake = float(f["stake"] or 0)
        odd = float(f["odd_total"] or 0)
        apostado += stake

        pct, base, con_extra, cuentan = _boost_calcular(
            cfg_sim, picks, stake, odd)

        d = por_picks.setdefault(len(picks), {
            "jugadas": 0, "ganadas": 0, "extra": 0.0, "pct": pct})
        d["jugadas"] += 1
        d["pct"] = pct

        if (f["status"] or "").lower() in ("won", "paid"):
            ganadas += 1
            pagado += base
            costo += con_extra - base
            d["ganadas"] += 1
            d["extra"] += con_extra - base

    ggr = apostado - pagado
    return {
        "dias": dias,
        "combinadas": total,
        "ganadas": ganadas,
        "tasa_acierto": round(ganadas / total * 100, 1) if total else 0,
        "apostado": round(apostado, 2),
        "pagado_sin_boost": round(pagado, 2),
        "ggr_sin_boost": round(ggr, 2),
        "costo_del_boost": round(costo, 2),
        "ggr_con_boost": round(ggr - costo, 2),
        "impacto_pct": round(costo / ggr * 100, 2) if ggr > 0 else None,
        "por_cantidad": [{
            "picks": k, "jugadas": v["jugadas"], "ganadas": v["ganadas"],
            "pct": v["pct"], "extra": round(v["extra"], 2),
        } for k, v in sorted(por_picks.items())],
        "aviso": ("Calculado sobre combinadas ya resueltas. Si el "
                  "potencializador atrae más jugadores o los empuja a "
                  "sumar patas, el volumen sube y este número cambia."),
    }


@app.post("/api/admin/boost/analizar")
async def boost_analizar(request: Request, _=Depends(auth.require_admin)):
    """
    La IA lee la simulación y opina. Primero se calcula sobre datos
    reales y después se le pasa el resultado: una opinión sin números
    propios vale poco.
    """
    body = await request.json()
    tabla = body.get("tabla") or []
    sim = body.get("simulacion") or {}

    escalones = ", ".join(
        f"{t.get('picks')} selecciones → +{t.get('pct')}%" for t in tabla)

    prompt = f"""Sos analista de riesgo de una casa de apuestas deportivas.
El operador quiere activar un potencializador de combinadas: un
porcentaje extra sobre el premio que crece con la cantidad de
selecciones, y que se paga SOLO si aciertan todas.

Tabla propuesta: {escalones}
Cuota mínima por selección para que cuente: {body.get('cuota_min_pick', 1.2)}

Simulación sobre SUS PROPIOS datos de los últimos {sim.get('dias', 90)} días:
- Combinadas jugadas: {sim.get('combinadas', 0)}
- Ganadas por el jugador: {sim.get('ganadas', 0)} ({sim.get('tasa_acierto', 0)}%)
- Apostado: {sim.get('apostado', 0)}
- GGR sin potencializador: {sim.get('ggr_sin_boost', 0)}
- Costo del potencializador: {sim.get('costo_del_boost', 0)}
- GGR resultante: {sim.get('ggr_con_boost', 0)}
- Impacto sobre el margen: {sim.get('impacto_pct')}%

Respondé en español rioplatense, en 3 o 4 frases cortas y concretas.
Decí si la tabla es sostenible con esos números, qué escalón conviene
ajustar si hay alguno riesgoso, y una advertencia si corresponde.
No uses vinetas ni titulos, escribí en prosa directa."""

    texto = await _consultar_claude_texto(prompt)
    return {"analisis": texto}


@app.get("/api/boost")
async def boost_publico():
    """La tabla, para mostrarla al armar el boleto. Sin auth."""
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _boost_config(conn)
    return {
        "activo": cfg["activo"],
        "tabla": cfg["tabla"],
        "cuota_min_pick": cfg["cuota_min_pick"],
        "leyenda": ("El extra se paga solo si aciertan todas las "
                    "selecciones."),
    }


@app.get("/api/admin/boost")
async def boost_admin(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _boost_config(conn)
        # Cuánto costó el potencializador en premios ya pagados
        gasto = await conn.fetchval("""
            SELECT COALESCE(SUM(boost_extra),0) FROM betslips
            WHERE status IN ('won','paid') AND boost_extra > 0
        """)
    return {**cfg, "pagado_historico": float(gasto or 0)}


@app.post("/api/admin/boost")
async def boost_guardar(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    tabla = body.get("tabla") or []
    if not isinstance(tabla, list) or len(tabla) > 12:
        raise HTTPException(400, "La tabla admite hasta 12 escalones")

    limpia = []
    for t in tabla:
        try:
            p = int(t.get("picks")); pc = float(t.get("pct"))
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(400, "Cada escalón necesita picks y porcentaje")
        if p < 2:
            raise HTTPException(400, "El potencializador arranca desde 2 selecciones")
        if not (0 < pc <= 200):
            raise HTTPException(400, "El porcentaje va entre 0 y 200")
        limpia.append({"picks": p, "pct": pc})
    limpia.sort(key=lambda x: x["picks"])

    # Que no baje al sumar picks: sería un incentivo al revés
    for i in range(1, len(limpia)):
        if limpia[i]["pct"] < limpia[i-1]["pct"]:
            raise HTTPException(400,
                f"Con {limpia[i]['picks']} selecciones el porcentaje no puede "
                f"ser menor que con {limpia[i-1]['picks']}.")

    try:
        cmin = float(body.get("cuota_min_pick") or 1.20)
    except (TypeError, ValueError):
        cmin = 1.20
    if not (1.01 <= cmin <= 5):
        raise HTTPException(400, "La cuota mínima por selección va entre 1.01 y 5")

    vals = {
        "boost_activo": "1" if body.get("activo") else "0",
        "boost_tabla": json.dumps(limpia),
        "boost_cuota_min": str(cmin),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at) VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    return {"ok": True, "tabla": limpia}


# ── PROGRAMACIÓN DE BONOS ─────────────────────────────────────
# Un bono puede estar limitado a fechas, días de la semana y franja
# horaria. Fuera de su ventana se sigue mostrando, pero deshabilitado
# y con el texto de cuándo vuelve: le sirve al cajero para decirle al
# cliente que pase el viernes.
#
# LA HORA ES LA DE LA CASA, una sola para todas las agencias. Con husos
# distintos, "viernes de 18 a 22" significaría cosas diferentes según
# dónde esté el local, y las promociones se vuelven imposibles de
# comunicar.

DIAS_ES = ["lunes", "martes", "miércoles", "jueves",
           "viernes", "sábado", "domingo"]


def _bono_en_ventana(b, ahora=None):
    """
    (disponible, motivo). 'b' es una fila de bonos con los campos de
    programación; si están todos vacíos, el bono está siempre activo.
    """
    ahora = ahora or datetime.now(TZ_CASA)

    desde = b.get("vigente_desde") if isinstance(b, dict) else b["vigente_desde"]
    hasta = b.get("vigente_hasta") if isinstance(b, dict) else b["vigente_hasta"]
    dias  = b.get("dias_semana") if isinstance(b, dict) else b["dias_semana"]
    h_ini = b.get("hora_desde") if isinstance(b, dict) else b["hora_desde"]
    h_fin = b.get("hora_hasta") if isinstance(b, dict) else b["hora_hasta"]

    hoy = ahora.date()
    if desde and hoy < desde:
        return False, f"Desde el {desde.strftime('%d/%m')}"
    if hasta and hoy > hasta:
        return False, "Promoción terminada"

    # dias_semana: "0,4" = lunes y viernes. Vacío = todos.
    if dias:
        permitidos = [int(d) for d in str(dias).split(",") if d.strip().isdigit()]
        if permitidos and ahora.weekday() not in permitidos:
            nombres = ", ".join(DIAS_ES[d] for d in sorted(permitidos)
                                if 0 <= d <= 6)
            return False, f"Solo {nombres}"

    if h_ini is not None and h_fin is not None:
        h = ahora.hour
        # Franja que cruza medianoche: 22 a 2
        dentro = (h_ini <= h < h_fin) if h_ini < h_fin \
                 else (h >= h_ini or h < h_fin)
        if not dentro:
            return False, f"De {int(h_ini):02d}:00 a {int(h_fin):02d}:00"

    return True, ""


def _texto_ventana(b):
    """'Viernes de 18 a 22' — para mostrar cuándo está disponible."""
    partes = []
    dias = b["dias_semana"] if not isinstance(b, dict) else b.get("dias_semana")
    h_ini = b["hora_desde"] if not isinstance(b, dict) else b.get("hora_desde")
    h_fin = b["hora_hasta"] if not isinstance(b, dict) else b.get("hora_hasta")
    if dias:
        d = [int(x) for x in str(dias).split(",") if x.strip().isdigit()]
        if d and len(d) < 7:
            partes.append(", ".join(DIAS_ES[i] for i in sorted(d) if 0 <= i <= 6))
    if h_ini is not None and h_fin is not None:
        partes.append(f"de {int(h_ini):02d} a {int(h_fin):02d} h")
    return " ".join(partes) if partes else "Siempre disponible"


async def _bonos_disponibles_agencia(conn, agencia_code):
    """Bonos activos asignados a una agencia (o global)."""
    return await conn.fetch("""
        SELECT b.id, b.nombre, b.tipo, b.monto_fijo, b.porcentaje, b.tope,
               b.rollover, b.vigente_desde, b.vigente_hasta,
               b.dias_semana, b.hora_desde, b.hora_hasta
        FROM bonos b
        JOIN bonos_agencias ba ON ba.bono_id = b.id
        WHERE b.activo=TRUE AND ba.habilitado=TRUE AND ba.agencia_code=$1
    """, agencia_code)


@app.get("/api/agencias/me/bonos")
async def agencia_bonos_activos(agencia_code: str = Depends(requiere_agencia)):
    """Bonos activos disponibles para esta agencia (para verlos en su panel)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await _bonos_disponibles_agencia(conn, agencia_code)
        # Resumen de bonos otorgados por esta agencia
        stats = await conn.fetchrow("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE estado='activo') AS activos,
                   COUNT(*) FILTER (WHERE estado='liberado') AS liberados,
                   COALESCE(SUM(monto),0) AS monto_total
            FROM bonos_otorgados WHERE agencia_code=$1
        """, agencia_code)
    # Cada bono se marca disponible o no según su ventana horaria. No se
    # ocultan: el cajero necesita poder decirle al cliente cuándo vuelve.
    bonos = []
    for r in rows:
        ok, motivo = _bono_en_ventana(r)
        bonos.append({
            "id": r["id"], "nombre": r["nombre"], "tipo": r["tipo"],
            "monto_fijo": r["monto_fijo"],
            "porcentaje": float(r["porcentaje"]) if r["porcentaje"] is not None else None,
            "tope": r["tope"],
            "rollover": float(r["rollover"]) if r["rollover"] is not None else None,
            "disponible": ok,
            "motivo": motivo,
            "ventana": _texto_ventana(r),
        })
    return {"bonos": bonos, "resumen": {
        "otorgados": stats["total"], "activos": stats["activos"],
        "liberados": stats["liberados"], "monto_total": stats["monto_total"],
    }}


@app.post("/api/agencias/me/otorgar-bono")
async def agencia_otorgar_bono(request: Request, agencia_code: str = Depends(requiere_agencia)):
    """La agencia otorga un bono a un cliente suyo.
    body: {user_id, bono_id, monto_carga?} (monto_carga si el bono es por carga)"""
    body = await request.json()
    user_id = int(body.get("user_id"))
    bono_id = int(body.get("bono_id"))
    monto_carga = body.get("monto_carga")

    pool = await get_db()
    async with pool.acquire() as conn:
        # El bono debe estar disponible para esta agencia
        bono = await conn.fetchrow("""
            SELECT b.id, b.tipo, b.monto_fijo, b.porcentaje, b.tope, b.rollover,
                   b.vigente_desde, b.vigente_hasta, b.dias_semana,
                   b.hora_desde, b.hora_hasta, b.nombre
            FROM bonos b JOIN bonos_agencias ba ON ba.bono_id=b.id
            WHERE b.id=$1 AND b.activo=TRUE AND ba.agencia_code=$2 AND ba.habilitado=TRUE
        """, bono_id, agencia_code)
        if not bono:
            raise HTTPException(404, "Bono no disponible para esta agencia")

        # La ventana se valida ACÁ, no solo en la pantalla: pintar el
        # botón gris no impide que alguien llame al endpoint igual.
        en_ventana, motivo = _bono_en_ventana(bono)
        if not en_ventana:
            raise HTTPException(400,
                f"'{bono['nombre']}' no está disponible ahora. {motivo}")

        # El cliente debe ser de esta agencia
        cli = await conn.fetchrow(
            "SELECT id, creado_por FROM users WHERE id=$1", user_id)
        if not cli or cli["creado_por"] != agencia_code:
            raise HTTPException(403, "El cliente no es de tu agencia")

        # Un bono activo por usuario (regla anti-abuso)
        ya = await conn.fetchval(
            "SELECT 1 FROM bonos_otorgados WHERE user_id=$1 AND estado='activo'", user_id)
        if ya:
            raise HTTPException(409, "El cliente ya tiene un bono activo")
        # Anti-repetición: no puede recibir dos veces el mismo bono
        ya_lo_tuvo = await conn.fetchval(
            "SELECT 1 FROM bonos_otorgados WHERE user_id=$1 AND bono_id=$2", user_id, bono_id)
        if ya_lo_tuvo:
            raise HTTPException(409, "El cliente ya recibió este bono antes")

        # Calcular el monto del bono
        if bono["tipo"] == "bienvenida":
            monto = int(bono["monto_fijo"] or 0)
        else:
            if not monto_carga:
                raise HTTPException(400, "Falta el monto de carga para el bono por carga")
            monto = int(float(monto_carga) * (float(bono["porcentaje"] or 0) / 100))
            if bono["tope"]:
                monto = min(monto, int(bono["tope"]))
        if monto <= 0:
            raise HTTPException(400, "El bono resultó en $0")

        rollover_obj = int(monto * float(bono["rollover"] or 0))
        async with conn.transaction():
            # Acreditar al saldo de bono (en centavos) y setear rollover pendiente
            await conn.execute("""
                UPDATE users SET saldo_bono = COALESCE(saldo_bono,0) + $2,
                    rollover_pendiente = COALESCE(rollover_pendiente,0) + $3
                WHERE id=$1
            """, user_id, monto * 100, rollover_obj * 100)
            await conn.execute("""
                INSERT INTO bonos_otorgados
                    (bono_id, user_id, monto, rollover_objetivo, rollover_cumplido,
                     estado, agencia_code)
                VALUES ($1,$2,$3,$4,0,'activo',$5)
            """, bono_id, user_id, monto, rollover_obj, agencia_code)
    return {"ok": True, "monto": monto, "rollover_objetivo": rollover_obj}


@app.get("/api/admin/bonos/reporte")
async def admin_reporte_bonos(_=Depends(auth.require_admin)):
    """Reporte del funcionamiento de todos los bonos."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT b.id, b.nombre, b.tipo, b.activo,
                   COUNT(bo.id) AS otorgados,
                   COUNT(bo.id) FILTER (WHERE bo.estado='activo') AS activos,
                   COUNT(bo.id) FILTER (WHERE bo.estado='liberado') AS liberados,
                   COALESCE(SUM(bo.monto),0) AS monto_total
            FROM bonos b
            LEFT JOIN bonos_otorgados bo ON bo.bono_id=b.id
            GROUP BY b.id, b.nombre, b.tipo, b.activo
            ORDER BY b.id DESC
        """)
    return {"reporte": [{
        "id": r["id"], "nombre": r["nombre"], "tipo": r["tipo"], "activo": r["activo"],
        "otorgados": r["otorgados"], "activos": r["activos"],
        "liberados": r["liberados"], "monto_total": r["monto_total"],
    } for r in rows]}


@app.get("/api/admin/limites")
async def admin_listar_limites(_=Depends(auth.require_admin)):
    """Todos los límites configurados."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT l.id, l.alcance, l.agencia_code, l.monto_min, l.monto_max,
                   l.pago_max, l.updated_at, l.moneda,
                   a.name AS agencia_nombre, a.moneda AS agencia_moneda
            FROM limites_apuesta l
            LEFT JOIN agencias a ON a.code = l.agencia_code
            -- Los globales primero: son los que se consultan seguido y
            -- quedaban perdidos al final entre los de agencia.
            ORDER BY (l.alcance <> 'global'), l.moneda NULLS FIRST,
                     l.agencia_code NULLS FIRST
        """)
    return {"limites": [{
        "id": r["id"], "alcance": r["alcance"], "agencia_code": r["agencia_code"],
        "agencia_nombre": r["agencia_nombre"],
        "monto_min": r["monto_min"], "monto_max": r["monto_max"],
        "pago_max": r["pago_max"],
        # La moneda en la que están expresados esos números
        "moneda": r["moneda"] or r["agencia_moneda"] or "ARS",
        "fecha": r["updated_at"].strftime("%d/%m/%Y") if r["updated_at"] else "",
    } for r in rows]}


@app.post("/api/admin/limites")
async def admin_set_limite(request: Request, _=Depends(auth.require_admin)):
    """El admin configura límites. body:
       {alcance: 'global'|'rama'|'agencia', agencia_code?, monto_min, monto_max, pago_max}
       - 'global': aplica a toda la red
       - 'rama':   aplica a la agencia dada y todas sus descendientes
       - 'agencia': aplica solo a esa agencia"""
    body = await request.json()
    # Se registra el cuerpo completo: si la moneda no llega, hay que
    # poder verlo en el log sin adivinar.
    log.warning(f"[LIMITES] body recibido: {body}")
    alcance = body.get("alcance", "global")
    code = (body.get("agencia_code") or "").upper() or None
    def _num(x):
        try: return int(x) if x not in (None, "") else None
        except (TypeError, ValueError): return None
    mn, mx, pm = _num(body.get("monto_min")), _num(body.get("monto_max")), _num(body.get("pago_max"))

    pool = await get_db()
    async with pool.acquire() as conn:
        if alcance == "global":
            # Un global POR MONEDA: se borra solo el de esa moneda, no
            # todos. Antes un cambio en pesos borraba el de dólares.
            moneda = (body.get("moneda") or "ARS").upper()[:4]
            # Las filas viejas pueden tener moneda NULL. Se normalizan
            # antes de tocar nada: si no, el DELETE no las encuentra y
            # el INSERT choca contra el índice único.
            await conn.execute(
                "UPDATE limites_apuesta SET moneda='ARS' "
                "WHERE alcance='global' AND moneda IS NULL")
            await conn.execute(
                "DELETE FROM limites_apuesta WHERE alcance='global' "
                "AND moneda=$1", moneda)
            await conn.execute("""
                INSERT INTO limites_apuesta
                    (alcance, moneda, monto_min, monto_max, pago_max, updated_by)
                VALUES ('global', $1, $2, $3, $4, 'admin')
            """, moneda, mn, mx, pm)
            log.info(f"[LIMITES] global {moneda}: min={mn} max={mx} pago={pm}")
            # Se relee para confirmar que quedó: un error de índice
            # dejaba la pantalla diciendo "guardado" sin haber guardado.
            ok = await conn.fetchval(
                "SELECT 1 FROM limites_apuesta WHERE alcance='global' "
                "AND moneda=$1", moneda)
            if not ok:
                raise HTTPException(500,
                    f"El límite de {moneda} no quedó guardado. "
                    f"Revisá si hay filas viejas sin moneda.")
            return {"ok": True, "alcance": "global", "moneda": moneda}

        if not code:
            raise HTTPException(400, "Falta la agencia")

        if alcance == "rama":
            # Aplicar a la agencia y todas sus descendientes (un registro por agencia)
            objetivos = await codes_de_la_rama(conn, code)
        else:
            objetivos = [code]

        for ag in objetivos:
            await conn.execute("DELETE FROM limites_apuesta WHERE alcance='agencia' AND agencia_code=$1", ag)
            await conn.execute("""
                INSERT INTO limites_apuesta (alcance, agencia_code, monto_min, monto_max, pago_max, updated_by)
                VALUES ('agencia', $1, $2, $3, $4, 'admin')
            """, ag, mn, mx, pm)
        return {"ok": True, "alcance": alcance, "aplicado_a": len(objetivos)}


@app.delete("/api/admin/limites/{lim_id}")
async def admin_borrar_limite(lim_id: int, _=Depends(auth.require_admin)):
    """Borra un límite de agencia (vuelve a heredar de la rama/global)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM limites_apuesta WHERE id=$1 AND alcance<>'global'", lim_id)
    return {"ok": True}


async def _calcular_ggr(conn, codes, desde, hasta):
    """
    Suma apostado y premios de los clientes de las agencias en 'codes',
    en el rango [desde, hasta]. GGR = apostado − premios.
    """
    from datetime import date as _date
    # asyncpg necesita objetos date, no strings
    if isinstance(desde, str): desde = _date.fromisoformat(desde)
    if isinstance(hasta, str): hasta = _date.fromisoformat(hasta)
    apostado = await conn.fetchval("""
        SELECT COALESCE(SUM(b.stake),0)
        FROM betslips b
        JOIN users u ON u.id = b.user_id
        WHERE u.creado_por = ANY($1)
          AND b.created_at::date >= $2 AND b.created_at::date <= $3
    """, codes, desde, hasta) or 0
    premios = await conn.fetchval("""
        SELECT COALESCE(SUM(monto),0)
        FROM agencia_movimientos
        WHERE agencia_code = ANY($1) AND tipo='pago_premio'
          AND created_at::date >= $2 AND created_at::date <= $3
    """, codes, desde, hasta) or 0
    return float(apostado), float(premios)


async def _rango_periodo(periodo, hoy=None):
    """Devuelve (desde, hasta) del período anterior según 'semanal' o 'mensual'."""
    from datetime import date as _date, timedelta
    hoy = hoy or _date.today()
    if periodo == "semanal":
        # Semana anterior: lunes a domingo
        inicio_semana = hoy - timedelta(days=hoy.weekday())   # lunes de esta semana
        desde = inicio_semana - timedelta(days=7)
        hasta = inicio_semana - timedelta(days=1)
    else:  # mensual
        primero = hoy.replace(day=1)
        hasta = primero - timedelta(days=1)          # último día del mes anterior
        desde = hasta.replace(day=1)                 # primer día del mes anterior
    return desde, hasta


async def _liquidar_influencer_periodo(conn, code, desde, hasta):
    """GGR y comisión de un influencer por sus apuestas en el período."""
    inf = await conn.fetchrow(
        "SELECT pct_ggr, pct_ventas FROM agencias WHERE code=$1 AND tipo='influencer'", code)
    if not inf:
        return None
    row = await conn.fetchrow("""
        SELECT COALESCE(SUM(stake),0) AS apostado,
               COALESCE(SUM(CASE WHEN lower(status) IN ('won','ganada','paid')
                         THEN potential_win ELSE 0 END),0) AS premios
        FROM betslips
        WHERE influencer_code=$1
          AND created_at::date>=$2 AND created_at::date<=$3
    """, code, desde, hasta)
    apostado = float(row["apostado"] or 0); premios = float(row["premios"] or 0)
    ggr = apostado - premios
    pg = float(inf["pct_ggr"] or 0); pv = float(inf["pct_ventas"] or 0)
    return {"apostado": apostado, "premios": premios, "ggr": ggr,
            "pct_ggr": pg, "pct_ventas": pv,
            "com_ggr": round(ggr*pg/100, 2), "com_ven": round(apostado*pv/100, 2),
            "com_total": round(ggr*pg/100 + apostado*pv/100, 2)}


async def _generar_liquidaciones_auto(periodo):
    """Genera las liquidaciones del período para todas las agencias e influencers.
    No paga: solo deja el registro. Evita duplicar si ya existe el mismo período."""
    pool = await get_db()
    desde, hasta = await _rango_periodo(periodo)
    generadas = 0
    async with pool.acquire() as conn:
        # --- AGENCIAS (tipo agencia) ---
        agencias = await conn.fetch("""
            SELECT code, pct_ggr, pct_ventas FROM agencias
            WHERE COALESCE(tipo,'agencia')='agencia'
        """)
        for a in agencias:
            ya = await conn.fetchval("""
                SELECT 1 FROM liquidaciones
                WHERE agencia_code=$1 AND desde=$2 AND hasta=$3 AND periodo=$4
            """, a["code"], desde, hasta, periodo)
            if ya:
                continue
            apostado, premios = await _calcular_ggr(conn, [a["code"]], desde, hasta)
            if apostado == 0 and premios == 0:
                continue   # sin actividad, no generar
            ggr = apostado - premios
            pg = float(a["pct_ggr"] or 0); pv = float(a["pct_ventas"] or 0)
            cg = round(ggr*pg/100, 2); cv = round(apostado*pv/100, 2)
            await conn.execute("""
                INSERT INTO liquidaciones
                    (agencia_code, desde, hasta, total_apostado, total_premios,
                     ggr, pct_ggr, pct_ventas, comision_ggr, comision_ventas,
                     comision_total, generada_por, automatica, tipo_beneficiario, periodo)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'auto',TRUE,'agencia',$12)
            """, a["code"], desde, hasta, apostado, premios, ggr, pg, pv,
                 cg, cv, round(cg+cv, 2), periodo)
            generadas += 1

        # --- INFLUENCERS ---
        influencers = await conn.fetch(
            "SELECT code FROM agencias WHERE tipo='influencer'")
        for inf in influencers:
            ya = await conn.fetchval("""
                SELECT 1 FROM liquidaciones
                WHERE agencia_code=$1 AND desde=$2 AND hasta=$3 AND periodo=$4
            """, inf["code"], desde, hasta, periodo)
            if ya:
                continue
            r = await _liquidar_influencer_periodo(conn, inf["code"], desde, hasta)
            if not r or (r["apostado"] == 0 and r["premios"] == 0):
                continue
            await conn.execute("""
                INSERT INTO liquidaciones
                    (agencia_code, desde, hasta, total_apostado, total_premios,
                     ggr, pct_ggr, pct_ventas, comision_ggr, comision_ventas,
                     comision_total, generada_por, automatica, tipo_beneficiario, periodo)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'auto',TRUE,'influencer',$12)
            """, inf["code"], desde, hasta, r["apostado"], r["premios"], r["ggr"],
                 r["pct_ggr"], r["pct_ventas"], r["com_ggr"], r["com_ven"],
                 r["com_total"], periodo)
            generadas += 1
    return {"periodo": periodo, "desde": str(desde), "hasta": str(hasta),
            "generadas": generadas}


@app.get("/api/admin/liquidacion-config")
async def get_liquidacion_config(_=Depends(auth.require_admin)):
    """Lee la config de liquidación automática (qué períodos están activos)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        val = await conn.fetchval(
            "SELECT valor FROM app_config WHERE clave='liquidacion_periodo'")
    return {"periodos": (val or "semanal,mensual").split(",")}


@app.post("/api/admin/liquidacion-config")
async def set_liquidacion_config(request: Request, _=Depends(auth.require_admin)):
    """El admin configura qué períodos de liquidación automática están activos.
    body: {periodos: ['semanal','mensual']}"""
    body = await request.json()
    periodos = body.get("periodos") or []
    validos = [p for p in periodos if p in ("semanal", "mensual")]
    val = ",".join(validos) if validos else ""
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO app_config (clave, valor, updated_at)
            VALUES ('liquidacion_periodo', $1, NOW())
            ON CONFLICT (clave) DO UPDATE SET valor=$1, updated_at=NOW()
        """, val)
    return {"ok": True, "periodos": validos}


@app.post("/api/admin/liquidar-auto")
async def liquidar_auto_manual(request: Request, _=Depends(auth.require_admin)):
    """Dispara manualmente la liquidación automática de un período.
    body: {periodo: 'semanal'|'mensual'}"""
    body = await request.json()
    periodo = body.get("periodo", "semanal")
    if periodo not in ("semanal", "mensual"):
        raise HTTPException(400, "Período inválido")
    return await _generar_liquidaciones_auto(periodo)


@app.post("/api/admin/liquidar")
async def generar_liquidacion(request: Request, _=Depends(auth.require_admin)):
    """
    Genera la liquidación de comisiones de una agencia en un período.
    GGR = apostado − premios. Comisión = pct_ggr*GGR + pct_ventas*apostado.
    """
    body = await request.json()
    code = (body.get("agencia") or "").upper()
    desde = body.get("desde"); hasta = body.get("hasta")
    if not code or not desde or not hasta:
        raise HTTPException(400, "Faltan agencia, desde o hasta")

    # Las fechas llegan como texto y Postgres necesita el tipo: sin
    # esto la consulta falla con un error de comparación.
    try:
        d1 = _a_fecha(desde)
        d2 = _a_fecha(hasta)
    except Exception:
        raise HTTPException(400, "Fechas inválidas")

    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT pct_ggr, pct_ventas FROM agencias WHERE code=$1", code)
        if not ag:
            raise HTTPException(404, "Agencia no encontrada")
        # Solo esa agencia (sus clientes directos)
        try:
            apostado, premios = await _calcular_ggr(conn, [code], d1, d2)
        except Exception as e:
            log.error(f"[LIQUIDAR] {code} {d1}..{d2}: "
                      f"{type(e).__name__}: {e}")
            raise HTTPException(500,
                f"No se pudo calcular: {str(e)[:200]}")
        ggr = apostado - premios
        pg = float(ag["pct_ggr"] or 0); pv = float(ag["pct_ventas"] or 0)
        com_ggr = round(ggr * pg / 100, 2)
        com_ven = round(apostado * pv / 100, 2)
        com_total = round(com_ggr + com_ven, 2)
        row = await conn.fetchrow("""
            INSERT INTO liquidaciones
                (agencia_code, desde, hasta, total_apostado, total_premios,
                 ggr, pct_ggr, pct_ventas, comision_ggr, comision_ventas,
                 comision_total, generada_por, automatica)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'admin',FALSE)
            RETURNING id
        """, code, d1, d2, apostado, premios, ggr, pg, pv,
             com_ggr, com_ven, com_total)
    return {"ok": True, "id": row["id"],
            "apostado": apostado, "premios": premios, "ggr": ggr,
            "comision_ggr": com_ggr, "comision_ventas": com_ven,
            "comision_total": com_total}


@app.get("/api/admin/liquidaciones")
async def listar_liquidaciones(agencia: str = "", _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            rows = await conn.fetch("""
                SELECT * FROM liquidaciones WHERE agencia_code=$1
                ORDER BY created_at DESC LIMIT 100
            """, agencia.upper())
        else:
            rows = await conn.fetch("""
                SELECT * FROM liquidaciones ORDER BY created_at DESC LIMIT 100
            """)
    return {"liquidaciones": [{
        "id": r["id"], "agencia": r["agencia_code"],
        "desde": r["desde"].strftime("%d/%m/%Y") if r["desde"] else "",
        "hasta": r["hasta"].strftime("%d/%m/%Y") if r["hasta"] else "",
        "apostado": float(r["total_apostado"] or 0),
        "premios": float(r["total_premios"] or 0),
        "ggr": float(r["ggr"] or 0),
        "comision_total": float(r["comision_total"] or 0),
        "fecha": r["created_at"].strftime("%d/%m/%Y") if r["created_at"] else "",
    } for r in rows]}


async def _cc_por_venta(conn, agencia_code, monto, code, validar=True):
    """
    Al vender un boleto, la agencia recibió efectivo del cliente, así
    que pasa a deberle esa plata a la casa: su saldo BAJA.

    Es el espejo de pagar un premio, donde el saldo sube porque puso
    plata de su caja.

    SIN SALDO NO SE VENDE: cada venta endeuda más a la agencia, y una
    agencia que sigue vendiendo sin respaldo le está tomando plata a
    clientes que después alguien tiene que pagar.
    """
    if not agencia_code or not monto or monto <= 0:
        return None
    return await _mover_cc(
        conn, agencia_code, -abs(float(monto)), "venta",
        f"Boleto vendido {code}", agencia_code,
        contra=code, validar=validar)


async def _caja_operativa(conn, codes, desde, hasta):
    """
    La plata que entró y salió por el mostrador en el período.

    ENTRA: lo que pagan los clientes al comprar un boleto.
    SALE: los premios que la agencia paga de su caja.

    Es distinto de las cargas y retiros de saldo, que son movimientos
    de la billetera del cliente. Acá está el efectivo real que pasó
    por el mostrador, que es lo que el cajero cuenta al cerrar.
    """
    filas = await conn.fetch("""
        SELECT tipo,
               COUNT(*) AS cantidad,
               COALESCE(SUM(ABS(monto)),0) AS total
        FROM cc_movimientos
        WHERE agencia_code = ANY($1)
          AND created_at::date BETWEEN $2 AND $3
          AND tipo IN ('venta','pago_premio','anulacion')
        GROUP BY tipo
    """, codes, desde, hasta)

    d = {f["tipo"]: {"n": int(f["cantidad"]), "total": float(f["total"])}
         for f in filas}
    ventas = d.get("venta", {"n": 0, "total": 0.0})
    premios = d.get("pago_premio", {"n": 0, "total": 0.0})
    anulados = d.get("anulacion", {"n": 0, "total": 0.0})

    # Lo vendido menos lo anulado es lo que quedó de verdad
    entro = ventas["total"] - anulados["total"]
    salio = premios["total"]

    return {
        "ventas": {"cantidad": ventas["n"], "total": round(ventas["total"], 2)},
        "premios": {"cantidad": premios["n"], "total": round(salio, 2)},
        "anulados": {"cantidad": anulados["n"],
                     "total": round(anulados["total"], 2)},
        "entro": round(entro, 2),
        "salio": round(salio, 2),
        # Lo que debería tener el cajón al cerrar
        "en_caja": round(entro - salio, 2),
    }


# ── CUENTA CORRIENTE — motor de saldos entre niveles ─
async def _mover_cc(conn, code, delta, tipo, detalle, quien,
                    contra=None, validar=True):
    """
    Mueve el saldo_cc de una agencia de forma atómica y lo registra.
    delta en pesos (positivo suma, negativo descuenta).
    Si validar=True y el saldo quedaría negativo, corta con error.
    Devuelve el nuevo saldo.
    """
    ag = await conn.fetchrow(
        "SELECT saldo_cc FROM agencias WHERE code=$1 FOR UPDATE", code)
    if not ag:
        raise HTTPException(404, f"Agencia {code} no encontrada")
    actual = float(ag["saldo_cc"] or 0)
    nuevo = actual + delta
    if validar and nuevo < 0:
        # El cajero tiene que entender qué pasó sin llamar a nadie:
        # cuánto tiene, cuánto necesitaba y qué hacer.
        falta = abs(nuevo)
        raise HTTPException(400,
            f"Sin saldo suficiente. Disponible: {actual:,.0f} · "
            f"faltan {falta:,.0f}. Pedí una carga a tu agencia superior "
            f"para poder seguir vendiendo.".replace(",", "."))
    await conn.execute(
        "UPDATE agencias SET saldo_cc=$2 WHERE code=$1", code, nuevo)
    await conn.execute("""
        INSERT INTO cc_movimientos
            (agencia_code, contra_code, tipo, monto, saldo_luego, detalle, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
    """, code, contra, tipo, delta, nuevo, detalle, quien)
    return nuevo


# ── CUENTA CORRIENTE — endpoints ──────────────────────────────
@app.post("/api/admin/agencias/{code}/cc")
async def admin_cargar_cc(code: str, request: Request,
                          _=Depends(auth.require_admin)):
    """El admin carga (o descuenta) saldo CC a una agencia. Sin límite."""
    body = await request.json()
    try:
        monto = float(body.get("monto"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    if monto == 0:
        raise HTTPException(400, "El monto no puede ser cero")
    detalle = (body.get("detalle") or "").strip()[:200] or "Carga admin"
    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Nadie puede quedar negativo: al retirar (monto<0) se valida el saldo.
            # Al cargar (monto>0) se suma, nunca deja negativo.
            nuevo = await _mover_cc(conn, code.upper(), monto,
                                    "carga_admin" if monto > 0 else "retiro_admin",
                                    detalle, "admin", contra="admin",
                                    validar=(monto < 0))
    return {"ok": True, "saldo_cc": nuevo}


@app.post("/api/agencias/me/sub/{code}/cc")
async def agencia_cargar_sub(code: str, request: Request,
                             agencia_code: str = Depends(requiere_agencia)):
    """
    Una agencia transfiere saldo a una sub-agencia de su rama.
    Se descuenta del saldo de la agencia (con validación) y se suma
    al de la sub-agencia. Atómico: o pasan las dos cosas, o ninguna.
    """
    body = await request.json()
    try:
        monto = float(body.get("monto"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    if monto == 0:
        raise HTTPException(400, "El monto no puede ser cero")
    code = code.upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # La sub debe estar en la rama de quien transfiere
            rama = await codes_de_la_rama(conn, agencia_code)
            if code == agencia_code or code not in rama:
                raise HTTPException(403, "Esa agencia no está en tu rama")
            if monto > 0:
                # CARGAR: descuenta de la agencia (valida su saldo) y suma a la sub
                await _mover_cc(conn, agencia_code, -monto, "transferencia",
                                f"A sub-agencia {code}", agencia_code,
                                contra=code, validar=True)
                nuevo_sub = await _mover_cc(conn, code, monto, "recibido",
                                f"De {agencia_code}", agencia_code,
                                contra=agencia_code, validar=False)
            else:
                # RETIRAR: saca de la sub (valida el saldo de la sub) y devuelve a la agencia
                nuevo_sub = await _mover_cc(conn, code, monto, "retiro",
                                f"Retiro de {agencia_code}", agencia_code,
                                contra=agencia_code, validar=True)
                await _mover_cc(conn, agencia_code, -monto, "recibido",
                                f"Retiro de sub-agencia {code}", agencia_code,
                                contra=code, validar=False)
    return {"ok": True, "saldo_sub": nuevo_sub}


@app.get("/api/agencias/me/cc")
async def mi_cc(agencia_code: str = Depends(requiere_agencia)):
    """Saldo CC de la agencia y sus últimos movimientos."""
    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT saldo_cc, moneda FROM agencias WHERE code=$1", agencia_code)
        movs = await conn.fetch("""
            SELECT tipo, monto, saldo_luego, detalle, contra_code, created_at
            FROM cc_movimientos WHERE agencia_code=$1
            ORDER BY created_at DESC LIMIT 30
        """, agencia_code)
    return {
        "saldo_cc": float(ag["saldo_cc"] or 0) if ag else 0,
        "moneda": ag["moneda"] if ag else "ARS",
        "movimientos": [{
            "tipo": m["tipo"], "monto": float(m["monto"]),
            "saldo": float(m["saldo_luego"] or 0),
            "detalle": m["detalle"], "contra": m["contra_code"],
            "fecha": m["created_at"].strftime("%d/%m %H:%M") if m["created_at"] else "",
        } for m in movs],
    }


# ── FICHA DE CLIENTE (admin y agencia) ────────────────────────
async def _ficha_cliente(conn, user_id):
    """Arma la ficha completa: datos, saldo, rendimiento, apuestas."""
    u = await conn.fetchrow("""
        SELECT id, nombre_completo, username, telefono, balance,
               creado_por, bloqueado, bloqueado_por, created_at
        FROM users WHERE id=$1
    """, user_id)
    if not u:
        return None
    # Apuestas del cliente
    bets = await conn.fetch("""
        SELECT code, stake, odd_total, potential_win, status, created_at
        FROM betslips WHERE user_id=$1
        ORDER BY created_at DESC LIMIT 50
    """, user_id)
    # Rendimiento
    total_apostado = 0; total_ganado = 0
    n_gan = n_perd = n_pend = 0
    for b in bets:
        stake = (b["stake"] or 0)
        total_apostado += stake
        st = (b["status"] or "").lower()
        if st in ("won","ganada","ganado"):
            total_ganado += (b["potential_win"] or 0); n_gan += 1
        elif st in ("lost","perdida","perdido"):
            n_perd += 1
        elif st in ("pending","pendiente","active"):
            n_pend += 1
    neto = total_ganado - total_apostado   # desde la óptica de la casa: -neto
    ag = await conn.fetchrow("SELECT name FROM agencias WHERE code=$1", u["creado_por"])
    return {
        "id": u["id"],
        "nombre": u["nombre_completo"] or u["username"] or "—",
        "telefono": u["telefono"],
        "saldo": (u["balance"] or 0) // 100,
        "agencia": u["creado_por"] or "—",
        "agencia_nombre": ag["name"] if ag else "—",
        "es_directo": not u["creado_por"],
        "bloqueado": bool(u["bloqueado"]),
        "bloqueado_por": u["bloqueado_por"],
        "creado": u["created_at"].strftime("%d/%m/%Y") if u["created_at"] else "",
        "rendimiento": {
            "apostado": total_apostado,
            "ganado": total_ganado,
            "neto_cliente": total_ganado - total_apostado,
            "ganadas": n_gan, "perdidas": n_perd, "pendientes": n_pend,
        },
        "apuestas": [{
            "code": b["code"], "stake": b["stake"] or 0,
            "odd": float(b["odd_total"] or 0),
            "premio": b["potential_win"] or 0,
            "status": b["status"],
            "fecha": b["created_at"].strftime("%d/%m %H:%M") if b["created_at"] else "",
        } for b in bets],
    }


@app.get("/api/admin/clientes/{user_id}")
async def admin_ficha_cliente(user_id: int, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        ficha = await _ficha_cliente(conn, user_id)
    if not ficha:
        raise HTTPException(404, "Cliente no encontrado")
    return ficha


@app.get("/api/agencias/me/clientes/{user_id}")
async def agencia_ficha_cliente(user_id: int,
                                agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        # La agencia solo ve clientes de su rama hacia abajo
        u = await conn.fetchrow("SELECT creado_por FROM users WHERE id=$1", user_id)
        if not u:
            raise HTTPException(404, "Cliente no encontrado")
        rama = await codes_de_la_rama(conn, agencia_code)
        if u["creado_por"] not in rama:
            raise HTTPException(403, "Ese cliente no es de tu rama")
        ficha = await _ficha_cliente(conn, user_id)
    return ficha


# ── CARGAR / RETIRAR (admin, a cualquier cliente del árbol) ──
@app.post("/api/admin/clientes/{user_id}/agencia")
async def admin_asignar_agencia(user_id: int, request: Request,
                                _=Depends(auth.require_admin)):
    """El admin asigna o cambia la agencia de un cliente (sin restricción).
    body: {agencia_code} (o vacío para dejarlo directo)"""
    body = await request.json()
    code = (body.get("agencia_code") or "").upper() or None
    pool = await get_db()
    async with pool.acquire() as conn:
        if code:
            existe = await conn.fetchval("SELECT 1 FROM agencias WHERE code=$1", code)
            if not existe:
                raise HTTPException(404, "Agencia no encontrada")
            # Heredar la moneda de la agencia
            mon = await conn.fetchval("SELECT moneda FROM agencias WHERE code=$1", code)
            await conn.execute(
                "UPDATE users SET creado_por=$2, moneda=COALESCE($3, moneda) WHERE id=$1",
                user_id, code, mon)
        else:
            await conn.execute(
                "UPDATE users SET creado_por=NULL WHERE id=$1", user_id)
    return {"ok": True, "agencia": code}


@app.post("/api/agencias/me/absorber-cliente")
async def agencia_absorber_cliente(request: Request,
                                   agencia_code: str = Depends(requiere_agencia)):
    """La agencia vincula un cliente directo (que se presentó en mostrador).
    Solo si el cliente NO está vinculado a ninguna agencia todavía.
    body: {user_id} o {telefono} o {documento}"""
    body = await request.json()
    user_id = body.get("user_id")
    telefono = "".join(ch for ch in (body.get("telefono") or "") if ch.isdigit())
    documento = (body.get("documento") or "").strip()

    pool = await get_db()
    async with pool.acquire() as conn:
        # Buscar el cliente
        if user_id:
            cli = await conn.fetchrow(
                "SELECT id, creado_por, moneda FROM users WHERE id=$1", int(user_id))
        elif telefono:
            cli = await conn.fetchrow("""
                SELECT id, creado_por, moneda FROM users
                WHERE regexp_replace(COALESCE(telefono,''), '[^0-9]', '', 'g')=$1
                LIMIT 1
            """, telefono)
        elif documento:
            cli = await conn.fetchrow(
                "SELECT id, creado_por, moneda FROM users WHERE documento=$1", documento)
        else:
            raise HTTPException(400, "Indicá user_id, teléfono o documento")

        if not cli:
            raise HTTPException(404, "Cliente no encontrado")
        # Solo se puede absorber si NO está vinculado a otra agencia
        if cli["creado_por"]:
            raise HTTPException(409,
                "Este cliente ya está vinculado a una agencia. Solo el admin puede cambiarlo.")
        # Vincular: hereda la moneda de la agencia
        mon = await conn.fetchval("SELECT moneda FROM agencias WHERE code=$1", agencia_code)
        # Validar que la moneda coincida (si el cliente ya tenía una)
        if cli["moneda"] and mon and cli["moneda"] != mon:
            raise HTTPException(409,
                f"El cliente opera en {cli['moneda']} y la agencia en {mon}. No se puede vincular.")
        await conn.execute(
            "UPDATE users SET creado_por=$2, moneda=COALESCE(moneda,$3) WHERE id=$1",
            cli["id"], agencia_code, mon)
    return {"ok": True, "user_id": cli["id"], "agencia": agencia_code}


@app.post("/api/admin/clientes/{user_id}/moneda")
async def admin_corregir_moneda(user_id: int, request: Request,
                                _=Depends(auth.require_admin)):
    """El admin corrige la moneda de un usuario (por si se creó mal)."""
    body = await request.json()
    moneda = (body.get("moneda") or "").strip().upper()[:4]
    if not moneda:
        raise HTTPException(400, "Falta la moneda")
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE users SET moneda=$2 WHERE id=$1", user_id, moneda)
    return {"ok": True, "user_id": user_id, "moneda": moneda}


@app.post("/api/admin/clientes/{user_id}/saldo")
async def admin_cargar_saldo(user_id: int, request: Request,
                             _=Depends(auth.require_admin)):
    body = await request.json()
    try:
        monto = int(body.get("monto"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    if monto == 0:
        raise HTTPException(400, "El monto no puede ser cero")
    if abs(monto) > 5_000_000:
        raise HTTPException(400, "Monto fuera de rango")
    detalle = (body.get("detalle") or "").strip()[:200] or None

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            u = await conn.fetchrow(
                "SELECT id, balance, creado_por FROM users WHERE id=$1 FOR UPDATE",
                user_id)
            if not u:
                raise HTTPException(404, "Cliente no encontrado")
            nuevo = (u["balance"] or 0) + monto * 100
            if nuevo < 0:
                raise HTTPException(400, "Saldo insuficiente para el retiro")
            await conn.execute("UPDATE users SET balance=$2 WHERE id=$1",
                               user_id, nuevo)
            # Queda registrado que lo hizo el admin
            await conn.execute("""
                INSERT INTO agencia_movimientos
                    (agencia_code, tipo, user_id, monto, detalle, operador)
                VALUES ($1, $2, $3, $4, $5, 'admin')
            """, u["creado_por"] or "admin",
                 "carga" if monto > 0 else "retiro",
                 user_id, abs(monto), detalle)
    return {"ok": True, "saldo": nuevo // 100,
            "movimiento": "carga" if monto > 0 else "retiro"}


# ── BLOQUEO EN CASCADA (agencias y clientes) ──────────────────
async def _registrar_bloqueo(conn, quien, objetivo, tipo_obj, accion,
                             motivo=None, cascada=False):
    await conn.execute("""
        INSERT INTO bloqueos_log (quien, objetivo, tipo_obj, accion, motivo, cascada)
        VALUES ($1,$2,$3,$4,$5,$6)
    """, quien, objetivo, tipo_obj, accion, motivo, cascada)


async def _bloquear_cliente(conn, user_id, quien, bloquear, motivo=None):
    await conn.execute("""
        UPDATE users SET bloqueado=$2,
            bloqueado_por=CASE WHEN $2 THEN $3 ELSE NULL END,
            bloqueado_motivo=CASE WHEN $2 THEN $4 ELSE NULL END,
            bloqueado_at=CASE WHEN $2 THEN NOW() ELSE NULL END
        WHERE id=$1
    """, user_id, bloquear, quien, motivo)


async def _bloquear_agencia(conn, code, quien, bloquear, cascada, motivo=None):
    estado = "suspended" if bloquear else "active"
    if cascada:
        # toda la rama hacia abajo
        codes = await codes_de_la_rama(conn, code)
        await conn.execute("""
            UPDATE agencias SET status=$2,
                bloqueado_por=CASE WHEN $2='suspended' THEN $3 ELSE NULL END,
                bloqueado_motivo=CASE WHEN $2='suspended' THEN $4 ELSE NULL END
            WHERE code = ANY($1)
        """, codes, estado, quien, motivo)
        # también los clientes de esas agencias
        await conn.execute("""
            UPDATE users SET bloqueado=$2,
                bloqueado_por=CASE WHEN $2 THEN $3 ELSE NULL END,
                bloqueado_motivo=CASE WHEN $2 THEN $4 ELSE NULL END,
                bloqueado_at=CASE WHEN $2 THEN NOW() ELSE NULL END
            WHERE creado_por = ANY($1)
        """, codes, bloquear, quien, motivo)
    else:
        await conn.execute("""
            UPDATE agencias SET status=$2,
                bloqueado_por=CASE WHEN $2='suspended' THEN $3 ELSE NULL END,
                bloqueado_motivo=CASE WHEN $2='suspended' THEN $4 ELSE NULL END
            WHERE code=$1
        """, code, estado, quien, motivo)


@app.get("/api/admin/bloqueos")
async def admin_bloqueos(_=Depends(auth.require_admin)):
    """Historial de bloqueos/desbloqueos: quién, a quién, cuándo, motivo."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT quien, objetivo, tipo_obj, accion, motivo, cascada, created_at
            FROM bloqueos_log ORDER BY created_at DESC LIMIT 200
        """)
        # Resolver nombres: si es cliente, buscar en users; si agencia, en agencias
        out = []
        for r in rows:
            nombre = r["objetivo"]
            if r["tipo_obj"] == "cliente":
                u = await conn.fetchrow(
                    "SELECT nombre_completo FROM users WHERE id::text=$1", r["objetivo"])
                if u and u["nombre_completo"]: nombre = u["nombre_completo"]
            else:
                a = await conn.fetchrow(
                    "SELECT name FROM agencias WHERE code=$1", r["objetivo"])
                if a and a["name"]: nombre = a["name"]
            out.append({
                "quien": r["quien"], "objetivo": r["objetivo"], "nombre": nombre,
                "tipo": r["tipo_obj"], "accion": r["accion"],
                "motivo": r["motivo"], "cascada": r["cascada"],
                "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            })
    return {"bloqueos": out}


@app.get("/api/agencias/me/clientes-rama")
async def agencia_clientes_rama(agencia_code: str = Depends(requiere_agencia)):
    """Lista los clientes de toda la rama de la agencia (para filtros)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        rows = await conn.fetch("""
            SELECT id, nombre_completo, username, creado_por
            FROM users WHERE creado_por = ANY($1)
            ORDER BY nombre_completo NULLS LAST
        """, rama)
    return {"clientes": [{
        "id": r["id"], "nombre": r["nombre_completo"] or r["username"] or "—",
        "agencia": r["creado_por"],
    } for r in rows]}


@app.get("/api/agencias/me/bloqueos")
async def agencia_bloqueos(agencia_code: str = Depends(requiere_agencia)):
    """Historial de bloqueos hechos por la rama de la agencia."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        rows = await conn.fetch("""
            SELECT quien, objetivo, tipo_obj, accion, motivo, cascada, created_at
            FROM bloqueos_log
            WHERE quien = ANY($1)
            ORDER BY created_at DESC LIMIT 200
        """, rama)
        out = []
        for r in rows:
            nombre = r["objetivo"]
            if r["tipo_obj"] == "cliente":
                u = await conn.fetchrow(
                    "SELECT nombre_completo FROM users WHERE id::text=$1", r["objetivo"])
                if u and u["nombre_completo"]: nombre = u["nombre_completo"]
            else:
                a = await conn.fetchrow(
                    "SELECT name FROM agencias WHERE code=$1", r["objetivo"])
                if a and a["name"]: nombre = a["name"]
            out.append({
                "quien": r["quien"], "objetivo": r["objetivo"], "nombre": nombre,
                "tipo": r["tipo_obj"], "accion": r["accion"],
                "motivo": r["motivo"], "cascada": r["cascada"],
                "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
            })
    return {"bloqueos": out}


# ── INFLUENCER — panel propio (combos + comisiones) ───────────
@app.get("/api/influencer/me")
async def influencer_me(desde: str = "", hasta: str = "",
                        agencia_code: str = Depends(requiere_agencia)):
    """
    Panel del influencer: sus combos y las jugadas firmadas (por combo o
    por su código de referido), con el cálculo de su comisión.
    """
    from datetime import date as _date
    hoy = _date.today()
    if not desde: desde = hoy.isoformat()
    if not hasta: hasta = hoy.isoformat()
    d1 = _date.fromisoformat(desde); d2 = _date.fromisoformat(hasta)

    pool = await get_db()
    async with pool.acquire() as conn:
        yo = await conn.fetchrow("""
            SELECT code, name, codigo_ref, pct_ggr, pct_ventas, tipo
            FROM agencias WHERE code=$1
        """, agencia_code)
        if not yo or (yo["tipo"] or "") != "influencer":
            raise HTTPException(403, "Solo para influencers")

        # Sus combos
        combos = await conn.fetch("""
            SELECT id, nombre, odd_total, fuente, visible, created_at
            FROM combos_manuales WHERE influencer_code=$1
            ORDER BY created_at DESC LIMIT 100
        """, agencia_code)

        # Jugadas firmadas (por combo o por código de referido)
        apostado = await conn.fetchval("""
            SELECT COALESCE(SUM(stake),0) FROM betslips
            WHERE influencer_code=$1
              AND created_at::date>=$2 AND created_at::date<=$3
        """, agencia_code, d1, d2) or 0
        premios = await conn.fetchval("""
            SELECT COALESCE(SUM(potential_win),0) FROM betslips
            WHERE influencer_code=$1 AND lower(status) IN ('won','ganada','paid')
              AND created_at::date>=$2 AND created_at::date<=$3
        """, agencia_code, d1, d2) or 0
        n_jugadas = await conn.fetchval("""
            SELECT COUNT(*) FROM betslips
            WHERE influencer_code=$1
              AND created_at::date>=$2 AND created_at::date<=$3
        """, agencia_code, d1, d2) or 0

    apostado = float(apostado); premios = float(premios)
    ggr = apostado - premios
    pg = float(yo["pct_ggr"] or 0); pv = float(yo["pct_ventas"] or 0)
    com = round(ggr * pg / 100 + apostado * pv / 100, 2)

    return {
        "code": yo["code"], "name": yo["name"], "codigo_ref": yo["codigo_ref"],
        "pct_ggr": pg, "pct_ventas": pv,
        "desde": desde, "hasta": hasta,
        "resumen": {
            "apostado": apostado, "premios": premios, "ggr": ggr,
            "jugadas": n_jugadas, "comision": com,
        },
        "combos": [{
            "id": c["id"], "nombre": c["nombre"], "odd": float(c["odd_total"] or 0),
            "fuente": c["fuente"] or "manual", "visible": c["visible"],
            "fecha": c["created_at"].strftime("%d/%m/%Y %H:%M") if c["created_at"] else "",
        } for c in combos],
    }


@app.post("/api/bloquear")
async def bloquear(request: Request):
    """
    Bloquea/desbloquea una agencia o cliente que esté debajo del que pide.
    Autenticación: admin (X-Admin-Key) o agencia (token). Registra quién.
    body: {tipo:'cliente'|'agencia', objetivo:id|code, bloquear:bool, cascada:bool}
    """
    body = await request.json()
    tipo = body.get("tipo")
    bloquear_flag = bool(body.get("bloquear", True))
    cascada = bool(body.get("cascada", False))
    motivo = (body.get("motivo") or "").strip()[:200] or None

    # ¿Quién pide? admin o agencia
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    quien = "admin"
    ag_solicitante = None
    if not es_admin:
        token = request.headers.get("Authorization","").replace("Bearer ","")
        ag_solicitante = await sesion_buscar(token) if token else None
        if not ag_solicitante:
            raise HTTPException(401, "No autorizado")
        quien = ag_solicitante

    pool = await get_db()
    async with pool.acquire() as conn:
        if tipo == "cliente":
            user_id = int(body.get("objetivo"))
            u = await conn.fetchrow("SELECT creado_por FROM users WHERE id=$1", user_id)
            if not u:
                raise HTTPException(404, "Cliente no encontrado")
            # Permiso: admin siempre; agencia solo si el cliente es de su rama
            if not es_admin:
                rama = await codes_de_la_rama(conn, ag_solicitante)
                if u["creado_por"] not in rama:
                    raise HTTPException(403, "Ese cliente no es de tu rama")
            await _bloquear_cliente(conn, user_id, quien, bloquear_flag, motivo)
            await _registrar_bloqueo(conn, quien, str(user_id), "cliente",
                                     "bloqueo" if bloquear_flag else "desbloqueo",
                                     motivo)
            return {"ok": True, "bloqueado": bloquear_flag}

        elif tipo == "agencia":
            code = (body.get("objetivo") or "").upper()
            obj = await agencia_por_code(conn, code)
            if not obj:
                raise HTTPException(404, "Agencia no encontrada")
            # Permiso: admin siempre; agencia solo si está debajo suyo (no ella misma)
            if not es_admin:
                rama = await codes_de_la_rama(conn, ag_solicitante)
                if code == ag_solicitante or code not in rama:
                    raise HTTPException(403, "Solo podés bloquear agencias debajo tuyo")
            # ¿Tiene sub-agencias? (para avisar al front que pregunte cascada)
            sub = await conn.fetch(
                "SELECT code FROM agencias WHERE ruta LIKE $1",
                (obj["ruta"] or code) + "/%")
            await _bloquear_agencia(conn, code, quien, bloquear_flag, cascada, motivo)
            await _registrar_bloqueo(conn, quien, code, "agencia",
                                     "bloqueo" if bloquear_flag else "desbloqueo",
                                     motivo, cascada)
            return {"ok": True, "bloqueado": bloquear_flag,
                    "cascada": cascada, "sub_agencias": len(sub)}
        else:
            raise HTTPException(400, "Tipo inválido")


@app.get("/api/agencia/{code}/tiene-subagencias")
async def tiene_subagencias(code: str):
    """Para que el front sepa si preguntar por cascada antes de bloquear."""
    pool = await get_db()
    async with pool.acquire() as conn:
        obj = await agencia_por_code(conn, code.upper())
        if not obj:
            return {"sub": 0}
        sub = await conn.fetch(
            "SELECT code FROM agencias WHERE ruta LIKE $1",
            (obj["ruta"] or code.upper()) + "/%")
    return {"sub": len(sub)}


# ── SUB-AGENCIAS — crear desde una agencia ────────────────────
@app.post("/api/agencias/me/sub")
async def crear_subagencia(request: Request,
                           agencia_code: str = Depends(requiere_agencia)):
    """
    Una agencia crea una sub-agencia que cuelga de ella. Los porcentajes
    de la nueva no pueden superar los de la agencia que la crea (no podés
    dar más comisión de la que tenés).
    """
    body = await request.json()
    name     = (body.get("name") or "").strip()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    try:
        pct_ggr    = float(body.get("pct_ggr") or 0)
        pct_ventas = float(body.get("pct_ventas") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentajes inválidos")

    if not name or not username or not password:
        raise HTTPException(400, "Faltan datos")
    if len(password) < 8:
        raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
    permiso_nuevo = (body.get("permiso") or "solo_agencia").strip().lower()
    if permiso_nuevo not in ("solo_agencia","crea_agencias","crea_influencers","ambos"):
        permiso_nuevo = "solo_agencia"

    pool = await get_db()
    async with pool.acquire() as conn:
        padre = await agencia_por_code(conn, agencia_code)
        if not padre:
            raise HTTPException(404, "Agencia no encontrada")
        permiso = padre.get("permiso") or "ambos"
        if permiso not in ("crea_agencias", "ambos"):
            raise HTTPException(403, "Tu agencia no tiene permiso para crear sub-agencias")
        # La hija no puede tener más poder del que el padre puede delegar:
        # si el padre no crea influencers, la hija tampoco puede tener ese permiso.
        padre_crea_inf = permiso in ("crea_influencers", "ambos")
        if not padre_crea_inf and permiso_nuevo in ("crea_influencers", "ambos"):
            permiso_nuevo = "crea_agencias" if permiso_nuevo == "ambos" else "solo_agencia"
        # No puede asignar más % del que ella tiene.
        # Con comisiones en cascada esto ya no es necesario para que las
        # cuentas cierren (la madre paga de SU parte, no del bolsillo de
        # la casa). Se mantiene como política: darle a una hija más de lo
        # que tenés significa ganar menos que quien cuelga de vos, y casi
        # siempre es un error de carga. Si hace falta un caso así, lo
        # habilita el admin a mano.
        if pct_ggr > float(padre["pct_ggr"] or 0):
            raise HTTPException(400,
                f"El % GGR no puede superar el tuyo ({float(padre['pct_ggr'] or 0)}%). "
                f"La comisión de tu sub-agencia sale de tu parte.")
        if pct_ventas > float(padre["pct_ventas"] or 0):
            raise HTTPException(400,
                f"El % de ventas no puede superar el tuyo "
                f"({float(padre['pct_ventas'] or 0)}%).")

        padre_ruta = padre["ruta"] or padre["code"]
        nivel = (padre["nivel"] or 0) + 1
        moneda = padre["moneda"] or "ARS"
        count = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        code = f"AGE{str(count+1).zfill(3)}"
        ruta = f"{padre_ruta}/{code}"
        try:
            await conn.execute("""
                INSERT INTO agencias
                    (code, name, username, password_hash,
                     parent_code, ruta, nivel, pct_ggr, pct_ventas, moneda,
                     debe_cambiar_pass, permiso)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
            """, code, name, username, auth.hash_password(password),
                 agencia_code, ruta, nivel, pct_ggr, pct_ventas, moneda, permiso_nuevo)
        except Exception:
            raise HTTPException(409, "Ese usuario ya existe")
    return {"code":code, "name":name, "nivel":nivel, "moneda":moneda}


@app.get("/api/agencias/me/arbol")
async def mi_arbol(agencia_code: str = Depends(requiere_agencia)):
    """Devuelve la rama hacia abajo de esta agencia (sus sub-agencias)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        yo = await agencia_por_code(conn, agencia_code)
        if not yo:
            raise HTTPException(404, "Agencia no encontrada")
        ruta = yo["ruta"] or yo["code"]
        # Todas las AGENCIAS que cuelgan de mí (sin incluirme, y SIN influencers)
        rows = await conn.fetch("""
            SELECT code, name, username, nivel, parent_code,
                   pct_ggr, pct_ventas, moneda, saldo_cc, status
            FROM agencias
            WHERE ruta LIKE $1
              AND COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY ruta
        """, ruta + "/%")
    return {"agencias": [dict(r) for r in rows], "moneda": yo["moneda"]}


# ── AGENCIAS — ACTUALIZAR (solo admin) ────────────────────────
@app.post("/api/cuenta/{code}/configurar")
async def configurar_cuenta(code: str, request: Request):
    """
    Edición completa de una cuenta ya creada (agencia/sub/influencer).
    El usuario NO se toca. Todo lo demás sí: nombre, contacto, %,
    alcance (influencer), estado.
    Admin (X-Admin-Key) edita cualquiera; una agencia (Bearer) edita
    los de su rama. El % no puede superar el del padre.
    """
    code = code.upper()
    body = await request.json()
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)

    pool = await get_db()
    async with pool.acquire() as conn:
        obj = await conn.fetchrow("SELECT * FROM agencias WHERE code=$1", code)
        if not obj:
            raise HTTPException(404, "Cuenta no encontrada")

        # Permisos: admin cualquiera; agencia solo su rama (y no a sí misma)
        if not es_admin:
            token = request.headers.get("Authorization","").replace("Bearer ","")
            solicitante = await sesion_buscar(token) if token else None
            if not solicitante:
                raise HTTPException(401, "No autorizado")
            rama = await codes_de_la_rama(conn, solicitante)
            if code == solicitante or code not in rama:
                raise HTTPException(403, "Esa cuenta no es de tu rama")

        # Valores nuevos (o los actuales si no vienen)
        name    = (body.get("name")    if body.get("name")    is not None else obj["name"])
        address = (body.get("address") if body.get("address") is not None else obj["address"])
        phone   = (body.get("phone")   if body.get("phone")   is not None else obj["phone"])
        status  = (body.get("status")  if body.get("status")  is not None else obj["status"])

        # Porcentajes con validación contra el padre
        try:
            pct_ggr    = float(body.get("pct_ggr",    obj["pct_ggr"]    or 0))
            pct_ventas = float(body.get("pct_ventas", obj["pct_ventas"] or 0))
        except (TypeError, ValueError):
            raise HTTPException(400, "Porcentajes inválidos")
        if not (0 <= pct_ggr <= 100) or not (0 <= pct_ventas <= 100):
            raise HTTPException(400, "Los porcentajes deben estar entre 0 y 100")
        # No superar el % del padre (salvo que el padre sea el admin: sin límite)
        parent = obj["parent_code"]
        if parent:
            padre = await conn.fetchrow(
                "SELECT pct_ggr, pct_ventas FROM agencias WHERE code=$1", parent)
            if padre:
                if pct_ggr > float(padre["pct_ggr"] or 0):
                    raise HTTPException(400,
                        f"El % GGR no puede superar el del padre ({float(padre['pct_ggr'] or 0)}%)")
                if pct_ventas > float(padre["pct_ventas"] or 0):
                    raise HTTPException(400,
                        f"El % de ventas no puede superar el del padre ({float(padre['pct_ventas'] or 0)}%)")

        # Alcance (solo aplica a influencers)
        es_influencer = (obj["tipo"] == "influencer")
        alcance = obj["alcance"]
        if es_influencer and body.get("alcance"):
            a = str(body.get("alcance")).strip().lower()
            if a in ("solo_agencia", "rama", "global"):
                alcance = a

        # Permiso (solo agencias, no influencers)
        permiso = obj.get("permiso") or "ambos"
        if not es_influencer and body.get("permiso"):
            pp = str(body.get("permiso")).strip().lower()
            if pp in ("solo_agencia","crea_agencias","crea_influencers","ambos"):
                permiso = pp

        await conn.execute("""
            UPDATE agencias
            SET name=$2, address=$3, phone=$4, status=$5,
                pct_ggr=$6, pct_ventas=$7, alcance=$8, permiso=$9
            WHERE code=$1
        """, code, name, address, phone, status, pct_ggr, pct_ventas, alcance, permiso)

        # Si bajás el % de un padre por debajo del de algún hijo, se avisa (no se fuerza)
        hijos_sobre = await conn.fetch("""
            SELECT code, name, pct_ggr, pct_ventas FROM agencias
            WHERE parent_code=$1 AND (pct_ggr > $2 OR pct_ventas > $3)
        """, code, pct_ggr, pct_ventas)

    return {"ok": True, "code": code, "pct_ggr": pct_ggr, "pct_ventas": pct_ventas,
            "alcance": alcance, "status": status, "permiso": permiso,
            "hijos_sobre_limite": [dict(h) for h in hijos_sobre]}


@app.put("/api/agencias/{code}")
async def update_agencia(code: str, request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agencias WHERE code=$1", code)
        if not row:
            raise HTTPException(status_code=404, detail="Agencia no encontrada")
        name    = body.get("name",    row["name"])
        address = body.get("address", row["address"])
        phone   = body.get("phone",   row["phone"])
        status  = body.get("status",  row["status"])
        password= body.get("password")
        if password:
            if len(password) < 8:
                raise HTTPException(status_code=400,
                    detail="La contraseña debe tener al menos 8 caracteres")
            await conn.execute("""
                UPDATE agencias SET name=$2,address=$3,
                    phone=$4,status=$5,password_hash=$6 WHERE code=$1
            """, code, name, address, phone, status, auth.hash_password(password))
        else:
            await conn.execute("""
                UPDATE agencias SET name=$2,address=$3,
                    phone=$4,status=$5 WHERE code=$1
            """, code, name, address, phone, status)
    return {"success":True}

# ── AGENCIAS — STATS (cada agencia ve solo las suyas) ─────────
@app.get("/api/agencias/{code}/stats")
async def agencia_stats(code: str, dias: int=30,
                        agencia_code: str = Depends(requiere_agencia)):
    if code != agencia_code:
        raise HTTPException(status_code=403,
            detail="No podés ver las estadísticas de otra agencia")
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                COUNT(*) as tickets,
                COUNT(*) FILTER (WHERE tipo='bot') as tickets_bot,
                COUNT(*) FILTER (WHERE tipo='manual') as tickets_manual,
                COALESCE(SUM(stake),0) as cobrado,
                COALESCE(SUM(potential_win),0) as retorno_pot
            FROM agencia_tickets
            WHERE agencia_code=$1
              AND created_at > NOW() - ($2 || ' days')::interval
        """, code, str(dias))
    return dict(row)

# ── BETSLIP — GET (solo agencias logueadas) ───────────────────
@app.get("/api/betslip/{code}")
async def get_betslip(code: str, _agencia: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT b.*, u.username, u.first_name
            FROM betslips b
            LEFT JOIN users u ON u.id=b.user_id
            WHERE b.code=$1
        """, code.upper())
    if not row:
        raise HTTPException(status_code=404, detail="Codigo no encontrado")
    if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Codigo expirado")
    try:
        picks = ast.literal_eval(row["picks"])
    except:
        picks = []
    return {
        "code":          row["code"],
        "user":          f"@{row['username']}" if row["username"] else row["first_name"] or "Usuario",
        "status":        row["status"],
        "picks":         picks,
        "stake":         row["stake"],
        "odd_total":     float(row["odd_total"]),
        "potential_win": row["potential_win"],
        "inf_code":      row["inf_code"],
        "created_at":    row["created_at"].strftime("%d/%m/%Y %H:%M") if row["created_at"] else "",
        "expires_at":    row["expires_at"].strftime("%d/%m/%Y %H:%M") if row["expires_at"] else "",
        "paid_at":       row["paid_at"].strftime("%d/%m/%Y %H:%M") if row["paid_at"] else None,
    }

# ── BETSLIP — PAY (solo agencias logueadas) ───────────────────
@app.post("/api/betslip/{code}/pay")
async def pay_betslip(code: str, request: Request,
                      agencia_code: str = Depends(requiere_agencia)):
    body = await request.json()
    # El monto lo valida el servidor: nunca se confía en el cliente.
    try:
        stake = int(body.get("stake", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Monto inválido")

    pool = await get_db()
    async with pool.acquire() as conn:
        # Límites configurables (por agencia/rama/global). Caen a las constantes
        # si no hay nada configurado.
        lim = await _limite_efectivo(conn, agencia_code)
        min_ap = lim.get("monto_min") if lim.get("monto_min") is not None else MIN_STAKE
        max_ap = lim.get("monto_max") if lim.get("monto_max") is not None else MAX_STAKE
        pago_max = lim.get("pago_max")
        if stake < min_ap or stake > max_ap:
            raise HTTPException(status_code=400,
                detail=f"El monto debe estar entre ${min_ap:,} y ${max_ap:,}".replace(",","."))

        # La transacción + FOR UPDATE evitan que el mismo boleto
        # se cobre dos veces si llegan dos requests a la vez.
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM betslips WHERE code=$1 FOR UPDATE", code.upper())
            if not row:
                raise HTTPException(status_code=404, detail="Codigo no encontrado")
            if row["status"] == "active":
                raise HTTPException(status_code=409, detail="Ya fue pagado")
            if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="Codigo expirado")
            # Pago máximo: NO se rechaza; se topea el premio al máximo.
            # Si el boleto lleva firma de influencer, validar que esta agencia
            # esté dentro del alcance de ese influencer (si no, se rechaza).
            firma_bol = row["influencer_code"] if "influencer_code" in row else None
            if firma_bol:
                await _validar_alcance(conn, firma_bol, agencia_code)

            pot_win = round(stake * float(row["odd_total"]))
            # Topear al pago máximo si está configurado
            topeado = False
            if pago_max is not None and pot_win > pago_max:
                pot_win = int(pago_max); topeado = True
            # La agencia recibió el efectivo del cliente: pasa a
            # deberle esa plata a la casa. Va ANTES de marcar el
            # boleto para que, si no tiene saldo, no quede vendido.
            await _cc_por_venta(conn, agencia_code, stake, code.upper())

            await conn.execute("""
                UPDATE betslips
                SET status='active', stake=$2, potential_win=$3,
                    paid_at=NOW(), paid_by=$4
                WHERE code=$1
            """, code.upper(), stake, pot_win, agencia_code)
            await conn.execute("""
                INSERT INTO sports_bets
                    (user_id,picks,stake,odd_total,potential_win,status,mode)
                VALUES ($1,$2,$3,$4,$5,'active','local')
            """, row["user_id"], row["picks"], stake, row["odd_total"], pot_win)
            await conn.execute("""
                INSERT INTO agencia_tickets
                    (agencia_code,betslip_code,tipo,stake,potential_win)
                VALUES ($1,$2,'bot',$3,$4)
            """, agencia_code, code.upper(), stake, pot_win)
    return {
        "success":True, "code":code.upper(),
        "stake":stake, "odd_total":float(row["odd_total"]),
        "potential_win":pot_win,
        "topeado": topeado,
        "aviso_tope": (f"El premio máximo a cobrar es ${pot_win:,}".replace(",",".")
                       if topeado else None),
    }

# ── RESERVAS ESPERANDO PAGO ───────────────────────────────────
# Los boletos que los clientes armaron y todavía no fueron a pagar.
# El cajero los ve llegar en vivo y los cobra sin que el cliente tenga
# que dictarle el código.
#
# Se muestran los de la rama de la agencia, más los que todavía no
# tienen agencia asignada (armados desde el bot o el sitio público):
# esos los puede cobrar cualquiera, y es justamente el embudo que
# hace que un cliente digital termine entrando a un local.

@app.get("/api/agencias/me/reservas")
async def reservas_pendientes(limite: int = 40,
                              agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        yo = await conn.fetchrow(
            "SELECT code, ruta FROM agencias WHERE code=$1", agencia_code)
        if not yo:
            raise HTTPException(404, "Agencia no encontrada")
        rama = await conn.fetch("""
            SELECT code FROM agencias
            WHERE code=$1 OR ruta LIKE $2
        """, agencia_code, (yo["ruta"] or yo["code"]) + "/%")
        codes = [r["code"] for r in rama]

        filas = await conn.fetch("""
            SELECT b.code, b.picks, b.stake, b.odd_total, b.potential_win,
                   b.created_at, b.expires_at, b.user_id,
                   b.terminal_codigo,
                   t.nombre AS terminal_nombre,
                   u.nombre_completo, u.username, u.creado_por
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            LEFT JOIN terminales t ON t.codigo = b.terminal_codigo
            WHERE b.status = 'pending'
              AND (b.expires_at IS NULL OR b.expires_at > NOW())
              AND (
                -- Clientes de la propia red. Antes se incluían los
                -- boletos sin agencia como "embudo", pero ver la
                -- reserva no hace que el cliente vaya a ese local y
                -- ensucia los cierres.
                u.creado_por = ANY($1)
                -- Y los que salieron de una terminal de esta agencia:
                -- no tienen cliente, pero se cobran acá.
                OR t.agencia_code = ANY($1)
              )
            ORDER BY b.created_at DESC
            LIMIT $2
        """, codes, max(1, min(limite, 100)))

    salida = []
    for f in filas:
        try:
            picks = ast.literal_eval(f["picks"]) if isinstance(f["picks"], str) \
                    else (f["picks"] or [])
        except (ValueError, SyntaxError):
            picks = []
        resumen = " + ".join(
            str(p.get("sel") or "")[:28] for p in picks[:2]) or "—"
        if len(picks) > 2:
            resumen += f" +{len(picks)-2}"
        salida.append({
            "code": f["code"],
            "cliente": (f["nombre_completo"] or f["username"]
                        or (f"Terminal · {f['terminal_nombre']}"
                            if f["terminal_nombre"] else "Sin cliente")),
            "de_mi_rama": bool(f["creado_por"] and f["creado_por"] in codes),
            # De qué pantalla del local salió, si vino de una terminal
            "terminal": f["terminal_nombre"],
            "terminal_codigo": f["terminal_codigo"],
            "picks": len(picks),
            "resumen": resumen,
            "odd_total": float(f["odd_total"] or 0),
            "stake": float(f["stake"] or 0),
            "potential_win": float(f["potential_win"] or 0),
            "hace": _hace_cuanto(f["created_at"]),
            "creado": _fecha_local(f["created_at"]),
            "vence": _fecha_local(f["expires_at"]) if f["expires_at"] else None,
        })
    return {"reservas": salida, "total": len(salida)}


def _hace_cuanto(dt):
    """'hace 3 min' — el cajero necesita saber si es reciente."""
    if not dt:
        return ""
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        seg = (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return ""
    if seg < 60:
        return "recién"
    if seg < 3600:
        return f"hace {int(seg//60)} min"
    if seg < 86400:
        return f"hace {int(seg//3600)} h"
    return f"hace {int(seg//86400)} d"


# ═══════════════════════════════════════════════════════════════
# CONTROL DE RIESGO DEL SISTEMA
# ═══════════════════════════════════════════════════════════════
# Detecta los patrones con los que un jugador puede sacarle ventaja
# sistemática a la casa. No son apuestas ganadoras sueltas — eso es
# parte del negocio — sino comportamientos que indican que alguien
# está explotando algo: cuotas mal puestas, bonos, o coordinación
# entre cuentas.
#
# CÓMO FUNCIONA: cada regla mira una ventana de tiempo y devuelve
# alertas con su evidencia. Las alertas se guardan con una huella
# única para no repetir el mismo hallazgo en cada pasada.
#
# QUÉ NO HACE: bloquear automáticamente. Una detección puede ser un
# falso positivo, y cancelarle la cuenta a un cliente legítimo cuesta
# más que la pérdida que se evita. El motor avisa; la decisión de
# limitar o suspender la toma una persona.

SEVERIDADES = {"baja": 1, "media": 2, "alta": 3, "critica": 4}


def _huella_alerta(tipo, *partes):
    """Identifica un hallazgo para no duplicarlo en cada pasada."""
    base = tipo + "|" + "|".join(str(p) for p in partes)
    return hashlib.sha256(base.encode()).hexdigest()[:32]


async def _guardar_alerta(conn, tipo, severidad, titulo, detalle,
                          evidencia=None, user_id=None, agencia=None,
                          betslip=None, monto=0, huella_partes=()):
    """Registra una alerta. Si ya existe la misma huella, no la repite."""
    huella = _huella_alerta(tipo, *huella_partes)
    try:
        await conn.execute("""
            INSERT INTO riesgo_alertas
                (tipo, severidad, titulo, detalle, evidencia, user_id,
                 agencia_code, betslip_code, monto, huella)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (huella) DO NOTHING
        """, tipo, severidad, titulo[:200], detalle,
             json.dumps(evidencia or {}, default=str), user_id, agencia,
             betslip, float(monto or 0), huella)
        # Se avisa solo si la alerta es nueva: la huella evita que el
        # mismo hallazgo mande un mensaje en cada pasada del motor.
        creada = await conn.fetchval(
            "SELECT 1 FROM riesgo_alertas WHERE huella=$1 AND "
            "created_at > NOW() - interval '30 seconds'", huella)
        if creada:
            await _avisar_riesgo(conn, tipo, severidad, titulo, detalle)
        return True
    except Exception as e:
        log.error(f"[RIESGO] no se pudo guardar alerta {tipo}: {e}")
        return False


async def _sellar_huella(conn, code, request, es_live=False,
                         terminal=None):
    """
    Guarda desde dónde se hizo la apuesta. Se llama después de crear el
    boleto para no tocar los cuatro INSERT distintos que existen.

    Nunca lanza excepción: perder la huella es un problema de análisis,
    pero fallar acá cancelaría una apuesta ya cobrada.
    """
    try:
        ip = _ip_cliente(request)
        ua = request.headers.get("user-agent", "")[:300]
        dev = _huella_dispositivo(request)
        # Cada UPDATE va en su propio savepoint: si uno falla —por
        # ejemplo porque falta una columna— no aborta la transacción
        # del boleto. Una huella sin guardar es un problema menor;
        # una apuesta que no se registra es grave.
        try:
            async with conn.transaction():
                r = await conn.execute("""
                    UPDATE betslips SET ip=$2, user_agent=$3,
                           device_hash=$4, es_live=$5,
                           terminal_codigo=COALESCE($6, terminal_codigo)
                    WHERE code=$1
                """, code, ip, ua, dev, bool(es_live),
                     (terminal or "").upper()[:16] or None)
        except Exception as e:
            log.error(f"[RIESGO] no se pudo sellar {code}: "
                      f"{type(e).__name__}: {e}")
            # Se reintenta sin las columnas nuevas, por si faltan
            try:
                async with conn.transaction():
                    r = await conn.execute("""
                        UPDATE betslips SET ip=$2, user_agent=$3,
                               device_hash=$4
                        WHERE code=$1
                    """, code, ip, ua, dev)
            except Exception:
                return
        # Si no actualizó ninguna fila, el boleto no existía todavía:
        # sin este aviso el fallo quedaba invisible.
        if r.endswith(" 0"):
            log.warning(f"[RIESGO] el boleto {code} no estaba al sellar la IP")
        else:
            log.info(f"[RIESGO] {code} sellado ip={ip} live={es_live}")
        # También en el usuario, en su propio savepoint por lo mismo
        try:
            async with conn.transaction():
                await conn.execute("""
                    UPDATE users SET ip_ultima=$2,
                           ip_registro=COALESCE(ip_registro,$2),
                           device_hash=COALESCE(device_hash,$3)
                    WHERE id=(SELECT user_id FROM betslips WHERE code=$1)
                """, code, ip, dev)
        except Exception as e:
            log.warning(f"[RIESGO] huella del usuario de {code}: {e}")
    except Exception as e:
        log.warning(f"[RIESGO] no se pudo sellar la huella de {code}: {e}")


def _picks_de(fila):
    """Los picks de un boleto, tolerando el formato de texto."""
    try:
        p = fila["picks"]
        return ast.literal_eval(p) if isinstance(p, str) else (p or [])
    except (ValueError, SyntaxError, KeyError, TypeError):
        return []


# ── REGLA 1: MULTICUENTA ──────────────────────────────────────
# Varios usuarios distintos apostando desde la misma IP o el mismo
# dispositivo. Es la base de casi todo el fraude coordinado: bonos
# múltiples, contrapartida, colusión.
#
# Ojo con los falsos positivos: en un cibercafé, un hogar o una
# agencia con wifi compartida es normal que varios jueguen desde la
# misma IP. Por eso la severidad sube con la cantidad de cuentas y se
# ignoran las apuestas cargadas desde el mostrador.
async def _detectar_multicuenta(conn, horas=72):
    alertas = 0
    filas = await conn.fetch("""
        SELECT b.ip, COUNT(DISTINCT b.user_id) AS cuentas,
               COUNT(*) AS apuestas,
               COALESCE(SUM(b.stake),0) AS total,
               ARRAY_AGG(DISTINCT b.user_id) AS ids
        FROM betslips b
        WHERE b.ip IS NOT NULL AND b.user_id IS NOT NULL
          AND b.created_at > NOW() - ($1 || ' hours')::interval
        GROUP BY b.ip
        HAVING COUNT(DISTINCT b.user_id) >= 3
        ORDER BY COUNT(DISTINCT b.user_id) DESC
        LIMIT 30
    """, str(horas))

    for f in filas:
        n = int(f["cuentas"])
        # 3-4 cuentas puede ser una familia; 8+ ya no tiene explicación inocente
        sev = "critica" if n >= 8 else ("alta" if n >= 5 else "media")
        nombres = await conn.fetch("""
            SELECT id, username, nombre_completo, creado_por
            FROM users WHERE id = ANY($1) LIMIT 12
        """, list(f["ids"] or []))
        if await _guardar_alerta(
            conn, "multicuenta", sev,
            f"{n} cuentas apostando desde la misma IP",
            f"La IP {f['ip']} registra {n} usuarios distintos con "
            f"{f['apuestas']} apuestas en {horas}h por {float(f['total']):,.0f} "
            f"en total. Puede ser una conexión compartida, pero también "
            f"multicuenta para abusar de bonos o armar contrapartida.",
            evidencia={"ip": f["ip"], "cuentas": n,
                       "apuestas": int(f["apuestas"]),
                       "usuarios": [dict(r) for r in nombres]},
            monto=float(f["total"]),
            huella_partes=(f["ip"], n, horas)):
            alertas += 1
    return alertas


# ── REGLA 2: CONTRAPARTIDA ────────────────────────────────────
# Dos usuarios apostando a lados opuestos del mismo evento en un
# intervalo corto. Si están vinculados (misma IP o misma agencia), el
# grupo gana sí o sí y la casa paga la diferencia.
#
# Es el patrón del documento: "apuestas opuestas en el mismo evento
# realizadas en intervalos muy cercanos".
async def _detectar_contrapartida(conn, horas=48):
    alertas = 0
    filas = await conn.fetch("""
        SELECT b.code, b.user_id, b.picks, b.stake, b.ip, b.created_at,
               u.nombre_completo, u.username, u.creado_por
        FROM betslips b
        LEFT JOIN users u ON u.id = b.user_id
        WHERE b.created_at > NOW() - ($1 || ' hours')::interval
          AND b.status IN ('active','won','lost','paid')
        ORDER BY b.created_at DESC
        LIMIT 1500
    """, str(horas))

    # Se indexa por evento: {event_id: [(seleccion, boleto), ...]}
    por_evento = {}
    for f in filas:
        for p in _picks_de(f):
            ev = p.get("event_id") or f"{p.get('h','')}|{p.get('a','')}"
            if not ev or ev == "|":
                continue
            por_evento.setdefault(ev, []).append((p.get("sel") or "", f))

    for ev, lista in por_evento.items():
        if len(lista) < 2:
            continue
        for i in range(len(lista)):
            sel_a, ba = lista[i]
            for j in range(i + 1, len(lista)):
                sel_b, bb = lista[j]
                # Distinta selección, distinto usuario
                if sel_a == sel_b or ba["user_id"] == bb["user_id"]:
                    continue
                if not ba["user_id"] or not bb["user_id"]:
                    continue
                # Vinculados por IP o por la misma agencia
                misma_ip = ba["ip"] and ba["ip"] == bb["ip"]
                misma_ag = ba["creado_por"] and ba["creado_por"] == bb["creado_por"]
                if not (misma_ip or misma_ag):
                    continue
                # En una ventana corta
                dt = abs((ba["created_at"] - bb["created_at"]).total_seconds())
                if dt > 1800:      # media hora
                    continue
                # Montos parecidos: el reparto calculado del arbitraje
                sa, sb = float(ba["stake"] or 0), float(bb["stake"] or 0)
                if sa <= 0 or sb <= 0:
                    continue
                ratio = min(sa, sb) / max(sa, sb)
                if ratio < 0.5:
                    continue

                sev = "critica" if (misma_ip and ratio > 0.8) else "alta"
                codes = tuple(sorted([ba["code"], bb["code"]]))
                if await _guardar_alerta(
                    conn, "contrapartida", sev,
                    "Apuestas opuestas en el mismo evento",
                    f"{ba['nombre_completo'] or ba['username']} apostó a "
                    f"'{sel_a}' y {bb['nombre_completo'] or bb['username']} a "
                    f"'{sel_b}' con {int(dt//60)} min de diferencia, montos "
                    f"{sa:,.0f} y {sb:,.0f}. "
                    + ("Comparten IP. " if misma_ip else "")
                    + ("Son de la misma agencia. " if misma_ag else "")
                    + "Gane quien gane, el grupo cobra.",
                    evidencia={"evento": ev, "boletos": list(codes),
                               "seleccion_a": sel_a, "seleccion_b": sel_b,
                               "minutos": int(dt // 60),
                               "misma_ip": bool(misma_ip),
                               "misma_agencia": bool(misma_ag)},
                    user_id=ba["user_id"], agencia=ba["creado_por"],
                    monto=sa + sb, huella_partes=codes):
                    alertas += 1
    return alertas


# ── REGLA 3: ESCALERA Y COMBINADAS DE CUOTA BAJA ──────────────
# El documento lo describe como "cuotas bajas y seguras (1.20 a 1.50)
# de forma consecutiva". Solo o combinado, el patrón es el mismo:
# muchas patas casi seguras para un premio grande con poco riesgo
# aparente. Se detecta por repetición, no por un boleto suelto.
async def _detectar_cuota_baja(conn, dias=14, minimo=5):
    alertas = 0
    filas = await conn.fetch("""
        SELECT b.user_id, b.picks, b.stake, b.odd_total, b.status,
               u.nombre_completo, u.username, u.creado_por
        FROM betslips b
        JOIN users u ON u.id = b.user_id
        WHERE b.created_at > NOW() - ($1 || ' days')::interval
          AND b.status IN ('active','won','lost','paid')
        LIMIT 4000
    """, str(dias))

    por_user = {}
    for f in filas:
        picks = _picks_de(f)
        if len(picks) < 2:
            continue
        odds = [float(p.get("odd") or 0) for p in picks]
        if not odds or any(o <= 0 for o in odds):
            continue
        # Todas las patas por debajo de 1.50
        if max(odds) > 1.50:
            continue
        d = por_user.setdefault(f["user_id"], {
            "n": 0, "ganadas": 0, "stake": 0.0, "premio": 0.0,
            "nombre": f["nombre_completo"] or f["username"],
            "agencia": f["creado_por"]})
        d["n"] += 1
        d["stake"] += float(f["stake"] or 0)
        if (f["status"] or "").lower() in ("won", "paid"):
            d["ganadas"] += 1
            d["premio"] += float(f["stake"] or 0) * float(f["odd_total"] or 1)

    for uid, d in por_user.items():
        if d["n"] < minimo:
            continue
        neto = d["premio"] - d["stake"]
        sev = "alta" if neto > 0 and d["n"] >= minimo * 2 else "media"
        if await _guardar_alerta(
            conn, "cuota_baja", sev,
            f"{d['n']} combinadas de cuotas bajas en {dias} días",
            f"{d['nombre']} armó {d['n']} combinadas con todas las patas "
            f"por debajo de 1.50, ganó {d['ganadas']}. Apostó "
            f"{d['stake']:,.0f} y el resultado para la casa es "
            f"{-neto:,.0f}. Es el patrón de escalera: muchas patas casi "
            f"seguras para un premio grande con poco riesgo real.",
            evidencia={"combinadas": d["n"], "ganadas": d["ganadas"],
                       "apostado": round(d["stake"], 2),
                       "resultado_casa": round(-neto, 2)},
            user_id=uid, agencia=d["agencia"], monto=d["stake"],
            huella_partes=(uid, d["n"], dias)):
            alertas += 1
    return alertas


# ── REGLA 4: ESPECIALISTA ─────────────────────────────────────
# Un jugador concentrado en un solo deporte o liga, con ganancia
# sostenida. El documento lo explica bien: la casa no puede ajustar
# con precisión miles de eventos, y quien domina un nicho encuentra
# las cuotas mal puestas.
#
# La clave no es que gane, es que gane SIEMPRE en lo mismo.
async def _detectar_especialista(conn, dias=30, minimo=15):
    alertas = 0
    filas = await conn.fetch("""
        SELECT b.user_id, b.picks, b.stake, b.odd_total, b.status,
               u.nombre_completo, u.username, u.creado_por
        FROM betslips b
        JOIN users u ON u.id = b.user_id
        WHERE b.created_at > NOW() - ($1 || ' days')::interval
          AND b.status IN ('won','lost','paid')
        LIMIT 5000
    """, str(dias))

    por_user = {}
    for f in filas:
        picks = _picks_de(f)
        deportes = {p.get("sport_key") or p.get("deporte") or "?" for p in picks}
        d = por_user.setdefault(f["user_id"], {
            "n": 0, "stake": 0.0, "premio": 0.0, "deportes": {},
            "nombre": f["nombre_completo"] or f["username"],
            "agencia": f["creado_por"]})
        d["n"] += 1
        d["stake"] += float(f["stake"] or 0)
        if (f["status"] or "").lower() in ("won", "paid"):
            d["premio"] += float(f["stake"] or 0) * float(f["odd_total"] or 1)
        for dep in deportes:
            d["deportes"][dep] = d["deportes"].get(dep, 0) + 1

    for uid, d in por_user.items():
        if d["n"] < minimo or d["stake"] <= 0:
            continue
        roi = (d["premio"] - d["stake"]) / d["stake"] * 100
        # Un jugador normal pierde plata a la larga. Un ROI sostenido
        # por encima de 15% en decenas de apuestas no es suerte.
        if roi < 15:
            continue
        top = max(d["deportes"].items(), key=lambda x: x[1]) if d["deportes"] else ("?", 0)
        concentracion = top[1] / d["n"] * 100 if d["n"] else 0
        if concentracion < 70:
            continue
        sev = "alta" if roi > 30 else "media"
        if await _guardar_alerta(
            conn, "especialista", sev,
            f"Ganancia sostenida concentrada en {top[0]}",
            f"{d['nombre']} hizo {d['n']} apuestas en {dias} días, el "
            f"{concentracion:.0f}% en {top[0]}, con un retorno de "
            f"{roi:+.1f}% sobre lo apostado. La casa lleva perdidos "
            f"{d['premio'] - d['stake']:,.0f} con este jugador. "
            f"Puede ser un especialista aprovechando cuotas mal puestas "
            f"en un nicho.",
            evidencia={"apuestas": d["n"], "roi_pct": round(roi, 1),
                       "deporte": top[0],
                       "concentracion_pct": round(concentracion, 1),
                       "resultado_casa": round(d["stake"] - d["premio"], 2)},
            user_id=uid, agencia=d["agencia"],
            monto=d["premio"] - d["stake"],
            huella_partes=(uid, dias, int(roi))):
            alertas += 1
    return alertas


# ── REGLA 5: MONTO FUERA DE PATRÓN ────────────────────────────
# Un jugador que viene apostando 2.000 y de golpe pone 200.000. O es
# información privilegiada, o es una cuenta tomada. Las dos cosas
# valen la pena mirarlas.
async def _detectar_monto_anomalo(conn, dias=45, factor=10):
    alertas = 0
    filas = await conn.fetch("""
        WITH hist AS (
            SELECT user_id,
                   AVG(stake) AS promedio,
                   COUNT(*) AS n
            FROM betslips
            WHERE created_at > NOW() - ($1 || ' days')::interval
              AND created_at < NOW() - interval '24 hours'
              AND stake > 0 AND user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) >= 5
        )
        SELECT b.code, b.user_id, b.stake, b.odd_total, b.created_at,
               h.promedio, h.n,
               u.nombre_completo, u.username, u.creado_por
        FROM betslips b
        JOIN hist h ON h.user_id = b.user_id
        JOIN users u ON u.id = b.user_id
        WHERE b.created_at > NOW() - interval '24 hours'
          AND b.stake > h.promedio * $2
        ORDER BY b.stake DESC
        LIMIT 40
    """, str(dias), factor)

    for f in filas:
        veces = float(f["stake"]) / float(f["promedio"] or 1)
        sev = "alta" if veces >= 20 else "media"
        if await _guardar_alerta(
            conn, "monto_anomalo", sev,
            f"Apuesta {veces:.0f} veces mayor a lo habitual",
            f"{f['nombre_completo'] or f['username']} venía apostando un "
            f"promedio de {float(f['promedio']):,.0f} en sus últimas "
            f"{f['n']} jugadas y ahora puso {float(f['stake']):,.0f}. "
            f"Puede ser información que no tenemos, o una cuenta usada "
            f"por otra persona.",
            evidencia={"promedio": round(float(f["promedio"]), 2),
                       "monto": float(f["stake"]),
                       "veces": round(veces, 1),
                       "apuestas_previas": int(f["n"])},
            user_id=f["user_id"], agencia=f["creado_por"],
            betslip=f["code"], monto=float(f["stake"]),
            huella_partes=(f["code"],)):
            alertas += 1
    return alertas


# ── REGLA 6: CONCENTRACIÓN EN VIVO ────────────────────────────
# El documento lo marca: quien concentra más del 80% en apuestas en
# vivo puede estar aprovechando el retraso entre lo que pasa en la
# cancha y lo que refleja la cuota. Con alguien en el estadio, la
# ventaja es de segundos pero real.
async def _detectar_live_abuso(conn, dias=21, minimo=20):
    alertas = 0
    filas = await conn.fetch("""
        SELECT b.user_id,
               COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN b.es_live THEN 1 ELSE 0 END),0) AS live,
               COALESCE(SUM(b.stake),0) AS stake,
               COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                    THEN b.stake * b.odd_total ELSE 0 END),0) AS premio,
               u.nombre_completo, u.username, u.creado_por
        FROM betslips b
        JOIN users u ON u.id = b.user_id
        WHERE b.created_at > NOW() - ($1 || ' days')::interval
          AND b.status IN ('won','lost','paid')
        GROUP BY b.user_id, u.nombre_completo, u.username, u.creado_por
        HAVING COUNT(*) >= $2
    """, str(dias), minimo)

    for f in filas:
        total, live = int(f["total"]), int(f["live"])
        pct = live / total * 100 if total else 0
        if pct < 80:
            continue
        stake, premio = float(f["stake"]), float(f["premio"])
        if stake <= 0:
            continue
        roi = (premio - stake) / stake * 100
        if roi < 10:
            continue      # concentrarse en vivo sin ganar no es problema
        if await _guardar_alerta(
            conn, "live_abuso", "alta" if roi > 25 else "media",
            f"{pct:.0f}% de apuestas en vivo con ganancia sostenida",
            f"{f['nombre_completo'] or f['username']} hizo {live} de "
            f"{total} apuestas en vivo con un retorno de {roi:+.1f}%. "
            f"Puede estar aprovechando el retraso entre lo que pasa en "
            f"la cancha y el ajuste de la cuota.",
            evidencia={"total": total, "live": live,
                       "pct_live": round(pct, 1), "roi_pct": round(roi, 1)},
            user_id=f["user_id"], agencia=f["creado_por"],
            monto=premio - stake, huella_partes=(f["user_id"], dias, int(pct))):
            alertas += 1
    return alertas


# ── REGLA 7: ABUSO DE BONOS ───────────────────────────────────
# Cuentas que aparecen, cobran el bono, cumplen el mínimo con
# apuestas de cuota baja y retiran. El "jineteo" del documento.
async def _detectar_bonus_abuse(conn, dias=30):
    alertas = 0
    try:
        filas = await conn.fetch("""
            SELECT u.id, u.nombre_completo, u.username, u.creado_por,
                   u.ip_registro, u.created_at,
                   COUNT(DISTINCT bo.id) AS bonos,
                   COALESCE(SUM(bo.monto),0) AS monto_bonos,
                   COUNT(DISTINCT b.code) AS apuestas
            FROM users u
            LEFT JOIN bonos_otorgados bo ON bo.user_id = u.id
            LEFT JOIN betslips b ON b.user_id = u.id
            WHERE u.created_at > NOW() - ($1 || ' days')::interval
            GROUP BY u.id
            HAVING COUNT(DISTINCT bo.id) >= 1
        """, str(dias))
    except Exception as e:
        log.warning(f"[RIESGO] bonus abuse no disponible: {e}")
        return 0

    # Agrupar por IP de registro: varias cuentas nuevas con bono
    por_ip = {}
    for f in filas:
        if not f["ip_registro"]:
            continue
        por_ip.setdefault(f["ip_registro"], []).append(f)

    for ip, us in por_ip.items():
        if len(us) < 3:
            continue
        total_bonos = sum(float(u["monto_bonos"] or 0) for u in us)
        if total_bonos <= 0:
            continue
        if await _guardar_alerta(
            conn, "bonus_abuse", "alta",
            f"{len(us)} cuentas nuevas con bono desde la misma IP",
            f"Desde {ip} se registraron {len(us)} cuentas en {dias} días, "
            f"todas con bono otorgado por {total_bonos:,.0f} en total. "
            f"Es el patrón de jineteo: abrir cuentas para cobrar el bono "
            f"de bienvenida sin intención de jugar en serio.",
            evidencia={"ip": ip, "cuentas": len(us),
                       "bonos_total": round(total_bonos, 2),
                       "usuarios": [{"id": u["id"],
                                     "nombre": u["nombre_completo"] or u["username"],
                                     "apuestas": int(u["apuestas"] or 0)}
                                    for u in us[:10]]},
            monto=total_bonos, huella_partes=(ip, len(us), dias)):
            alertas += 1
    return alertas


# ── MOTOR ─────────────────────────────────────────────────────

async def _correr_motor_riesgo(conn):
    """Corre todas las reglas. Cada una es independiente: si una falla
    por datos inesperados, las demás siguen."""
    resultados = {}
    reglas = [
        ("multicuenta", _detectar_multicuenta),
        ("contrapartida", _detectar_contrapartida),
        ("cuota_baja", _detectar_cuota_baja),
        ("especialista", _detectar_especialista),
        ("monto_anomalo", _detectar_monto_anomalo),
        ("live_abuso", _detectar_live_abuso),
        ("bonus_abuse", _detectar_bonus_abuse),
        ("movimiento_sin_juego", _detectar_agencia_movimientos),
        ("agencia_perdedora", _detectar_agencia_perdedora),
        ("anulaciones", _detectar_anulaciones),
    ]
    for nombre, fn in reglas:
        try:
            resultados[nombre] = await fn(conn)
        except Exception as e:
            log.error(f"[RIESGO] regla {nombre} falló: {e}")
            resultados[nombre] = -1      # -1 marca que no pudo correr
    return resultados


# ── AUDITORÍA DE CUOTAS ───────────────────────────────────────
# Una cuota mal puesta es la forma más cara de perder plata: no hace
# falta que nadie haga trampa, alcanza con que alguien la vea antes
# que nosotros.
#
# Dos controles, los dos aritméticos y sin IA:
#
# 1. MARGEN NEGATIVO. Sumando las probabilidades implícitas de todas
#    las opciones de un evento (100/cuota), el total debería dar más
#    de 100: ese excedente es el margen de la casa. Si da menos de
#    100, la apuesta es matemáticamente ganadora para el jugador y
#    cualquiera que sepa dividir la encuentra.
#
# 2. DESVÍO CONTRA EL PROVEEDOR. Si la cuota que mostramos difiere
#    mucho de la que mandó el feed, hubo un error de conversión, de
#    caché o de configuración.

def _margen_evento(opciones):
    """
    Suma de probabilidades implícitas. Devuelve (suma, margen_pct).
    Menos de 100 significa que la casa pierde con cualquier resultado.
    """
    suma = 0.0
    for o in opciones:
        try:
            c = float(o)
        except (TypeError, ValueError):
            continue
        if c > 1.0:
            suma += 100.0 / c
    return suma, (suma - 100.0)


@app.get("/api/admin/riesgo/cuotas")
async def auditar_cuotas(_=Depends(auth.require_admin)):
    """
    Revisa las cuotas del feed actual y marca las que dejan margen
    negativo o sospechosamente bajo.
    """
    problemas = []
    revisados = 0

    for dep in _eventos_del_feed():
        if True:
            for ev in dep.get("events", []) or []:
                odds = ev.get("odds") or {}
                valores = [v for v in (odds.get("L"), odds.get("E"),
                                       odds.get("V")) if v]
                if len(valores) < 2:
                    continue
                revisados += 1
                suma, margen = _margen_evento(valores)

                nivel = None
                if margen < 0:
                    nivel = "critica"
                elif margen < 2:
                    nivel = "alta"
                elif margen > 40:
                    # Margen enorme: la cuota está tan baja que nadie va a
                    # apostar, o hay un error de carga
                    nivel = "media"
                if not nivel:
                    continue

                problemas.append({
                    "evento": f"{ev.get('h','')} vs {ev.get('a','')}",
                    "event_id": ev.get("id"),
                    "deporte": dep.get("key") or dep.get("title"),
                    # El mercado principal. Los demás se auditan aparte
                    # más abajo, porque cada uno tiene su propio margen.
                    "mercado": "h2h",
                    "cuotas": {"L": odds.get("L"), "E": odds.get("E"),
                               "V": odds.get("V")},
                    "suma_prob": round(suma, 2),
                    "margen_pct": round(margen, 2),
                    "severidad": nivel,
                    "motivo": ("La casa pierde con cualquier resultado"
                               if margen < 0 else
                               ("Margen casi nulo: sin colchón para la casa"
                                if margen < 2 else
                                "Margen desmedido: puede ser un error de carga")),
                })

    # Los otros mercados: cada uno tiene su margen propio y uno mal
    # puesto en 'totals' cuesta lo mismo que uno en el resultado.
    for dep in _eventos_del_feed():
        if True:
            for ev in dep.get("events", []) or []:
                for mk, opciones in (ev.get("markets") or {}).items():
                    if mk == "h2h" or not isinstance(opciones, dict):
                        continue
                    vals = [v for v in opciones.values()
                            if isinstance(v, (int, float)) and v > 1]
                    if len(vals) < 2:
                        continue
                    revisados += 1
                    suma, margen = _margen_evento(vals)
                    if margen >= 0:
                        continue
                    problemas.append({
                        "evento": f"{ev.get('h','')} vs {ev.get('a','')}",
                        "event_id": ev.get("id"),
                        "deporte": dep.get("key") or dep.get("title"),
                        "mercado": mk,
                        "cuotas": {k: v for k, v in list(opciones.items())[:3]},
                        "suma_prob": round(suma, 2),
                        "margen_pct": round(margen, 2),
                        "severidad": "critica",
                        "motivo": f"El mercado '{mk}' deja margen negativo: "
                                  f"el jugador gana con cualquier resultado.",
                    })

    problemas.sort(key=lambda x: x["margen_pct"])

    # Cuáles ya están bloqueados: el estado tiene que salir de la base,
    # no de lo que la pantalla recuerde. Al recargar se perdía y volvía
    # a ofrecer bloquear algo que ya estaba bloqueado.
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            filas = await conn.fetch("""
                SELECT event_id, mercado, objeto FROM eventos_bloqueos
                WHERE alcance='global'
                  AND (vence_at IS NULL OR vence_at > NOW())
            """)
        yabloq = {(f["event_id"], f["mercado"] or "h2h") for f in filas
                  if f["objeto"] == "mercado"}
        yabloq |= {(f["event_id"], None) for f in filas
                   if f["objeto"] == "evento"}
        for p in problemas:
            mk = p.get("mercado") or "h2h"
            p["bloqueado"] = ((p["event_id"], None) in yabloq
                              or (p["event_id"], mk) in yabloq)
    except Exception as e:
        log.warning(f"[CUOTAS] no se pudo leer el estado de bloqueo: {e}")

    return {
        "revisados": revisados,
        "problemas": problemas[:50],
        "explicacion": ("Se suman las probabilidades implícitas (100/cuota) "
                        "de cada evento. Por encima de 100 es el margen de "
                        "la casa; por debajo, el jugador gana haga lo que "
                        "haga."),
    }


@app.post("/api/admin/riesgo/cuotas/bloquear")
async def bloquear_cuotas_peligrosas(request: Request,
                                     _=Depends(auth.require_admin)):
    """
    Bloquea de una los eventos con margen negativo o casi nulo.

    Es la acción que sigue a la auditoría: detectar una cuota que hace
    perder plata y tener que ir a buscarla a mano no sirve de nada. El
    bloqueo es global y para siempre hasta que se quite, porque una
    cuota mal puesta no se arregla sola.
    """
    body = await request.json()
    # Qué se bloquea: solo las críticas, o también las de margen bajo
    umbral = body.get("umbral") or "critica"
    if umbral not in ("critica", "alta"):
        raise HTTPException(400, "Umbral inválido")
    solo = body.get("event_ids")        # opcional: una selección puntual

    res = await auditar_cuotas()
    niveles = {"critica"} if umbral == "critica" else {"critica", "alta"}

    creados = 0
    pool = await get_db()
    async with pool.acquire() as conn:
        for p in res["problemas"]:
            if solo:
                # Selección puntual: se bloquea lo que se pidió, sin
                # filtrar por severidad. Si el admin lo eligió a mano,
                # ya decidió que amerita.
                if p["event_id"] not in solo:
                    continue
            elif p["severidad"] not in niveles:
                continue
            if not p["event_id"]:
                continue
            ya = await conn.fetchval("""
                SELECT 1 FROM eventos_bloqueos
                WHERE event_id=$1 AND alcance='global'
                  AND (objeto='evento'
                       OR (objeto='mercado' AND mercado=$2))
                  AND (vence_at IS NULL OR vence_at > NOW())
            """, p["event_id"], p.get("mercado") or "h2h")
            if ya:
                continue
            # Si el problema es de un mercado puntual se bloquea solo
            # ese, no el evento entero: sacar todo por un mercado mal
            # puesto cuesta más de lo que evita.
            mk = p.get("mercado")
            if mk and mk != "h2h":
                await conn.execute("""
                    INSERT INTO eventos_bloqueos
                        (objeto, event_id, mercado, alcance, modo, motivo,
                         etiqueta, creado_por)
                    VALUES ('mercado', $1, $2, 'global', 'ambos', $3, $4,
                            'auditor')
                """, p["event_id"], mk,
                     f"Margen {p['margen_pct']}% · {p['motivo']}",
                     p["evento"])
            else:
                await conn.execute("""
                    INSERT INTO eventos_bloqueos
                        (objeto, event_id, alcance, modo, motivo, etiqueta,
                         creado_por)
                    VALUES ('evento', $1, 'global', 'ambos', $2, $3, 'auditor')
                """, p["event_id"],
                     f"Margen {p['margen_pct']}% · {p['motivo']}",
                     p["evento"])
            creados += 1
        if creados:
            await _cargar_bloqueos(conn, forzar=True)

    log.warning(f"[CUOTAS] {creados} eventos bloqueados por margen")
    return {"ok": True, "bloqueados": creados,
            "revisados": res["revisados"],
            "detectados": len(res["problemas"])}


@app.post("/api/admin/riesgo/cuotas/desbloquear")
async def desbloquear_cuota(request: Request, _=Depends(auth.require_admin)):
    """
    Quita los bloqueos de un evento. Antes había que listar todos los
    bloqueos y buscar el id, lo que fallaba si el listado no cargaba.
    """
    body = await request.json()
    event_id = (body.get("event_id") or "").strip()
    if not event_id:
        raise HTTPException(400, "Falta el evento")

    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            DELETE FROM eventos_bloqueos
            WHERE event_id=$1 AND alcance='global'
        """, event_id)
        await _cargar_bloqueos(conn, forzar=True)
    quitados = int(r.split()[-1] or 0)
    log.warning(f"[CUOTAS] {quitados} bloqueos quitados de {event_id}")
    return {"ok": True, "quitados": quitados}


@app.post("/api/admin/riesgo/cuotas/escanear")
async def auditar_cuotas_alertas(_=Depends(auth.require_admin)):
    """Igual que el anterior pero deja las alertas registradas."""
    res = await auditar_cuotas()
    creadas = 0
    pool = await get_db()
    async with pool.acquire() as conn:
        for p in res["problemas"]:
            if p["severidad"] not in ("critica", "alta"):
                continue
            if await _guardar_alerta(
                conn, "cuota_mal_puesta", p["severidad"],
                f"Margen {p['margen_pct']}% en {p['evento']}",
                f"{p['motivo']}. Las cuotas son L={p['cuotas'].get('L')}, "
                f"E={p['cuotas'].get('E')}, V={p['cuotas'].get('V')}, y la "
                f"suma de probabilidades da {p['suma_prob']}%. Cualquier "
                f"jugador que divida 100 por cada cuota lo ve.",
                evidencia=p, monto=0,
                huella_partes=(p["event_id"], p["margen_pct"])):
                creadas += 1
    return {"revisados": res["revisados"], "problemas": len(res["problemas"]),
            "alertas_nuevas": creadas}


# ── VIGÍA DEL SISTEMA ─────────────────────────────────────────
# Un chequeo de salud general que corre cada tanto y le pasa el
# panorama a la IA. La diferencia con las reglas: las reglas buscan
# lo que ya sabemos que puede pasar. El vigía mira números que no
# encajan y avisa aunque no haya una regla escrita para eso.

async def _foto_del_sistema(conn):
    """Los números que describen cómo viene funcionando todo."""
    foto = {}

    # Volumen y margen de las últimas 24 horas contra los 7 días previos
    hoy = await conn.fetchrow("""
        SELECT COUNT(*) AS n, COALESCE(SUM(stake),0) AS apostado,
               COALESCE(SUM(CASE WHEN status IN ('won','paid')
                    THEN stake*odd_total ELSE 0 END),0) AS pagado
        FROM betslips
        WHERE created_at > NOW() - interval '24 hours'
          AND status IN ('won','lost','paid','active')
    """)
    semana = await conn.fetchrow("""
        SELECT COUNT(*) AS n, COALESCE(SUM(stake),0) AS apostado,
               COALESCE(SUM(CASE WHEN status IN ('won','paid')
                    THEN stake*odd_total ELSE 0 END),0) AS pagado
        FROM betslips
        WHERE created_at BETWEEN NOW() - interval '8 days'
                             AND NOW() - interval '24 hours'
          AND status IN ('won','lost','paid','active')
    """)
    ap_hoy = float(hoy["apostado"] or 0)
    ap_sem = float(semana["apostado"] or 0) / 7 if semana["n"] else 0
    foto["apuestas_24h"] = int(hoy["n"] or 0)
    foto["apostado_24h"] = round(ap_hoy, 2)
    foto["promedio_diario_previo"] = round(ap_sem, 2)
    foto["variacion_pct"] = (round((ap_hoy - ap_sem) / ap_sem * 100, 1)
                             if ap_sem > 0 else None)
    foto["margen_24h"] = (round((ap_hoy - float(hoy["pagado"] or 0))
                                / ap_hoy * 100, 2) if ap_hoy > 0 else None)

    # Saldo de los jugadores: es pasivo, si crece mucho hay que mirarlo
    foto["saldo_jugadores"] = float(await conn.fetchval(
        "SELECT COALESCE(SUM(balance),0)/100.0 FROM users") or 0)

    # Alertas abiertas por severidad
    sev = await conn.fetch("""
        SELECT severidad, COUNT(*) AS n FROM riesgo_alertas
        WHERE estado='abierta' GROUP BY severidad
    """)
    foto["alertas_abiertas"] = {r["severidad"]: int(r["n"]) for r in sev}

    # Boletos que quedaron colgados: activos con el evento ya jugado
    foto["sin_liquidar"] = int(await conn.fetchval("""
        SELECT COUNT(*) FROM betslips
        WHERE status='active' AND created_at < NOW() - interval '3 days'
    """) or 0)

    # Reservas vencidas sin limpiar
    foto["reservas_vencidas"] = int(await conn.fetchval("""
        SELECT COUNT(*) FROM betslips
        WHERE status='pending' AND expires_at < NOW()
    """) or 0)

    # Cobertura de IP: sin esto el control de riesgo no ve nada
    cob = await conn.fetchrow("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN ip IS NOT NULL THEN 1 ELSE 0 END),0) AS con_ip
        FROM betslips WHERE created_at > NOW() - interval '7 days'
    """)
    t = int(cob["total"] or 0)
    foto["cobertura_ip_pct"] = (round(int(cob["con_ip"] or 0) / t * 100, 1)
                                if t else None)

    # Agencias con margen negativo
    foto["agencias_en_rojo"] = int(await conn.fetchval("""
        SELECT COUNT(*) FROM (
            SELECT u.creado_por,
                   COALESCE(SUM(b.stake),0) AS ap,
                   COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                        THEN b.stake*b.odd_total ELSE 0 END),0) AS pg
            FROM betslips b JOIN users u ON u.id=b.user_id
            WHERE b.created_at > NOW() - interval '30 days'
              AND b.status IN ('won','lost','paid')
              AND u.creado_por IS NOT NULL
            GROUP BY u.creado_por
            HAVING COALESCE(SUM(b.stake),0) > 0
               AND COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                    THEN b.stake*b.odd_total ELSE 0 END),0)
                   > COALESCE(SUM(b.stake),0)
        ) x
    """) or 0)

    return foto


@app.get("/api/admin/riesgo/salud")
async def salud_sistema(_=Depends(auth.require_admin)):
    """La foto cruda, sin interpretación."""
    pool = await get_db()
    async with pool.acquire() as conn:
        return await _foto_del_sistema(conn)


@app.post("/api/admin/riesgo/vigia")
async def vigia_ia(_=Depends(auth.require_admin)):
    """
    El vigía: la IA mira la foto del sistema y dice si algo no cierra.

    A diferencia de las reglas, que buscan patrones conocidos, acá se
    le pasan los números y se le pide que encuentre lo que no encaja.
    Sirve para lo que no anticipamos al escribir las reglas.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        foto = await _foto_del_sistema(conn)

    prompt = f"""Sos el analista de guardia de una casa de apuestas
deportivas. Estos son los números del sistema ahora mismo:

- Apuestas en 24h: {foto.get('apuestas_24h')}
- Apostado en 24h: {foto.get('apostado_24h'):,.0f}
- Promedio diario de la semana previa: {foto.get('promedio_diario_previo'):,.0f}
- Variación: {foto.get('variacion_pct')}%
- Margen de la casa en 24h: {foto.get('margen_24h')}%
- Saldo total de los jugadores: {foto.get('saldo_jugadores'):,.0f}
- Alertas de riesgo abiertas: {foto.get('alertas_abiertas')}
- Boletos activos de hace más de 3 días sin liquidar: {foto.get('sin_liquidar')}
- Reservas vencidas sin limpiar: {foto.get('reservas_vencidas')}
- Cobertura de IP en las apuestas: {foto.get('cobertura_ip_pct')}%
- Agencias con margen negativo en 30 días: {foto.get('agencias_en_rojo')}

Un margen sano para una casa de apuestas ronda el 5 al 10 por ciento.
El saldo de los jugadores es plata de ellos, no ganancia.

Respondé en español rioplatense, en prosa, sin vinetas ni titulos, en
5 u 8 frases. Decí si hay algo que no cierra y por que, que revisar
primero, y si todo esta bien decilo sin inventar problemas. Se concreto
con los numeros que te llamen la atencion."""

    texto = await _consultar_claude_texto(prompt, max_tokens=800)
    return {"analisis": texto, "foto": foto}


# ── BLOQUEO DE EVENTOS Y MERCADOS ─────────────────────────────
# Sacar de la oferta un evento, un deporte o un mercado puntual. Se
# usa cuando hay un problema concreto: una cuota mal puesta, un
# partido con movimientos raros, una lesión que el feed no reflejó.
#
# REGLA: el bloqueo más restrictivo gana. Si algo está bloqueado en
# cualquier nivel de la cadena —global, la rama o la agencia— no se
# puede apostar. Un bloqueo se pone por un motivo, y que una agencia
# lo saltee derrota el propósito.
#
# El caché evita consultar la base en cada pick de cada boleto; se
# refresca cada 30 segundos, que es tolerable para un bloqueo.

_bloqueos_cache = {"datos": None, "ts": 0.0}
_BLOQUEOS_TTL = 30


async def _cargar_bloqueos(conn, forzar=False):
    """Todos los bloqueos vigentes, indexados para consulta rápida."""
    ahora = time.time()
    if not forzar and _bloqueos_cache["datos"] is not None \
       and ahora - _bloqueos_cache["ts"] < _BLOQUEOS_TTL:
        return _bloqueos_cache["datos"]

    filas = await conn.fetch("""
        SELECT objeto, event_id, sport_key, mercado, alcance,
               agencia_code, modo
        FROM eventos_bloqueos
        WHERE vence_at IS NULL OR vence_at > NOW()
    """)
    datos = {"eventos": [], "deportes": [], "mercados": []}
    for f in filas:
        item = {
            "event_id": f["event_id"], "sport_key": f["sport_key"],
            "mercado": f["mercado"], "alcance": f["alcance"],
            "agencia": f["agencia_code"], "modo": f["modo"] or "ambos",
        }
        if f["objeto"] == "evento":
            datos["eventos"].append(item)
        elif f["objeto"] == "deporte":
            datos["deportes"].append(item)
        elif f["objeto"] == "mercado":
            datos["mercados"].append(item)

    _bloqueos_cache["datos"] = datos
    _bloqueos_cache["ts"] = ahora
    return datos


def _alcanza(item, agencia_code, ruta_agencia):
    """¿Este bloqueo aplica a esta agencia?"""
    if item["alcance"] == "global":
        return True
    if not agencia_code:
        # Apuesta directa del bot, sin agencia: solo la alcanzan
        # los bloqueos globales
        return False
    if item["alcance"] == "agencia":
        return item["agencia"] == agencia_code
    if item["alcance"] == "rama":
        # La agencia bloqueada o cualquiera que cuelgue de ella
        if item["agencia"] == agencia_code:
            return True
        return bool(ruta_agencia and item["agencia"]
                    and (ruta_agencia.startswith(item["agencia"] + "/")
                         or f"/{item['agencia']}/" in ruta_agencia))
    return False


def _modo_coincide(item, es_live):
    m = item.get("modo") or "ambos"
    if m == "ambos":
        return True
    return (m == "live") if es_live else (m == "prematch")


async def _picks_bloqueados(conn, picks, agencia_code=None, es_live=False):
    """
    Devuelve la lista de picks que no se pueden apostar, con el motivo.
    Vacía significa que el boleto puede seguir.
    """
    datos = await _cargar_bloqueos(conn)
    if not any(datos.values()):
        return []

    ruta = None
    if agencia_code:
        ruta = await conn.fetchval(
            "SELECT ruta FROM agencias WHERE code=$1", agencia_code)

    trabados = []
    for p in picks:
        ev = p.get("event_id") or ""
        sk = p.get("sport_key") or p.get("deporte") or ""
        mk = p.get("market") or p.get("mercado") or "h2h"
        etiqueta = f"{p.get('h','')} vs {p.get('a','')}".strip(" vs")

        for b in datos["eventos"]:
            if b["event_id"] and b["event_id"] == ev \
               and _alcanza(b, agencia_code, ruta) and _modo_coincide(b, es_live):
                trabados.append({"pick": etiqueta or ev,
                                 "motivo": "El evento no está disponible"})
                break
        else:
            for b in datos["deportes"]:
                if b["sport_key"] and b["sport_key"] == sk \
                   and _alcanza(b, agencia_code, ruta) and _modo_coincide(b, es_live):
                    trabados.append({"pick": etiqueta or sk,
                                     "motivo": "Ese deporte no está disponible"})
                    break
            else:
                for b in datos["mercados"]:
                    if b["event_id"] == ev and b["mercado"] == mk \
                       and _alcanza(b, agencia_code, ruta) \
                       and _modo_coincide(b, es_live):
                        trabados.append({
                            "pick": etiqueta or ev,
                            "motivo": f"El mercado '{mk}' no está disponible "
                                      f"para este evento"})
                        break
    return trabados


@app.get("/api/admin/eventos/{event_id}/apuestas")
async def apuestas_del_evento(event_id: str, _=Depends(auth.require_admin)):
    """
    Qué apuestas vivas hay sobre un evento, de quién y por cuánto.

    Se consulta ANTES de bloquear: bloquear no cancela lo ya apostado,
    solo impide nuevas. Si hay exposición grande conviene saberlo, y si
    está concentrada en pocas cuentas o en una sola agencia, más todavía
    — eso suele ser la señal de que alguien sabe algo.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT b.code, b.picks, b.stake, b.odd_total, b.potential_win,
                   b.status, b.created_at, b.es_live, b.ip,
                   u.id AS uid, u.nombre_completo, u.username, u.creado_por,
                   a.name AS agencia_nombre
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE b.status IN ('active','pending')
              AND b.picks LIKE '%' || $1 || '%'
            ORDER BY b.potential_win DESC
            LIMIT 300
        """, event_id)

    apuestas = []
    por_seleccion = {}
    por_agencia = {}
    por_cliente = {}
    total_stake = 0.0
    total_riesgo = 0.0
    ips = {}

    for f in filas:
        picks = _picks_de(f)
        # El LIKE puede traer falsos positivos: se confirma el id exacto
        mio = [p for p in picks if (p.get("event_id") or "") == event_id]
        if not mio:
            continue

        sel = mio[0].get("sel") or "?"
        stake = float(f["stake"] or 0)
        riesgo = float(f["potential_win"] or 0)
        total_stake += stake
        total_riesgo += riesgo

        d = por_seleccion.setdefault(sel, {"n": 0, "stake": 0.0, "riesgo": 0.0})
        d["n"] += 1; d["stake"] += stake; d["riesgo"] += riesgo

        ag = f["creado_por"] or "Sin agencia"
        d2 = por_agencia.setdefault(ag, {
            "n": 0, "stake": 0.0, "riesgo": 0.0,
            "nombre": f["agencia_nombre"] or ag})
        d2["n"] += 1; d2["stake"] += stake; d2["riesgo"] += riesgo

        nombre = f["nombre_completo"] or f["username"] or "Sin cliente"
        d3 = por_cliente.setdefault(f["uid"] or nombre, {
            "n": 0, "riesgo": 0.0, "nombre": nombre,
            "id": f["uid"], "agencia": ag})
        d3["n"] += 1; d3["riesgo"] += riesgo

        if f["ip"]:
            ips[f["ip"]] = ips.get(f["ip"], 0) + 1

        apuestas.append({
            "code": f["code"], "cliente": nombre, "cliente_id": f["uid"],
            "agencia": ag, "agencia_nombre": f["agencia_nombre"],
            "seleccion": sel,
            "cuota": float(f["odd_total"] or 0),
            "stake": stake, "a_pagar": riesgo,
            "estado": f["status"], "live": bool(f["es_live"]),
            "picks": len(picks),
            "fecha": _fecha_local(f["created_at"]),
        })

    # Señales que ameritan mirar de cerca antes de decidir
    avisos = []
    if por_cliente:
        top = max(por_cliente.values(), key=lambda x: x["riesgo"])
        if total_riesgo > 0 and top["riesgo"] / total_riesgo > 0.5 and len(por_cliente) > 1:
            avisos.append(
                f"{top['nombre']} concentra el "
                f"{top['riesgo']/total_riesgo*100:.0f}% de la exposición.")
    if len(por_seleccion) == 1 and len(apuestas) >= 5:
        sel = list(por_seleccion.keys())[0]
        avisos.append(
            f"Las {len(apuestas)} apuestas van al mismo lado ('{sel}'). "
            f"Cuando todos apuestan igual, suele haber información.")
    ip_repetida = [ip for ip, n in ips.items() if n >= 3]
    if ip_repetida:
        avisos.append(
            f"{len(ip_repetida)} IP con 3 o más apuestas en este evento.")

    return {
        "event_id": event_id,
        "total": len(apuestas),
        "apostado": round(total_stake, 2),
        # Lo que la casa pagaría si ganan todas: la exposición real
        "exposicion": round(total_riesgo, 2),
        "por_seleccion": [{
            "seleccion": k, "apuestas": v["n"],
            "apostado": round(v["stake"], 2),
            "a_pagar": round(v["riesgo"], 2),
        } for k, v in sorted(por_seleccion.items(),
                             key=lambda x: -x[1]["riesgo"])],
        "por_agencia": [{
            "code": k, "nombre": v["nombre"], "apuestas": v["n"],
            "apostado": round(v["stake"], 2),
            "a_pagar": round(v["riesgo"], 2),
        } for k, v in sorted(por_agencia.items(),
                             key=lambda x: -x[1]["riesgo"])],
        "top_clientes": [{
            "id": v["id"], "nombre": v["nombre"], "agencia": v["agencia"],
            "apuestas": v["n"], "a_pagar": round(v["riesgo"], 2),
        } for v in sorted(por_cliente.values(),
                          key=lambda x: -x["riesgo"])[:10]],
        "apuestas": apuestas[:60],
        "avisos": avisos,
        "nota": ("Bloquear no cancela lo ya apostado: solo impide nuevas "
                 "jugadas. Para dar de baja un boleto hay que anularlo."),
    }


@app.get("/api/admin/eventos/bloqueos")
async def listar_bloqueos(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT b.*, a.name AS agencia_nombre
            FROM eventos_bloqueos b
            LEFT JOIN agencias a ON a.code = b.agencia_code
            WHERE b.vence_at IS NULL OR b.vence_at > NOW()
            ORDER BY b.created_at DESC
            LIMIT 200
        """)
    return {"bloqueos": [{
        "id": f["id"], "objeto": f["objeto"],
        "event_id": f["event_id"], "sport_key": f["sport_key"],
        "mercado": f["mercado"], "alcance": f["alcance"],
        "agencia": f["agencia_code"], "agencia_nombre": f["agencia_nombre"],
        "modo": f["modo"], "motivo": f["motivo"],
        "etiqueta": f["etiqueta"],
        "vence": _fecha_local(f["vence_at"]) if f["vence_at"] else None,
        "fecha": _fecha_local(f["created_at"]),
    } for f in filas]}


@app.post("/api/admin/eventos/bloqueos")
async def crear_bloqueo(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    objeto = body.get("objeto")
    if objeto not in ("evento", "deporte", "mercado"):
        raise HTTPException(400, "Objeto inválido")

    alcance = body.get("alcance") or "global"
    if alcance not in ("global", "rama", "agencia"):
        raise HTTPException(400, "Alcance inválido")

    agencia = (body.get("agencia_code") or "").upper() or None
    if alcance != "global" and not agencia:
        raise HTTPException(400, "Falta la agencia para ese alcance")

    modo = body.get("modo") or "ambos"
    if modo not in ("prematch", "live", "ambos"):
        raise HTTPException(400, "Modo inválido")

    event_id = (body.get("event_id") or "").strip() or None
    sport_key = (body.get("sport_key") or "").strip() or None
    mercado = (body.get("mercado") or "").strip() or None

    if objeto == "evento" and not event_id:
        raise HTTPException(400, "Falta el evento")
    if objeto == "deporte" and not sport_key:
        raise HTTPException(400, "Falta el deporte")
    if objeto == "mercado" and not (event_id and mercado):
        raise HTTPException(400, "Un bloqueo de mercado necesita evento y mercado")

    # Vencimiento opcional: útil para bloquear solo hasta que empiece
    horas = body.get("horas")
    vence = None
    if horas:
        try:
            vence = datetime.now(timezone.utc) + timedelta(hours=float(horas))
        except (TypeError, ValueError):
            vence = None

    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            existe = await conn.fetchval(
                "SELECT 1 FROM agencias WHERE code=$1", agencia)
            if not existe:
                raise HTTPException(404, "Agencia inexistente")
        row = await conn.fetchrow("""
            INSERT INTO eventos_bloqueos
                (objeto, event_id, sport_key, mercado, alcance, agencia_code,
                 modo, motivo, etiqueta, creado_por, vence_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'admin',$10)
            RETURNING id
        """, objeto, event_id, sport_key, mercado, alcance, agencia, modo,
             (body.get("motivo") or "")[:300] or None,
             (body.get("etiqueta") or "")[:200] or None, vence)
        await _cargar_bloqueos(conn, forzar=True)

    log.warning(f"[BLOQUEO] {objeto} {event_id or sport_key} "
                f"alcance={alcance} agencia={agencia} modo={modo}")
    return {"ok": True, "id": row["id"]}


@app.delete("/api/admin/eventos/bloqueos/{bloqueo_id}")
async def quitar_bloqueo(bloqueo_id: int, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM eventos_bloqueos WHERE id=$1", bloqueo_id)
        await _cargar_bloqueos(conn, forzar=True)
    return {"ok": True}


# ── AJUSTE DE CUOTAS ──────────────────────────────────────────
# Alternativa al bloqueo: bajar la cuota en vez de sacar el evento.
# Sirve cuando no querés perder la jugada pero sí reducir cuánto
# pagás si sale.

async def _cargar_ajustes(conn):
    filas = await conn.fetch("""
        SELECT event_id, mercado, seleccion, alcance, agencia_code,
               ajuste_pct, cuota_fija
        FROM eventos_ajustes
    """)
    return [dict(f) for f in filas]


def _aplicar_ajuste(cuota, ajustes, event_id, mercado, seleccion,
                    agencia_code, ruta):
    """La cuota que corresponde después de los ajustes que apliquen."""
    mejor = None
    for a in ajustes:
        if a["event_id"] != event_id:
            continue
        if a["mercado"] and a["mercado"] != mercado:
            continue
        if a["seleccion"] and a["seleccion"] != seleccion:
            continue
        if not _alcanza({"alcance": a["alcance"], "agencia": a["agencia_code"]},
                        agencia_code, ruta):
            continue
        if a["cuota_fija"]:
            v = float(a["cuota_fija"])
        else:
            v = float(cuota) * (1 + float(a["ajuste_pct"] or 0) / 100)
        # Si hay varios ajustes, gana el más conservador para la casa
        mejor = v if mejor is None else min(mejor, v)
    return round(mejor, 2) if mejor is not None else cuota


@app.get("/api/admin/ajustes")
async def listar_ajustes(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT j.*, a.name AS agencia_nombre
            FROM eventos_ajustes j
            LEFT JOIN agencias a ON a.code = j.agencia_code
            ORDER BY j.created_at DESC LIMIT 100
        """)
    return {"ajustes": [{
        "id": f["id"], "event_id": f["event_id"], "mercado": f["mercado"],
        "seleccion": f["seleccion"], "alcance": f["alcance"],
        "agencia": f["agencia_code"], "agencia_nombre": f["agencia_nombre"],
        "ajuste_pct": float(f["ajuste_pct"] or 0),
        "cuota_fija": float(f["cuota_fija"]) if f["cuota_fija"] else None,
        "etiqueta": f["etiqueta"], "motivo": f["motivo"],
        "fecha": _fecha_local(f["created_at"]),
    } for f in filas]}


@app.post("/api/admin/ajustes")
async def crear_ajuste(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    event_id = (body.get("event_id") or "").strip()
    if not event_id:
        raise HTTPException(400, "Falta el evento")

    alcance = body.get("alcance") or "global"
    if alcance not in ("global", "rama", "agencia"):
        raise HTTPException(400, "Alcance inválido")
    agencia = (body.get("agencia_code") or "").upper() or None
    if alcance != "global" and not agencia:
        raise HTTPException(400, "Falta la agencia para ese alcance")

    cuota_fija = body.get("cuota_fija")
    try:
        pct = float(body.get("ajuste_pct") or 0)
    except (TypeError, ValueError):
        pct = 0
    try:
        cuota_fija = float(cuota_fija) if cuota_fija else None
    except (TypeError, ValueError):
        cuota_fija = None

    if cuota_fija is None and pct == 0:
        raise HTTPException(400, "Poné un porcentaje o una cuota fija")
    if pct > 0:
        raise HTTPException(400,
            "El ajuste solo puede bajar la cuota. Para subirla, usá Bet Best.")
    if pct < -90:
        raise HTTPException(400, "No se puede bajar más del 90%")
    if cuota_fija is not None and cuota_fija <= 1.0:
        raise HTTPException(400, "La cuota tiene que ser mayor a 1.00")

    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO eventos_ajustes
                (event_id, mercado, seleccion, alcance, agencia_code,
                 ajuste_pct, cuota_fija, etiqueta, motivo, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'admin')
            ON CONFLICT (event_id, COALESCE(mercado,''),
                         COALESCE(seleccion,''), alcance,
                         COALESCE(agencia_code,''))
            DO UPDATE SET ajuste_pct=$6, cuota_fija=$7, motivo=$9,
                          created_at=NOW()
        """, event_id, (body.get("mercado") or "").strip() or None,
             (body.get("seleccion") or "").strip() or None,
             alcance, agencia, pct, cuota_fija,
             (body.get("etiqueta") or "")[:200] or None,
             (body.get("motivo") or "")[:300] or None)
    return {"ok": True}


@app.delete("/api/admin/ajustes/{ajuste_id}")
async def quitar_ajuste(ajuste_id: int, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM eventos_ajustes WHERE id=$1", ajuste_id)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
def _eventos_del_feed():
    """
    Los deportes del caché de Sportradar. El caché tiene la forma
    {"data": {...}, "ts": 123}, no un diccionario de feeds: recorrerlo
    como si cada clave fuera uno devolvía basura y rompía.
    """
    try:
        data = (_sr_all_cache.get("data") or {}) \
               if "_sr_all_cache" in globals() else {}
        return data.get("sports", []) or []
    except Exception as e:
        log.warning(f"[FEED] no se pudo leer el caché: {e}")
        return []


# ── TERMINALES DEL LOCAL ──────────────────────────────────────
# Cada pantalla del local es una terminal con su propio QR. El
# cliente lo escanea, arma el boleto en su teléfono mientras espera,
# y llega al mostrador con el código listo.
#
# QUÉ RESUELVE: la cola en el mostrador. El cajero solo cobra en vez
# de armar el boleto pick por pick.
#
# LA TERMINAL QUEDA EN EL BOLETO de esa sesión, no sigue al cliente
# después. Sirve para saber qué pantalla trabaja, no para atribuirle
# todo lo que esa persona juegue el resto del mes.

@app.get("/api/agencias/me/terminales")
async def listar_terminales(agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT t.*,
                   (SELECT COUNT(*) FROM terminal_escaneos e
                    WHERE e.terminal_id = t.id
                      AND e.created_at > NOW() - interval '30 days') AS escaneos,
                   (SELECT COUNT(*) FROM betslips b
                    WHERE b.terminal_codigo = t.codigo
                      AND b.created_at > NOW() - interval '30 days') AS boletos,
                   (SELECT COALESCE(SUM(b.stake),0) FROM betslips b
                    WHERE b.terminal_codigo = t.codigo
                      AND b.created_at > NOW() - interval '30 days'
                      AND b.status IN ('active','won','lost','paid')) AS vendido
            FROM terminales t
            WHERE t.agencia_code = $1
            ORDER BY t.created_at
        """, agencia_code)
    return {"terminales": [{
        "id": f["id"], "nombre": f["nombre"], "codigo": f["codigo"],
        "ubicacion": f["ubicacion"], "activa": f["activa"],
        "permite_web": f["permite_web"], "permite_app": f["permite_app"],
        "escaneos": int(f["escaneos"] or 0),
        "boletos": int(f["boletos"] or 0),
        "vendido": float(f["vendido"] or 0),
        "ultimo_uso": _fecha_local(f["ultimo_uso"]) if f["ultimo_uso"] else None,
        # La dirección que se pone en el QR
        "url": f"{APP_URL}/t/{f['codigo']}",
    } for f in filas]}


@app.post("/api/agencias/me/terminales")
async def crear_terminal(request: Request,
                         agencia_code: str = Depends(requiere_agencia)):
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:60]
    if not nombre:
        raise HTTPException(400, "Poné un nombre a la terminal")

    pool = await get_db()
    async with pool.acquire() as conn:
        # Código corto: el QR se imprime en papel común y uno largo
        # se vuelve denso y difícil de leer con poca luz.
        for _ in range(6):
            codigo = agencia_code[:4].upper() + secrets.token_hex(2).upper()
            existe = await conn.fetchval(
                "SELECT 1 FROM terminales WHERE codigo=$1", codigo)
            if not existe:
                break
        else:
            raise HTTPException(503, "No se pudo generar el código")

        row = await conn.fetchrow("""
            INSERT INTO terminales
                (agencia_code, nombre, codigo, ubicacion,
                 permite_web, permite_app, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id
        """, agencia_code, nombre, codigo,
             (body.get("ubicacion") or "")[:120] or None,
             bool(body.get("permite_web", True)),
             bool(body.get("permite_app", True)),
             agencia_code)
    return {"ok": True, "id": row["id"], "codigo": codigo,
            "url": f"{APP_URL}/t/{codigo}"}


@app.get("/api/agencias/me/terminales/reporte")
async def reporte_terminales(desde: str = "", hasta: str = "",
                             agencia_code: str = Depends(requiere_agencia)):
    """Qué vendió cada terminal en el período."""
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT t.id, t.nombre, t.codigo, t.ubicacion,
                   (SELECT COUNT(*) FROM terminal_escaneos e
                    WHERE e.terminal_id=t.id
                      AND e.created_at::date BETWEEN $2 AND $3) AS escaneos,
                   (SELECT COUNT(*) FROM betslips b
                    WHERE b.terminal_codigo=t.codigo
                      AND b.created_at::date BETWEEN $2 AND $3) AS boletos,
                   (SELECT COALESCE(SUM(b.stake),0) FROM betslips b
                    WHERE b.terminal_codigo=t.codigo
                      AND b.created_at::date BETWEEN $2 AND $3
                      AND b.status IN ('active','won','lost','paid')) AS vendido,
                   (SELECT COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                        THEN b.potential_win ELSE 0 END),0) FROM betslips b
                    WHERE b.terminal_codigo=t.codigo
                      AND b.created_at::date BETWEEN $2 AND $3) AS pagado
            FROM terminales t
            WHERE t.agencia_code=$1
            ORDER BY 7 DESC
        """, agencia_code, d, h)

    salida = []
    for f in filas:
        esc = int(f["escaneos"] or 0)
        bol = int(f["boletos"] or 0)
        vendido = float(f["vendido"] or 0)
        salida.append({
            "nombre": f["nombre"], "codigo": f["codigo"],
            "ubicacion": f["ubicacion"],
            "escaneos": esc, "boletos": bol,
            "vendido": round(vendido, 2),
            "ggr": round(vendido - float(f["pagado"] or 0), 2),
            # Cuántos de los que escanean terminan apostando: si es
            # bajo, el problema está después del QR.
            "conversion_pct": round(bol / esc * 100, 1) if esc else None,
        })
    return {"desde": str(d), "hasta": str(h), "terminales": salida,
            "total_vendido": round(sum(t["vendido"] for t in salida), 2),
            "total_boletos": sum(t["boletos"] for t in salida)}


@app.post("/api/agencias/me/terminales/{tid}")
async def editar_terminal(tid: int, request: Request,
                          agencia_code: str = Depends(requiere_agencia)):
    body = await request.json()
    pool = await get_db()
    async with pool.acquire() as conn:
        propia = await conn.fetchval(
            "SELECT 1 FROM terminales WHERE id=$1 AND agencia_code=$2",
            tid, agencia_code)
        if not propia:
            raise HTTPException(403, "Esa terminal no es tuya")
        await conn.execute("""
            UPDATE terminales
            SET nombre = COALESCE($2, nombre),
                ubicacion = COALESCE($3, ubicacion),
                activa = COALESCE($4, activa),
                permite_web = COALESCE($5, permite_web),
                permite_app = COALESCE($6, permite_app)
            WHERE id = $1
        """, tid,
             (body.get("nombre") or "").strip()[:60] or None,
             (body.get("ubicacion") or "").strip()[:120] or None,
             body.get("activa"),
             body.get("permite_web"),
             body.get("permite_app"))
    return {"ok": True}


@app.delete("/api/agencias/me/terminales/{tid}")
async def borrar_terminal(tid: int,
                          agencia_code: str = Depends(requiere_agencia)):
    """
    Se desactiva en vez de borrarse: los boletos ya vendidos apuntan
    a su código y perderlos rompería el reporte histórico.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            UPDATE terminales SET activa=false
            WHERE id=$1 AND agencia_code=$2
        """, tid, agencia_code)
        if r.endswith(" 0"):
            raise HTTPException(403, "Esa terminal no es tuya")
    return {"ok": True}


@app.get("/api/box/{agencia_code}/terminal")
async def terminal_del_box(agencia_code: str):
    """
    La terminal que le toca a esta pantalla del local.

    Público: el Box no maneja sesión de agencia, y el dato que
    devuelve —un código de QR— no es sensible.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        t = await conn.fetchrow("""
            SELECT codigo, nombre FROM terminales
            WHERE agencia_code=$1 AND activa=true
            ORDER BY created_at LIMIT 1
        """, agencia_code.upper())
    if not t:
        return {"terminal": None}
    return {"terminal": {
        "codigo": t["codigo"], "nombre": t["nombre"],
        "url": f"{APP_URL}/t/{t['codigo']}",
    }}


@app.get("/api/terminal/{codigo}")
async def abrir_terminal(codigo: str, request: Request):
    """
    Alguien escaneó el QR. Devuelve qué opciones ofrecerle.
    Público: lo consulta el teléfono del cliente, sin sesión.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        t = await conn.fetchrow("""
            SELECT t.*, a.name AS agencia_nombre, a.moneda
            FROM terminales t
            LEFT JOIN agencias a ON a.code = t.agencia_code
            WHERE t.codigo = $1
        """, codigo.upper())
        if not t or not t["activa"]:
            raise HTTPException(404, "Terminal no disponible")

        await conn.execute(
            "UPDATE terminales SET ultimo_uso=NOW() WHERE id=$1", t["id"])
        try:
            await conn.execute("""
                INSERT INTO terminal_escaneos (terminal_id, ip, device_hash)
                VALUES ($1,$2,$3)
            """, t["id"], _ip_cliente(request), _huella_dispositivo(request))
        except Exception as e:
            log.warning(f"[TERMINAL] escaneo no registrado: {e}")

    return {
        "codigo": t["codigo"],
        "nombre": t["nombre"],
        "agencia": t["agencia_nombre"],
        "agencia_code": t["agencia_code"],
        "moneda": t["moneda"] or "ARS",
        # SIEMPRE como invitado. No se ofrece entrar con cuenta a
        # propósito: si alguien de otra agencia apostara con su
        # usuario, el boleto quedaría a nombre de su agencia de origen
        # y la comisión se la llevaría quien no puso ni el local ni la
        # pantalla. Armando sin registro, la venta es de quien cobra.
        "modo": "invitado",
    }


@app.post("/api/terminal/{codigo}/eleccion")
async def terminal_eleccion(codigo: str, request: Request):
    """Qué eligió el que escaneó: sirve para saber qué camino usan."""
    body = await request.json()
    eligio = (body.get("eligio") or "")[:20]
    pool = await get_db()
    async with pool.acquire() as conn:
        t = await conn.fetchval(
            "SELECT id FROM terminales WHERE codigo=$1", codigo.upper())
        if t:
            await conn.execute("""
                UPDATE terminal_escaneos SET eligio=$2
                WHERE id = (SELECT MAX(id) FROM terminal_escaneos
                            WHERE terminal_id=$1)
            """, t, eligio)
    return {"ok": True}


# ── RECOMPENSA POR COMPARTIR ──────────────────────────────────
# Se paga por VISITAS REALES al enlace, no por tocar el botón.
#
# POR QUÉ NO SE PAGA EL TOQUE: el menú de compartir del teléfono no
# le avisa a la web si la persona compartió o canceló — devuelve lo
# mismo en los dos casos. Pagar ahí sería regalar plata a quien abra
# y cierre el menú cinco veces.
#
# Pagar por visita exige que alguien distinto, desde otro dispositivo
# y otra conexión, abra el enlace. Simular eso cinco veces no le
# conviene a nadie por unos centavos.
#
# LA PLATA ENTRA COMO SALDO DE BONO: no se puede retirar sin apostar
# antes. Si entrara como saldo real, alguien podría juntar visitas y
# retirar sin jugar nunca.

async def _cfg_recompensa(conn):
    filas = await conn.fetch(
        "SELECT clave, valor FROM app_config WHERE clave LIKE 'recomp_%'")
    c = {f["clave"]: f["valor"] for f in filas}
    def num(k, d):
        try: return float(c.get(k) or d)
        except (TypeError, ValueError): return d
    return {
        "activo": c.get("recomp_activo", "0") == "1",
        # Cuánto se paga por visita, en la moneda de referencia
        "monto_usd": num("recomp_monto_usd", 0.10),
        "max_por_apuesta": int(num("recomp_max_apuesta", 5)),
        "max_por_dia": int(num("recomp_max_dia", 20)),
        # Cuánto tiene que apostar para poder retirarlo
        "rollover": num("recomp_rollover", 1),
        "pct_casa": num("recomp_pct_casa", 100),
        "pct_agencia": num("recomp_pct_agencia", 0),
        # Dónde se ofrece: app, web, o las dos
        "destinos": [x for x in (c.get("recomp_destinos", "app,web") or "").split(",") if x],
        # Alcance: vacío = todas las agencias. Con contenido, solo esas
        # y sus ramas.
        "ramas": [x for x in (c.get("recomp_ramas", "") or "").split(",") if x],
        "excluidas": [x for x in (c.get("recomp_excluidas", "") or "").split(",") if x],
    }


async def _recompensa_activa_para(conn, agencia_code, origen="app"):
    """
    ¿Este cliente puede ganar por compartir?

    Misma regla que el resto: la exclusión alcanza a toda la rama y
    gana sobre cualquier habilitación de arriba.
    """
    cfg = await _cfg_recompensa(conn)
    if not cfg["activo"]:
        return False, cfg
    if cfg["destinos"] and origen not in cfg["destinos"]:
        return False, cfg
    if not agencia_code:
        # Sin agencia solo aplica si no hay restricción por rama
        return (not cfg["ramas"]), cfg

    ruta = None
    if cfg["ramas"] or cfg["excluidas"]:
        ruta = await conn.fetchval(
            "SELECT ruta FROM agencias WHERE code=$1", agencia_code) or ""
    cadena = [p for p in (ruta or "").split("/") if p]
    if agencia_code not in cadena:
        cadena.append(agencia_code)

    if cfg["excluidas"] and any(c in cfg["excluidas"] for c in cadena):
        return False, cfg
    if not cfg["ramas"]:
        return True, cfg
    return any(c in cfg["ramas"] for c in cadena), cfg


# Equivalencias aproximadas para que 0.10 USD tenga sentido en cada
# moneda. No es un tipo de cambio real: es cuánto se decide regalar.
EQUIV_RECOMPENSA = {
    "USD": 1, "EUR": 1, "ARS": 1000, "BRL": 5, "CLP": 900,
    "COP": 4000, "PYG": 7000, "UYU": 40, "PEN": 4, "MXN": 18,
    "BOB": 7, "VES": 36,
}


def _monto_recompensa(monto_usd, moneda):
    """Lo que se acredita en la moneda del cliente."""
    factor = EQUIV_RECOMPENSA.get((moneda or "ARS").upper(), 1000)
    v = monto_usd * factor
    # Se redondea para arriba a algo presentable: 100 en pesos, no
    # 97.34, que en un aviso queda raro.
    if v >= 100:
        return round(v / 10) * 10
    return round(v, 2)


@app.post("/api/compartir/nueva")
async def compartir_nueva(request: Request):
    """
    Genera el enlace con código propio cuando el cliente comparte.
    Se llama al tocar compartir, pero acá no se paga nada todavía.
    """
    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        raise HTTPException(401, "Entrá a tu cuenta")

    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow(
            "SELECT creado_por, moneda FROM users WHERE id=$1", int(user_id))
        if not u:
            raise HTTPException(404, "Cliente inexistente")

        ok, cfg = await _recompensa_activa_para(
            conn, u["creado_por"], body.get("origen") or "app")
        if not ok:
            # Sin premio no se muestra el botón: prometer algo que no
            # se va a pagar es peor que no ofrecerlo.
            return {"codigo": None, "activo": False}

        hoy = datetime.now(TZ_CASA).date()
        ya_hoy = await conn.fetchval("""
            SELECT COALESCE(SUM(pagadas),0) FROM compartidas
            WHERE user_id=$1 AND created_at::date=$2
        """, int(user_id), hoy) or 0

        codigo = "S" + secrets.token_urlsafe(7)[:9]
        row = await conn.fetchrow("""
            INSERT INTO compartidas
                (codigo, user_id, agencia_code, betslip_code,
                 ip_origen, device_origen)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
        """, codigo, int(user_id), u["creado_por"],
             (body.get("betslip_code") or "")[:32] or None,
             _ip_cliente(request), _huella_dispositivo(request))

    monto = _monto_recompensa(cfg["monto_usd"], u["moneda"])
    return {
        "codigo": codigo, "id": row["id"], "activo": True,
        "monto_por_visita": monto,
        "moneda": u["moneda"] or "ARS",
        "max": cfg["max_por_apuesta"],
        "restante_hoy": max(0, cfg["max_por_dia"] - int(ya_hoy)),
        "texto": (f"Ganás {monto} por cada persona que entre con tu "
                  f"enlace, hasta {cfg['max_por_apuesta']} por apuesta."),
    }


@app.get("/api/compartir/mis-ganancias/{user_id}")
async def mis_recompensas(user_id: int):
    """Cuánto lleva ganado el cliente por compartir."""
    pool = await get_db()
    async with pool.acquire() as conn:
        tot = await conn.fetchrow("""
            SELECT COUNT(*) AS n, COALESCE(SUM(monto),0) AS total
            FROM recompensas WHERE user_id=$1 AND tipo='compartir'
        """, user_id)
        pend = await conn.fetchval(
            "SELECT COALESCE(rollover_pendiente,0)/100.0 FROM users WHERE id=$1",
            user_id) or 0
        recientes = await conn.fetch("""
            SELECT c.codigo, c.visitas, c.pagadas, c.created_at,
                   c.betslip_code
            FROM compartidas c
            WHERE c.user_id=$1
            ORDER BY c.created_at DESC LIMIT 10
        """, user_id)
    return {
        "visitas_pagadas": int(tot["n"] or 0),
        "ganado": round(float(tot["total"] or 0), 2),
        "falta_apostar": round(float(pend), 2),
        "compartidas": [{
            "codigo": r["codigo"], "visitas": int(r["visitas"] or 0),
            "pagadas": int(r["pagadas"] or 0),
            "apuesta": r["betslip_code"],
            "fecha": _fecha_local(r["created_at"]),
        } for r in recientes],
        "nota": ("Lo que ganás entra como saldo de bono: para retirarlo "
                 "tenés que apostarlo primero."),
    }


@app.get("/api/compartir/{codigo}")
async def compartir_visita(codigo: str, request: Request):
    """
    Alguien abrió un enlace compartido. Acá se decide si cuenta.
    
    Se descarta: la misma IP o dispositivo del que compartió (mirarse
    a uno mismo no es alcance), visitas repetidas de la misma persona,
    y lo que supere los topes.
    """
    ip = _ip_cliente(request)
    dev = _huella_dispositivo(request)

    pool = await get_db()
    async with pool.acquire() as conn:
        c = await conn.fetchrow("""
            SELECT c.*, u.moneda, u.creado_por
            FROM compartidas c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.codigo = $1
        """, codigo)
        if not c:
            return {"ok": False, "motivo": "enlace inexistente"}

        ok, cfg = await _recompensa_activa_para(conn, c["creado_por"])

        motivo = None
        if not ok:
            motivo = "programa inactivo"
        elif ip and ip == c["ip_origen"]:
            # Abrir el propio enlace desde el mismo lugar no es alcance
            motivo = "misma_ip"
        elif dev and dev == c["device_origen"]:
            motivo = "mismo_device"
        elif int(c["pagadas"] or 0) >= cfg["max_por_apuesta"]:
            motivo = "tope"
        else:
            hoy = datetime.now(TZ_CASA).date()
            ya_hoy = await conn.fetchval("""
                SELECT COALESCE(SUM(pagadas),0) FROM compartidas
                WHERE user_id=$1 AND created_at::date=$2
            """, c["user_id"], hoy) or 0
            if int(ya_hoy) >= cfg["max_por_dia"]:
                motivo = "tope diario"

        # Se registra la visita igual, pagada o no: sirve para ver si
        # alguien está intentando algo raro.
        try:
            v = await conn.fetchrow("""
                INSERT INTO compartidas_visitas
                    (compartida_id, ip, device_hash, pagada, motivo_rechazo)
                VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, c["id"], ip, dev, motivo is None, motivo)
        except Exception as e:
            log.warning(f"[COMPARTIR] visita no registrada: {e}")
            v = None

        if v is None:
            # El índice único la rechazó: ya había venido esta persona
            return {"ok": True, "contada": False, "motivo": "repetida"}

        if motivo:
            await conn.execute(
                "UPDATE compartidas SET visitas = visitas + 1 WHERE id=$1",
                c["id"])
            return {"ok": True, "contada": False, "motivo": motivo}

        # Cuenta: se acredita como saldo de bono, no retirable
        moneda = c["moneda"] or "ARS"
        monto = _monto_recompensa(cfg["monto_usd"], moneda)
        pct_ag = float(cfg["pct_agencia"] or 0)
        pct_casa = round(100.0 - pct_ag, 2)

        async with conn.transaction():
            await conn.execute("""
                UPDATE compartidas
                SET visitas = visitas + 1, pagadas = pagadas + 1
                WHERE id=$1
            """, c["id"])
            await conn.execute("""
                UPDATE users
                SET saldo_bono = COALESCE(saldo_bono,0) + $2,
                    saldo_recompensa = COALESCE(saldo_recompensa,0) + $2,
                    rollover_pendiente = COALESCE(rollover_pendiente,0) + $3
                WHERE id=$1
            """, c["user_id"], int(monto * 100),
                 int(monto * float(cfg["rollover"] or 1) * 100))
            await conn.execute("""
                INSERT INTO recompensas
                    (user_id, agencia_code, tipo, monto, moneda,
                     compartida_id, visita_id, pct_casa, pct_agencia,
                     costo_casa, costo_agencia)
                VALUES ($1,$2,'compartir',$3,$4,$5,$6,$7,$8,$9,$10)
            """, c["user_id"], c["creado_por"], monto, moneda,
                 c["id"], v["id"], pct_casa, pct_ag,
                 round(monto * pct_casa / 100, 2),
                 round(monto * pct_ag / 100, 2))

        log.warning(f"[COMPARTIR] {codigo} → +{monto} {moneda} "
                    f"para user {c['user_id']}")
        return {"ok": True, "contada": True, "monto": monto,
                "moneda": moneda}


@app.get("/api/admin/recompensas")
async def admin_recompensas(desde: str = "", hasta: str = "",
                            _=Depends(auth.require_admin)):
    """Config, costo del programa y señales de abuso."""
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _cfg_recompensa(conn)
        tot = await conn.fetchrow("""
            SELECT COUNT(*) AS n,
                   COUNT(DISTINCT user_id) AS clientes,
                   COALESCE(SUM(monto),0) AS total,
                   COALESCE(SUM(costo_casa),0) AS casa,
                   COALESCE(SUM(costo_agencia),0) AS agencias
            FROM recompensas
            WHERE created_at::date BETWEEN $1 AND $2 AND tipo='compartir'
        """, d, h)
        rechazos = await conn.fetch("""
            SELECT motivo_rechazo, COUNT(*) AS n
            FROM compartidas_visitas v
            JOIN compartidas c ON c.id = v.compartida_id
            WHERE v.motivo_rechazo IS NOT NULL
              AND v.created_at::date BETWEEN $1 AND $2
            GROUP BY motivo_rechazo ORDER BY 2 DESC
        """, d, h)
        top = await conn.fetch("""
            SELECT r.user_id, u.nombre_completo, u.username,
                   COUNT(*) AS visitas, COALESCE(SUM(r.monto),0) AS ganado
            FROM recompensas r
            LEFT JOIN users u ON u.id = r.user_id
            WHERE r.created_at::date BETWEEN $1 AND $2
            GROUP BY r.user_id, u.nombre_completo, u.username
            ORDER BY 5 DESC LIMIT 10
        """, d, h)

    return {
        **cfg, "desde": str(d), "hasta": str(h),
        "visitas_pagadas": int(tot["n"] or 0),
        "clientes": int(tot["clientes"] or 0),
        "costo_total": round(float(tot["total"] or 0), 2),
        "paga_casa": round(float(tot["casa"] or 0), 2),
        "paga_agencias": round(float(tot["agencias"] or 0), 2),
        # Los rechazos dicen si alguien está probando trampas
        "rechazos": [{"motivo": r["motivo_rechazo"], "cantidad": int(r["n"])}
                     for r in rechazos],
        "top": [{
            "user_id": t["user_id"],
            "nombre": t["nombre_completo"] or t["username"],
            "visitas": int(t["visitas"]),
            "ganado": round(float(t["ganado"] or 0), 2),
        } for t in top],
    }


@app.post("/api/admin/recompensas")
async def set_recompensas(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    try:
        monto = float(body.get("monto_usd") or 0)
        max_ap = int(body.get("max_por_apuesta") or 5)
        max_dia = int(body.get("max_por_dia") or 20)
        roll = float(body.get("rollover") or 1)
        pct_ag = float(body.get("pct_agencia") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Valores inválidos")

    if not (0 <= monto <= 5):
        raise HTTPException(400,
            "El monto va entre 0 y 5 dólares por visita. Más arriba se "
            "vuelve caro de sostener.")
    if not (1 <= max_ap <= 50):
        raise HTTPException(400, "El tope por apuesta va entre 1 y 50")
    if not (1 <= max_dia <= 500):
        raise HTTPException(400, "El tope diario va entre 1 y 500")
    if roll < 1:
        raise HTTPException(400,
            "El rollover no puede ser menor a 1: sin eso se podría "
            "retirar sin apostar nunca.")
    pct_ag = max(0.0, min(100.0, pct_ag))

    vals = {
        "recomp_activo": "1" if body.get("activo") else "0",
        "recomp_monto_usd": str(monto),
        "recomp_max_apuesta": str(max_ap),
        "recomp_max_dia": str(max_dia),
        "recomp_rollover": str(roll),
        "recomp_pct_agencia": str(pct_ag),
        "recomp_pct_casa": str(round(100 - pct_ag, 2)),
        "recomp_destinos": ",".join(body.get("destinos") or ["app", "web"]),
        "recomp_ramas": ",".join(body.get("ramas") or []),
        "recomp_excluidas": ",".join(body.get("excluidas") or []),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at)
                VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    log.warning(f"[RECOMPENSA] {'ON' if body.get('activo') else 'OFF'} · "
                f"{monto} USD/visita · tope {max_ap}/apuesta")
    return {"ok": True}


# ── BONOS: VALIDAR Y EXPLICAR ANTES DE OTORGAR ────────────────
# Un bono mal configurado se paga con plata real, así que conviene
# ver qué implica antes de confirmarlo.
#
# Tres capas, de la más barata a la más cara:
#   1. Reglas fijas: detectan lo que es objetivamente un problema.
#   2. Resumen: qué se está por dar, cuánto cuesta y quién lo paga.
#   3. IA: solo si se pide, para lo que las reglas no ven.

def _revisar_bono(b):
    """
    Problemas concretos de una configuración de bono.

    Devuelve una lista de avisos con severidad. Son reglas, no
    opiniones: cada una responde a algo que cuesta plata.
    """
    avisos = []
    try:
        monto = float(b.get("monto_fijo") or 0)
        pct = float(b.get("porcentaje") or 0)
        tope = float(b.get("tope") or 0)
        rollover = float(b.get("rollover") or 0)
        cuota_min = float(b.get("cuota_minima") or 0)
        cuota_max = float(b.get("cuota_maxima") or 0)
        pct_casa = float(b.get("pct_paga_casa") or 100)
        pct_ag = float(b.get("pct_paga_agencia") or 0)
    except (TypeError, ValueError):
        return [{"sev": "alta", "texto": "Hay valores que no son números."}]

    if not monto and not pct:
        avisos.append({"sev": "alta",
            "texto": "El bono no tiene monto fijo ni porcentaje: no daría nada."})

    if pct > 0 and tope <= 0:
        avisos.append({"sev": "alta",
            "texto": "Bono por porcentaje sin tope. Un depósito grande "
                     "podría costar mucho más de lo previsto."})

    # El rollover es lo que protege el bono. Sin él, el cliente
    # deposita, recibe el bono y retira todo sin jugar.
    if rollover <= 0:
        avisos.append({"sev": "alta",
            "texto": "Sin rollover el cliente puede retirar el bono sin "
                     "apostar. Es plata regalada."})
    elif rollover < 3:
        avisos.append({"sev": "media",
            "texto": f"Rollover de {rollover:g}x es bajo. Lo habitual "
                     f"arranca en 5x."})
    elif rollover > 40:
        avisos.append({"sev": "media",
            "texto": f"Rollover de {rollover:g}x es muy alto: casi nadie "
                     f"lo va a cumplir y el bono deja de ser atractivo."})

    # Sin cuota mínima, el cliente cumple el rollover apostando a
    # favoritos de 1.05 sin riesgo real
    if cuota_min <= 0:
        avisos.append({"sev": "alta",
            "texto": "Sin cuota mínima, el rollover se cumple apostando a "
                     "cuotas de 1.05 sin riesgo. Poné al menos 1.50."})
    elif cuota_min < 1.3:
        avisos.append({"sev": "media",
            "texto": f"Cuota mínima de {cuota_min:g} es baja para exigir "
                     f"riesgo real."})

    if cuota_max > 0 and cuota_min > 0 and cuota_max <= cuota_min:
        avisos.append({"sev": "alta",
            "texto": "La cuota máxima es menor o igual a la mínima: "
                     "ninguna apuesta va a contar."})

    suma = pct_casa + pct_ag
    if abs(suma - 100) > 0.01:
        avisos.append({"sev": "alta",
            "texto": f"El reparto suma {suma:g}% y tiene que dar 100. "
                     f"La diferencia quedaría sin dueño."})

    if not b.get("requiere_verificacion"):
        avisos.append({"sev": "media",
            "texto": "Sin verificación de identidad, una persona puede "
                     "abrir varias cuentas y cobrar el bono en todas."})

    if b.get("deposito_minimo") in (None, 0, ""):
        if monto > 0:
            avisos.append({"sev": "media",
                "texto": "Bono de monto fijo sin depósito mínimo: se puede "
                         "reclamar sin poner nada."})
    return avisos


@app.post("/api/admin/bonos/revisar")
async def revisar_bono(request: Request, _=Depends(auth.require_admin)):
    """
    Qué implica este bono antes de guardarlo: costo estimado, quién
    lo paga y los problemas que se detecten.
    """
    b = await request.json()
    avisos = _revisar_bono(b)

    try:
        monto = float(b.get("monto_fijo") or 0)
        pct = float(b.get("porcentaje") or 0)
        tope = float(b.get("tope") or 0)
        rollover = float(b.get("rollover") or 0)
        pct_casa = float(b.get("pct_paga_casa") or 100)
        pct_ag = float(b.get("pct_paga_agencia") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Valores inválidos")

    # Lo máximo que puede costar cada bono otorgado
    costo_max = monto if monto else (tope if tope else 0)

    # Cuánto tiene que apostar el cliente para liberarlo
    a_apostar = round(costo_max * rollover, 2) if rollover else 0

    return {
        "avisos": avisos,
        "graves": sum(1 for a in avisos if a["sev"] == "alta"),
        "resumen": {
            "costo_por_bono": round(costo_max, 2),
            "reparto": {
                "casa": round(costo_max * pct_casa / 100, 2),
                "agencia": round(costo_max * pct_ag / 100, 2),
                "pct_casa": pct_casa, "pct_agencia": pct_ag,
            },
            "debe_apostar": a_apostar,
            "cuando_se_paga": ("Al liberarse el rollover. Mientras el "
                               "cliente juega con saldo de bono, nadie "
                               "puso plata todavía."),
        },
    }


@app.post("/api/admin/bonos/analizar")
async def analizar_bono_ia(request: Request, _=Depends(auth.require_admin)):
    """
    Lectura de la IA sobre el bono, con los números reales de la casa.
    Se pide a mano: las reglas cubren lo objetivo y esto cuesta.
    """
    b = await request.json()
    avisos = _revisar_bono(b)

    pool = await get_db()
    async with pool.acquire() as conn:
        # Cómo vienen los bonos que ya se dieron: sirve para saber si
        # el rollover que se está poniendo es alcanzable en la práctica
        hist = await conn.fetchrow("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(CASE WHEN estado='liberado' THEN 1 ELSE 0 END),0) AS liberados,
                   COALESCE(SUM(monto),0) AS total_otorgado
            FROM bonos_otorgados
            WHERE otorgado_at > NOW() - interval '90 days'
        """)
        costo = await conn.fetchval("""
            SELECT COALESCE(SUM(monto),0) FROM bonos_costos
            WHERE created_at > NOW() - interval '90 days'
        """) or 0
        margen = await conn.fetchrow("""
            SELECT COALESCE(SUM(stake),0) AS ap,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN potential_win ELSE 0 END),0) AS pg
            FROM betslips
            WHERE created_at > NOW() - interval '90 days'
              AND status IN ('won','lost','paid')
        """)

    ap = float(margen["ap"] or 0)
    pg = float(margen["pg"] or 0)
    margen_pct = round((ap - pg) / ap * 100, 2) if ap > 0 else None
    n = int(hist["n"] or 0)
    lib = int(hist["liberados"] or 0)

    prompt = f"""Sos el analista de una casa de apuestas deportivas.
Están por crear un bono y necesitan saber si tiene sentido.

CONFIGURACIÓN PROPUESTA:
- Monto fijo: {b.get('monto_fijo') or 'no'}
- Porcentaje del depósito: {b.get('porcentaje') or 'no'}%
- Tope: {b.get('tope') or 'sin tope'}
- Rollover: {b.get('rollover') or 0}x
- Cuota mínima para que cuente: {b.get('cuota_minima') or 'ninguna'}
- Depósito mínimo: {b.get('deposito_minimo') or 'ninguno'}
- Lo paga: {b.get('pct_paga_casa', 100)}% la casa, {b.get('pct_paga_agencia', 0)}% la agencia

CÓMO VIENE LA CASA (90 días):
- Margen sobre lo apostado: {margen_pct if margen_pct is not None else 'sin datos'}%
- Bonos otorgados: {n}, de los cuales se liberaron {lib}
  ({round(lib/n*100) if n else 0}%)
- Costo de bonos liberados: {float(costo):,.0f}

PROBLEMAS QUE YA DETECTAMOS:
{chr(10).join('- ' + a['texto'] for a in avisos) if avisos else '- ninguno'}

Respondé en español rioplatense, en prosa, 4 a 7 frases. Decí si el
bono se sostiene con ese margen, si el rollover es alcanzable mirando
cuántos se liberaron antes, y qué cambiarías. Sé concreto con números.
Si está bien, decilo sin inventar problemas. Sin titulos ni vinetas."""

    texto = await _consultar_claude_texto(prompt, max_tokens=600)
    return {"analisis": texto, "avisos": avisos,
            "contexto": {"margen_pct": margen_pct, "otorgados": n,
                         "liberados": lib, "costo_90d": round(float(costo), 2)}}


@app.get("/api/admin/bonos/costos")
async def costos_bonos(desde: str = "", hasta: str = "",
                       _=Depends(auth.require_admin)):
    """
    Cuánto costaron los bonos y quién lo pagó. Solo cuenta lo
    liberado: lo otorgado y no liberado todavía no costó nada.
    """
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        tot = await conn.fetchrow("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(monto),0) AS total,
                   COALESCE(SUM(costo_casa),0) AS casa,
                   COALESCE(SUM(costo_agencia),0) AS agencias
            FROM bonos_costos
            WHERE created_at::date BETWEEN $1 AND $2
              AND producto = 'sports'
        """, d, h)
        por_ag = await conn.fetch("""
            SELECT c.agencia_code, a.name,
                   COUNT(*) AS n,
                   COALESCE(SUM(c.costo_agencia),0) AS costo
            FROM bonos_costos c
            LEFT JOIN agencias a ON a.code = c.agencia_code
            WHERE c.created_at::date BETWEEN $1 AND $2
              AND c.costo_agencia > 0
            GROUP BY c.agencia_code, a.name
            ORDER BY 4 DESC
        """, d, h)
        pendiente = await conn.fetchval("""
            SELECT COALESCE(SUM(monto),0) FROM bonos_otorgados
            WHERE estado = 'activo'
        """) or 0

    return {
        "desde": str(d), "hasta": str(h),
        "liberados": int(tot["n"] or 0),
        "total": round(float(tot["total"] or 0), 2),
        "paga_casa": round(float(tot["casa"] or 0), 2),
        "paga_agencias": round(float(tot["agencias"] or 0), 2),
        "por_agencia": [{
            "code": f["agencia_code"], "nombre": f["name"],
            "bonos": int(f["n"]), "costo": round(float(f["costo"] or 0), 2),
        } for f in por_ag],
        # Lo que está en juego: si todos cumplen, esto se va a pagar
        "comprometido": round(float(pendiente), 2),
        "nota": ("Solo cuenta lo liberado. Los bonos activos todavía no "
                 "costaron nada: si el cliente pierde antes de cumplir el "
                 "rollover, no se paga."),
    }


# ── PERMISOS DE PRODUCTOS ─────────────────────────────────────
# Qué puede ofrecer cada agencia: deportivas, casino, ruleta.
#
# LA REGLA QUE SOSTIENE TODO: el permiso baja por el árbol y nadie
# puede ampliarlo. Una agencia puede quitarle un producto a las que
# cuelgan de ella, pero nunca darle algo que ella misma no tenga.
# Si el admin le sacó casino a una rama, ninguna agencia de esa rama
# lo tiene aunque su padre intente habilitarlo.
#
# Sin esa regla, una agencia intermedia podría devolverle a sus hijas
# algo que la casa le quitó, y el control se vuelve decorativo.

_prod_cache = {"datos": None, "ts": 0.0}
_PROD_TTL = 60


async def _catalogo_productos(conn):
    filas = await conn.fetch("""
        SELECT codigo, nombre, icono, activo, orden
        FROM productos_catalogo ORDER BY orden, codigo
    """)
    return [{"codigo": f["codigo"], "nombre": f["nombre"],
             "icono": f["icono"], "activo": bool(f["activo"]),
             "orden": int(f["orden"] or 0)} for f in filas]


async def _permisos_crudos(conn, forzar=False):
    """Todos los permisos definidos, indexados por agencia."""
    ahora = time.time()
    if not forzar and _prod_cache["datos"] is not None \
       and ahora - _prod_cache["ts"] < _PROD_TTL:
        return _prod_cache["datos"]
    filas = await conn.fetch(
        "SELECT agencia_code, producto, activo FROM productos_permisos")
    d = {}
    for f in filas:
        d.setdefault(f["agencia_code"], {})[f["producto"]] = bool(f["activo"])
    _prod_cache["datos"] = d
    _prod_cache["ts"] = ahora
    return d


async def _productos_de(conn, agencia_code):
    """
    Los productos que esta agencia realmente puede ofrecer.

    Se recorre la cadena desde la raíz hasta ella: si algún nivel lo
    tiene apagado, queda apagado sin importar lo que digan los de
    abajo. Por eso se evalúa de arriba hacia abajo y una vez que algo
    se apaga, no se vuelve a encender.
    """
    catalogo = await _catalogo_productos(conn)
    activos = {c["codigo"] for c in catalogo if c["activo"]}
    if not agencia_code:
        return activos

    permisos = await _permisos_crudos(conn)
    ruta = await conn.fetchval(
        "SELECT ruta FROM agencias WHERE code=$1", agencia_code) or ""
    cadena = [p for p in ruta.split("/") if p]
    if agencia_code not in cadena:
        cadena.append(agencia_code)

    resultado = set(activos)
    for code in cadena:
        propios = permisos.get(code) or {}
        for prod, on in propios.items():
            if not on:
                resultado.discard(prod)   # apagado arriba, apagado abajo
    return resultado


@app.get("/api/admin/productos")
async def admin_productos(_=Depends(auth.require_admin)):
    """Catálogo y qué agencias tienen algo apagado."""
    pool = await get_db()
    async with pool.acquire() as conn:
        catalogo = await _catalogo_productos(conn)
        filas = await conn.fetch("""
            SELECT p.agencia_code, p.producto, p.activo, p.definido_por,
                   a.name AS agencia_nombre
            FROM productos_permisos p
            LEFT JOIN agencias a ON a.code = p.agencia_code
            WHERE p.activo = false
            ORDER BY a.name
        """)
    return {
        "catalogo": catalogo,
        "restricciones": [{
            "agencia": f["agencia_code"],
            "agencia_nombre": f["agencia_nombre"],
            "producto": f["producto"],
            "definido_por": f["definido_por"],
        } for f in filas],
    }


@app.post("/api/admin/productos/catalogo")
async def admin_producto_global(request: Request,
                                _=Depends(auth.require_admin)):
    """Prender o apagar un producto en todo el sistema."""
    body = await request.json()
    codigo = (body.get("codigo") or "").strip()
    if not codigo:
        raise HTTPException(400, "Falta el producto")
    activo = bool(body.get("activo"))
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE productos_catalogo SET activo=$2 WHERE codigo=$1",
            codigo, activo)
        if r.endswith(" 0"):
            raise HTTPException(404, "Producto inexistente")
    _prod_cache["datos"] = None
    log.warning(f"[PRODUCTOS] {codigo} global: {'ON' if activo else 'OFF'}")
    return {"ok": True}


@app.post("/api/admin/productos/agencia")
async def admin_producto_agencia(request: Request,
                                 _=Depends(auth.require_admin)):
    """Prender o apagar un producto para una agencia y su rama."""
    body = await request.json()
    code = (body.get("agencia_code") or "").upper()
    producto = (body.get("producto") or "").strip()
    activo = bool(body.get("activo"))
    if not code or not producto:
        raise HTTPException(400, "Faltan datos")

    pool = await get_db()
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT 1 FROM agencias WHERE code=$1", code)
        if not existe:
            raise HTTPException(404, "Agencia inexistente")
        await conn.execute("""
            INSERT INTO productos_permisos
                (agencia_code, producto, activo, definido_por, updated_at)
            VALUES ($1,$2,$3,'admin',NOW())
            ON CONFLICT (agencia_code, producto)
            DO UPDATE SET activo=$3, definido_por='admin', updated_at=NOW()
        """, code, producto, activo)
    _prod_cache["datos"] = None
    log.warning(f"[PRODUCTOS] {producto} en {code}: "
                f"{'ON' if activo else 'OFF'}")
    return {"ok": True}


@app.get("/api/agencias/me/productos")
async def productos_agencia(agencia_code: str = Depends(requiere_agencia)):
    """
    Qué productos tiene y cuáles puede manejar para sus hijas.

    Solo puede tocar los que ella tenga: no se puede dar lo que no
    se tiene.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        catalogo = await _catalogo_productos(conn)
        mios = await _productos_de(conn, agencia_code)
        hijas = await conn.fetch("""
            SELECT code, name FROM agencias
            WHERE parent_code=$1 ORDER BY name
        """, agencia_code)
        permisos = await _permisos_crudos(conn)

        detalle = []
        for h in hijas:
            suyos = await _productos_de(conn, h["code"])
            propios = permisos.get(h["code"]) or {}
            detalle.append({
                "code": h["code"], "nombre": h["name"],
                "productos": sorted(suyos),
                # Lo que esta agencia apagó explícitamente para ella
                "apagados_aca": [k for k, v in propios.items() if not v],
            })

    return {
        "catalogo": [c for c in catalogo if c["activo"]],
        "mis_productos": sorted(mios),
        "hijas": detalle,
    }


@app.post("/api/agencias/me/productos")
async def set_producto_hija(request: Request,
                            agencia_code: str = Depends(requiere_agencia)):
    """
    La agencia apaga o prende un producto para una de sus hijas.

    No puede habilitar algo que ella no tenga: eso devolvería a la
    hija algo que la casa le quitó a toda la rama.
    """
    body = await request.json()
    hija = (body.get("agencia_code") or "").upper()
    producto = (body.get("producto") or "").strip()
    activo = bool(body.get("activo"))
    if not hija or not producto:
        raise HTTPException(400, "Faltan datos")

    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        if hija not in rama or hija == agencia_code:
            raise HTTPException(403, "Esa agencia no es de tu red")

        if activo:
            mios = await _productos_de(conn, agencia_code)
            if producto not in mios:
                raise HTTPException(403,
                    f"No podés habilitar {producto} porque tu agencia no "
                    f"lo tiene. Pedíselo a la administración.")

        await conn.execute("""
            INSERT INTO productos_permisos
                (agencia_code, producto, activo, definido_por, updated_at)
            VALUES ($1,$2,$3,$4,NOW())
            ON CONFLICT (agencia_code, producto)
            DO UPDATE SET activo=$3, definido_por=$4, updated_at=NOW()
        """, hija, producto, activo, agencia_code)
    _prod_cache["datos"] = None
    return {"ok": True}


# ── REPORTES POR PRODUCTO ─────────────────────────────────────
# Deportivas, casino y ruleta en un solo lugar, detallados y sumados.
#
# La vista v_actividad traduce las tres fuentes a la misma forma, así
# que acá no hace falta saber cómo guarda cada producto lo suyo.
#
# COMISIONES: el casino se liquida aparte y SOLO sobre GGR. No hay
# comisión por volumen porque el jugador puede apostar el mismo saldo
# cien veces: eso inflaría la base sin que la casa haya ganado nada.

async def _actividad_por_producto(conn, desde, hasta, codes=None):
    """Lo jugado por producto en el período, opcionalmente por rama."""
    if not await _hay_vista_actividad(conn):
        log.warning("[REPORTES] falta v_actividad: correr "
                    "migracion_productos.sql")
        return []
    if codes:
        filas = await conn.fetch("""
            SELECT producto, detalle,
                   COUNT(*) AS jugadas,
                   COUNT(DISTINCT user_id) AS jugadores,
                   COALESCE(SUM(apostado),0) AS apostado,
                   COALESCE(SUM(pagado),0) AS pagado,
                   COALESCE(SUM(ggr),0) AS ggr
            FROM v_actividad
            WHERE fecha::date BETWEEN $1 AND $2
              AND agencia_code = ANY($3)
            GROUP BY producto, detalle
            ORDER BY 7 DESC
        """, desde, hasta, codes)
    else:
        filas = await conn.fetch("""
            SELECT producto, detalle,
                   COUNT(*) AS jugadas,
                   COUNT(DISTINCT user_id) AS jugadores,
                   COALESCE(SUM(apostado),0) AS apostado,
                   COALESCE(SUM(pagado),0) AS pagado,
                   COALESCE(SUM(ggr),0) AS ggr
            FROM v_actividad
            WHERE fecha::date BETWEEN $1 AND $2
            GROUP BY producto, detalle
            ORDER BY 7 DESC
        """, desde, hasta)

    productos = {}
    for f in filas:
        p = f["producto"]
        d = productos.setdefault(p, {
            "producto": p, "jugadas": 0, "jugadores": 0,
            "apostado": 0.0, "pagado": 0.0, "ggr": 0.0, "detalle": []})
        d["jugadas"] += int(f["jugadas"] or 0)
        d["jugadores"] = max(d["jugadores"], int(f["jugadores"] or 0))
        d["apostado"] += float(f["apostado"] or 0)
        d["pagado"] += float(f["pagado"] or 0)
        d["ggr"] += float(f["ggr"] or 0)
        if f["detalle"]:
            d["detalle"].append({
                "nombre": f["detalle"],
                "jugadas": int(f["jugadas"] or 0),
                "apostado": round(float(f["apostado"] or 0), 2),
                "ggr": round(float(f["ggr"] or 0), 2),
            })

    salida = []
    for d in productos.values():
        ap = d["apostado"]
        salida.append({
            **d,
            "apostado": round(ap, 2),
            "pagado": round(d["pagado"], 2),
            "ggr": round(d["ggr"], 2),
            # El margen dice cuánto se queda la casa de lo que entró
            "margen_pct": round(d["ggr"] / ap * 100, 2) if ap > 0 else None,
            "detalle": sorted(d["detalle"], key=lambda x: -x["ggr"])[:12],
        })
    salida.sort(key=lambda x: -x["ggr"])
    return salida


@app.get("/api/admin/reportes/productos")
async def reporte_productos(desde: str = "", hasta: str = "",
                            agencia: str = "",
                            _=Depends(auth.require_admin)):
    """Todo lo jugado por producto, detallado y sumado."""
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        codes = None
        if agencia:
            codes = await codes_de_la_rama(conn, agencia.upper())
        productos = await _actividad_por_producto(conn, d, h, codes)

    total_ap = sum(p["apostado"] for p in productos)
    total_pg = sum(p["pagado"] for p in productos)
    total_ggr = sum(p["ggr"] for p in productos)

    return {
        "desde": str(d), "hasta": str(h),
        "agencia": agencia.upper() or None,
        "productos": productos,
        "total": {
            "apostado": round(total_ap, 2),
            "pagado": round(total_pg, 2),
            "ggr": round(total_ggr, 2),
            "margen_pct": (round(total_ggr / total_ap * 100, 2)
                           if total_ap > 0 else None),
            "jugadas": sum(p["jugadas"] for p in productos),
        },
    }


@app.get("/api/agencias/me/reportes/productos")
async def reporte_productos_agencia(desde: str = "", hasta: str = "",
                                    agencia_code: str = Depends(requiere_agencia)):
    """Lo mismo pero acotado a su rama."""
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        codes = await codes_de_la_rama(conn, agencia_code)
        productos = await _actividad_por_producto(conn, d, h, codes)

    total_ap = sum(p["apostado"] for p in productos)
    total_ggr = sum(p["ggr"] for p in productos)
    return {
        "desde": str(d), "hasta": str(h),
        "productos": productos,
        "total": {
            "apostado": round(total_ap, 2),
            "pagado": round(sum(p["pagado"] for p in productos), 2),
            "ggr": round(total_ggr, 2),
            "margen_pct": (round(total_ggr / total_ap * 100, 2)
                           if total_ap > 0 else None),
            "jugadas": sum(p["jugadas"] for p in productos),
        },
    }


# ── COMISIÓN DE CASINO EN CASCADA ─────────────────────────────

async def _hay_vista_actividad(conn):
    """
    ¿Existe v_actividad? Si falta la migración de productos, los
    reportes que la usan tienen que avisar en vez de reventar.
    """
    try:
        return bool(await conn.fetchval(
            "SELECT to_regclass('public.v_actividad') IS NOT NULL"))
    except Exception:
        return False


async def _comision_casino_cascada(conn, code, desde, hasta):
    """
    Lo que le corresponde a cada nivel por el casino de su rama.

    Igual que las deportivas: cada nivel cobra sobre lo que queda
    después de pagar a los de abajo. Pero solo sobre GGR, sin la
    parte de volumen.
    """
    hijas = await conn.fetch(
        "SELECT code FROM agencias WHERE parent_code=$1", code)

    # Lo que generó ella misma, sin contar sus hijas
    if not await _hay_vista_actividad(conn):
        propio = 0
    else:
        propio = await conn.fetchval("""
            SELECT COALESCE(SUM(ggr),0) FROM v_actividad
            WHERE producto IN ('casino','ruleta')
              AND agencia_code = $1
              AND fecha::date BETWEEN $2 AND $3
        """, code, desde, hasta) or 0

    pct = await conn.fetchval(
        "SELECT COALESCE(pct_ggr_casino,0) FROM agencias WHERE code=$1",
        code) or 0

    sub = []
    ggr_hijas = 0.0
    pagado_hijas = 0.0
    for h in hijas:
        r = await _comision_casino_cascada(conn, h["code"], desde, hasta)
        sub.append(r)
        ggr_hijas += r["ggr_total"]
        pagado_hijas += r["comision_total"]

    ggr_total = float(propio) + ggr_hijas
    # Sobre lo que queda después de pagarle a las de abajo
    base = ggr_total - pagado_hijas
    comision = round(base * float(pct) / 100, 2)

    return {
        "code": code,
        "pct": float(pct),
        "ggr_propio": round(float(propio), 2),
        "ggr_total": round(ggr_total, 2),
        "base": round(base, 2),
        "comision": comision,
        "comision_total": round(comision + pagado_hijas, 2),
        "hijas": sub,
    }


@app.get("/api/admin/comisiones-casino")
async def comisiones_casino(desde: str = "", hasta: str = "",
                            agencia: str = "",
                            _=Depends(auth.require_admin)):
    d = _a_fecha(desde) if desde else (datetime.now(TZ_CASA).date()
                                       - timedelta(days=30))
    h = _a_fecha(hasta) if hasta else datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            raiz = [agencia.upper()]
        else:
            raiz = [r["code"] for r in await conn.fetch(
                "SELECT code FROM agencias WHERE parent_code IS NULL")]
        arbol = [await _comision_casino_cascada(conn, c, d, h) for c in raiz]

    return {"desde": str(d), "hasta": str(h), "arbol": arbol,
            "nota": ("El casino se liquida solo sobre GGR. No hay comisión "
                     "por volumen: el mismo saldo puede jugarse muchas "
                     "veces y eso no significa más ganancia.")}


@app.post("/api/admin/agencias/{code}/comision-casino")
async def set_comision_casino(code: str, request: Request,
                              _=Depends(auth.require_admin)):
    body = await request.json()
    try:
        pct = float(body.get("pct_ggr_casino") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Porcentaje inválido")
    if not (0 <= pct <= 100):
        raise HTTPException(400, "El porcentaje va entre 0 y 100")

    pool = await get_db()
    async with pool.acquire() as conn:
        ant = await conn.fetchval(
            "SELECT COALESCE(pct_ggr_casino,0) FROM agencias WHERE code=$1",
            code.upper())
        if ant is None:
            raise HTTPException(404, "Agencia inexistente")
        await conn.execute(
            "UPDATE agencias SET pct_ggr_casino=$2 WHERE code=$1",
            code.upper(), pct)
        await conn.execute("""
            INSERT INTO comisiones_historial
                (agencia_code, pct_casino_ant, pct_casino_new, cambiado_por)
            VALUES ($1,$2,$3,'admin')
        """, code.upper(), float(ant), pct)
    log.warning(f"[COMISION] casino {code.upper()}: {ant}% → {pct}%")
    return {"ok": True, "anterior": float(ant), "nuevo": pct}


# ── ANÁLISIS DE LA APUESTA ANTES DE CONFIRMAR ─────────────────
# Le muestra al cliente qué tan probable considera el mercado la
# combinada que está por jugar.
#
# POR QUÉ ESTO NO ES UN PRONÓSTICO: la probabilidad implícita sale
# de la cuota, no de una opinión. 100/cuota es lo que el mercado
# estima, y es un dato verificable que el cliente puede comprobar
# solo. No se promete nada ni se sugiere qué jugar.
#
# Es información honesta: a más selecciones, menos chances. Que el
# cliente lo vea antes de confirmar es correcto, aunque a veces lo
# haga apostar menos.

def _prob_implicita(cuota):
    """Lo que el mercado estima, en porcentaje. 2.00 → 50%."""
    try:
        c = float(cuota)
        return (100.0 / c) if c > 1 else None
    except (TypeError, ValueError):
        return None


@app.post("/api/analizar-apuesta")
async def analizar_apuesta(request: Request):
    """
    Devuelve la probabilidad de la combinada y una lectura en
    palabras. Público: lo consulta la app y el sitio antes de que el
    cliente confirme.
    """
    body = await request.json()
    picks = body.get("picks") or []
    if not picks:
        raise HTTPException(400, "Faltan las selecciones")
    try:
        stake = float(body.get("stake") or 0)
    except (TypeError, ValueError):
        stake = 0

    detalle = []
    prob_total = 1.0
    cuota_total = 1.0
    sin_dato = False

    for p in picks:
        try:
            odd = float(p.get("odd") or 0)
        except (TypeError, ValueError):
            odd = 0
        pr = _prob_implicita(odd)
        if pr is None:
            sin_dato = True
            continue
        prob_total *= (pr / 100.0)
        cuota_total *= odd
        detalle.append({
            "evento": f"{p.get('h','')} vs {p.get('a','')}".strip(" vs"),
            "seleccion": p.get("sel") or p.get("label") or "",
            "cuota": round(odd, 2),
            "probabilidad": round(pr, 1),
        })

    if not detalle:
        raise HTTPException(400, "No se pudo leer ninguna cuota")

    pct = prob_total * 100
    premio = round(stake * cuota_total) if stake else None

    # La lectura en palabras. Nada de "tenés chances" ni de alentar:
    # se describe lo que dicen los números y se deja decidir.
    n = len(detalle)
    if n == 1:
        lectura = (f"El mercado le da un {pct:.0f}% de probabilidad a "
                   f"esta selección.")
    else:
        lectura = (f"Para cobrar tienen que acertar las {n} selecciones. "
                   f"El mercado estima esa combinación en {pct:.1f}%.")
        if pct < 1:
            lectura += (" Es una combinada muy difícil: menos de 1 de "
                        "cada 100 boletos así sale.")
        elif pct < 5:
            lectura += " Es exigente: sale aproximadamente 1 de cada 20."
        elif pct >= 40:
            lectura += " Es de las más alcanzables."

    # La pata más débil: la que más baja las chances del boleto
    floja = min(detalle, key=lambda x: x["probabilidad"]) if n > 1 else None
    if floja and floja["probabilidad"] < 35:
        lectura += (f" La más difícil es {floja['seleccion']} "
                    f"({floja['probabilidad']:.0f}%).")

    return {
        "picks": detalle,
        "cantidad": n,
        "cuota_total": round(cuota_total, 2),
        "probabilidad_pct": round(pct, 2),
        # Cada cuántos boletos así saldría uno, que se entiende mejor
        # que un porcentaje con decimales
        "uno_cada": round(100 / pct) if pct > 0 else None,
        "premio": premio,
        "lectura": lectura,
        "sin_dato": sin_dato,
        "nota": ("Sale de las cuotas, no de un pronóstico: es lo que el "
                 "mercado estima, no lo que va a pasar."),
    }


# ═══════════════════════════════════════════════════════════════
# SOPORTE AL JUGADOR
# ═══════════════════════════════════════════════════════════════
# El jugador escribe desde la app o el sitio. La IA responde lo
# repetitivo con datos reales de su cuenta; lo que no puede, o lo que
# toca dinero, se deriva a la agencia que lo dio de alta.
#
# QUÉ NO RESUELVE LA IA: reclamos de plata. Si alguien dice que le
# falta saldo, que le pagaron de menos o que una apuesta se liquidó
# mal, eso va derecho a un humano. Una respuesta automática ahí puede
# cerrar un problema real que después escala.

# Temas que siempre van a un humano, sin pasar por la IA
DERIVA_DIRECTA = [
    "no me pagaron", "no me pagó", "falta plata", "falta saldo",
    "me robaron", "me descontaron", "no me acreditaron", "reclamo",
    "estafa", "denuncia", "abogado", "fraude", "me sacaron",
    "cobré de menos", "cobre de menos", "pagaron mal", "liquidaron mal",
]


# Señales de que la persona puede estar en problemas con el juego.
# Esto NO es soporte: acá lo único correcto es frenar, no responder
# con un mensaje automático y ofrecerle limitar o cerrar la cuenta.
# Una respuesta liviana o que lo empuje a seguir jugando en este
# momento puede hacer un daño real.
TEMAS_SENSIBLES = [
    "recuperar lo perdido", "recuperar lo que perdi", "perdi todo",
    "no puedo parar", "adicto", "adiccion", "ludopata", "ludopatia",
    "me arruine", "preste plata para jugar", "pedi prestado para jugar",
    "no tengo para comer", "problema con el juego", "me estoy fundiendo",
    "gaste todo", "no doy mas", "quiero dejar de jugar",
    "cerrar mi cuenta", "autoexcluir", "autoexclusion",
]


def _sin_acentos(t):
    t = (t or "").lower()
    for a, b in (("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u")):
        t = t.replace(a, b)
    return t


def _requiere_humano(texto):
    """
    Devuelve (derivar, motivo). 'sensible' tiene prioridad sobre
    'dinero': si alguien menciona las dos cosas, lo que importa es
    la persona.
    """
    q = _sin_acentos(texto)
    for x in TEMAS_SENSIBLES:
        if _sin_acentos(x) in q:
            return True, "sensible"
    for x in DERIVA_DIRECTA:
        if _sin_acentos(x) in q:
            return True, "dinero"
    return False, ""


async def _contexto_jugador(conn, user_id):
    """Los datos de su cuenta, para que la IA responda con hechos."""
    u = await conn.fetchrow("""
        SELECT u.id, u.nombre_completo, u.username, u.balance, u.saldo_bono,
               u.moneda, u.creado_por, a.name AS agencia_nombre,
               a.whatsapp, a.telegram_url, a.soporte_horario
        FROM users u
        LEFT JOIN agencias a ON a.code = u.creado_por
        WHERE u.id = $1
    """, user_id)
    if not u:
        return None
    ultimas = await conn.fetch("""
        SELECT code, stake, odd_total, potential_win, status, created_at
        FROM betslips WHERE user_id=$1
        ORDER BY created_at DESC LIMIT 5
    """, user_id)
    return {
        "nombre": u["nombre_completo"] or u["username"],
        "saldo": int(u["balance"] or 0) // 100,
        "bono": int(u["saldo_bono"] or 0) // 100,
        "moneda": u["moneda"] or "ARS",
        "agencia": u["agencia_nombre"] or u["creado_por"],
        "agencia_code": u["creado_por"],
        "whatsapp": u["whatsapp"],
        "telegram": u["telegram_url"],
        "horario": u["soporte_horario"],
        "apuestas": [{
            "code": b["code"], "monto": float(b["stake"] or 0),
            "cuota": float(b["odd_total"] or 0),
            "premio": float(b["potential_win"] or 0),
            "estado": b["status"],
            "fecha": _fecha_local(b["created_at"]),
        } for b in ultimas],
    }


@app.post("/api/soporte/mensaje")
async def soporte_mensaje(request: Request):
    """
    El jugador escribe. Responde la IA si puede; si no, deriva.
    Público: lo usan la app y el sitio, que se identifican con el
    user_id que ya tienen de su sesión.
    """
    body = await request.json()
    user_id = body.get("user_id")
    texto = (body.get("texto") or "").strip()[:800]
    ticket_id = body.get("ticket_id")
    origen = body.get("origen") or "app"

    if not user_id or not texto:
        raise HTTPException(400, "Faltan datos")

    pool = await get_db()
    async with pool.acquire() as conn:
        ctx = await _contexto_jugador(conn, int(user_id))
        if not ctx:
            raise HTTPException(404, "Cliente inexistente")

        # Hilo abierto o uno nuevo
        if not ticket_id:
            t = await conn.fetchrow("""
                SELECT id FROM soporte_tickets
                WHERE user_id=$1 AND estado='abierto'
                ORDER BY created_at DESC LIMIT 1
            """, int(user_id))
            if t:
                ticket_id = t["id"]
            else:
                t = await conn.fetchrow("""
                    INSERT INTO soporte_tickets
                        (user_id, agencia_code, asunto, origen)
                    VALUES ($1,$2,$3,$4) RETURNING id
                """, int(user_id), ctx["agencia_code"], texto[:100], origen)
                ticket_id = t["id"]

        await conn.execute("""
            INSERT INTO soporte_mensajes (ticket_id, autor, texto)
            VALUES ($1,'cliente',$2)
        """, ticket_id, texto)

        # ¿Va directo a un humano?
        derivar, motivo = _requiere_humano(texto)
        if derivar:
            await conn.execute("""
                UPDATE soporte_tickets
                SET derivado=true, motivo_deriva=$2, updated_at=NOW()
                WHERE id=$1
            """, ticket_id, motivo)

            if motivo == "sensible":
                # Alguien que dice que no puede parar o que perdió todo
                # no necesita soporte técnico. Lo único correcto es
                # frenar, ofrecerle limitar la cuenta y que hable con
                # una persona. Nada de minimizar ni de seguir vendiendo.
                aviso = ("Gracias por decírmelo. Prefiero no contestarte "
                         "con un mensaje automático: esto lo va a ver "
                         "alguien de tu agencia.\n\n"
                         "Si sentís que el juego te está haciendo daño, "
                         "podés pedirnos que te limitemos el monto o que "
                         "cerremos tu cuenta cuando quieras. Se hace en "
                         "el momento y sin vueltas.")
            else:
                aviso = ("Esto lo tiene que ver una persona de tu agencia. "
                         "Ya les avisé y te van a responder.")

            await conn.execute("""
                INSERT INTO soporte_mensajes (ticket_id, autor, texto)
                VALUES ($1,'ia',$2)
            """, ticket_id, aviso)
            return {"ticket_id": ticket_id, "respuesta": aviso,
                    "derivado": True, "motivo": motivo,
                    "contacto": {
                        "agencia": ctx["agencia"],
                        "whatsapp": ctx["whatsapp"],
                        "telegram": ctx["telegram"],
                        "horario": ctx["horario"]}}

        # Si ya está derivado, no responde la IA: contesta el humano
        est = await conn.fetchrow(
            "SELECT derivado FROM soporte_tickets WHERE id=$1", ticket_id)
        if est and est["derivado"]:
            return {"ticket_id": ticket_id, "derivado": True,
                    "respuesta": None}

        previos = await conn.fetch("""
            SELECT autor, texto FROM soporte_mensajes
            WHERE ticket_id=$1 ORDER BY created_at DESC LIMIT 6
        """, ticket_id)

    hilo = ""
    for m in reversed(previos):
        quien = "Cliente" if m["autor"] == "cliente" else "Vos"
        hilo += f"\n{quien}: {m['texto'][:200]}"

    apuestas = "\n".join(
        f"- {a['code']}: apostó {a['monto']:.0f} a {a['cuota']:.2f}, "
        f"{a['estado']}, {a['fecha']}" for a in ctx["apuestas"]) or "ninguna"

    prompt = f"""Sos del equipo de atención de QuartzPlay, una casa de
apuestas deportivas. Atendés a un cliente por chat.

DATOS DE SU CUENTA:
- Nombre: {ctx['nombre']}
- Saldo: {ctx['saldo']} {ctx['moneda']}{f" (+ {ctx['bono']} de bono)" if ctx['bono'] else ""}
- Su agencia: {ctx['agencia']}
- Últimas apuestas:
{apuestas}

CONVERSACIÓN:{hilo}

REGLAS:
- Respondé solo con los datos que tenés. Si no sabés algo, decilo.
- Para cargar o retirar saldo, tiene que ir a su agencia: no se hace
  desde la app.
- Si te pregunta por qué perdió una apuesta, explicale con los datos
  que ves, sin justificar de más.
- Nunca le prometas que va a ganar ni le sugieras seguir apostando.
- Si menciona que está perdiendo mucho, que quiere recuperar lo
  perdido, o algo que suene a que el juego lo está afectando,
  respondé con cuidado y sugerile parar. No lo alientes.
- Si el tema necesita a una persona, decilo claro y no inventes.

Respondé en español rioplatense, 2 a 4 frases, amable y concreto.
Sin titulos ni vinetas."""

    respuesta = await _consultar_claude_texto(prompt, max_tokens=400)

    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO soporte_mensajes (ticket_id, autor, texto)
            VALUES ($1,'ia',$2)
        """, ticket_id, respuesta)
        await conn.execute(
            "UPDATE soporte_tickets SET updated_at=NOW() WHERE id=$1",
            ticket_id)

    return {"ticket_id": ticket_id, "respuesta": respuesta,
            "derivado": False}


@app.get("/api/soporte/contacto")
async def soporte_contacto(user_id: int):
    """
    Los canales de la agencia del cliente. Se consulta al abrir el
    chat para que los botones estén desde el primer momento y no
    recién cuando la IA deriva.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow("""
            SELECT a.name, a.whatsapp, a.telegram_url, a.soporte_horario
            FROM users u
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE u.id = $1
        """, user_id)
    if not r or not (r["whatsapp"] or r["telegram_url"]):
        return {"contacto": None}
    return {"contacto": {
        "agencia": r["name"], "whatsapp": r["whatsapp"],
        "telegram": r["telegram_url"], "horario": r["soporte_horario"],
    }}


@app.get("/api/soporte/hilo")
async def soporte_hilo(user_id: int, ticket_id: int = 0):
    """El historial de su conversación."""
    pool = await get_db()
    async with pool.acquire() as conn:
        if not ticket_id:
            t = await conn.fetchrow("""
                SELECT id FROM soporte_tickets
                WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1
            """, user_id)
            if not t:
                return {"ticket_id": None, "mensajes": [], "derivado": False}
            ticket_id = t["id"]
        tk = await conn.fetchrow(
            "SELECT * FROM soporte_tickets WHERE id=$1 AND user_id=$2",
            ticket_id, user_id)
        if not tk:
            raise HTTPException(404, "Conversación inexistente")
        msgs = await conn.fetch("""
            SELECT autor, texto, created_at FROM soporte_mensajes
            WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT 100
        """, ticket_id)
        cont = await conn.fetchrow("""
            SELECT a.name, a.whatsapp, a.telegram_url, a.soporte_horario
            FROM agencias a WHERE a.code=$1
        """, tk["agencia_code"]) if tk["agencia_code"] else None

    return {
        "ticket_id": ticket_id,
        "estado": tk["estado"],
        "derivado": bool(tk["derivado"]),
        "mensajes": [{
            "autor": m["autor"], "texto": m["texto"],
            "fecha": _fecha_local(m["created_at"]),
        } for m in msgs],
        "contacto": ({"agencia": cont["name"], "whatsapp": cont["whatsapp"],
                      "telegram": cont["telegram_url"],
                      "horario": cont["soporte_horario"]}
                     if cont else None),
    }


# ── DEL LADO DE QUIEN ATIENDE ─────────────────────────────────

@app.get("/api/agencias/me/soporte")
async def soporte_agencia(estado: str = "abierto",
                          agencia_code: str = Depends(requiere_agencia)):
    """Los tickets de sus clientes. Primero los derivados."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        filas = await conn.fetch("""
            SELECT t.*, u.nombre_completo, u.username, u.balance,
                   (SELECT texto FROM soporte_mensajes m
                    WHERE m.ticket_id=t.id ORDER BY created_at DESC LIMIT 1)
                     AS ultimo,
                   (SELECT COUNT(*) FROM soporte_mensajes m
                    WHERE m.ticket_id=t.id AND m.autor='cliente'
                      AND NOT m.leido) AS sin_leer
            FROM soporte_tickets t
            JOIN users u ON u.id = t.user_id
            WHERE t.agencia_code = ANY($1)
              AND ($2='todos' OR t.estado=$2)
            ORDER BY t.derivado DESC, t.updated_at DESC
            LIMIT 100
        """, rama, estado)
    return {"tickets": [{
        "id": f["id"], "cliente": f["nombre_completo"] or f["username"],
        "user_id": f["user_id"], "asunto": f["asunto"],
        "estado": f["estado"], "derivado": bool(f["derivado"]),
        "motivo": f["motivo_deriva"],
        "ultimo": (f["ultimo"] or "")[:120],
        "sin_leer": int(f["sin_leer"] or 0),
        "saldo": int(f["balance"] or 0) // 100,
        "fecha": _fecha_local(f["updated_at"]),
    } for f in filas],
        "derivados": sum(1 for f in filas if f["derivado"])}


@app.get("/api/agencias/me/soporte/{ticket_id}")
async def soporte_ticket(ticket_id: int,
                         agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        tk = await conn.fetchrow("""
            SELECT t.*, u.nombre_completo, u.username, u.balance, u.moneda
            FROM soporte_tickets t JOIN users u ON u.id=t.user_id
            WHERE t.id=$1 AND t.agencia_code = ANY($2)
        """, ticket_id, rama)
        if not tk:
            raise HTTPException(403, "Ese ticket no es de tu rama")
        msgs = await conn.fetch("""
            SELECT autor, texto, created_at FROM soporte_mensajes
            WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT 100
        """, ticket_id)
        await conn.execute("""
            UPDATE soporte_mensajes SET leido=true
            WHERE ticket_id=$1 AND autor='cliente' AND NOT leido
        """, ticket_id)
    return {
        "id": tk["id"], "cliente": tk["nombre_completo"] or tk["username"],
        "user_id": tk["user_id"],
        "saldo": int(tk["balance"] or 0) // 100,
        "moneda": tk["moneda"] or "ARS",
        "estado": tk["estado"], "derivado": bool(tk["derivado"]),
        "mensajes": [{
            "autor": m["autor"], "texto": m["texto"],
            "fecha": _fecha_local(m["created_at"]),
        } for m in msgs],
    }


@app.post("/api/agencias/me/soporte/{ticket_id}")
async def soporte_responder(ticket_id: int, request: Request,
                            agencia_code: str = Depends(requiere_agencia)):
    body = await request.json()
    texto = (body.get("texto") or "").strip()[:2000]
    cerrar = bool(body.get("cerrar"))

    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        tk = await conn.fetchval("""
            SELECT id FROM soporte_tickets
            WHERE id=$1 AND agencia_code = ANY($2)
        """, ticket_id, rama)
        if not tk:
            raise HTTPException(403, "Ese ticket no es de tu rama")
        if texto:
            await conn.execute("""
                INSERT INTO soporte_mensajes (ticket_id, autor, texto)
                VALUES ($1,'agencia',$2)
            """, ticket_id, texto)
        await conn.execute("""
            UPDATE soporte_tickets
            SET estado=$2, updated_at=NOW(),
                derivado = CASE WHEN $2='cerrado' THEN false ELSE derivado END
            WHERE id=$1
        """, ticket_id, "cerrado" if cerrar else "atendido")
    return {"ok": True}


@app.get("/api/admin/soporte")
async def soporte_admin(estado: str = "abierto",
                        _=Depends(auth.require_admin)):
    """Todos los tickets, para que el admin vea si alguna agencia
    está dejando clientes sin atender."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT t.*, u.nombre_completo, u.username,
                   a.name AS agencia_nombre,
                   (SELECT texto FROM soporte_mensajes m
                    WHERE m.ticket_id=t.id ORDER BY created_at DESC LIMIT 1)
                     AS ultimo
            FROM soporte_tickets t
            JOIN users u ON u.id = t.user_id
            LEFT JOIN agencias a ON a.code = t.agencia_code
            WHERE ($1='todos' OR t.estado=$1)
            ORDER BY t.derivado DESC, t.updated_at DESC
            LIMIT 150
        """, estado)
        # Los que llevan más de un día derivados sin respuesta
        colgados = await conn.fetchval("""
            SELECT COUNT(*) FROM soporte_tickets
            WHERE derivado AND estado='abierto'
              AND updated_at < NOW() - interval '24 hours'
        """)
    return {"tickets": [{
        "id": f["id"], "cliente": f["nombre_completo"] or f["username"],
        "agencia": f["agencia_nombre"] or f["agencia_code"],
        "asunto": f["asunto"], "estado": f["estado"],
        "derivado": bool(f["derivado"]), "motivo": f["motivo_deriva"],
        "ultimo": (f["ultimo"] or "")[:120],
        "fecha": _fecha_local(f["updated_at"]),
    } for f in filas],
        "sin_atender_24h": int(colgados or 0)}


@app.get("/api/agencias/me/contacto")
async def mi_contacto(agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow("""
            SELECT whatsapp, telegram_url, soporte_horario
            FROM agencias WHERE code=$1
        """, agencia_code)
    return {"whatsapp": r["whatsapp"] if r else None,
            "telegram_url": r["telegram_url"] if r else None,
            "horario": r["soporte_horario"] if r else None}


@app.post("/api/agencias/me/contacto")
async def guardar_mi_contacto(request: Request,
                              agencia_code: str = Depends(requiere_agencia)):
    """
    La agencia carga sus propios canales. Es la que atiende, así que
    es la que sabe qué número usa y en qué horario.
    """
    body = await request.json()
    wa = (body.get("whatsapp") or "").strip()[:30] or None
    tg = (body.get("telegram_url") or "").strip()[:200] or None
    hor = (body.get("horario") or "").strip()[:120] or None

    if wa and not re.fullmatch(r"[\d\s\+\-\(\)]{8,30}", wa):
        raise HTTPException(400,
            "El WhatsApp tiene que ser un número con código de país, "
            "por ejemplo +54 9 11 1234 5678")
    if tg and not tg.startswith(("https://t.me/", "http://t.me/", "@")):
        raise HTTPException(400,
            "El Telegram va como https://t.me/tuusuario o @tuusuario")
    # Se normaliza el @ a enlace, que es lo que el cliente puede tocar
    if tg and tg.startswith("@"):
        tg = "https://t.me/" + tg[1:]

    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE agencias SET whatsapp=$2, telegram_url=$3,
                   soporte_horario=$4
            WHERE code=$1
        """, agencia_code, wa, tg, hor)
    return {"ok": True, "whatsapp": wa, "telegram_url": tg}


@app.get("/api/admin/soporte/{ticket_id}")
async def admin_ticket(ticket_id: int, _=Depends(auth.require_admin)):
    """El hilo completo de un ticket, para que el admin pueda ver y
    responder cuando la agencia no contesta."""
    pool = await get_db()
    async with pool.acquire() as conn:
        t = await conn.fetchrow("""
            SELECT t.*, u.nombre_completo, u.username, u.balance, u.moneda,
                   a.name AS agencia_nombre, a.whatsapp
            FROM soporte_tickets t
            JOIN users u ON u.id = t.user_id
            LEFT JOIN agencias a ON a.code = t.agencia_code
            WHERE t.id = $1
        """, ticket_id)
        if not t:
            raise HTTPException(404, "Ticket inexistente")
        msgs = await conn.fetch("""
            SELECT autor, texto, created_at FROM soporte_mensajes
            WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT 100
        """, ticket_id)
    return {
        "id": t["id"], "estado": t["estado"], "derivado": t["derivado"],
        "motivo": t["motivo_deriva"], "origen": t["origen"],
        "cliente": t["nombre_completo"] or t["username"],
        "cliente_id": t["user_id"],
        "saldo": int(t["balance"] or 0) // 100,
        "moneda": t["moneda"] or "ARS",
        "agencia": t["agencia_nombre"] or t["agencia_code"],
        "mensajes": [{
            "autor": m["autor"], "texto": m["texto"],
            "fecha": _fecha_local(m["created_at"]),
        } for m in msgs],
    }


@app.post("/api/admin/soporte/{ticket_id}")
async def admin_responder_ticket(ticket_id: int, request: Request,
                                 _=Depends(auth.require_admin)):
    body = await request.json()
    texto = (body.get("texto") or "").strip()[:2000]
    cerrar = bool(body.get("cerrar"))
    pool = await get_db()
    async with pool.acquire() as conn:
        if texto:
            await conn.execute("""
                INSERT INTO soporte_mensajes (ticket_id, autor, texto)
                VALUES ($1,'admin',$2)
            """, ticket_id, texto)
        await conn.execute("""
            UPDATE soporte_tickets SET estado=$2, updated_at=NOW()
            WHERE id=$1
        """, ticket_id, "cerrado" if cerrar else "atendido")
    return {"ok": True}


@app.post("/api/admin/agencias/{code}/contacto")
async def guardar_contacto(code: str, request: Request,
                           _=Depends(auth.require_admin)):
    """Los canales de la agencia: se muestran cuando hace falta un humano."""
    body = await request.json()
    wa = (body.get("whatsapp") or "").strip()[:30] or None
    if wa:
        # Solo dígitos y el signo inicial: es lo que arma el enlace
        limpio = re.sub(r"[^\d+]", "", wa)
        if not re.fullmatch(r"\+?\d{8,15}", limpio):
            raise HTTPException(400,
                "El WhatsApp tiene que ser un número con código de país, "
                "por ejemplo +5491122334455")
        wa = limpio
    tg = (body.get("telegram_url") or "").strip()[:120] or None
    if tg and not tg.startswith("http"):
        tg = "https://t.me/" + tg.lstrip("@")

    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            UPDATE agencias SET whatsapp=$2, telegram_url=$3,
                   soporte_horario=$4
            WHERE code=$1
        """, code.upper(), wa, tg,
             (body.get("soporte_horario") or "")[:100] or None)
        if r.endswith("0"):
            raise HTTPException(404, "Agencia inexistente")
    return {"ok": True}


# MENSAJERÍA INTERNA
# ═══════════════════════════════════════════════════════════════
# Conversación entre el admin y cada agencia, más avisos que bajan
# por el árbol.
#
# POR QUÉ NO HAY CHAT ENTRE AGENCIAS: cada una ve solo su rama, y un
# canal directo entre agencias rompería ese aislamiento. Si dos
# agencias necesitan coordinar, lo hacen por fuera.
#
# LOS AVISOS SE GUARDAN UNA VEZ: en vez de una copia por agencia, se
# guarda uno solo con su alcance y se resuelve a quién le toca al
# consultarlo. Con cientos de agencias, la diferencia es grande.

@app.get("/api/admin/mensajes")
async def admin_hilos(_=Depends(auth.require_admin)):
    """Los hilos con todas las agencias, con lo último de cada uno."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT a.code, a.name,
                   (SELECT texto FROM mensajes m WHERE m.agencia_code=a.code
                    ORDER BY created_at DESC LIMIT 1) AS ultimo,
                   (SELECT created_at FROM mensajes m WHERE m.agencia_code=a.code
                    ORDER BY created_at DESC LIMIT 1) AS fecha,
                   (SELECT COUNT(*) FROM mensajes m WHERE m.agencia_code=a.code
                    AND NOT m.de_admin AND NOT m.leido) AS sin_leer
            FROM agencias a
            WHERE COALESCE(a.tipo,'agencia') <> 'influencer'
            ORDER BY
                (SELECT COUNT(*) FROM mensajes m WHERE m.agencia_code=a.code
                 AND NOT m.de_admin AND NOT m.leido) DESC,
                (SELECT created_at FROM mensajes m WHERE m.agencia_code=a.code
                 ORDER BY created_at DESC LIMIT 1) DESC NULLS LAST
            LIMIT 200
        """)
    return {"hilos": [{
        "code": f["code"], "nombre": f["name"],
        "ultimo": (f["ultimo"] or "")[:120],
        "fecha": _fecha_local(f["fecha"]) if f["fecha"] else None,
        "sin_leer": int(f["sin_leer"] or 0),
    } for f in filas],
        "total_sin_leer": sum(int(f["sin_leer"] or 0) for f in filas)}


@app.get("/api/admin/mensajes/{code}")
async def admin_hilo(code: str, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT id, de_admin, texto, autor, created_at
            FROM mensajes WHERE agencia_code=$1
            ORDER BY created_at ASC LIMIT 200
        """, code.upper())
        # Al abrir el hilo se marcan leídos los de la agencia
        await conn.execute("""
            UPDATE mensajes SET leido=true
            WHERE agencia_code=$1 AND NOT de_admin AND NOT leido
        """, code.upper())
    return {"mensajes": [{
        "id": f["id"], "mio": f["de_admin"], "texto": f["texto"],
        "autor": f["autor"], "fecha": _fecha_local(f["created_at"]),
    } for f in filas]}


@app.post("/api/admin/mensajes/{code}")
async def admin_enviar(code: str, request: Request,
                       _=Depends(auth.require_admin)):
    body = await request.json()
    texto = (body.get("texto") or "").strip()[:2000]
    if not texto:
        raise HTTPException(400, "Escribí un mensaje")
    pool = await get_db()
    async with pool.acquire() as conn:
        existe = await conn.fetchval(
            "SELECT 1 FROM agencias WHERE code=$1", code.upper())
        if not existe:
            raise HTTPException(404, "Agencia inexistente")
        await conn.execute("""
            INSERT INTO mensajes (agencia_code, de_admin, texto, autor)
            VALUES ($1, true, $2, 'admin')
        """, code.upper(), texto)
    return {"ok": True}


@app.get("/api/agencias/me/mensajes")
async def agencia_hilo(agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT id, de_admin, texto, created_at
            FROM mensajes WHERE agencia_code=$1
            ORDER BY created_at ASC LIMIT 200
        """, agencia_code)
        await conn.execute("""
            UPDATE mensajes SET leido=true
            WHERE agencia_code=$1 AND de_admin AND NOT leido
        """, agencia_code)
    return {"mensajes": [{
        "id": f["id"], "mio": not f["de_admin"], "texto": f["texto"],
        "fecha": _fecha_local(f["created_at"]),
    } for f in filas]}


@app.post("/api/agencias/me/mensajes")
async def agencia_enviar(request: Request,
                         agencia_code: str = Depends(requiere_agencia)):
    body = await request.json()
    texto = (body.get("texto") or "").strip()[:2000]
    if not texto:
        raise HTTPException(400, "Escribí un mensaje")
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO mensajes (agencia_code, de_admin, texto, autor)
            VALUES ($1, false, $2, $1)
        """, agencia_code, texto)
    return {"ok": True}


@app.get("/api/agencias/me/mensajes/pendientes")
async def agencia_pendientes(agencia_code: str = Depends(requiere_agencia)):
    """Para el indicador: cuántos mensajes del admin sin leer."""
    pool = await get_db()
    async with pool.acquire() as conn:
        n = await conn.fetchval("""
            SELECT COUNT(*) FROM mensajes
            WHERE agencia_code=$1 AND de_admin AND NOT leido
        """, agencia_code)
    return {"sin_leer": int(n or 0)}


# ── AVISOS EN CASCADA ─────────────────────────────────────────

@app.post("/api/admin/avisos")
async def crear_aviso(request: Request, _=Depends(auth.require_admin)):
    """
    Un aviso que baja por el árbol. Con alcance 'rama' alcanza a la
    agencia indicada y todo lo que cuelga de ella.
    """
    body = await request.json()
    titulo = (body.get("titulo") or "").strip()[:150]
    if not titulo:
        raise HTTPException(400, "Falta el título")

    nivel = body.get("nivel") or "info"
    if nivel not in ("info", "aviso", "urgente"):
        raise HTTPException(400, "Nivel inválido")

    alcance = body.get("alcance") or "todas"
    if alcance not in ("todas", "rama", "agencia"):
        raise HTTPException(400, "Alcance inválido")

    # A qué superficies llega. Un aviso operativo va solo a las
    # agencias; una promoción, también a los clientes.
    destinos = body.get("destinos") or ["agencia"]
    if not isinstance(destinos, list) or not destinos:
        raise HTTPException(400, "Elegí al menos un destino")
    validos = {"agencia", "box", "app", "web"}
    destinos = [d for d in destinos if d in validos]
    if not destinos:
        raise HTTPException(400, "Destinos inválidos")
    code = (body.get("agencia_code") or "").upper() or None
    if alcance != "todas" and not code:
        raise HTTPException(400, "Falta la agencia para ese alcance")

    horas = body.get("horas")
    vence = None
    if horas:
        try:
            vence = datetime.now(timezone.utc) + timedelta(hours=float(horas))
        except (TypeError, ValueError):
            vence = None

    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO avisos
                (titulo, cuerpo, nivel, alcance, agencia_code, vence_at,
                 destinos, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'admin')
            RETURNING id
        """, titulo, (body.get("cuerpo") or "")[:2000] or None,
             nivel, alcance, code, vence, ",".join(destinos))
    log.warning(f"[AVISO] {nivel} · {alcance} · {titulo[:60]}")
    return {"ok": True, "id": row["id"]}


@app.get("/api/admin/avisos")
async def listar_avisos(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT a.*, ag.name AS agencia_nombre,
                   (SELECT COUNT(*) FROM avisos_vistos v WHERE v.aviso_id=a.id)
                     AS vistos
            FROM avisos a
            LEFT JOIN agencias ag ON ag.code = a.agencia_code
            ORDER BY a.created_at DESC LIMIT 60
        """)
    return {"avisos": [{
        "id": f["id"], "titulo": f["titulo"], "cuerpo": f["cuerpo"],
        "nivel": f["nivel"], "alcance": f["alcance"],
        # Alcance es A QUÉ AGENCIAS; destinos es EN QUÉ PANTALLAS.
        # Sin este dato, el listado no podía distinguirlos.
        "destinos": (f["destinos"] or "agencia").split(","),
        "agencia": f["agencia_code"], "agencia_nombre": f["agencia_nombre"],
        "vistos": int(f["vistos"] or 0),
        "vence": _fecha_local(f["vence_at"]) if f["vence_at"] else None,
        "vigente": (f["vence_at"] is None
                    or f["vence_at"] > datetime.now(timezone.utc)),
        "fecha": _fecha_local(f["created_at"]),
    } for f in filas]}


@app.delete("/api/admin/avisos/{aviso_id}")
async def borrar_aviso(aviso_id: int, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM avisos WHERE id=$1", aviso_id)
    return {"ok": True}


@app.get("/api/agencias/me/avisos")
async def avisos_agencia(agencia_code: str = Depends(requiere_agencia)):
    """
    Los avisos vigentes que le tocan a esta agencia. Se resuelve el
    alcance acá en vez de guardar una copia por agencia.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        ruta = await conn.fetchval(
            "SELECT ruta FROM agencias WHERE code=$1", agencia_code) or ""
        filas = await conn.fetch("""
            SELECT a.id, a.titulo, a.cuerpo, a.nivel, a.alcance,
                   a.agencia_code, a.created_at,
                   (v.aviso_id IS NOT NULL) AS visto
            FROM avisos a
            LEFT JOIN avisos_vistos v
                   ON v.aviso_id = a.id AND v.agencia_code = $1
            WHERE (a.vence_at IS NULL OR a.vence_at > NOW())
              AND COALESCE(a.destinos,'agencia') LIKE '%agencia%'
            ORDER BY
                CASE a.nivel WHEN 'urgente' THEN 3 WHEN 'aviso' THEN 2
                             ELSE 1 END DESC,
                a.created_at DESC
            LIMIT 30
        """, agencia_code)

    salida = []
    for f in filas:
        al = f["alcance"]
        destino = f["agencia_code"]
        if al == "todas":
            aplica = True
        elif al == "agencia":
            aplica = destino == agencia_code
        else:  # rama
            aplica = (destino == agencia_code
                      or (ruta and destino
                          and (ruta.startswith(destino + "/")
                               or f"/{destino}/" in ruta)))
        if not aplica:
            continue
        salida.append({
            "id": f["id"], "titulo": f["titulo"], "cuerpo": f["cuerpo"],
            "nivel": f["nivel"], "visto": bool(f["visto"]),
            "fecha": _fecha_local(f["created_at"]),
        })
    return {"avisos": salida,
            "sin_ver": sum(1 for a in salida if not a["visto"])}


@app.get("/api/avisos")
async def avisos_publicos(destino: str = "app", agencia_code: str = ""):
    """
    Avisos para clientes y terminales. Público porque lo consumen la
    app, el sitio y el box, que no tienen sesión de agencia.

    Solo devuelve los que el admin marcó para ese destino: un aviso
    operativo para agencias no tiene por qué verlo un jugador.
    """
    if destino not in ("app", "web", "box"):
        raise HTTPException(400, "Destino inválido")

    pool = await get_db()
    async with pool.acquire() as conn:
        ruta = None
        if agencia_code:
            ruta = await conn.fetchval(
                "SELECT ruta FROM agencias WHERE code=$1",
                agencia_code.upper())
        filas = await conn.fetch("""
            SELECT id, titulo, cuerpo, nivel, alcance, agencia_code,
                   created_at, COALESCE(destinos,'agencia') AS destinos
            FROM avisos
            WHERE (vence_at IS NULL OR vence_at > NOW())
              AND COALESCE(destinos,'agencia') LIKE '%' || $1 || '%'
            ORDER BY
                CASE nivel WHEN 'urgente' THEN 3 WHEN 'aviso' THEN 2
                           ELSE 1 END DESC,
                created_at DESC
            LIMIT 20
        """, destino)

    salida = []
    for f in filas:
        al = f["alcance"]
        dst = f["agencia_code"]
        if al == "todas":
            aplica = True
        elif not agencia_code:
            # Sin agencia (app o sitio abierto) solo llegan los globales
            aplica = False
        elif al == "agencia":
            aplica = dst == agencia_code.upper()
        else:
            aplica = (dst == agencia_code.upper()
                      or (ruta and dst
                          and (ruta.startswith(dst + "/")
                               or f"/{dst}/" in ruta)))
        if aplica:
            salida.append({
                "id": f["id"], "titulo": f["titulo"],
                "cuerpo": f["cuerpo"], "nivel": f["nivel"],
                "fecha": _fecha_local(f["created_at"]),
            })
    return {"avisos": salida}


@app.post("/api/agencias/me/avisos/{aviso_id}/visto")
async def marcar_aviso_visto(aviso_id: int,
                             agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO avisos_vistos (aviso_id, agencia_code)
            VALUES ($1,$2) ON CONFLICT DO NOTHING
        """, aviso_id, agencia_code)
    return {"ok": True}


# BOT DE TELEGRAM CONVERSACIONAL
# ═══════════════════════════════════════════════════════════════
# Hasta ahora el bot solo abría la web. Acá pasa a resolver en el
# chat lo que el chat hace mejor: consultar y apostar algo ya armado.
#
# QUÉ SE APUESTA EN EL CHAT: combos flash y cuotas destacadas, con
# botones de monto. Armar una combinada libre desde cero serían diez
# idas y vueltas donde la app resuelve en tres toques — el chat es
# para lo inmediato, la app para explorar.
#
# CÓMO SE MANEJA EL COSTO: los botones no consumen IA. Solo el texto
# libre pasa por el modelo, y va al modelo chico salvo que necesite
# entender algo complejo.

APP_URL = os.environ.get("APP_URL", "https://juego.iaqp.lat")
# El usuario del bot, sin la arroba. Se usa para armar el enlace que
# abre Telegram con la terminal ya cargada.
TELEGRAM_BOT_USER = os.environ.get("TELEGRAM_BOT_USER", "Quartzplay_bot")

# Los mismos montos que muestra la app, para que el chat no sugiera
# cifras que no tienen sentido en esa moneda.
MONTOS_MONEDA = {
    "ARS": [2000, 5000, 10000, 20000],
    "CLP": [2000, 5000, 10000, 20000],
    "COP": [5000, 10000, 20000, 50000],
    "PYG": [10000, 20000, 50000, 100000],
    "USD": [5, 10, 20, 50],
    "EUR": [5, 10, 20, 50],
    "BRL": [10, 25, 50, 100],
    "UYU": [100, 250, 500, 1000],
    "PEN": [10, 25, 50, 100],
    "MXN": [50, 100, 250, 500],
}


def montos_de_moneda(moneda):
    return MONTOS_MONEDA.get((moneda or "ARS").upper(), MONTOS_MONEDA["ARS"])


async def _texto_equipo(conn, equipo):
    """
    Cuándo juega su equipo y a cuánto paga. Datos, no promesas: nada
    de "hoy es tu día de suerte", que además de falso es lo que un
    regulador mira con lupa.
    """
    eq = (equipo or "").lower().strip()
    encontrados = []
    for dep in _eventos_del_feed():
        if True:
            for ev in dep.get("events", []) or []:
                h = (ev.get("h") or "").lower()
                a = (ev.get("a") or "").lower()
                if eq in h or eq in a:
                    odds = ev.get("odds") or {}
                    local = eq in h
                    encontrados.append({
                        "rival": ev.get("a") if local else ev.get("h"),
                        "local": local,
                        "hora": ev.get("time"),
                        "liga": dep.get("name"),
                        "cuota": odds.get("L") if local else odds.get("V"),
                        "empate": odds.get("E"),
                        "otra": odds.get("V") if local else odds.get("L"),
                    })

    if not encontrados:
        return (f"No encontré partidos de <b>{equipo}</b> en la cartelera "
                f"de ahora.\n\nTe aviso cuando aparezca.")

    e = encontrados[0]
    t = f"⚽ <b>{equipo}</b>\n\n"
    t += f"{'De local' if e['local'] else 'De visitante'} vs "
    t += f"<b>{e['rival']}</b>\n"
    if e["liga"]:
        t += f"{e['liga']}\n"
    if e["hora"]:
        t += f"🕐 {e['hora']}\n"
    if e["cuota"]:
        try:
            c = float(e["cuota"])
            # La probabilidad implícita es un dato útil y verificable:
            # le dice cuánto de probable considera el mercado que gane.
            prob = 100 / c
            t += (f"\nQue gane paga <b>{c:.2f}</b>\n"
                  f"El mercado le da un {prob:.0f}% de chances")
        except (TypeError, ValueError):
            pass
    if len(encontrados) > 1:
        t += f"\n\nTiene {len(encontrados)} partidos en cartelera."
    return t


async def _tg_guia(chat_id, texto, cli):
    """
    Texto libre del cliente. Lo resuelve la IA, pero solo lo que no
    se puede resolver con reglas: el saldo, las apuestas y el equipo
    salen de la base y no consumen nada.

    El tono es de guía, no de vendedor. No promete suerte ni empuja a
    apostar: da datos y deja decidir.
    """
    q = texto.lower()

    # Atajos sin IA: cubren la mayoría de lo que se pregunta
    if any(x in q for x in ("saldo", "cuanto tengo", "cuánto tengo")):
        if cli:
            saldo = int(cli["balance"] or 0) // 100
            await _tg_responder(chat_id,
                f"Tenés <b>{saldo:,}</b> {cli['moneda'] or 'ARS'}".replace(",", "."),
                [[("← Menú", "menu")]])
        else:
            await _tg_responder(chat_id, "Primero vinculá tu cuenta.",
                                _menu_principal(False))
        return

    if any(x in q for x in ("mis apuestas", "mi apuesta", "boleto")):
        await _tg_boton({"data": "apuestas", "id": "",
                         "message": {"chat": {"id": chat_id}},
                         "from": {"id": cli["id"] if cli else 0}})
        return

    # ¿Está diciendo de qué equipo es?
    if cli and any(x in q for x in ("soy de", "hincha de", "mi equipo es")):
        equipo = texto
        for marca in ("soy de", "hincha de", "mi equipo es"):
            if marca in q:
                equipo = texto[q.index(marca) + len(marca):].strip(" .!¡")
                break
        if equipo:
            pool = await get_db()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE users SET equipo_favorito=$2 WHERE id=$1",
                    cli["id"], equipo[:60])
                info = await _texto_equipo(conn, equipo)
            await _tg_responder(chat_id,
                f"Anotado, sos de <b>{equipo}</b> 👊\n\n{info}",
                [[("← Menú", "menu")]])
            return

    # Lo que queda va a la IA, con contexto corto para que salga barato
    ctx = ""
    if cli:
        saldo = int(cli["balance"] or 0) // 100
        ctx = (f"El cliente se llama {cli['nombre_completo'] or ''}, "
               f"tiene {saldo} de saldo en {cli['moneda'] or 'ARS'}")
        if cli["equipo_favorito"]:
            ctx += f" y es hincha de {cli['equipo_favorito']}"
        ctx += "."

    prompt = f"""Sos el asistente de QuartzPlay, una casa de apuestas
deportivas. Hablás con un cliente por Telegram.

{ctx}

Podés ayudarlo con: consultar su saldo, ver sus apuestas, mostrarle el
combo del día, o contarle cuándo juega su equipo.

REGLAS IMPORTANTES:
- Nunca prometas suerte ni digas que hoy es un buen día para apostar.
- No lo empujes a jugar. Si pregunta algo, respondé; no ofrezcas de más.
- Si te pide un pronóstico, aclarale que nadie sabe el resultado y que
  la cuota solo dice qué tan probable lo considera el mercado.
- Si menciona que está perdiendo mucho o que quiere recuperar lo perdido,
  no lo alientes: sugerile tomarse un descanso.

Mensaje del cliente: {texto[:300]}

Respondé en español rioplatense, 2 o 3 frases, cercano pero sin
exagerar. Sin titulos ni vinetas."""

    respuesta = await _consultar_claude_texto(prompt, max_tokens=300)
    await _tg_responder(chat_id, respuesta, [[("← Menú", "menu")]])


async def _tg_responder(chat_id, texto, botones=None, editar=None):
    """
    Manda o edita un mensaje. 'botones' es una lista de filas, cada
    una con pares (etiqueta, dato). El dato vuelve cuando lo tocan.
    """
    if not TELEGRAM_TOKEN:
        return
    cuerpo = {"chat_id": chat_id, "text": texto[:4000],
              "parse_mode": "HTML"}
    if botones:
        cuerpo["reply_markup"] = {"inline_keyboard": [
            [{"text": t, "callback_data": d[:64]} for t, d in fila]
            for fila in botones]}
    metodo = "editMessageText" if editar else "sendMessage"
    if editar:
        cuerpo["message_id"] = editar
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            await cli.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/{metodo}",
                json=cuerpo)
    except Exception as e:
        log.warning(f"[TG] no se pudo responder a {chat_id}: {e}")


async def _tg_confirmar(callback_id, texto=""):
    """Le saca el reloj al botón que el cliente tocó."""
    if not TELEGRAM_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=8) as cli:
            await cli.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery",
                json={"callback_query_id": callback_id, "text": texto[:200]})
    except Exception:
        pass


async def _tg_cliente(conn, tg_id):
    """El cliente vinculado a ese Telegram, o None."""
    return await conn.fetchrow("""
        SELECT id, nombre_completo, username, balance, saldo_bono,
               moneda, creado_por, equipo_favorito, bloqueado
        FROM users WHERE telegram_id = $1
    """, tg_id)


def _menu_principal(vinculado):
    if not vinculado:
        return [[("🔗 Vincular mi cuenta", "vincular")],
                [("📱 Abrir la app", "app")]]
    return [
        [("💰 Mi saldo", "saldo"), ("🎫 Mis apuestas", "apuestas")],
        [("⚡ Combo del día", "flash")],
        [("⚽ Mi equipo", "equipo"), ("📱 Abrir la app", "app")],
    ]


# ── COMBOS FLASH: exclusivos del chat ─────────────────────────
# Un combo que solo existe en Telegram, con un extra sobre el premio
# y vencimiento corto. Es lo que le da al bot una razón de ser que un
# enlace a la web no tiene.

FLASH_TTL_MIN = int(os.environ.get("FLASH_TTL_MIN", "90"))
FLASH_EXTRA_PCT = float(os.environ.get("FLASH_EXTRA_PCT", "10"))
_flash_cache = {"cfg": None, "ts": 0.0}


async def _flash_config(conn):
    """
    Config del combo flash. Arranca del entorno pero se ajusta desde
    el admin sin reiniciar: el extra sale del margen de la casa, así
    que tiene que poder apagarse rápido si molesta.
    """
    ahora = time.time()
    if _flash_cache["cfg"] is not None and ahora - _flash_cache["ts"] < 60:
        return _flash_cache["cfg"]
    try:
        filas = await conn.fetch(
            "SELECT clave, valor FROM app_config WHERE clave LIKE 'flash_%'")
        c = {f["clave"]: f["valor"] for f in filas}
    except Exception:
        c = {}
    cfg = {
        "activo": c.get("flash_activo", "1") == "1",
        "ttl_min": int(c.get("flash_ttl_min") or FLASH_TTL_MIN),
        "extra_pct": float(c.get("flash_extra_pct") or FLASH_EXTRA_PCT),
        "tope_apuesta": int(c.get("flash_tope") or 0),
    }
    _flash_cache["cfg"] = cfg
    _flash_cache["ts"] = ahora
    return cfg


@app.get("/api/admin/flash")
async def flash_admin(dias: int = 30, _=Depends(auth.require_admin)):
    """Config y cuánto costó el extra hasta ahora."""
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _flash_config(conn)
        # Los boletos que salieron de un flash llevan boost_pct
        r = await conn.fetchrow("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(stake),0) AS apostado,
                   COALESCE(SUM(boost_extra),0) AS extra_total,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN boost_extra ELSE 0 END),0) AS extra_pagado,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN potential_win ELSE 0 END),0) AS pagado
            FROM betslips
            WHERE boost_pct > 0
              AND created_at > NOW() - ($1 || ' days')::interval
        """, str(dias))
        generados = await conn.fetchval("""
            SELECT COUNT(*) FROM combos_flash
            WHERE created_at > NOW() - ($1 || ' days')::interval
        """, str(dias)) or 0
        vigente = await _flash_vigente(conn)

    apostado = float(r["apostado"] or 0)
    pagado = float(r["pagado"] or 0)
    return {
        **cfg,
        "dias": dias,
        "generados": int(generados),
        "apostados": int(r["n"] or 0),
        "volumen": round(apostado, 2),
        "pagado": round(pagado, 2),
        # Lo que costó el extra: solo se paga si el cliente acierta
        "extra_comprometido": round(float(r["extra_total"] or 0), 2),
        "extra_pagado": round(float(r["extra_pagado"] or 0), 2),
        "resultado": round(apostado - pagado, 2),
        "hay_vigente": bool(vigente),
    }


@app.post("/api/admin/flash")
async def flash_guardar(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    try:
        ttl = int(body.get("ttl_min") or FLASH_TTL_MIN)
        extra = float(body.get("extra_pct") or 0)
        tope = int(body.get("tope_apuesta") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Valores inválidos")

    if not (5 <= ttl <= 1440):
        raise HTTPException(400, "La vigencia va entre 5 minutos y 24 horas")
    if not (0 <= extra <= 50):
        raise HTTPException(400,
            "El extra va entre 0 y 50%. Más arriba se come el margen "
            "de cualquier combinada.")
    if tope < 0:
        raise HTTPException(400, "El tope no puede ser negativo")

    vals = {
        "flash_activo": "1" if body.get("activo") else "0",
        "flash_ttl_min": str(ttl),
        "flash_extra_pct": str(extra),
        "flash_tope": str(tope),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at)
                VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    _flash_cache["cfg"] = None
    log.warning(f"[FLASH] config: activo={body.get('activo')} "
                f"ttl={ttl} extra={extra}% tope={tope}")
    return {"ok": True}


async def _flash_vigente(conn):
    """El combo flash de ahora, o None si venció."""
    return await conn.fetchrow("""
        SELECT * FROM combos_flash
        WHERE vence_at > NOW()
        ORDER BY created_at DESC LIMIT 1
    """)


async def _generar_flash(conn):
    """Arma uno nuevo con el generador que ya existe."""
    cfg = await _flash_config(conn)
    if not cfg["activo"]:
        return None
    try:
        datos = await combo_sugerido(perfil="equilibrado")
    except HTTPException:
        return None
    picks = datos["picks"]
    vence = datetime.now(timezone.utc) + timedelta(minutes=cfg["ttl_min"])
    row = await conn.fetchrow("""
        INSERT INTO combos_flash
            (nombre, picks, odd_total, extra_pct, vence_at, created_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        RETURNING *
    """, "⚡ " + datos["nombre"], str(picks),
         datos["odd_total"], cfg["extra_pct"], vence)
    return row


def _texto_flash(flash, moneda="ARS"):
    try:
        picks = ast.literal_eval(flash["picks"]) if isinstance(flash["picks"], str) \
                else flash["picks"]
    except (ValueError, SyntaxError):
        picks = []
    lineas = [f"<b>{flash['nombre']}</b>", ""]
    for p in picks:
        lineas.append(f"• {p.get('h','')} — {p.get('a','')}")
        lineas.append(f"  <b>{p.get('sel','')}</b> · {p.get('odd',0):.2f}")
    total = float(flash["odd_total"] or 0)
    extra = float(flash["extra_pct"] or 0)
    lineas.append("")
    lineas.append(f"Cuota total: <b>{total:.2f}x</b>")
    if extra:
        lineas.append(f"🎁 Extra del chat: <b>+{extra:.0f}%</b> sobre el premio")
    resta = flash["vence_at"] - datetime.now(timezone.utc)
    mins = max(0, int(resta.total_seconds() // 60))
    lineas.append(f"⏱ Vence en {mins} min")
    return "\n".join(lineas)


@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request):
    """
    Recibe todo lo que pasa en el chat. Telegram exige responder
    rápido, así que nunca se demora acá: lo que tarda se hace después.
    """
    try:
        upd = await request.json()
    except Exception:
        return {"ok": True}

    try:
        if "callback_query" in upd:
            await _tg_boton(upd["callback_query"])
        elif "message" in upd:
            await _tg_mensaje(upd["message"])
    except Exception as e:
        log.error(f"[TG] error procesando: {e}")
    # Siempre 200: si se devuelve error, Telegram reintenta en bucle
    return {"ok": True}


async def _tg_mensaje(msg):
    chat_id = msg.get("chat", {}).get("id")
    tg_id = msg.get("from", {}).get("id")
    texto = (msg.get("text") or "").strip()
    if not chat_id or not texto:
        return

    pool = await get_db()
    async with pool.acquire() as conn:
        cli = await _tg_cliente(conn, tg_id)

    if texto.startswith("/start"):
        nombre = msg.get("from", {}).get("first_name") or ""
        if cli:
            await _tg_responder(chat_id,
                f"Hola {nombre} 👋\n\n¿Qué querés hacer?",
                _menu_principal(True))
        else:
            await _tg_responder(chat_id,
                f"Hola {nombre} 👋\n\nPara ver tu saldo y apostar desde "
                f"acá, primero vinculá tu cuenta.",
                _menu_principal(False))
        return

    if texto.startswith("/"):
        await _tg_responder(chat_id, "Elegí una opción:",
                            _menu_principal(bool(cli)))
        return

    # Texto libre: lo resuelve la guía
    await _tg_guia(chat_id, texto, cli)


async def _tg_boton(cb):
    """Un botón tocado. Acá pasa casi todo y no consume IA."""
    dato = cb.get("data") or ""
    chat_id = cb.get("message", {}).get("chat", {}).get("id")
    msg_id = cb.get("message", {}).get("message_id")
    tg_id = cb.get("from", {}).get("id")
    await _tg_confirmar(cb.get("id"))
    if not chat_id:
        return

    pool = await get_db()
    async with pool.acquire() as conn:
        cli = await _tg_cliente(conn, tg_id)

        if dato == "menu":
            await _tg_responder(chat_id, "¿Qué querés hacer?",
                                _menu_principal(bool(cli)), editar=msg_id)
            return

        if dato == "app":
            await _tg_responder(chat_id,
                f"Abrí la app acá: {APP_URL}", editar=msg_id)
            return

        if dato == "vincular":
            await _tg_responder(chat_id,
                "Para vincular tu cuenta, pedile el código a tu agencia "
                "y escribilo acá.", editar=msg_id)
            return

        if not cli:
            await _tg_responder(chat_id,
                "Primero vinculá tu cuenta.", _menu_principal(False),
                editar=msg_id)
            return

        if dato == "saldo":
            saldo = int(cli["balance"] or 0) // 100
            bono = int(cli["saldo_bono"] or 0) // 100
            t = f"💰 Tu saldo: <b>{saldo:,}</b> {cli['moneda'] or 'ARS'}".replace(",", ".")
            if bono:
                t += f"\n🎁 Bono: <b>{bono:,}</b>".replace(",", ".")
            t += "\n\nPara cargar saldo, andá a tu agencia."
            await _tg_responder(chat_id, t,
                                [[("← Volver", "menu")]], editar=msg_id)
            return

        if dato == "apuestas":
            filas = await conn.fetch("""
                SELECT code, stake, odd_total, potential_win, status, created_at
                FROM betslips WHERE user_id=$1
                ORDER BY created_at DESC LIMIT 5
            """, cli["id"])
            if not filas:
                await _tg_responder(chat_id, "Todavía no tenés apuestas.",
                                    [[("← Volver", "menu")]], editar=msg_id)
                return
            ESTADO = {"active": "⏳ En juego", "won": "✅ Ganada",
                      "lost": "❌ Perdida", "paid": "✅ Pagada",
                      "pending": "🎫 Sin pagar"}
            t = "<b>🎫 Tus últimas apuestas</b>\n"
            for f in filas:
                t += (f"\n<code>{f['code']}</code> · "
                      f"{ESTADO.get(f['status'], f['status'])}\n"
                      f"  {float(f['stake'] or 0):,.0f} @ "
                      f"{float(f['odd_total'] or 0):.2f} → "
                      f"{float(f['potential_win'] or 0):,.0f}\n").replace(",", ".")
            await _tg_responder(chat_id, t,
                                [[("← Volver", "menu")]], editar=msg_id)
            return

        if dato == "flash":
            flash = await _flash_vigente(conn)
            if not flash:
                flash = await _generar_flash(conn)
            if not flash:
                await _tg_responder(chat_id,
                    "No hay combo disponible ahora. Probá en un rato.",
                    [[("← Volver", "menu")]], editar=msg_id)
                return
            montos = montos_de_moneda(cli["moneda"] or "ARS")
            botones = [[(f"Apostar {m:,}".replace(",", "."),
                         f"bet:{flash['id']}:{m}") for m in montos[:2]],
                       [(f"Apostar {m:,}".replace(",", "."),
                         f"bet:{flash['id']}:{m}") for m in montos[2:4]],
                       [("← Volver", "menu")]]
            await _tg_responder(chat_id, _texto_flash(flash, cli["moneda"]),
                                botones, editar=msg_id)
            return

        if dato == "equipo":
            eq = cli["equipo_favorito"]
            if not eq:
                await _tg_responder(chat_id,
                    "Todavía no me dijiste de qué equipo sos.\n\n"
                    "Escribime el nombre y te aviso cuando juegue.",
                    [[("← Volver", "menu")]], editar=msg_id)
                return
            await _tg_responder(chat_id,
                await _texto_equipo(conn, eq),
                [[("← Volver", "menu")]], editar=msg_id)
            return

        if dato.startswith("bet:"):
            _, flash_id, monto = dato.split(":")
            await _tg_apostar_flash(conn, chat_id, msg_id, cli,
                                    int(flash_id), int(monto))
            return


async def _tg_apostar_flash(conn, chat_id, msg_id, cli, flash_id, monto):
    """
    Apuesta el combo flash desde el chat. Es plata real, así que
    valida saldo y descuenta con el mismo cuidado que la app.
    """
    flash = await conn.fetchrow(
        "SELECT * FROM combos_flash WHERE id=$1", flash_id)
    if not flash or flash["vence_at"] <= datetime.now(timezone.utc):
        await _tg_responder(chat_id,
            "Ese combo ya venció. Pedí uno nuevo.",
            [[("⚡ Combo del día", "flash")], [("← Volver", "menu")]],
            editar=msg_id)
        return

    cfg = await _flash_config(conn)
    if cfg["tope_apuesta"] and monto > cfg["tope_apuesta"]:
        await _tg_responder(chat_id,
            f"El máximo para el combo del chat es "
            f"<b>{cfg['tope_apuesta']:,}</b>.".replace(",", ".") +
            "\n\nPara montos mayores, apostá desde la app.",
            [[("📱 Abrir la app", "app")], [("← Volver", "menu")]],
            editar=msg_id)
        return

    saldo = int(cli["balance"] or 0) // 100
    if saldo < monto:
        await _tg_responder(chat_id,
            f"No te alcanza el saldo. Tenés <b>{saldo:,}</b> y "
            f"la apuesta es de <b>{monto:,}</b>.".replace(",", ".") +
            "\n\nCargá en tu agencia.",
            [[("← Volver", "menu")]], editar=msg_id)
        return

    try:
        picks = ast.literal_eval(flash["picks"]) if isinstance(flash["picks"], str) \
                else flash["picks"]
    except (ValueError, SyntaxError):
        picks = []
    if not picks:
        await _tg_responder(chat_id, "Hubo un problema con ese combo.",
                            [[("← Volver", "menu")]], editar=msg_id)
        return

    odd = float(flash["odd_total"] or 0)
    extra = float(flash["extra_pct"] or 0)
    premio = round(monto * odd * (1 + extra / 100))

    code = "QP-" + str(secrets.randbelow(90000) + 10000)
    try:
        async with conn.transaction():
            # FOR UPDATE: el saldo se lee bloqueado, como en la app
            actual = await conn.fetchval(
                "SELECT balance FROM users WHERE id=$1 FOR UPDATE", cli["id"])
            if int(actual or 0) // 100 < monto:
                raise ValueError("saldo insuficiente")
            await conn.execute(
                "UPDATE users SET balance = balance - $2 WHERE id=$1",
                cli["id"], monto * 100)
            await conn.execute("""
                INSERT INTO betslips
                    (code, user_id, picks, stake, odd_total, potential_win,
                     status, con_bono, boost_pct, boost_extra,
                     created_at, paid_at)
                VALUES ($1,$2,$3,$4,$5,$6,'active',false,$7,$8,NOW(),NOW())
            """, code, cli["id"], str(picks), monto, odd, premio,
                 extra, round(monto * odd * extra / 100))
    except Exception as e:
        log.error(f"[TG] no se pudo apostar el flash: {e}")
        await _tg_responder(chat_id,
            "No se pudo registrar la apuesta. Probá desde la app.",
            [[("📱 Abrir la app", "app")], [("← Volver", "menu")]],
            editar=msg_id)
        return

    nuevo = saldo - monto
    await _tg_responder(chat_id,
        f"✅ <b>Apuesta registrada</b>\n\n"
        f"<code>{code}</code>\n"
        f"Apostaste <b>{monto:,}</b> a {odd:.2f}x\n".replace(",", ".") +
        (f"Con el extra del chat cobrás <b>{premio:,}</b>\n".replace(",", ".")
         if extra else f"Cobrás <b>{premio:,}</b>\n".replace(",", ".")) +
        f"\nTe queda <b>{nuevo:,}</b> de saldo.".replace(",", "."),
        [[("🎫 Mis apuestas", "apuestas")], [("← Volver", "menu")]],
        editar=msg_id)


# ── GENERADOR DE COMBOS ───────────────────────────────────────
# Arma una combinada con criterio, sin IA: elige entre los eventos
# reales del día según el perfil que pida el cliente.
#
# POR QUÉ SIN IA: son dos por cliente por día. Con mil clientes eso es
# dos mil generaciones diarias, y con IA costaría unos 60 dólares por
# día para algo que se resuelve con reglas. La IA queda para los
# combos destacados de la casa, que son ocho por día.
#
# CADA UNO ES DISTINTO: hay azar dentro de los rangos, así que el
# mismo cliente que pide dos veces recibe combinadas diferentes.

# 'tope' es la cuota total máxima: sin eso, el perfil arriesgado
# armaba combinadas de 2000x que nadie gana nunca y que el cliente
# percibe como una burla más que como una oportunidad.
PERFILES_COMBO = {
    "seguro":     {"picks": (2, 3), "odd": (1.25, 1.75),
                   "tope": 6, "nombre": "Seguro"},
    "equilibrado":{"picks": (3, 4), "odd": (1.60, 2.40),
                   "tope": 20, "nombre": "Equilibrado"},
    "arriesgado": {"picks": (4, 5), "odd": (2.00, 3.20),
                   "tope": 80, "nombre": "Arriesgado"},
}

NOMBRES_COMBO = [
    "Tu jugada", "La del día", "Combinada express", "A tu medida",
    "Selección propia", "Tu combinada", "Armada para vos",
    "La elegida", "Tu apuesta", "Combo personal",
]


def _candidatos_para_combo(perfil):
    """
    Eventos del feed que sirven para este perfil: cuota en rango y
    con hora de inicio conocida.
    """
    lo, hi = perfil["odd"]
    fuera = []
    for dep in _eventos_del_feed():
        if True:
            for ev in dep.get("events", []) or []:
                odds = ev.get("odds") or {}
                for etiqueta, valor in (("L", odds.get("L")),
                                        ("E", odds.get("E")),
                                        ("V", odds.get("V"))):
                    try:
                        v = float(valor)
                    except (TypeError, ValueError):
                        continue
                    if not (lo <= v <= hi):
                        continue
                    sel = {"L": ev.get("h"), "E": "Empate",
                           "V": ev.get("a")}.get(etiqueta)
                    if not sel:
                        continue
                    fuera.append({
                        "id": ev.get("id"), "event_id": ev.get("id"),
                        "h": ev.get("h"), "a": ev.get("a"),
                        "home": ev.get("h"), "away": ev.get("a"),
                        "sel": sel, "odd": round(v, 2),
                        "market": "h2h",
                        "sport_key": dep.get("key"),
                        "liga": dep.get("name"),
                        "time": ev.get("time"),
                        "commence_time": ev.get("commence_time")
                                         or ev.get("start_time"),
                    })
    return fuera


@app.get("/api/combo-sugerido")
async def combo_sugerido(perfil: str = "equilibrado",
                         agencia_code: str = ""):
    """
    Arma una combinada al vuelo. Público: lo usan la app, el sitio y
    el box. No guarda nada: si el cliente la quiere, la apuesta como
    cualquier otra.
    """
    p = PERFILES_COMBO.get(perfil) or PERFILES_COMBO["equilibrado"]
    candidatos = _candidatos_para_combo(p)

    if len(candidatos) < p["picks"][0]:
        raise HTTPException(404,
            "No hay suficientes eventos para armar una combinada ahora. "
            "Probá más tarde o con otro perfil.")

    # Se filtran los bloqueados: no tiene sentido sugerir algo que
    # después el sistema va a rechazar.
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            trabados = await _picks_bloqueados(
                conn, candidatos, agencia_code=agencia_code.upper() or None)
        if trabados:
            vetados = {t["pick"] for t in trabados}
            candidatos = [c for c in candidatos
                          if f"{c['h']} vs {c['a']}" not in vetados]
    except Exception as e:
        log.warning(f"[COMBO] no se pudo filtrar bloqueados: {e}")

    cuantos = random.randint(*p["picks"])
    cuantos = min(cuantos, len(candidatos))

    # Un solo pick por evento: dos selecciones del mismo partido no
    # forman una combinada válida.
    random.shuffle(candidatos)
    elegidos, usados = [], set()
    for c in candidatos:
        if c["event_id"] in usados:
            continue
        elegidos.append(c)
        usados.add(c["event_id"])
        if len(elegidos) >= cuantos:
            break

    if len(elegidos) < p["picks"][0]:
        raise HTTPException(404, "No hay suficientes eventos distintos ahora.")

    total = 1.0
    for c in elegidos:
        total *= c["odd"]

    # Si se pasó del tope, se sacan patas hasta entrar. Mejor una
    # combinada de 40x que se puede ganar que una de 2000x que no.
    tope = p.get("tope")
    while tope and total > tope and len(elegidos) > p["picks"][0]:
        # Sale la de cuota más alta, que es la que más infla
        elegidos.sort(key=lambda x: -x["odd"])
        fuera = elegidos.pop(0)
        total /= fuera["odd"]
    random.shuffle(elegidos)

    return {
        "perfil": perfil,
        "nombre": f"{random.choice(NOMBRES_COMBO)} · {p['nombre']}",
        "picks": elegidos,
        "odd_total": round(total, 2),
        "generado": _fecha_local(datetime.now(timezone.utc)),
    }


@app.get("/api/combo-sugerido/cupo")
async def combo_cupo(user_id: int = 0, agencia_code: str = ""):
    """
    Cuántas generaciones le quedan. En la app y el sitio el límite es
    por cliente; en el box no hay cliente identificado, así que el
    cupo es de la agencia entera.
    """
    hoy = datetime.now(TZ_CASA).date()
    pool = await get_db()
    async with pool.acquire() as conn:
        if user_id:
            usados = await conn.fetchval("""
                SELECT COUNT(*) FROM combo_generado
                WHERE user_id=$1 AND fecha=$2
            """, user_id, hoy) or 0
            tope = COMBO_TOPE_CLIENTE
        elif agencia_code:
            usados = await conn.fetchval("""
                SELECT COUNT(*) FROM combo_generado
                WHERE agencia_code=$1 AND fecha=$2
            """, agencia_code.upper(), hoy) or 0
            tope = COMBO_TOPE_AGENCIA
        else:
            return {"usados": 0, "tope": COMBO_TOPE_CLIENTE,
                    "quedan": COMBO_TOPE_CLIENTE}
    return {"usados": int(usados), "tope": tope,
            "quedan": max(0, tope - int(usados))}


COMBO_TOPE_CLIENTE = int(os.environ.get("COMBO_TOPE_CLIENTE", "2"))
# En el box no hay cliente identificado: el cupo es de la agencia y
# sirve para evitar abuso, no como límite individual.
COMBO_TOPE_AGENCIA = int(os.environ.get("COMBO_TOPE_AGENCIA", "20"))


@app.post("/api/combo-sugerido/usar")
async def combo_usar(request: Request):
    """Registra una generación. Se llama antes de devolver el combo."""
    body = await request.json()
    user_id = body.get("user_id")
    agencia = (body.get("agencia_code") or "").upper() or None
    hoy = datetime.now(TZ_CASA).date()

    pool = await get_db()
    async with pool.acquire() as conn:
        if user_id:
            usados = await conn.fetchval(
                "SELECT COUNT(*) FROM combo_generado WHERE user_id=$1 AND fecha=$2",
                int(user_id), hoy) or 0
            if usados >= COMBO_TOPE_CLIENTE:
                raise HTTPException(429,
                    f"Ya generaste {COMBO_TOPE_CLIENTE} combinadas hoy. "
                    f"Volvé mañana.")
        elif agencia:
            usados = await conn.fetchval(
                "SELECT COUNT(*) FROM combo_generado WHERE agencia_code=$1 AND fecha=$2",
                agencia, hoy) or 0
            if usados >= COMBO_TOPE_AGENCIA:
                raise HTTPException(429,
                    f"La agencia llegó al tope de {COMBO_TOPE_AGENCIA} "
                    f"combinadas por día.")
        await conn.execute("""
            INSERT INTO combo_generado (user_id, agencia_code, fecha, created_at)
            VALUES ($1, $2, $3, NOW())
        """, int(user_id) if user_id else None, agencia, hoy)
    return {"ok": True}


# ── CHAT INTERNO DEL ADMIN ────────────────────────────────────
# Un asistente que conoce el sistema, para que el operador no tenga
# que preguntar por dónde se hace cada cosa.
#
# CÓMO SE MANEJA EL COSTO: la mayoría de las preguntas son "cómo hago
# tal cosa" y se responden con el manual, que es texto fijo. Solo
# cuando la pregunta pide números se consultan datos en vivo, porque
# eso multiplica lo que se envía en cada consulta.
#
# SOLO ADMIN: el chat puede exponer datos de cualquier agencia, así
# que no se abre a las agencias sin antes filtrar por alcance.

MANUAL_SISTEMA = """
QUARTZPLAY — cómo está organizado

ESTRUCTURA
- Agencias en árbol. Cada una cuelga de otra y tiene su rama.
- Los clientes pertenecen a la agencia que los dio de alta (creado_por).
- Esa pertenencia define las comisiones, sin importar desde dónde apueste.

PANTALLAS DEL ADMIN
- Global: resumen del día, KPIs.
- Cierre: liquidación por período. Adentro: Resumen, Caja, Movs,
  Apuestas, Cash out, Combos.
- Combos: los combos de la casa que se muestran en la app.
- Agencias: árbol, alta, permisos, saldo de cuenta corriente.
- Influencers: cuentas que generan combos con su código.
- Eventos: cuotas del feed. Ahí se bloquean eventos, deportes y
  mercados, y se ajustan cuotas hacia abajo.
- Billetera: saldo de los clientes, cargas y retiros.
- Usuarios: alta y ficha de clientes.
- Config: ocho secciones (Límites, Riesgo, Potencializador, Bet Best,
  Banners, Bonos, Bet Builder, General).
- Diag: estado de servicios y créditos de proveedores.

CONFIG → GENERAL es el control de riesgo del sistema, con cinco vistas:
  Alertas (lo que detectó el motor), IPs (desde dónde juegan),
  Agencias (margen por agencia), Cuotas (auditoría de márgenes),
  Vigía (chequeo general con IA), Avisos (alertas por Telegram).

CONCEPTOS
- GGR: lo apostado menos lo pagado en premios. Es la ganancia bruta.
- Margen: el GGR sobre lo apostado. Sano ronda 5 a 10 por ciento.
- Comisiones en cascada: cada nivel cobra sobre lo que queda después
  de pagar a los de abajo. No es una suma plana.
- Saldo de jugadores: es plata de ellos, un pasivo. No es ganancia.
- Exposición: lo que la casa pagaría si ganan todas las apuestas vivas
  de un evento.
- Potencializador: porcentaje extra sobre el premio de una combinada,
  que crece con la cantidad de selecciones. Se paga solo si aciertan
  todas.
- Bet Best: el cliente trae la foto de un boleto de otra casa y el
  sistema intenta igualar la cuota subiendo hasta un tope (6% por
  defecto). Si no llega, ofrece lo máximo alcanzable.
- Cash out: cerrar una apuesta antes de que termine, a un valor
  calculado. Se habilita por agencia desde su ficha.

OPERACIONES FRECUENTES
- Bloquear un evento: Eventos, buscar el partido, "Bloquear / limitar".
  Se elige qué (evento, deporte o mercado), dónde (global, rama o una
  agencia) y cuándo (siempre, solo previa, solo en vivo).
  El nivel superior manda: lo que se bloquea arriba no lo puede
  habilitar una agencia.
- Bajar una cuota sin bloquear: mismo panel, opción "Bajar cuota".
  Solo puede bajar, nunca subir.
- Anular una apuesta: desde el ticket. Hay dos reglas: dentro de los
  5 minutos del pago y más de 60 minutos antes del evento. El admin
  puede forzarla.
- Habilitar cash out a una agencia: Agencias, abrir su ficha, abajo
  "Permiso para hacer cash out".
- Cargar un límite: Config, Límites. Los globales son por moneda.
- Programar un bono: Config, Bonos. Se define vigencia, días de la
  semana y franja horaria. Fuera de esa ventana el bono se ve
  deshabilitado con el horario.

REGLAS TÉCNICAS QUE IMPORTAN
- users.balance está en centavos. betslips.stake está en pesos.
- Los límites y el tope de riesgo son por moneda.
- Bloquear un evento NO cancela las apuestas ya tomadas.
- El motor de riesgo avisa, no bloquea automáticamente.
"""


def _necesita_datos(pregunta):
    """
    ¿La pregunta pide números del sistema o solo explicación?
    Las de explicación se responden con el manual y salen mucho más
    baratas, que son la mayoría.
    """
    q = (pregunta or "").lower()
    # Se quitan los acentos: "cuál" y "cual" tienen que dar lo mismo
    for a, b2 in (("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u")):
        q = q.replace(a, b2)
    señales = ["cuanto", "cuantos", "cuantas", "hoy", "ayer",
               "esta semana", "este mes", "ahora", "actual",
               "cual es", "cuales", "quien", "quienes",
               "ranking", "mejor", "peor", "mas volumen", "menos",
               "total", "saldo", "alertas", "pendiente", "sin liquidar",
               "esta pasando", "estado", "resumen", "top"]
    return any(x in q for x in señales)


async def _datos_para_chat(conn):
    """Una foto compacta del sistema. Solo cuando hace falta."""
    d = {}
    try:
        hoy = await conn.fetchrow("""
            SELECT COUNT(*) AS n, COALESCE(SUM(stake),0) AS apostado,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN stake*odd_total ELSE 0 END),0) AS pagado
            FROM betslips WHERE created_at::date = CURRENT_DATE
        """)
        d["hoy"] = {"apuestas": int(hoy["n"] or 0),
                    "apostado": float(hoy["apostado"] or 0),
                    "pagado": float(hoy["pagado"] or 0)}
        d["saldo_jugadores"] = float(await conn.fetchval(
            "SELECT COALESCE(SUM(balance),0)/100.0 FROM users") or 0)
        d["clientes"] = int(await conn.fetchval(
            "SELECT COUNT(*) FROM users") or 0)
        d["agencias"] = int(await conn.fetchval(
            "SELECT COUNT(*) FROM agencias WHERE status='active'") or 0)
        d["alertas_abiertas"] = int(await conn.fetchval(
            "SELECT COUNT(*) FROM riesgo_alertas WHERE estado='abierta'") or 0)
        d["sin_liquidar"] = int(await conn.fetchval(
            "SELECT COUNT(*) FROM betslips WHERE status='active' "
            "AND created_at < NOW() - interval '3 days'") or 0)
        d["bloqueos"] = int(await conn.fetchval(
            "SELECT COUNT(*) FROM eventos_bloqueos "
            "WHERE vence_at IS NULL OR vence_at > NOW()") or 0)
        top = await conn.fetch("""
            SELECT a.name, a.code,
                   COALESCE(SUM(b.stake),0) AS apostado
            FROM agencias a
            LEFT JOIN users u ON u.creado_por = a.code
            LEFT JOIN betslips b ON b.user_id = u.id
                 AND b.created_at > NOW() - interval '30 days'
            GROUP BY a.name, a.code
            ORDER BY 3 DESC LIMIT 5
        """)
        d["top_agencias"] = [{"nombre": t["name"], "code": t["code"],
                              "apostado": float(t["apostado"] or 0)}
                             for t in top]
    except Exception as e:
        log.warning(f"[CHAT] no se pudieron traer los datos: {e}")
    return d


@app.post("/api/admin/chat")
async def chat_admin(request: Request, _=Depends(auth.require_admin)):
    """
    Responde dudas del operador sobre el sistema.

    Mantiene el hilo de la conversación para que se pueda repreguntar,
    pero acotado: mandar todo el historial en cada consulta multiplica
    el costo sin agregar mucho.
    """
    body = await request.json()
    pregunta = (body.get("mensaje") or "").strip()[:600]
    if not pregunta:
        raise HTTPException(400, "Escribí una pregunta")

    historial = body.get("historial") or []
    # Solo los últimos intercambios: el resto rara vez aporta
    historial = historial[-6:]

    datos = {}
    if _necesita_datos(pregunta):
        pool = await get_db()
        async with pool.acquire() as conn:
            datos = await _datos_para_chat(conn)

    contexto = MANUAL_SISTEMA
    if datos:
        contexto += f"\n\nDATOS DEL SISTEMA AHORA:\n{json.dumps(datos, default=str, ensure_ascii=False)}"

    hilo = ""
    for h in historial:
        quien = "Operador" if h.get("rol") == "user" else "Vos"
        hilo += f"\n{quien}: {(h.get('texto') or '')[:300]}"

    prompt = f"""Sos el asistente interno de QuartzPlay, una plataforma de
apuestas deportivas. Ayudás a los operadores del panel de administración.

{contexto}
{"CONVERSACIÓN PREVIA:" + hilo if hilo else ""}

PREGUNTA DEL OPERADOR: {pregunta}

Respondé en español rioplatense, directo y breve: 2 a 5 frases salvo que
pidan un procedimiento paso a paso. Si la respuesta es dónde queda algo,
decí la ruta exacta de las pantallas. Si no sabés algo o no está en la
información que tenés, decilo en vez de inventar. No uses titulos ni
vinetas salvo que sea una lista de pasos."""

    texto = await _consultar_claude_texto(prompt, max_tokens=700)
    return {
        "respuesta": texto,
        # Para que se vea si la consulta trajo datos en vivo
        "consulto_datos": bool(datos),
    }


# ── AVISOS DE RIESGO POR TELEGRAM ─────────────────────────────
# Una alerta que nadie mira no sirve. Para detectar contrapartida
# hace falta enterarse mientras el evento todavía no se jugó, no al
# día siguiente.
#
# QUÉ SE AVISA: solo lo que justifica interrumpir a alguien. El nivel
# mínimo es configurable, pero por defecto son críticas y altas. Si
# suena el teléfono por cada alerta media, en una semana lo silencian
# y volvemos al punto de partida.
#
# A QUIÉN: varios destinatarios, cargados desde el admin. Cada uno es
# un chat_id de Telegram.

async def _destinatarios_riesgo(conn):
    """Los chat_id que reciben avisos, y desde qué severidad."""
    filas = await conn.fetch(
        "SELECT clave, valor FROM riesgo_config WHERE clave LIKE 'aviso_%'")
    cfg = {f["clave"]: f["valor"] for f in filas}
    try:
        destinos = json.loads(cfg.get("aviso_destinos") or "[]")
    except Exception:
        destinos = []
    limpios = []
    for d in destinos:
        try:
            limpios.append({"chat_id": str(d.get("chat_id")).strip(),
                            "nombre": (d.get("nombre") or "")[:60]})
        except (AttributeError, TypeError):
            continue
    return {
        "activo": cfg.get("aviso_activo", "1") == "1",
        "minimo": cfg.get("aviso_minimo", "alta"),
        "destinos": [d for d in limpios if d["chat_id"]],
    }


async def _avisar_riesgo(conn, tipo, severidad, titulo, detalle):
    """Manda el aviso a todos los destinatarios configurados."""
    try:
        cfg = await _destinatarios_riesgo(conn)
        if not cfg["activo"] or not cfg["destinos"]:
            return 0
        if SEVERIDADES.get(severidad, 0) < SEVERIDADES.get(cfg["minimo"], 3):
            return 0

        icono = {"critica": "🔴", "alta": "🟠",
                 "media": "🟡", "baja": "⚪"}.get(severidad, "⚠️")
        texto = (f"{icono} ALERTA DE RIESGO — {severidad.upper()}\n\n"
                 f"{titulo}\n\n{(detalle or '')[:600]}\n\n"
                 f"Revisala en el panel: Config → General")
        enviados = 0
        for d in cfg["destinos"]:
            try:
                await avisar_telegram(d["chat_id"], texto)
                enviados += 1
            except Exception as e:
                log.warning(f"[RIESGO] no se pudo avisar a {d['chat_id']}: {e}")
        return enviados
    except Exception as e:
        log.error(f"[RIESGO] falló el aviso: {e}")
        return 0


@app.get("/api/admin/riesgo/avisos")
async def riesgo_avisos_config(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _destinatarios_riesgo(conn)
    return {**cfg, "bot_configurado": bool(TELEGRAM_TOKEN)}


@app.post("/api/admin/riesgo/avisos")
async def riesgo_avisos_guardar(request: Request, _=Depends(auth.require_admin)):
    body = await request.json()
    destinos = body.get("destinos") or []
    if not isinstance(destinos, list) or len(destinos) > 10:
        raise HTTPException(400, "Hasta 10 destinatarios")

    limpios = []
    for d in destinos:
        chat = str((d or {}).get("chat_id") or "").strip()
        if not chat:
            continue
        # Un chat_id es numérico; los de grupo empiezan con guion
        if not re.fullmatch(r"-?\d{5,20}", chat):
            raise HTTPException(400,
                f"'{chat}' no parece un chat de Telegram. Tiene que ser el "
                f"número que devuelve @userinfobot.")
        limpios.append({"chat_id": chat,
                        "nombre": str((d or {}).get("nombre") or "")[:60]})

    minimo = body.get("minimo") or "alta"
    if minimo not in SEVERIDADES:
        raise HTTPException(400, "Nivel mínimo inválido")

    vals = {
        "aviso_activo": "1" if body.get("activo", True) else "0",
        "aviso_minimo": minimo,
        "aviso_destinos": json.dumps(limpios),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO riesgo_config (clave, valor, updated_at)
                VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    return {"ok": True, "destinos": len(limpios), "minimo": minimo}


@app.post("/api/admin/riesgo/avisos/probar")
async def riesgo_avisos_probar(_=Depends(auth.require_admin)):
    """Manda un mensaje de prueba para confirmar que llega."""
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _destinatarios_riesgo(conn)
    if not TELEGRAM_TOKEN:
        raise HTTPException(400, "El bot de Telegram no está configurado")
    if not cfg["destinos"]:
        raise HTTPException(400, "No hay destinatarios cargados")
    ok = 0
    for d in cfg["destinos"]:
        try:
            await avisar_telegram(
                d["chat_id"],
                "✅ Prueba de alertas de QuartzPlay.\n\n"
                "Si ves este mensaje, los avisos de riesgo van a llegarte acá.")
            ok += 1
        except Exception:
            pass
    return {"ok": True, "enviados": ok, "destinos": len(cfg["destinos"])}


@app.get("/api/admin/riesgo/pendientes")
async def riesgo_pendientes(_=Depends(auth.require_admin)):
    """Cuántas alertas abiertas hay, para el indicador del panel."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT severidad, COUNT(*) AS n FROM riesgo_alertas
            WHERE estado='abierta' GROUP BY severidad
        """)
    por_sev = {f["severidad"]: int(f["n"]) for f in filas}
    return {
        "total": sum(por_sev.values()),
        "por_severidad": por_sev,
        # Lo que amerita el punto rojo: críticas y altas
        "urgentes": por_sev.get("critica", 0) + por_sev.get("alta", 0),
    }


# ── REGISTRO DE IPs ───────────────────────────────────────────
# La foto de quién apuesta desde dónde. Sirve para lo que el motor
# todavía no marcó como alerta: dos cuentas compartiendo conexión no
# es delito, pero si además apuestan a lados opuestos, sí.

@app.get("/api/admin/riesgo/ips")
async def riesgo_ips(dias: int = 30, minimo: int = 2, limite: int = 60,
                     _=Depends(auth.require_admin)):
    """IPs con más de una cuenta, ordenadas por cantidad de cuentas."""
    dias = max(1, min(dias, 365))
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT b.ip,
                   COUNT(DISTINCT b.user_id) AS cuentas,
                   COUNT(*) AS apuestas,
                   COALESCE(SUM(b.stake),0) AS apostado,
                   MAX(b.created_at) AS ultima,
                   ARRAY_AGG(DISTINCT b.user_id) AS ids
            FROM betslips b
            WHERE b.ip IS NOT NULL AND b.user_id IS NOT NULL
              AND b.created_at > NOW() - ($1 || ' days')::interval
            GROUP BY b.ip
            HAVING COUNT(DISTINCT b.user_id) >= $2
            -- Primero las de varias cuentas, que son las que importan,
            -- pero con minimo=1 se listan todas para poder auditar.
            ORDER BY COUNT(DISTINCT b.user_id) DESC, MAX(b.created_at) DESC
            LIMIT $3
        """, str(dias), minimo, max(1, min(limite, 200)))

        salida = []
        for f in filas:
            ids = list(f["ids"] or [])
            us = await conn.fetch("""
                SELECT u.id, u.username, u.nombre_completo, u.creado_por,
                       u.balance, u.riesgo_nivel,
                       a.name AS agencia_nombre
                FROM users u
                LEFT JOIN agencias a ON a.code = u.creado_por
                WHERE u.id = ANY($1) LIMIT 15
            """, ids)
            salida.append({
                "ip": f["ip"],
                "cuentas": int(f["cuentas"]),
                "apuestas": int(f["apuestas"]),
                "apostado": float(f["apostado"] or 0),
                "ultima": _fecha_local(f["ultima"]),
                "usuarios": [{
                    "id": u["id"],
                    "nombre": u["nombre_completo"] or u["username"],
                    "agencia": u["creado_por"],
                    "agencia_nombre": u["agencia_nombre"],
                    "saldo": int(u["balance"] or 0) // 100,
                    "nivel": u["riesgo_nivel"] or "normal",
                } for u in us],
            })

        # Cuántas apuestas quedaron sin IP: si son casi todas, el proxy
        # no está pasando el dato y el motor trabaja a ciegas.
        cobertura = await conn.fetchrow("""
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN ip IS NOT NULL THEN 1 ELSE 0 END),0) AS con_ip
            FROM betslips
            WHERE created_at > NOW() - ($1 || ' days')::interval
        """, str(dias))

    total = int(cobertura["total"] or 0)
    con_ip = int(cobertura["con_ip"] or 0)
    return {
        "ips": salida,
        "dias": dias,
        "cobertura": {
            "apuestas": total,
            "con_ip": con_ip,
            "pct": round(con_ip / total * 100, 1) if total else 0,
        },
    }


@app.get("/api/admin/riesgo/diagnostico-ip")
async def diagnostico_ip(request: Request, _=Depends(auth.require_admin)):
    """
    Qué cabeceras llegan realmente y qué IP se estaría guardando.

    Sirve para saber si el proxy pasa la IP del cliente o si todas las
    apuestas quedan con la misma. Sin ese dato, las reglas de
    multicuenta y colusión no detectan nada aunque el motor corra.
    """
    cabeceras = {k: v for k, v in request.headers.items()
                 if k.lower() in ("x-forwarded-for", "x-real-ip",
                                  "cf-connecting-ip", "x-forwarded-proto",
                                  "user-agent", "origin", "referer")}
    pool = await get_db()
    async with pool.acquire() as conn:
        distintas = await conn.fetch("""
            SELECT ip, COUNT(*) AS apuestas,
                   COUNT(DISTINCT user_id) AS cuentas
            FROM betslips WHERE ip IS NOT NULL
            GROUP BY ip ORDER BY COUNT(*) DESC LIMIT 20
        """)
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM betslips WHERE ip IS NOT NULL")

    filas = [{"ip": f["ip"], "apuestas": int(f["apuestas"]),
              "cuentas": int(f["cuentas"])} for f in distintas]

    # Si una sola IP concentra casi todo, el proxy no está pasando la real
    alerta = None
    if total >= 5 and filas:
        pct = filas[0]["apuestas"] / total * 100
        if len(filas) == 1 or pct > 90:
            alerta = (f"El {pct:.0f}% de las apuestas comparten la IP "
                      f"{filas[0]['ip']}. Lo más probable es que sea la del "
                      f"proxy y no la del jugador: así, las reglas de "
                      f"multicuenta y colusión no van a detectar nada.")

    return {
        "ip_que_veo_ahora": _ip_cliente(request),
        "huella_dispositivo": _huella_dispositivo(request),
        "cabeceras": cabeceras,
        "ips_registradas": filas,
        "total_con_ip": int(total or 0),
        "alerta": alerta,
    }


@app.get("/api/admin/riesgo/ip/{ip}")
async def detalle_ip(ip: str, limite: int = 100,
                     _=Depends(auth.require_admin)):
    """
    Todo lo que pasó desde una IP: qué cuentas, qué apostaron, cuándo.
    Es la vista que se usa cuando algo llamó la atención y hay que
    reconstruir qué ocurrió.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        apuestas = await conn.fetch("""
            SELECT b.code, b.picks, b.stake, b.odd_total, b.potential_win,
                   b.status, b.created_at, b.es_live, b.device_hash,
                   u.id AS uid, u.nombre_completo, u.username, u.creado_por,
                   a.name AS agencia_nombre
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE b.ip = $1
            ORDER BY b.created_at DESC
            LIMIT $2
        """, ip, max(1, min(limite, 300)))

        cuentas = await conn.fetch("""
            SELECT u.id, u.username, u.nombre_completo, u.creado_por,
                   u.balance, u.riesgo_nivel, u.created_at,
                   u.ip_registro = $1 AS registrado_aca,
                   a.name AS agencia_nombre
            FROM users u
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE u.id IN (SELECT DISTINCT user_id FROM betslips
                           WHERE ip = $1 AND user_id IS NOT NULL)
               OR u.ip_registro = $1 OR u.ip_ultima = $1
            LIMIT 40
        """, ip)

    total_stake = sum(float(f["stake"] or 0) for f in apuestas)
    ganadas = sum(1 for f in apuestas
                  if (f["status"] or "").lower() in ("won", "paid"))
    cobrado = sum(float(f["stake"] or 0) * float(f["odd_total"] or 0)
                  for f in apuestas
                  if (f["status"] or "").lower() in ("won", "paid"))
    dispositivos = {f["device_hash"] for f in apuestas if f["device_hash"]}

    return {
        "ip": ip,
        "apuestas": [{
            "code": f["code"],
            "cliente": f["nombre_completo"] or f["username"] or "Sin cliente",
            "cliente_id": f["uid"],
            "agencia": f["agencia_nombre"] or f["creado_por"] or "—",
            "picks": len(_picks_de(f)),
            "stake": float(f["stake"] or 0),
            "cuota": float(f["odd_total"] or 0),
            "a_pagar": float(f["potential_win"] or 0),
            "estado": f["status"],
            "live": bool(f["es_live"]),
            # Fecha Y hora: para reconstruir la secuencia de lo que pasó
            "fecha": _fecha_local(f["created_at"]),
        } for f in apuestas],
        "cuentas": [{
            "id": c["id"],
            "nombre": c["nombre_completo"] or c["username"],
            "username": c["username"],
            "agencia": c["agencia_nombre"] or c["creado_por"],
            "saldo": int(c["balance"] or 0) // 100,
            "nivel": c["riesgo_nivel"] or "normal",
            "alta": _fecha_local(c["created_at"]),
            "registrado_aca": bool(c["registrado_aca"]),
        } for c in cuentas],
        "resumen": {
            "apuestas": len(apuestas),
            "cuentas": len(cuentas),
            "dispositivos": len(dispositivos),
            "apostado": round(total_stake, 2),
            "ganadas": ganadas,
            "cobrado": round(cobrado, 2),
            "resultado_casa": round(total_stake - cobrado, 2),
        },
    }


@app.get("/api/admin/riesgo/cliente/{user_id}")
async def riesgo_ficha_cliente(user_id: int, _=Depends(auth.require_admin)):
    """
    Todo lo que se sabe de un jugador desde el punto de vista de riesgo:
    desde dónde juega, con quién comparte conexión, cómo le va.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT u.id, u.username, u.nombre_completo, u.balance,
                   u.creado_por, u.created_at, u.ip_registro, u.ip_ultima,
                   u.device_hash, u.riesgo_nivel, u.riesgo_nota, u.riesgo_tope,
                   a.name AS agencia_nombre
            FROM users u
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE u.id = $1
        """, user_id)
        if not u:
            raise HTTPException(404, "Cliente inexistente")

        ips = await conn.fetch("""
            SELECT ip, COUNT(*) AS apuestas, MAX(created_at) AS ultima
            FROM betslips
            WHERE user_id = $1 AND ip IS NOT NULL
            GROUP BY ip ORDER BY COUNT(*) DESC LIMIT 12
        """, user_id)

        # Otras cuentas que usaron alguna de esas IPs
        vecinos = await conn.fetch("""
            SELECT DISTINCT u.id, u.username, u.nombre_completo,
                   u.creado_por, b.ip
            FROM betslips b
            JOIN users u ON u.id = b.user_id
            WHERE b.ip IN (
                    SELECT DISTINCT ip FROM betslips
                    WHERE user_id = $1 AND ip IS NOT NULL)
              AND b.user_id <> $1
            LIMIT 25
        """, user_id)

        # Cómo le va: si gana sostenido, importa saberlo
        r = await conn.fetchrow("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(stake),0) AS apostado,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid')
                        THEN stake*odd_total ELSE 0 END),0) AS cobrado,
                   COALESCE(SUM(CASE WHEN status IN ('won','paid') THEN 1 ELSE 0 END),0) AS ganadas,
                   COALESCE(SUM(CASE WHEN es_live THEN 1 ELSE 0 END),0) AS live
            FROM betslips
            WHERE user_id = $1 AND status IN ('won','lost','paid')
        """, user_id)

        alertas = await conn.fetch("""
            SELECT id, tipo, severidad, titulo, estado, created_at
            FROM riesgo_alertas WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 10
        """, user_id)

    apostado = float(r["apostado"] or 0)
    cobrado = float(r["cobrado"] or 0)
    n = int(r["n"] or 0)
    return {
        "cliente": {
            "id": u["id"], "nombre": u["nombre_completo"] or u["username"],
            "username": u["username"],
            "agencia": u["creado_por"], "agencia_nombre": u["agencia_nombre"],
            "saldo": int(u["balance"] or 0) // 100,
            "alta": _fecha_local(u["created_at"]),
            "ip_registro": u["ip_registro"], "ip_ultima": u["ip_ultima"],
            "device": u["device_hash"],
            "nivel": u["riesgo_nivel"] or "normal",
            "nota": u["riesgo_nota"], "tope": u["riesgo_tope"],
        },
        "ips": [{"ip": f["ip"], "apuestas": int(f["apuestas"]),
                 "ultima": _fecha_local(f["ultima"])} for f in ips],
        "comparten_ip": [{"id": v["id"],
                          "nombre": v["nombre_completo"] or v["username"],
                          "agencia": v["creado_por"], "ip": v["ip"]}
                         for v in vecinos],
        "actividad": {
            "apuestas": n, "ganadas": int(r["ganadas"] or 0),
            "en_vivo": int(r["live"] or 0),
            "apostado": round(apostado, 2), "cobrado": round(cobrado, 2),
            # Positivo = el jugador va ganando. La casa pierde.
            "resultado_jugador": round(cobrado - apostado, 2),
            "roi_pct": round((cobrado - apostado) / apostado * 100, 1)
                       if apostado > 0 else 0,
        },
        "alertas": [{"id": a["id"], "tipo": a["tipo"],
                     "severidad": a["severidad"], "titulo": a["titulo"],
                     "estado": a["estado"], "fecha": _fecha_local(a["created_at"])}
                    for a in alertas],
    }


# ── RIESGO DEL LADO DE LAS AGENCIAS ───────────────────────────
# Una agencia puede cargar saldo, anular apuestas y hacer cash out.
# Con esas tres cosas se saca plata sin que se note en el cierre, así
# que también hay que mirarla a ella, no solo a los jugadores.

async def _detectar_agencia_movimientos(conn, dias=14):
    """
    Plata que entra y sale sin jugarse. Un cliente que carga 500.000 y
    retira 480.000 sin apostar no está jugando: está moviendo fondos.
    """
    alertas = 0
    filas = await conn.fetch("""
        SELECT m.agencia_code, m.user_id,
               COALESCE(SUM(CASE WHEN m.tipo LIKE 'carga%' THEN m.monto ELSE 0 END),0) AS cargado,
               COALESCE(SUM(CASE WHEN m.tipo LIKE 'retiro%' THEN m.monto ELSE 0 END),0) AS retirado,
               COUNT(*) AS movimientos,
               u.nombre_completo, u.username
        FROM agencia_movimientos m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.created_at > NOW() - ($1 || ' days')::interval
          AND m.user_id IS NOT NULL
        GROUP BY m.agencia_code, m.user_id, u.nombre_completo, u.username
        HAVING COALESCE(SUM(CASE WHEN m.tipo LIKE 'carga%' THEN m.monto ELSE 0 END),0) > 0
    """, str(dias))

    for f in filas:
        cargado = float(f["cargado"] or 0)
        retirado = float(f["retirado"] or 0)
        if cargado < 50000 or retirado <= 0:
            continue
        # Cuánto de lo que entró se jugó realmente
        jugado = await conn.fetchval("""
            SELECT COALESCE(SUM(stake),0) FROM betslips
            WHERE user_id = $1
              AND created_at > NOW() - ($2 || ' days')::interval
        """, f["user_id"], str(dias)) or 0
        jugado = float(jugado)
        # Si retiró casi todo lo que cargó y apostó una fracción mínima
        if retirado < cargado * 0.6:
            continue
        if jugado > cargado * 0.25:
            continue
        if await _guardar_alerta(
            conn, "movimiento_sin_juego", "alta",
            "Carga y retiro sin apuestas de por medio",
            f"{f['nombre_completo'] or f['username'] or 'Cliente'} cargó "
            f"{cargado:,.0f} en {f['agencia_code']} y retiró {retirado:,.0f}, "
            f"pero solo apostó {jugado:,.0f}. La plata entró y salió casi "
            f"sin jugarse.",
            evidencia={"cargado": round(cargado, 2),
                       "retirado": round(retirado, 2),
                       "apostado": round(jugado, 2),
                       "movimientos": int(f["movimientos"])},
            user_id=f["user_id"], agencia=f["agencia_code"],
            monto=retirado,
            huella_partes=(f["agencia_code"], f["user_id"], int(cargado), dias)):
            alertas += 1
    return alertas


async def _detectar_agencia_perdedora(conn, dias=30, minimo=30):
    """
    Una agencia cuyos clientes ganan sistemáticamente. Puede ser mala
    suerte, pero también un cajero coludido cargando apuestas con
    resultado conocido.
    """
    alertas = 0
    filas = await conn.fetch("""
        SELECT u.creado_por AS agencia,
               COUNT(*) AS n,
               COALESCE(SUM(b.stake),0) AS apostado,
               COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                    THEN b.stake*b.odd_total ELSE 0 END),0) AS pagado,
               a.name AS nombre
        FROM betslips b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN agencias a ON a.code = u.creado_por
        WHERE b.created_at > NOW() - ($1 || ' days')::interval
          AND b.status IN ('won','lost','paid')
          AND u.creado_por IS NOT NULL
        GROUP BY u.creado_por, a.name
        HAVING COUNT(*) >= $2
    """, str(dias), minimo)

    for f in filas:
        apostado = float(f["apostado"] or 0)
        pagado = float(f["pagado"] or 0)
        if apostado <= 0:
            continue
        margen = (apostado - pagado) / apostado * 100
        # La casa debería quedarse con algo. Un margen negativo
        # sostenido en decenas de apuestas no es varianza normal.
        if margen > -5:
            continue
        if await _guardar_alerta(
            conn, "agencia_perdedora", "alta" if margen < -20 else "media",
            f"La casa pierde con los clientes de {f['nombre'] or f['agencia']}",
            f"En {f['n']} apuestas de {dias} días, los clientes de "
            f"{f['agencia']} apostaron {apostado:,.0f} y cobraron "
            f"{pagado:,.0f}. El margen de la casa es {margen:+.1f}%. "
            f"Puede ser varianza, pero también un cajero cargando "
            f"apuestas con el resultado ya conocido.",
            evidencia={"apuestas": int(f["n"]), "apostado": round(apostado, 2),
                       "pagado": round(pagado, 2),
                       "margen_pct": round(margen, 1)},
            agencia=f["agencia"], monto=pagado - apostado,
            huella_partes=(f["agencia"], dias, int(margen))):
            alertas += 1
    return alertas


async def _detectar_anulaciones(conn, dias=14, minimo=5):
    """
    Anular una apuesta devuelve la plata. Usado de más, es la forma
    más simple de sacar fondos sin dejar rastro en el cierre.
    """
    alertas = 0
    try:
        filas = await conn.fetch("""
            SELECT b.paid_by AS agencia, COUNT(*) AS n,
                   COALESCE(SUM(b.stake),0) AS total,
                   a.name AS nombre
            FROM betslips b
            LEFT JOIN agencias a ON a.code = b.paid_by
            WHERE b.status = 'cancelled'
              AND b.created_at > NOW() - ($1 || ' days')::interval
              AND b.paid_by IS NOT NULL
            GROUP BY b.paid_by, a.name
            HAVING COUNT(*) >= $2
        """, str(dias), minimo)
    except Exception as e:
        log.warning(f"[RIESGO] anulaciones no disponibles: {e}")
        return 0

    for f in filas:
        n = int(f["n"])
        if await _guardar_alerta(
            conn, "anulaciones", "alta" if n >= 15 else "media",
            f"{n} anulaciones en {f['nombre'] or f['agencia']}",
            f"La agencia {f['agencia']} anuló {n} apuestas en {dias} días "
            f"por {float(f['total']):,.0f}. Anular devuelve la plata: usado "
            f"de más es una forma de mover fondos sin que aparezca en el "
            f"cierre.",
            evidencia={"anulaciones": n, "monto": float(f["total"] or 0)},
            agencia=f["agencia"], monto=float(f["total"] or 0),
            huella_partes=(f["agencia"], n, dias)):
            alertas += 1
    return alertas


@app.get("/api/admin/riesgo/agencias")
async def riesgo_agencias(dias: int = 30, _=Depends(auth.require_admin)):
    """Panorama por agencia: margen, movimientos y alertas."""
    dias = max(1, min(dias, 365))
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT a.code, a.name, a.moneda, a.status,
                   COUNT(DISTINCT u.id) AS clientes,
                   COUNT(b.code) AS apuestas,
                   COALESCE(SUM(b.stake),0) AS apostado,
                   COALESCE(SUM(CASE WHEN b.status IN ('won','paid')
                        THEN b.stake*b.odd_total ELSE 0 END),0) AS pagado
            FROM agencias a
            LEFT JOIN users u ON u.creado_por = a.code
            LEFT JOIN betslips b ON b.user_id = u.id
                 AND b.created_at > NOW() - ($1 || ' days')::interval
                 AND b.status IN ('won','lost','paid')
            WHERE COALESCE(a.tipo,'agencia') <> 'influencer'
            GROUP BY a.code, a.name, a.moneda, a.status
            ORDER BY COALESCE(SUM(b.stake),0) DESC
        """, str(dias))

        alertas = await conn.fetch("""
            SELECT agencia_code, COUNT(*) AS n
            FROM riesgo_alertas
            WHERE estado='abierta' AND agencia_code IS NOT NULL
            GROUP BY agencia_code
        """)
        por_ag = {a["agencia_code"]: int(a["n"]) for a in alertas}

    salida = []
    for f in filas:
        apostado = float(f["apostado"] or 0)
        pagado = float(f["pagado"] or 0)
        margen = (apostado - pagado) / apostado * 100 if apostado > 0 else None
        salida.append({
            "code": f["code"], "name": f["name"], "moneda": f["moneda"],
            "activa": f["status"] == "active",
            "clientes": int(f["clientes"] or 0),
            "apuestas": int(f["apuestas"] or 0),
            "apostado": round(apostado, 2),
            "pagado": round(pagado, 2),
            "ggr": round(apostado - pagado, 2),
            "margen_pct": round(margen, 1) if margen is not None else None,
            "alertas": por_ag.get(f["code"], 0),
        })
    return {"agencias": salida, "dias": dias}


@app.post("/api/admin/riesgo/escanear")
async def riesgo_escanear(_=Depends(auth.require_admin)):
    """Corre el motor a pedido y devuelve cuántas alertas generó cada regla."""
    pool = await get_db()
    async with pool.acquire() as conn:
        res = await _correr_motor_riesgo(conn)
        abiertas = await conn.fetchval(
            "SELECT COUNT(*) FROM riesgo_alertas WHERE estado='abierta'")
    fallaron = [k for k, v in res.items() if v == -1]
    return {"ok": True, "nuevas": {k: v for k, v in res.items() if v >= 0},
            "reglas_con_error": fallaron,
            "alertas_abiertas": int(abiertas or 0)}


@app.get("/api/admin/riesgo/alertas")
async def riesgo_alertas(estado: str = "abierta", severidad: str = "",
                         tipo: str = "", limite: int = 60,
                         _=Depends(auth.require_admin)):
    cond, args = ["1=1"], []
    if estado and estado != "todas":
        args.append(estado); cond.append(f"a.estado = ${len(args)}")
    if severidad:
        args.append(severidad); cond.append(f"a.severidad = ${len(args)}")
    if tipo:
        args.append(tipo); cond.append(f"a.tipo = ${len(args)}")
    args.append(max(1, min(limite, 200)))

    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch(f"""
            SELECT a.*, u.nombre_completo, u.username
            FROM riesgo_alertas a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE {" AND ".join(cond)}
            ORDER BY
                CASE a.severidad WHEN 'critica' THEN 4 WHEN 'alta' THEN 3
                                 WHEN 'media' THEN 2 ELSE 1 END DESC,
                a.created_at DESC
            LIMIT ${len(args)}
        """, *args)
        resumen = await conn.fetch("""
            SELECT severidad, COUNT(*) AS n
            FROM riesgo_alertas WHERE estado='abierta'
            GROUP BY severidad
        """)

    return {
        "alertas": [{
            "id": f["id"], "tipo": f["tipo"], "severidad": f["severidad"],
            "titulo": f["titulo"], "detalle": f["detalle"],
            "evidencia": json.loads(f["evidencia"]) if f["evidencia"] else {},
            "user_id": f["user_id"],
            "cliente": f["nombre_completo"] or f["username"],
            "agencia": f["agencia_code"], "betslip": f["betslip_code"],
            "monto": float(f["monto"] or 0), "estado": f["estado"],
            "nota": f["nota"], "fecha": _fecha_local(f["created_at"]),
        } for f in filas],
        "resumen": {r["severidad"]: int(r["n"]) for r in resumen},
    }


@app.post("/api/admin/riesgo/alertas/{alerta_id}")
async def riesgo_marcar(alerta_id: int, request: Request,
                        _=Depends(auth.require_admin)):
    body = await request.json()
    estado = body.get("estado") or "revisada"
    if estado not in ("abierta", "revisada", "descartada"):
        raise HTTPException(400, "Estado inválido")
    nota = (body.get("nota") or "")[:500] or None
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE riesgo_alertas
            SET estado=$2, nota=COALESCE($3, nota),
                revisada_por='admin', revisada_at=NOW()
            WHERE id=$1
        """, alerta_id, estado, nota)
    return {"ok": True, "estado": estado}


@app.post("/api/admin/riesgo/marcar-usuario")
async def riesgo_marcar_usuario(request: Request, _=Depends(auth.require_admin)):
    """
    Pone a un jugador bajo observación o le limita el monto. No lo
    bloquea: bloquear a un cliente legítimo por un falso positivo
    cuesta más que la pérdida que se evita.
    """
    body = await request.json()
    user_id = int(body.get("user_id") or 0)
    nivel = body.get("nivel") or "normal"
    if nivel not in ("normal", "observado", "limitado"):
        raise HTTPException(400, "Nivel inválido")
    nota = (body.get("nota") or "")[:300] or None
    tope = body.get("tope")
    try:
        tope = int(tope) if tope not in (None, "") else None
    except (TypeError, ValueError):
        tope = None

    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            UPDATE users SET riesgo_nivel=$2, riesgo_nota=$3, riesgo_tope=$4
            WHERE id=$1
        """, user_id, nivel, nota, tope)
        if r.endswith("0"):
            raise HTTPException(404, "Cliente inexistente")
    log.info(f"[RIESGO] usuario {user_id} marcado como {nivel}")
    return {"ok": True, "nivel": nivel, "tope": tope}


@app.post("/api/admin/riesgo/alertas/analizar")
async def riesgo_analizar_ia(request: Request, _=Depends(auth.require_admin)):
    """
    La IA lee las alertas abiertas y arma un panorama: qué mirar
    primero, qué puede ser falso positivo y qué acción sugiere.

    El motor detecta patrones; la IA ayuda a priorizar cuando hay
    decenas de alertas y no se sabe por dónde empezar.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT a.tipo, a.severidad, a.titulo, a.detalle, a.monto,
                   u.nombre_completo, u.username
            FROM riesgo_alertas a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.estado='abierta'
            ORDER BY CASE a.severidad WHEN 'critica' THEN 4 WHEN 'alta' THEN 3
                     WHEN 'media' THEN 2 ELSE 1 END DESC
            LIMIT 25
        """)
    if not filas:
        return {"analisis": "No hay alertas abiertas para analizar."}

    listado = "\n".join(
        f"- [{f['severidad']}] {f['tipo']}: {f['titulo']}. "
        f"{(f['detalle'] or '')[:220]}" for f in filas)

    prompt = f"""Sos analista de riesgo y fraude de una casa de apuestas
deportivas. El sistema detectó estas alertas abiertas:

{listado}

Respondé en español rioplatense, en prosa, sin vinetas ni titulos, en
6 u 8 frases. Decí:
1. Cuáles son las 2 o 3 mas urgentes y por que.
2. Cuales probablemente sean falsos positivos y como confirmarlo.
3. Que accion concreta conviene tomar primero.

Tene en cuenta que limitar o suspender a un cliente legitimo cuesta mas
que la perdida que se evita, asi que sugeri verificar antes de actuar
salvo que la evidencia sea contundente."""

    texto = await _consultar_claude_texto(prompt, max_tokens=900)
    return {"analisis": texto, "alertas_analizadas": len(filas)}


# ── CAJA: CARGAS, DESCARGAS Y SALDOS ──────────────────────────
# Lo que el cajero necesita para cuadrar al cierre del día:
#   cuánto entró en efectivo, cuánto salió, y cuánto saldo quedó
#   vivo en las cuentas de los jugadores.
#
# EL SALDO NO ES LO MISMO QUE LA GANANCIA. Si un cliente cargó 10.000
# y no jugó, esos 10.000 están en la caja de la agencia pero le
# pertenecen al cliente. Por eso el saldo vivo se informa aparte: es un
# pasivo, no una utilidad.
#
# En cascada: cada agencia ve su propia caja y la de todas las que
# cuelgan de ella, igual que el cierre.

def _fecha_local(dt):
    """Fecha en la zona de la casa. Nunca lanza excepción."""
    if not dt:
        return ""
    try:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(TZ_CASA).strftime("%d/%m %H:%M")
    except Exception:
        return str(dt)[:16]


async def _resumen_caja(conn, codes, desde, hasta):
    """Cargas, descargas y saldo vivo de un conjunto de agencias."""
    filas = await conn.fetch("""
        SELECT agencia_code, tipo,
               COUNT(*) AS cantidad,
               COALESCE(SUM(monto),0) AS total
        FROM agencia_movimientos
        WHERE agencia_code = ANY($1)
          AND created_at::date >= $2
          AND created_at::date <= $3
        GROUP BY agencia_code, tipo
    """, codes, desde, hasta)

    # Saldo vivo: lo que los clientes de esas agencias tienen sin jugar.
    # Está en centavos en la base, se devuelve en pesos como el resto.
    saldos = await conn.fetch("""
        SELECT creado_por AS agencia_code,
               COUNT(*) AS clientes,
               COALESCE(SUM(balance),0) AS saldo,
               COALESCE(SUM(saldo_bono),0) AS bono
        FROM users
        WHERE creado_por = ANY($1)
        GROUP BY creado_por
    """, codes)

    por_agencia = {c: {"cargas": 0.0, "descargas": 0.0, "premios": 0.0,
                       "mov_cargas": 0, "mov_descargas": 0,
                       "saldo_clientes": 0.0, "bono_clientes": 0.0,
                       "clientes": 0} for c in codes}

    for f in filas:
        d = por_agencia.setdefault(f["agencia_code"], {
            "cargas": 0.0, "descargas": 0.0, "premios": 0.0,
            "mov_cargas": 0, "mov_descargas": 0,
            "saldo_clientes": 0.0, "bono_clientes": 0.0, "clientes": 0})
        t = (f["tipo"] or "").lower()
        monto = float(f["total"] or 0)
        if t in ("carga", "carga_admin", "carga_cliente"):
            d["cargas"] += monto
            d["mov_cargas"] += int(f["cantidad"])
        elif t in ("retiro", "retiro_cliente"):
            d["descargas"] += monto
            d["mov_descargas"] += int(f["cantidad"])
        elif t == "premio":
            d["premios"] += monto

    for f in saldos:
        d = por_agencia.get(f["agencia_code"])
        if d is not None:
            d["saldo_clientes"] = int(f["saldo"] or 0) / 100
            d["bono_clientes"] = int(f["bono"] or 0) / 100
            d["clientes"] = int(f["clientes"] or 0)

    return por_agencia


async def _detalle_movimientos(conn, codes, desde, hasta, limite=200):
    """Movimiento por movimiento, para revisar un cuadre que no cierra."""
    filas = await conn.fetch("""
        SELECT am.created_at, am.agencia_code, am.tipo, am.monto,
               am.detalle, am.operador,
               u.nombre_completo, u.username, u.id AS user_id
        FROM agencia_movimientos am
        LEFT JOIN users u ON u.id = am.user_id
        WHERE am.agencia_code = ANY($1)
          AND am.created_at::date >= $2
          AND am.created_at::date <= $3
        ORDER BY am.created_at DESC
        LIMIT $4
    """, codes, desde, hasta, limite)
    return [{
        # Protegido: si la columna no tuviera zona, astimezone falla y
        # se llevaría puesto todo el endpoint por una fecha.
        "fecha": _fecha_local(f["created_at"]),
        "agencia": f["agencia_code"],
        "tipo": f["tipo"],
        "monto": float(f["monto"] or 0),
        "cliente": f["nombre_completo"] or f["username"] or "—",
        "cliente_id": f["user_id"],
        "detalle": f["detalle"],
        "operador": f["operador"],
    } for f in filas]


def _hoy_iso():
    return datetime.now(TZ_CASA).date().isoformat()


def _a_fecha(x, por_defecto=None):
    """
    Texto 'YYYY-MM-DD' a date. Los parámetros de la URL llegan como
    texto, y compararlos contra created_at::date sin convertir hace
    que Postgres no pueda inferir el tipo y tire error.
    """
    from datetime import date as _d
    if isinstance(x, _d):
        return x
    try:
        return _d.fromisoformat(str(x)[:10])
    except (TypeError, ValueError):
        return por_defecto or datetime.now(TZ_CASA).date()


@app.get("/api/agencias/me/caja")
async def caja_agencia(desde: str = None, hasta: str = None,
                       cliente: int = None, detalle: bool = False,
                       agencia_code: str = Depends(requiere_agencia)):
    """
    Cuadre de caja de la agencia y su rama.
    - Sin filtros: el día de hoy.
    - cliente=<id>: solo los movimientos de ese cliente.
    - detalle=true: agrega el listado movimiento por movimiento.
    """
    desde = _a_fecha(desde or _hoy_iso())
    hasta = _a_fecha(hasta or desde)

    pool = await get_db()
    async with pool.acquire() as conn:
        yo = await conn.fetchrow(
            "SELECT code, name, moneda, ruta FROM agencias WHERE code=$1",
            agencia_code)
        if not yo:
            raise HTTPException(404, "Agencia no encontrada")

        rama = await conn.fetch("""
            SELECT code, name, nivel FROM agencias
            WHERE (code=$1 OR ruta LIKE $2)
              AND COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY ruta
        """, agencia_code, (yo["ruta"] or yo["code"]) + "/%")
        codes = [r["code"] for r in rama]

        if cliente:
            # Un cliente puntual: validar que sea de la rama
            u = await conn.fetchrow(
                "SELECT id, nombre_completo, username, balance, saldo_bono, "
                "creado_por FROM users WHERE id=$1", cliente)
            if not u or u["creado_por"] not in codes:
                raise HTTPException(403, "Ese cliente no es de tu rama")
            movs = await conn.fetch("""
                SELECT tipo, COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS total
                FROM agencia_movimientos
                WHERE user_id=$1 AND created_at::date >= $2
                  AND created_at::date <= $3
                GROUP BY tipo
            """, cliente, desde, hasta)
            cargas = sum(float(m["total"]) for m in movs
                         if (m["tipo"] or "").startswith("carga"))
            descargas = sum(float(m["total"]) for m in movs
                            if (m["tipo"] or "").startswith("retiro"))
            det = await _detalle_movimientos(conn, codes, desde, hasta) \
                  if detalle else None
            if det is not None:
                det = [d for d in det if d["cliente_id"] == cliente]
            return {
                "desde": desde.isoformat(), "hasta": hasta.isoformat(), "moneda": yo["moneda"],
                "cliente": {
                    "id": u["id"],
                    "nombre": u["nombre_completo"] or u["username"],
                    "saldo": int(u["balance"] or 0) // 100,
                    "saldo_bono": int(u["saldo_bono"] or 0) // 100,
                    "agencia": u["creado_por"],
                },
                "total": {"cargas": round(cargas, 2),
                          "descargas": round(descargas, 2),
                          "neto": round(cargas - descargas, 2)},
                "movimientos": det,
            }

        resumen = await _resumen_caja(conn, codes, desde, hasta)
        det = await _detalle_movimientos(conn, codes, desde, hasta) \
              if detalle else None

    filas = []
    tot = {"cargas": 0.0, "descargas": 0.0, "premios": 0.0,
           "saldo_clientes": 0.0, "bono_clientes": 0.0, "clientes": 0}
    for r in rama:
        d = resumen.get(r["code"], {})
        fila = {
            "code": r["code"], "name": r["name"], "nivel": r["nivel"],
            "es_mia": r["code"] == agencia_code,
            "cargas": round(d.get("cargas", 0), 2),
            "descargas": round(d.get("descargas", 0), 2),
            "neto_caja": round(d.get("cargas", 0) - d.get("descargas", 0), 2),
            "premios_pagados": round(d.get("premios", 0), 2),
            "movimientos": d.get("mov_cargas", 0) + d.get("mov_descargas", 0),
            "clientes": d.get("clientes", 0),
            "saldo_clientes": round(d.get("saldo_clientes", 0), 2),
            "bono_clientes": round(d.get("bono_clientes", 0), 2),
        }
        for k in ("cargas", "descargas", "premios_pagados",
                  "saldo_clientes", "bono_clientes", "clientes"):
            tot[{"premios_pagados": "premios"}.get(k, k)] += fila[k]
        filas.append(fila)

    # El efectivo que pasó por el mostrador: ventas y premios. Es lo
    # que el cajero cuenta al cerrar, distinto de las cargas de saldo.
    # Una sola consulta para toda la rama, fuera del bucle.
    async with pool.acquire() as conn2:
        operativa = await _caja_operativa(conn2, codes, desde, hasta)

    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(), "moneda": yo["moneda"],
        "operativa": operativa,
        "total": {
            "cargas": round(tot["cargas"], 2),
            "descargas": round(tot["descargas"], 2),
            "neto_caja": round(tot["cargas"] - tot["descargas"], 2),
            "premios_pagados": round(tot["premios"], 2),
            "clientes": int(tot["clientes"]),
            "saldo_clientes": round(tot["saldo_clientes"], 2),
            "bono_clientes": round(tot["bono_clientes"], 2),
        },
        "agencias": filas,
        "movimientos": det,
        "aviso": ("El saldo de los clientes es plata de ellos, no ganancia "
                  "de la agencia. Para la utilidad, mirá el cierre."),
    }


@app.get("/api/admin/caja")
async def caja_admin(desde: str = None, hasta: str = None,
                     agencia: str = None, cliente: int = None,
                     detalle: bool = False, _=Depends(auth.require_admin)):
    """
    Igual que el de agencia pero para el admin: sin filtro ve todas.
    Con agencia=CODE, esa agencia y su rama.
    """
    desde = _a_fecha(desde or _hoy_iso())
    hasta = _a_fecha(hasta or desde)

    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            base = await conn.fetchrow(
                "SELECT code, ruta FROM agencias WHERE code=$1", agencia.upper())
            if not base:
                raise HTTPException(404, "Agencia inexistente")
            rama = await conn.fetch("""
                SELECT code, name, nivel FROM agencias
                WHERE (code=$1 OR ruta LIKE $2)
                  AND COALESCE(tipo,'agencia') <> 'influencer'
                ORDER BY ruta
            """, base["code"], (base["ruta"] or base["code"]) + "/%")
        else:
            rama = await conn.fetch("""
                SELECT code, name, nivel FROM agencias
                WHERE COALESCE(tipo,'agencia') <> 'influencer'
                ORDER BY ruta
            """)
        codes = [r["code"] for r in rama]
        if not codes:
            return {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "agencias": [],
                    "total": {}, "movimientos": None}

        if cliente:
            u = await conn.fetchrow(
                "SELECT id, nombre_completo, username, balance, saldo_bono, "
                "creado_por, moneda FROM users WHERE id=$1", cliente)
            if not u:
                raise HTTPException(404, "Cliente inexistente")
            movs = await conn.fetch("""
                SELECT tipo, COALESCE(SUM(monto),0) AS total
                FROM agencia_movimientos
                WHERE user_id=$1 AND created_at::date >= $2
                  AND created_at::date <= $3
                GROUP BY tipo
            """, cliente, desde, hasta)
            cargas = sum(float(m["total"]) for m in movs
                         if (m["tipo"] or "").startswith("carga"))
            descargas = sum(float(m["total"]) for m in movs
                            if (m["tipo"] or "").startswith("retiro"))
            det = await _detalle_movimientos(conn, codes, desde, hasta) \
                  if detalle else None
            if det is not None:
                det = [d for d in det if d["cliente_id"] == cliente]
            return {
                "desde": desde.isoformat(), "hasta": hasta.isoformat(), "moneda": u["moneda"] or "ARS",
                "cliente": {
                    "id": u["id"],
                    "nombre": u["nombre_completo"] or u["username"],
                    "saldo": int(u["balance"] or 0) // 100,
                    "saldo_bono": int(u["saldo_bono"] or 0) // 100,
                    "agencia": u["creado_por"] or "Telegram directo",
                },
                "total": {"cargas": round(cargas, 2),
                          "descargas": round(descargas, 2),
                          "neto": round(cargas - descargas, 2)},
                "movimientos": det,
            }

        resumen = await _resumen_caja(conn, codes, desde, hasta)
        det = await _detalle_movimientos(conn, codes, desde, hasta) \
              if detalle else None

    filas = []
    tot = {"cargas": 0.0, "descargas": 0.0, "premios": 0.0,
           "saldo_clientes": 0.0, "bono_clientes": 0.0, "clientes": 0}
    for r in rama:
        d = resumen.get(r["code"], {})
        fila = {
            "code": r["code"], "name": r["name"], "nivel": r["nivel"],
            "cargas": round(d.get("cargas", 0), 2),
            "descargas": round(d.get("descargas", 0), 2),
            "neto_caja": round(d.get("cargas", 0) - d.get("descargas", 0), 2),
            "premios_pagados": round(d.get("premios", 0), 2),
            "movimientos": d.get("mov_cargas", 0) + d.get("mov_descargas", 0),
            "clientes": d.get("clientes", 0),
            "saldo_clientes": round(d.get("saldo_clientes", 0), 2),
            "bono_clientes": round(d.get("bono_clientes", 0), 2),
        }
        tot["cargas"] += fila["cargas"]
        tot["descargas"] += fila["descargas"]
        tot["premios"] += fila["premios_pagados"]
        tot["saldo_clientes"] += fila["saldo_clientes"]
        tot["bono_clientes"] += fila["bono_clientes"]
        tot["clientes"] += fila["clientes"]
        filas.append(fila)

    # El efectivo del mostrador: ventas y premios de toda la red
    async with pool.acquire() as conn2:
        todas = [f["code"] for f in await conn2.fetch(
            "SELECT code FROM agencias")]
        operativa = await _caja_operativa(conn2, todas, desde, hasta)

    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "operativa": operativa,
        "total": {
            "cargas": round(tot["cargas"], 2),
            "descargas": round(tot["descargas"], 2),
            "neto_caja": round(tot["cargas"] - tot["descargas"], 2),
            "premios_pagados": round(tot["premios"], 2),
            "clientes": int(tot["clientes"]),
            "saldo_clientes": round(tot["saldo_clientes"], 2),
            "bono_clientes": round(tot["bono_clientes"], 2),
        },
        "agencias": filas,
        "movimientos": det,
        "aviso": ("El saldo de los clientes es plata de ellos, no ganancia. "
                  "Para la utilidad, mirá el cierre."),
    }


# ── ANULACION DE APUESTAS ─────────────────────────────────────
# Sirve para deshacer el error del cajero, no para que el cliente se
# arrepienta. Por eso la ventana es corta y el permiso se habilita a
# dedo desde el admin.
#
# DOS CONDICIONES, LAS DOS OBLIGATORIAS:
#   1. Que no hayan pasado mas de N minutos desde que se pago (5 por
#      defecto). Es el margen para corregir una carga mal hecha.
#   2. Que falte mas de N minutos para que empiece el evento (60 por
#      defecto). Sin esto, alguien podria anular al ver que el partido
#      viene mal, que es exactamente lo que hay que impedir.
#
# El permiso se guarda en la agencia. Si se habilita "toda la rama", se
# marca a la agencia y a todas sus descendientes usando la ruta.
#
# TODO lo que hizo el pago se revierte: el boleto, sports_bets, el
# ticket de la agencia, la exposicion y, si se jugo con saldo, la plata
# vuelve a la cuenta del cliente.

ANULAR_MINUTOS_TRAS_PAGO = int(os.environ.get("ANULAR_MINUTOS_TRAS_PAGO", "5"))
ANULAR_MINUTOS_ANTES_EVENTO = int(os.environ.get("ANULAR_MINUTOS_ANTES_EVENTO", "60"))


def _inicio_mas_proximo(picks):
    """La hora del primer partido del boleto. Es la que manda: si una
    pata ya esta por empezar, el boleto entero deja de ser anulable."""
    menor = None
    for p in (picks or []):
        crudo = p.get("commence_time") or p.get("start_time") or p.get("time")
        if not crudo:
            continue
        try:
            dt = datetime.fromisoformat(str(crudo).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if menor is None or dt < menor:
            menor = dt
    return menor


async def _puede_anular(conn, row, agencia_code=None):
    """(ok, motivo). agencia_code None significa que anula el admin."""
    estado = (row["status"] or "").lower()
    if estado not in ("active", "pending"):
        return False, f"No se puede anular una apuesta en estado '{estado}'"

    ahora = datetime.now(timezone.utc)

    # Regla 1: ventana desde el pago
    if estado == "active":
        pagado = row["paid_at"]
        if not pagado:
            return False, "La apuesta figura activa pero sin fecha de pago"
        if pagado.tzinfo is None:
            pagado = pagado.replace(tzinfo=timezone.utc)
        pasados = (ahora - pagado).total_seconds() / 60
        if pasados > ANULAR_MINUTOS_TRAS_PAGO:
            return False, (f"Pasaron {int(pasados)} minutos desde el pago. "
                           f"Solo se puede anular dentro de los "
                           f"{ANULAR_MINUTOS_TRAS_PAGO} minutos.")

    # Regla 2: distancia al comienzo del evento
    try:
        picks = ast.literal_eval(row["picks"]) if isinstance(row["picks"], str) \
                else (row["picks"] or [])
    except (ValueError, SyntaxError):
        picks = []
    inicio = _inicio_mas_proximo(picks)
    if inicio:
        faltan = (inicio - ahora).total_seconds() / 60
        if faltan < ANULAR_MINUTOS_ANTES_EVENTO:
            if faltan < 0:
                return False, "El evento ya comenzó"
            return False, (f"Faltan {int(faltan)} minutos para el evento. "
                           f"Hay que anular con al menos "
                           f"{ANULAR_MINUTOS_ANTES_EVENTO} de anticipación.")
    # Sin hora de inicio no se puede verificar la regla 2: solo el admin
    elif agencia_code is not None:
        return False, ("No se pudo determinar cuándo empieza el evento. "
                       "Pedile la anulación al administrador.")

    # Permiso de la agencia
    if agencia_code is not None:
        if (row["paid_by"] or "") != agencia_code:
            return False, "Esta apuesta la cobró otra agencia"
        permiso = await conn.fetchval(
            "SELECT puede_anular FROM agencias WHERE code=$1", agencia_code)
        if not permiso:
            return False, "Tu agencia no tiene habilitada la anulación"

    return True, ""


async def _anular_boleto(conn, row, quien, motivo, agencia_code=None):
    """Revierte todo lo que hizo el pago. Se llama dentro de transacción."""
    code = row["code"]

    await conn.execute("""
        UPDATE betslips
        SET status='cancelled', anulado_at=NOW(), anulado_por=$2, anulado_motivo=$3
        WHERE code=$1
    """, code, quien[:60], (motivo or "")[:200])

    # La exposición que generaba deja de contar
    await conn.execute("DELETE FROM exposicion WHERE code=$1", code)

    # El ticket de la agencia se marca anulado para que no sume al cierre
    await conn.execute("""
        UPDATE agencia_tickets SET anulado=true, anulado_at=NOW()
        WHERE betslip_code=$1
    """, code)

    await conn.execute("""
        UPDATE sports_bets SET status='cancelled'
        WHERE user_id IS NOT DISTINCT FROM $1 AND status='active'
          AND stake=$2 AND odd_total=$3
    """, row["user_id"], row["stake"], row["odd_total"])

    # Si se jugó con saldo propio, la plata vuelve. Si se pagó en
    # efectivo en el mostrador, la devuelve el cajero en mano.
    devuelto = 0
    if row["user_id"] and (row["stake"] or 0) > 0 and row["paid_by"] is None:
        columna = "saldo_bono" if row["con_bono"] else "balance"
        await conn.execute(
            f"UPDATE users SET {columna} = {columna} + $2 WHERE id=$1",
            row["user_id"], int(row["stake"]) * 100)
        devuelto = int(row["stake"])

    # Si lo había cobrado una agencia, se le devuelve el saldo: el
    # cajero le dio la plata de vuelta al cliente, así que ya no le
    # debe eso a la casa. Sin validar, porque una anulación siempre
    # suma y no puede dejar el saldo en negativo.
    if row["paid_by"] and (row["stake"] or 0) > 0:
        try:
            await _mover_cc(conn, row["paid_by"], float(row["stake"]),
                            "anulacion", f"Boleto anulado {code}",
                            row["paid_by"], contra=code, validar=False)
        except Exception as e:
            log.error(f"[ANULAR] no se pudo devolver la cc de {code}: {e}")

    return devuelto


@app.post("/api/betslip/{code}/anular")
async def anular_desde_agencia(code: str, request: Request,
                               agencia_code: str = Depends(requiere_agencia)):
    body = await request.json() if await request.body() else {}
    motivo = str(body.get("motivo") or "")[:200]

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM betslips WHERE code=$1 FOR UPDATE", code.upper())
            if not row:
                raise HTTPException(404, "Código no encontrado")

            ok, porque = await _puede_anular(conn, row, agencia_code)
            if not ok:
                raise HTTPException(400, porque)

            devuelto = await _anular_boleto(conn, row, f"agencia:{agencia_code}",
                                            motivo, agencia_code)
    log.info(f"[ANULAR] {code.upper()} por {agencia_code}: {motivo}")
    return {"ok": True, "code": code.upper(), "devuelto_al_cliente": devuelto,
            "efectivo_a_devolver": int(row["stake"] or 0) if row["paid_by"] else 0}


@app.post("/api/admin/betslip/{code}/anular")
async def anular_desde_admin(code: str, request: Request,
                             _=Depends(auth.require_admin)):
    """El admin puede saltear las ventanas de tiempo con forzar=true."""
    body = await request.json() if await request.body() else {}
    motivo = str(body.get("motivo") or "")[:200]
    forzar = bool(body.get("forzar"))

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM betslips WHERE code=$1 FOR UPDATE", code.upper())
            if not row:
                raise HTTPException(404, "Código no encontrado")

            if not forzar:
                ok, porque = await _puede_anular(conn, row, None)
                if not ok:
                    raise HTTPException(400, porque + " (se puede forzar)")
            elif (row["status"] or "").lower() not in ("active", "pending"):
                raise HTTPException(400,
                    f"No se puede anular una apuesta '{row['status']}'")

            devuelto = await _anular_boleto(conn, row, "admin", motivo)
    log.warning(f"[ANULAR-ADMIN] {code.upper()} forzado={forzar}: {motivo}")
    return {"ok": True, "code": code.upper(), "forzado": forzar,
            "devuelto_al_cliente": devuelto}


@app.post("/api/admin/agencias/{code}/permiso-cashout")
async def permiso_cashout(code: str, request: Request,
                          _=Depends(auth.require_admin)):
    """
    Habilita o quita el cash out. Con rama=true alcanza a la agencia y
    a todas sus descendientes.

    El cash out cierra una apuesta antes de que termine, a un valor
    calculado. Es atractivo para el cliente pero achica el margen: por
    eso conviene poder darlo solo a las agencias que lo manejan bien.
    """
    body = await request.json()
    activo = bool(body.get("activo"))
    rama = bool(body.get("rama"))

    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT code, ruta FROM agencias WHERE code=$1", code.upper())
        if not ag:
            raise HTTPException(404, "Agencia inexistente")
        if rama:
            r = await conn.execute("""
                UPDATE agencias SET puede_cashout=$2
                WHERE ruta = $1 OR ruta LIKE $1 || '/%'
            """, ag["ruta"], activo)
            alcanzadas = int(r.split()[-1] or 0)
        else:
            await conn.execute(
                "UPDATE agencias SET puede_cashout=$2 WHERE code=$1",
                ag["code"], activo)
            alcanzadas = 1
    log.info(f"[PERMISO] cashout={activo} rama={rama} desde {code.upper()}")
    return {"ok": True, "activo": activo, "rama": rama,
            "agencias_alcanzadas": alcanzadas}


@app.get("/api/agencias/me/puede-cashout")
async def agencia_puede_cashout(agencia_code: str = Depends(requiere_agencia)):
    pool = await get_db()
    async with pool.acquire() as conn:
        v = await conn.fetchval(
            "SELECT puede_cashout FROM agencias WHERE code=$1", agencia_code)
    return {"puede_cashout": bool(v)}


@app.post("/api/admin/agencias/{code}/permiso-anular")
async def permiso_anular(code: str, request: Request,
                         _=Depends(auth.require_admin)):
    """
    Habilita o quita el permiso de anular. Con rama=true alcanza a la
    agencia y a todas sus descendientes, usando la ruta del árbol.
    """
    body = await request.json()
    activo = bool(body.get("activo"))
    rama = bool(body.get("rama"))

    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT code, ruta FROM agencias WHERE code=$1", code.upper())
        if not ag:
            raise HTTPException(404, "Agencia inexistente")

        if rama:
            r = await conn.execute("""
                UPDATE agencias SET puede_anular=$2
                WHERE ruta = $1 OR ruta LIKE $1 || '.%'
            """, ag["ruta"], activo)
            alcanzadas = int(r.split()[-1] or 0)
        else:
            await conn.execute(
                "UPDATE agencias SET puede_anular=$2 WHERE code=$1",
                ag["code"], activo)
            alcanzadas = 1

    log.info(f"[PERMISO] anular={activo} rama={rama} desde {code.upper()}")
    return {"ok": True, "activo": activo, "rama": rama,
            "agencias_alcanzadas": alcanzadas}


@app.get("/api/agencias/me/puede-anular")
async def agencia_puede_anular(agencia_code: str = Depends(requiere_agencia)):
    """Lo consulta la terminal para mostrar u ocultar el botón."""
    pool = await get_db()
    async with pool.acquire() as conn:
        v = await conn.fetchval(
            "SELECT puede_anular FROM agencias WHERE code=$1", agencia_code)
    return {"puede_anular": bool(v),
            "minutos_tras_pago": ANULAR_MINUTOS_TRAS_PAGO,
            "minutos_antes_evento": ANULAR_MINUTOS_ANTES_EVENTO}


# ── ADMIN: árbol completo, clientes, eventos ──────────────────
@app.get("/api/admin/arbol")
async def admin_arbol(_=Depends(auth.require_admin)):
    """Todo el árbol de agencias (sin influencers), con su config y saldo CC."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT code, name, username, parent_code, ruta, nivel,
                   pct_ggr, pct_ventas, moneda, saldo_cc, status, permiso
            FROM agencias
            WHERE COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY ruta
        """)
    return {"agencias": [dict(r) for r in rows]}


@app.get("/api/admin/clientes")
async def admin_clientes(agencia: str = "", buscar: str = "",
                         limite: int = 100, _=Depends(auth.require_admin)):
    """Clientes de todas las agencias, filtrables por agencia o nombre."""
    limite = max(1, min(int(limite), 300))
    # Mostrar TODOS los clientes: los creados por agencias Y los que se
    # registraron solos desde la app de Telegram (creado_por NULL).
    cond, args = [], []
    if agencia:
        args.append(agencia.upper()); cond.append(f"u.creado_por=${len(args)}")
    if buscar:
        args.append(f"%{buscar.lower()}%")
        cond.append(f"(LOWER(u.nombre_completo) LIKE ${len(args)} OR LOWER(u.username) LIKE ${len(args)})")
    where = ("WHERE " + " AND ".join(cond)) if cond else ""
    args.append(limite)
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT u.id, u.nombre_completo, u.username, u.balance,
                   u.creado_por, u.created_at, u.moneda, a.name AS agencia_nombre
            FROM users u
            LEFT JOIN agencias a ON a.code = u.creado_por
            {where}
            ORDER BY u.created_at DESC
            LIMIT ${len(args)}
        """, *args)
    return {"clientes": [{
        "id": r["id"], "nombre": r["nombre_completo"] or r["username"] or "—",
        # balance está en CENTAVOS en la base. Acá se devuelve en pesos,
        # como el resto de la API. Sin la división, una carga de 20.000
        # se mostraba como 2.000.000.
        "username": r["username"], "balance": (r["balance"] or 0) // 100,
        "moneda": r["moneda"] or "ARS",
        "agencia": r["creado_por"] or "Telegram directo",
        "agencia_nombre": r["agencia_nombre"] or ("Registro por app" if not r["creado_por"] else "—"),
        "fecha": r["created_at"].strftime("%d/%m/%Y") if r["created_at"] else "",
    } for r in rows]}


@app.post("/api/admin/clientes")
async def admin_crear_cliente(request: Request, _=Depends(auth.require_admin)):
    """El admin crea un cliente. Si no indica agencia, el cliente es propio
    del admin (creado_por='admin')."""
    body = await request.json()
    nombre  = (body.get("nombre") or "").strip()[:100]
    agencia = (body.get("agencia") or "").strip().upper()
    telefono= (body.get("telefono") or "").strip()[:30] or None
    uname   = (body.get("username") or "").strip().lower()[:40]
    passwd  = body.get("password") or ""
    if not nombre:
        raise HTTPException(400, "Falta el nombre")
    if not uname:
        raise HTTPException(400, "Falta el usuario")
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", uname):
        raise HTTPException(400,
            "El usuario admite letras, números, punto, guion y guion bajo (3 a 40)")
    if len(passwd) < 6:
        raise HTTPException(400, "La clave debe tener al menos 6 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            existe = await conn.fetchrow("SELECT 1 FROM agencias WHERE code=$1", agencia)
            if not existe:
                raise HTTPException(404, "La agencia no existe")
            dueno = agencia
        else:
            dueno = "admin"   # cliente propio del admin, sin agencia
        if await conn.fetchval("SELECT 1 FROM users WHERE LOWER(username)=$1", uname):
            raise HTTPException(409,
                f"El usuario '{uname}' ya está tomado. Probá con otro.")
        if await conn.fetchval("SELECT 1 FROM agencias WHERE LOWER(username)=$1", uname):
            raise HTTPException(409,
                f"El usuario '{uname}' ya está tomado. Probá con otro.")
        # Los clientes de mostrador no tienen Telegram. telegram_id es NOT NULL,
        # así que le damos un id negativo único (Telegram usa positivos).
        fake_tg = -(int(time.time() * 1000) % 2_000_000_000)
        row = await conn.fetchrow("""
            INSERT INTO users (username, nombre_completo, telefono, telegram_id,
                               balance, creado_por, password_hash, created_at)
            VALUES ($1,$2,$3,$4,0,$5,$6,NOW())
            RETURNING id
        """, uname, nombre, telefono, fake_tg, dueno,
             auth.hash_password(passwd))
    return {"id": row["id"], "nombre": nombre, "username": uname,
            "agencia": dueno}


DEPORTE_NOMBRE = {
    "soccer": "⚽ Fútbol", "basketball": "🏀 Básquet",
    "tennis": "🎾 Tenis", "americanfootball": "🏈 Fútbol americano",
    "baseball": "⚾ Béisbol", "icehockey": "🏒 Hockey",
    "mma": "🥊 MMA", "boxing": "🥊 Boxeo", "cricket": "🏏 Cricket",
    "rugbyleague": "🏉 Rugby", "rugbyunion": "🏉 Rugby",
    "golf": "⛳ Golf", "volleyball": "🏐 Vóley",
    "esports": "🎮 eSports", "aussierules": "🏉 Fútbol australiano",
}


@app.get("/api/admin/eventos")
async def admin_eventos(tipo: str = "prematch", deporte: str = "",
                        liga: str = "", buscar: str = "",
                        _=Depends(auth.require_admin)):
    """Eventos con cuotas para el panel admin: prematch o en vivo."""
    if tipo == "live":
        entrada = _football_cache.get("live")
        data = entrada[0] if entrada else None
        if not data:
            data = await cache_swr("live", ODDS_TTL_LIVE, _armar_live)
    else:
        # Misma fuente que la app y las agencias, con su respaldo.
        # Tener el respaldo en un solo lugar evita que el admin vea
        # eventos que las agencias no pueden vender.
        data = await all_markets()
    data = data or {}
    # Resumen liviano: liga, equipos, cuotas 1X2
    salida = []
    # El buscador mira TODOS los eventos, no los primeros de cada liga:
    # si alguien busca un partido puntual, el recorte lo escondería.
    q = (buscar or "").strip().lower()
    tope = 200 if q else 40

    for sport in data.get("sports", []):
        # Filtro por deporte o liga antes de recorrer los eventos
        # El filtro es por deporte, y las claves del feed son por liga:
        # 'soccer' tiene que alcanzar a 'soccer_epl', 'soccer_brazil', etc.
        if deporte and not (sport.get("key") or "").startswith(deporte):
            continue
        if liga:
            k = (sport.get("key") or "").lower()
            n = (sport.get("name") or "").lower()
            # Acepta la clave exacta (del selector) o texto libre
            if liga.lower() != k and liga.lower() not in n:
                continue

        evs = []
        for ev in sport.get("events", [])[:tope]:
            if q:
                texto = f"{ev.get('h','')} {ev.get('a','')}".lower()
                if q not in texto:
                    continue
            h2h = (ev.get("markets") or {}).get("h2h", {})
            evs.append({
                # El id y el deporte son lo que permite bloquear o
                # ajustar el evento desde el panel.
                "event_id": ev.get("id"),
                "sport_key": sport.get("key"),
                "home": ev.get("h"), "away": ev.get("a"),
                "time": ev.get("time"), "minute": ev.get("minute",""),
                "L": h2h.get(ev.get("h","")), "E": h2h.get("Draw"),
                "V": h2h.get(ev.get("a","")),
                # Los mercados disponibles, para bloquear uno puntual
                "mercados": sorted(list((ev.get("markets") or {}).keys()))[:20],
            })
        if evs:
            salida.append({"liga": sport.get("name"), "icon": sport.get("icon"),
                           "key": sport.get("key"), "eventos": evs})
    # El catálogo completo para los selectores: sale del feed sin
    # filtrar, si no el filtro se comería sus propias opciones.
    # Cada entrada del feed es una LIGA, no un deporte. Se agrupan por
    # deporte para que el filtro de arriba tenga pocos botones y el de
    # ligas se llene según el deporte elegido.
    ligas = []
    por_deporte = {}
    for sp in data.get("sports", []):
        key = sp.get("key") or ""
        n = len(sp.get("events") or [])
        # 'soccer_epl' → deporte 'soccer'
        base = key.split("_")[0] if key else "otros"
        d = por_deporte.setdefault(base, {
            "key": base, "nombre": DEPORTE_NOMBRE.get(base, base.title()),
            "icon": sp.get("icon"), "eventos": 0, "ligas": 0})
        d["eventos"] += n
        d["ligas"] += 1
        ligas.append({"key": key, "nombre": sp.get("name"),
                      "deporte": base, "eventos": n})

    catalogo = list(por_deporte.values())
    # Fútbol primero: es el que más se usa. Después por volumen.
    catalogo.sort(key=lambda x: (x["key"] != "soccer", -(x["eventos"] or 0)))
    ligas.sort(key=lambda x: -(x["eventos"] or 0))

    return {"tipo": tipo, "deportes": salida, "catalogo": catalogo,
            "ligas": ligas,
            "filtrado": bool(deporte or liga or buscar)}


# ── ADMIN: vista global de todo el sistema ────────────────────
@app.get("/api/admin/resumen")
async def admin_resumen(_=Depends(auth.require_admin)):
    """Panorama general para el panel admin."""
    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        usuarios = await conn.fetchval("SELECT COUNT(*) FROM users")
        tickets_hoy = await conn.fetchval("""
            SELECT COUNT(*) FROM agencia_tickets
            WHERE created_at::date = NOW()::date
        """)
        cobrado_hoy = await conn.fetchval("""
            SELECT COALESCE(SUM(stake),0) FROM agencia_tickets
            WHERE created_at::date = NOW()::date
        """)
        premios_hoy = await conn.fetchval("""
            SELECT COALESCE(SUM(monto),0) FROM agencia_movimientos
            WHERE tipo='pago_premio' AND created_at::date = NOW()::date
        """)
        pendientes = await conn.fetchval("""
            SELECT COUNT(*) FROM betslips WHERE status='pending'
        """)
        sin_liquidar = await conn.fetchval("""
            SELECT COUNT(*) FROM betslips
            WHERE status='paid' AND resultado IS NULL
        """)
    return {
        "agencias": ag or 0,
        "usuarios": usuarios or 0,
        "tickets_hoy": tickets_hoy or 0,
        "cobrado_hoy": int(cobrado_hoy or 0),
        "premios_hoy": int(premios_hoy or 0),
        "neto_hoy": int(cobrado_hoy or 0) - int(premios_hoy or 0),
        "boletos_pendientes": pendientes or 0,
        "sin_liquidar": sin_liquidar or 0,
    }


@app.get("/api/admin/agencias-detalle")
async def admin_agencias_detalle(_=Depends(auth.require_admin)):
    """Cada agencia con sus totales del día."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.code, a.name,
                   COUNT(at.id) FILTER (WHERE at.created_at::date=NOW()::date) AS tickets_hoy,
                   COALESCE(SUM(at.stake) FILTER (WHERE at.created_at::date=NOW()::date),0) AS cobrado_hoy,
                   COUNT(at.id) AS tickets_total
            FROM agencias a
            LEFT JOIN agencia_tickets at ON at.agencia_code = a.code
            GROUP BY a.code, a.name
            ORDER BY cobrado_hoy DESC
        """)
    return {"agencias": [{
        "code": r["code"], "name": r["name"],
        "tickets_hoy": r["tickets_hoy"] or 0,
        "cobrado_hoy": int(r["cobrado_hoy"] or 0),
        "tickets_total": r["tickets_total"] or 0,
    } for r in rows]}


@app.get("/api/admin/movimientos")
async def admin_movimientos(limite: int = 50, _=Depends(auth.require_admin)):
    """Últimos movimientos de caja de todas las agencias."""
    limite = max(1, min(int(limite), 200))
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT m.tipo, m.monto, m.agencia_code, m.betslip_code,
                   m.created_at, u.nombre_completo, u.username
            FROM agencia_movimientos m
            LEFT JOIN users u ON u.id = m.user_id
            ORDER BY m.created_at DESC LIMIT $1
        """, limite)
    return {"movimientos": [{
        "tipo": r["tipo"], "monto": r["monto"],
        "agencia": r["agencia_code"], "betslip": r["betslip_code"],
        "usuario": r["nombre_completo"] or r["username"] or "—",
        "fecha": r["created_at"].strftime("%d/%m %H:%M") if r["created_at"] else "",
    } for r in rows]}


@app.get("/api/admin/apuestas")
async def admin_apuestas(estado: str = "", limite: int = 50,
                         _=Depends(auth.require_admin)):
    """Apuestas de todo el sistema, filtrables por estado."""
    limite = max(1, min(int(limite), 200))
    pool = await get_db()
    cond = ""
    args = [limite]
    if estado in ("pending","paid"):
        cond = "WHERE b.status = $2"
        args.append(estado)
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.resultado, b.pagado_at, b.created_at, b.cliente_nombre,
                   at.agencia_code
            FROM betslips b
            LEFT JOIN agencia_tickets at ON at.betslip_code = b.code
            {cond}
            ORDER BY b.created_at DESC LIMIT $1
        """, *args)
    return {"apuestas": [{
        "code": r["code"], "stake": r["stake"] or 0,
        "odd_total": float(r["odd_total"]) if r["odd_total"] else None,
        "potential_win": r["potential_win"] or 0,
        "estado": r["status"], "resultado": r["resultado"],
        "pagado": r["pagado_at"] is not None,
        "agencia": r["agencia_code"] or "—",
        "cliente": r["cliente_nombre"] or "—",
        "fecha": r["created_at"].strftime("%d/%m %H:%M") if r["created_at"] else "",
    } for r in rows]}


# ── COMBOS MANUALES (agencia + admin) ─────────────────────────
# La agencia arma combos que ven solo sus terminales. El admin arma
# combos y elige qué agencias los ven (NULL = todas).

@app.get("/api/box/{agencia_code}/combos-manuales")
async def box_combos_manuales(agencia_code: str):
    """Combos que debe ver la terminal de esta agencia."""
    agencia_code = agencia_code.upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, origen, nombre, picks, odd_total, creado_por
            FROM combos_manuales
            WHERE visible = true
              AND (
                -- combos de esta misma agencia
                (origen='agencia' AND creado_por=$1)
                -- combos del admin con destino box, dirigidos a esta agencia
                OR (origen='admin' AND COALESCE(destino_box,true)
                    AND (agencias IS NULL
                     OR $1 = ANY(string_to_array(agencias, ','))))
              )
            ORDER BY created_at DESC LIMIT 20
        """, agencia_code)
    combos = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        combos.append({
            "id": r["id"], "origen": r["origen"], "name": r["nombre"],
            "picks": picks, "odd_total": float(r["odd_total"]),
            "tag": "Combo de la casa" if r["origen"]=="admin" else "Combo de la agencia",
            "tagColor": "#E8C547" if r["origen"]=="admin" else "#00F0FF",
        })
    return {"combos": combos}


@app.get("/api/app/combos-manuales")
async def app_combos_manuales():
    """Combos del admin con destino app, para la app de Telegram."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, nombre, picks, odd_total
            FROM combos_manuales
            WHERE visible = true AND origen='admin' AND destino_app = true
            ORDER BY created_at DESC LIMIT 10
        """)
    combos = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        combos.append({
            "id": f"m{r['id']}", "name": r["nombre"], "picks": picks,
            "odd_total": float(r["odd_total"]),
            "tag": "Combo de la casa", "tagColor": "#E8C547", "conf": 8,
            "note": "Combinada destacada por QuartzPlay",
        })
    return {"combos": combos}


@app.post("/api/influencers/{code}/liquidar")
async def liquidar_influencer(code: str, request: Request):
    """Genera y guarda la liquidación de comisión de un influencer.
    Admin o agencia de su rama."""
    code = code.upper()
    body = await request.json()
    desde = body.get("desde"); hasta = body.get("hasta")
    d1, d2 = _rango_periodo(desde, hasta)
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    pool = await get_db()
    async with pool.acquire() as conn:
        inf = await conn.fetchrow(
            "SELECT parent_code FROM agencias WHERE code=$1 AND tipo='influencer'", code)
        if not inf:
            raise HTTPException(404, "Influencer no encontrado")
        if not es_admin:
            token = request.headers.get("Authorization","").replace("Bearer ","")
            solicitante = await sesion_buscar(token) if token else None
            if not solicitante:
                raise HTTPException(401, "No autorizado")
            rama = await codes_de_la_rama(conn, solicitante)
            if inf["parent_code"] not in rama:
                raise HTTPException(403, "Ese influencer no es de tu rama")
        rep = await _reporte_influencer(conn, code, d1, d2)
        row = await conn.fetchrow("""
            INSERT INTO liquidaciones
                (agencia_code, desde, hasta, total_apostado, total_premios,
                 ggr, pct_ggr, pct_ventas, comision_ggr, comision_ventas,
                 comision_total, generada_por, automatica)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE)
            RETURNING id
        """, code, d1, d2, rep["apostado"], rep["premios"], rep["ggr"],
             rep["pct_ggr"], rep["pct_ventas"],
             round(rep["ggr"]*rep["pct_ggr"]/100,2),
             round(rep["apostado"]*rep["pct_ventas"]/100,2),
             rep["comision"], "admin" if es_admin else "agencia")
    return {"ok": True, "id": row["id"], "comision": rep["comision"]}


# ── INFLUENCERS — reportes para admin y agencias ──────────────
async def _comision_influencers_en(conn, codes, d1, d2):
    """
    Comisión total de influencers por jugadas ocurridas en la caja de
    las agencias 'codes' (la agencia donde se jugó absorbe la comisión).
    """
    if not codes:
        return 0.0
    rows = await conn.fetch("""
        SELECT b.influencer_code,
               COALESCE(SUM(b.stake),0) AS apostado,
               COALESCE(SUM(CASE WHEN lower(b.status) IN ('won','ganada','paid')
                         THEN b.potential_win ELSE 0 END),0) AS premios
        FROM betslips b
        JOIN agencia_tickets at ON at.betslip_code = b.code
        WHERE b.influencer_code IS NOT NULL
          AND at.agencia_code = ANY($1)
          AND b.created_at::date>=$2 AND b.created_at::date<=$3
        GROUP BY b.influencer_code
    """, codes, d1, d2)
    total = 0.0
    for r in rows:
        inf = await conn.fetchrow("""
            SELECT pct_ggr, pct_ventas FROM agencias
            WHERE code=$1 AND tipo='influencer'
        """, r["influencer_code"])
        if not inf:
            continue
        apostado = float(r["apostado"] or 0); premios = float(r["premios"] or 0)
        ggr = apostado - premios
        pg = float(inf["pct_ggr"] or 0); pv = float(inf["pct_ventas"] or 0)
        total += ggr * pg / 100 + apostado * pv / 100
    return round(total, 2)


async def _reporte_influencer(conn, code, d1, d2):
    """Números de un influencer en el período: ventas, GGR, comisión."""
    inf = await conn.fetchrow("""
        SELECT a.name, a.username, a.codigo_ref, a.pct_ggr, a.pct_ventas,
               a.parent_code, a.nivel, a.alcance, p.name AS parent_name
        FROM agencias a
        LEFT JOIN agencias p ON p.code = a.parent_code
        WHERE a.code=$1 AND a.tipo='influencer'
    """, code)
    if not inf:
        return None
    apostado = await conn.fetchval("""
        SELECT COALESCE(SUM(stake),0) FROM betslips
        WHERE influencer_code=$1 AND created_at::date>=$2 AND created_at::date<=$3
    """, code, d1, d2) or 0
    premios = await conn.fetchval("""
        SELECT COALESCE(SUM(potential_win),0) FROM betslips
        WHERE influencer_code=$1 AND lower(status) IN ('won','ganada','paid')
          AND created_at::date>=$2 AND created_at::date<=$3
    """, code, d1, d2) or 0
    jugadas = await conn.fetchval("""
        SELECT COUNT(*) FROM betslips
        WHERE influencer_code=$1 AND created_at::date>=$2 AND created_at::date<=$3
    """, code, d1, d2) or 0
    n_combos = await conn.fetchval("""
        SELECT COUNT(*) FROM combos_manuales WHERE influencer_code=$1
    """, code) or 0
    apostado = float(apostado); premios = float(premios)
    ggr = apostado - premios
    pg = float(inf["pct_ggr"] or 0); pv = float(inf["pct_ventas"] or 0)
    com = round(ggr * pg / 100 + apostado * pv / 100, 2)
    return {
        "code": code, "name": inf["name"], "username": inf["username"],
        "codigo_ref": inf["codigo_ref"],
        "pct_ggr": pg, "pct_ventas": pv, "parent_code": inf["parent_code"],
        "parent_name": inf["parent_name"] or ("Admin" if not inf["parent_code"] else inf["parent_code"]),
        "alcance": inf["alcance"],
        "apostado": apostado, "premios": premios, "ggr": ggr,
        "jugadas": jugadas, "combos": n_combos, "comision": com,
    }


def _rango_periodo(desde, hasta):
    from datetime import date as _date
    hoy = _date.today()
    d1 = _date.fromisoformat(desde) if desde else hoy.replace(day=1)
    d2 = _date.fromisoformat(hasta) if hasta else hoy
    return d1, d2


# ── ESCANEOS DE INFLUENCER (mejorar apuesta por su link) ──────
async def _registrar_escaneo(conn, inf_code, picks_leidos, picks_ok, cuota, betslip_code=None):
    """Registra un escaneo hecho por el link de un influencer."""
    if not inf_code:
        return None
    row = await conn.fetchrow("""
        INSERT INTO escaneos_log
            (influencer_code, picks_leidos, picks_ok, cuota_total, jugo, betslip_code)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    """, inf_code, picks_leidos or 0, picks_ok or 0, cuota,
         bool(betslip_code), betslip_code)
    return row["id"]


async def _reporte_escaneos(conn, codes, d1, d2):
    """Escaneos por influencer con conversión (escaneos vs jugadas)."""
    if not codes:
        return {"total_escaneos": 0, "total_jugadas": 0, "conversion": 0, "detalle": []}
    rows = await conn.fetch("""
        SELECT influencer_code,
               COUNT(*) AS escaneos,
               COUNT(*) FILTER (WHERE jugo) AS jugadas,
               COALESCE(AVG(cuota_total),0) AS cuota_prom
        FROM escaneos_log
        WHERE influencer_code = ANY($1)
          AND created_at::date>=$2 AND created_at::date<=$3
        GROUP BY influencer_code
    """, codes, d1, d2)
    detalle = []
    tot_e = tot_j = 0
    for r in rows:
        inf = await conn.fetchrow(
            "SELECT name, codigo_ref FROM agencias WHERE code=$1", r["influencer_code"])
        e = r["escaneos"] or 0; j = r["jugadas"] or 0
        tot_e += e; tot_j += j
        detalle.append({
            "code": r["influencer_code"],
            "name": inf["name"] if inf else r["influencer_code"],
            "codigo_ref": inf["codigo_ref"] if inf else None,
            "escaneos": e, "jugadas": j,
            "conversion": round(j*100/e,1) if e else 0,
            "cuota_prom": round(float(r["cuota_prom"] or 0),2),
        })
    conv = round(tot_j*100/tot_e,1) if tot_e else 0
    return {"total_escaneos": tot_e, "total_jugadas": tot_j,
            "conversion": conv, "detalle": detalle}


@app.get("/api/escaner/{codigo_ref}")
async def escaner_info(codigo_ref: str):
    """Info pública del escáner de un influencer (para la landing del link)."""
    codigo_ref = codigo_ref.strip().upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        inf = await conn.fetchrow("""
            SELECT code, name, codigo_ref FROM agencias
            WHERE upper(codigo_ref)=$1 AND tipo='influencer'
        """, codigo_ref)
    if not inf:
        raise HTTPException(404, "Escáner no encontrado")
    return {"code": inf["code"], "name": inf["name"], "codigo_ref": inf["codigo_ref"]}


@app.post("/api/escaner/{codigo_ref}/registrar")
async def escaner_registrar(codigo_ref: str, request: Request):
    """Registra un escaneo hecho por el link de un influencer (público)."""
    codigo_ref = codigo_ref.strip().upper()
    body = await request.json()
    pool = await get_db()
    async with pool.acquire() as conn:
        inf = await conn.fetchrow("""
            SELECT code FROM agencias WHERE upper(codigo_ref)=$1 AND tipo='influencer'
        """, codigo_ref)
        if not inf:
            raise HTTPException(404, "Escáner no encontrado")
        eid = await _registrar_escaneo(
            conn, inf["code"],
            body.get("picks_leidos"), body.get("picks_ok"),
            body.get("cuota_total"), body.get("betslip_code"))
    return {"ok": True, "escaneo_id": eid, "influencer_code": inf["code"]}


@app.get("/api/admin/influencers/escaneos")
async def admin_reporte_escaneos(desde: str = "", hasta: str = "",
                                 _=Depends(auth.require_admin)):
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        codes = [r["code"] for r in await conn.fetch(
            "SELECT code FROM agencias WHERE tipo='influencer'")]
        rep = await _reporte_escaneos(conn, codes, d1, d2)
    rep["desde"] = d1.isoformat(); rep["hasta"] = d2.isoformat()
    return rep


@app.get("/api/agencias/me/influencers/escaneos")
async def agencia_reporte_escaneos(desde: str = "", hasta: str = "",
                                   agencia_code: str = Depends(requiere_agencia)):
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        codes = [r["code"] for r in await conn.fetch("""
            SELECT code FROM agencias
            WHERE tipo='influencer' AND parent_code = ANY($1)
        """, rama)]
        rep = await _reporte_escaneos(conn, codes, d1, d2)
    rep["desde"] = d1.isoformat(); rep["hasta"] = d2.isoformat()
    return rep


@app.get("/api/admin/influencers/reporte")
async def admin_reporte_influencers(desde: str = "", hasta: str = "",
                                    _=Depends(auth.require_admin)):
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        codes = await conn.fetch(
            "SELECT code FROM agencias WHERE tipo='influencer' ORDER BY ruta")
        filas = []
        tot_v = tot_g = tot_c = 0.0
        for r in codes:
            rep = await _reporte_influencer(conn, r["code"], d1, d2)
            if rep:
                filas.append(rep)
                tot_v += rep["apostado"]; tot_g += rep["ggr"]; tot_c += rep["comision"]
    return {"desde": d1.isoformat(), "hasta": d2.isoformat(),
            "total": {"ventas": round(tot_v,2), "ggr": round(tot_g,2),
                      "comisiones": round(tot_c,2)},
            "influencers": filas}


@app.get("/api/agencias/me/influencers/costos")
async def agencia_costos_influencers(desde: str = "", hasta: str = "",
                                     agencia_code: str = Depends(requiere_agencia)):
    """
    Comisiones de influencers que ABSORBE esta agencia: jugadas firmadas
    por cualquier influencer PERO jugadas en la caja de esta rama.
    La agencia donde se jugó paga la comisión.
    """
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        # Jugadas firmadas que ocurrieron en la caja de esta rama
        rows = await conn.fetch("""
            SELECT b.influencer_code, at.agencia_code,
                   COALESCE(SUM(b.stake),0) AS apostado,
                   COALESCE(SUM(CASE WHEN lower(b.status) IN ('won','ganada','paid')
                             THEN b.potential_win ELSE 0 END),0) AS premios,
                   COUNT(*) AS jugadas
            FROM betslips b
            JOIN agencia_tickets at ON at.betslip_code = b.code
            WHERE b.influencer_code IS NOT NULL
              AND at.agencia_code = ANY($1)
              AND b.created_at::date>=$2 AND b.created_at::date<=$3
            GROUP BY b.influencer_code, at.agencia_code
        """, rama, d1, d2)
        filas = []
        tot = 0.0
        for r in rows:
            inf = await conn.fetchrow("""
                SELECT name, pct_ggr, pct_ventas FROM agencias
                WHERE code=$1 AND tipo='influencer'
            """, r["influencer_code"])
            if not inf:
                continue
            apostado = float(r["apostado"] or 0); premios = float(r["premios"] or 0)
            ggr = apostado - premios
            pg = float(inf["pct_ggr"] or 0); pv = float(inf["pct_ventas"] or 0)
            com = round(ggr*pg/100 + apostado*pv/100, 2)
            tot += com
            filas.append({
                "influencer": inf["name"], "influencer_code": r["influencer_code"],
                "agencia": r["agencia_code"], "apostado": apostado,
                "ggr": ggr, "jugadas": r["jugadas"], "comision": com,
                "propio": r["influencer_code"] and False,  # marca si es de otra rama
            })
    return {"desde": d1.isoformat(), "hasta": d2.isoformat(),
            "total_comision": round(tot,2), "detalle": filas}


@app.get("/api/agencias/me/influencers/reporte")
async def agencia_reporte_influencers(desde: str = "", hasta: str = "",
                                      agencia_code: str = Depends(requiere_agencia)):
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        codes = await conn.fetch("""
            SELECT code FROM agencias
            WHERE tipo='influencer' AND parent_code = ANY($1) ORDER BY ruta
        """, rama)
        filas = []
        tot_v = tot_g = tot_c = 0.0
        for r in codes:
            rep = await _reporte_influencer(conn, r["code"], d1, d2)
            if rep:
                filas.append(rep)
                tot_v += rep["apostado"]; tot_g += rep["ggr"]; tot_c += rep["comision"]
    return {"desde": d1.isoformat(), "hasta": d2.isoformat(),
            "total": {"ventas": round(tot_v,2), "ggr": round(tot_g,2),
                      "comisiones": round(tot_c,2)},
            "influencers": filas}


@app.get("/api/influencers/{code}/detalle")
async def influencer_detalle(code: str, request: Request,
                             desde: str = "", hasta: str = ""):
    """Detalle de un influencer: sus combos + últimas jugadas firmadas.
    Admin ve cualquiera; agencia solo los de su rama."""
    code = code.upper()
    d1, d2 = _rango_periodo(desde, hasta)
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    pool = await get_db()
    async with pool.acquire() as conn:
        inf = await conn.fetchrow(
            "SELECT parent_code FROM agencias WHERE code=$1 AND tipo='influencer'", code)
        if not inf:
            raise HTTPException(404, "Influencer no encontrado")
        if not es_admin:
            token = request.headers.get("Authorization","").replace("Bearer ","")
            solicitante = await sesion_buscar(token) if token else None
            if not solicitante:
                raise HTTPException(401, "No autorizado")
            rama = await codes_de_la_rama(conn, solicitante)
            if inf["parent_code"] not in rama:
                raise HTTPException(403, "Ese influencer no es de tu rama")
        rep = await _reporte_influencer(conn, code, d1, d2)
        combos = await conn.fetch("""
            SELECT id, nombre, odd_total, codigo, visible, created_at
            FROM combos_manuales WHERE influencer_code=$1
            ORDER BY created_at DESC LIMIT 100
        """, code)
        jugadas = await conn.fetch("""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.created_at, u.nombre_completo
            FROM betslips b LEFT JOIN users u ON u.id=b.user_id
            WHERE b.influencer_code=$1
              AND b.created_at::date>=$2 AND b.created_at::date<=$3
            ORDER BY b.created_at DESC LIMIT 100
        """, code, d1, d2)
    return {
        "reporte": rep,
        "combos": [{
            "id": c["id"], "nombre": c["nombre"], "odd": float(c["odd_total"] or 0),
            "codigo": c["codigo"], "visible": c["visible"],
            "fecha": c["created_at"].strftime("%d/%m/%Y") if c["created_at"] else "",
        } for c in combos],
        "jugadas": [{
            "code": j["code"], "cliente": j["nombre_completo"] or "—",
            "stake": j["stake"] or 0, "odd": float(j["odd_total"] or 0),
            "premio": j["potential_win"] or 0, "status": j["status"],
            "fecha": j["created_at"].strftime("%d/%m %H:%M") if j["created_at"] else "",
        } for j in jugadas],
    }


# ── INFLUENCERS — combos, panel y comisiones ──────────────────
def _procesar_picks_combo(picks):
    if not picks:
        raise HTTPException(400, "El combo no tiene selecciones")
    if len(picks) > 12:
        raise HTTPException(400, "Máximo 12 selecciones")
    limpios, odd_total = [], 1.0
    for p in picks:
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= 50):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        limpios.append({
            "h": str(p.get("home") or p.get("h") or "")[:80],
            "a": str(p.get("away") or p.get("a") or "")[:80],
            "sel": str(p.get("sel") or "")[:120],
            "odd": round(odd, 2),
            "sport": str(p.get("sport") or "")[:60],
            "event_id": str(p.get("event_id") or "")[:64] or None,
            "sport_key": str(p.get("sport_key") or "")[:60] or None,
            # Hora de inicio: la necesita la anulación para saber si el
            # evento está por empezar. Sin esto no se puede anular nada.
            "commence_time": str(p.get("commence_time")
                                 or p.get("start_time") or "")[:40] or None,
        })
        odd_total *= odd
    return limpios, round(odd_total, 2)


async def _requiere_influencer(authorization: str = Header(None)):
    """Valida sesión y que sea un influencer. Devuelve su code."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "No autorizado")
    token = authorization.split(" ",1)[1]
    code = await sesion_buscar(token)
    if not code:
        raise HTTPException(401, "Sesión inválida")
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT tipo FROM agencias WHERE code=$1", code)
    if not row or (row["tipo"] or "") != "influencer":
        raise HTTPException(403, "Solo para influencers")
    return code


@app.get("/api/influencer/me/combos-ia")
async def influencer_combos_ia(inf_code: str = Depends(_requiere_influencer),
                               historial: bool = False):
    """Combos de la IA (y de la casa) que el influencer puede compartir firmados.
    Por defecto: activos + expirados que todavía se pueden jugar (no empezaron
    todos los partidos). Con ?historial=true: también los ya vencidos."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, nombre, picks, odd_total, fuente, codigo,
                   primer_evento_at, created_at,
                   (primer_evento_at IS NOT NULL AND primer_evento_at <= NOW()) AS expirado
            FROM combos_manuales
            WHERE (lower(coalesce(fuente,'')) IN ('ia','ai','auto') OR origen='admin')
              AND (visible = true OR $1 = true)
            ORDER BY created_at DESC LIMIT 60
        """, historial)
    out = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        out.append({
            "id": r["id"], "nombre": r["nombre"], "picks": picks,
            "odd": float(r["odd_total"] or 0),
            "es_ia": (r["fuente"] or "").lower() in ("ia","ai","auto"),
            "expirado": bool(r["expirado"]),
            "estado": "expirado" if r["expirado"] else "activo",
            "primer_evento_at": r["primer_evento_at"].isoformat() if r["primer_evento_at"] else None,
        })
    return {"combos": out}


@app.post("/api/influencer/me/combos-ia")
async def influencer_adoptar_combo_ia(request: Request,
                                      inf_code: str = Depends(_requiere_influencer)):
    """El influencer copia un combo IA como suyo, con su firma y código."""
    body = await request.json()
    origen_id = body.get("combo_id")
    codigo = (body.get("codigo") or "").strip()[:40].upper() or None
    pool = await get_db()
    async with pool.acquire() as conn:
        base = await conn.fetchrow(
            "SELECT nombre, picks, odd_total FROM combos_manuales WHERE id=$1", int(origen_id))
        if not base:
            raise HTTPException(404, "Combo no encontrado")
        if codigo:
            existe = await conn.fetchval(
                "SELECT 1 FROM combos_manuales WHERE codigo=$1", codigo)
            if existe:
                raise HTTPException(409, "Ese código ya está en uso")
        row = await conn.fetchrow("""
            INSERT INTO combos_manuales
                (origen, creado_por, nombre, picks, odd_total, visible,
                 fuente, influencer_code, codigo)
            VALUES ('influencer', $1, $2, $3, $4, true, 'manual', $1, $5)
            RETURNING id
        """, inf_code, base["nombre"], base["picks"], base["odd_total"], codigo)
    return {"id": row["id"], "codigo": codigo}



@app.post("/api/influencer/me/combos")
async def influencer_crear_combo(request: Request,
                                 inf_code: str = Depends(_requiere_influencer)):
    """El influencer crea un combo con su firma y código de salida."""
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:80] or "Combo"
    codigo = (body.get("codigo") or "").strip()[:40].upper() or None
    limpios, odd_total = _procesar_picks_combo(body.get("picks") or [])
    pool = await get_db()
    async with pool.acquire() as conn:
        if codigo:
            existe = await conn.fetchval(
                "SELECT 1 FROM combos_manuales WHERE codigo=$1", codigo)
            if existe:
                raise HTTPException(409, "Ese código ya está en uso")
        row = await conn.fetchrow("""
            INSERT INTO combos_manuales
                (origen, creado_por, nombre, picks, odd_total, visible,
                 fuente, influencer_code, codigo)
            VALUES ('influencer', $1, $2, $3, $4, true, 'manual', $1, $5)
            RETURNING id
        """, inf_code, nombre, str(limpios), odd_total, codigo)
    return {"id": row["id"], "odd_total": odd_total, "codigo": codigo}


@app.get("/api/influencer/me/combos")
async def influencer_mis_combos(inf_code: str = Depends(_requiere_influencer)):
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, nombre, picks, odd_total, codigo, visible, created_at
            FROM combos_manuales
            WHERE influencer_code=$1
               OR id IN (SELECT combo_id FROM combos_compartidos
                         WHERE destino_code=$1 AND tipo='influencer')
            ORDER BY created_at DESC LIMIT 200
        """, inf_code)
    out = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        out.append({
            "id": r["id"], "nombre": r["nombre"], "odd": float(r["odd_total"] or 0),
            "codigo": r["codigo"], "visible": r["visible"], "picks": picks,
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
        })
    return {"combos": out}


@app.get("/api/influencer/me/escaneos")
async def influencer_mis_escaneos(desde: str = "", hasta: str = "",
                                  inf_code: str = Depends(_requiere_influencer)):
    """El influencer ve sus propios escaneos y conversión."""
    d1, d2 = _rango_periodo(desde, hasta)
    pool = await get_db()
    async with pool.acquire() as conn:
        rep = await _reporte_escaneos(conn, [inf_code], d1, d2)
        # Últimos escaneos con detalle
        ultimos = await conn.fetch("""
            SELECT picks_leidos, picks_ok, cuota_total, jugo, betslip_code, created_at
            FROM escaneos_log WHERE influencer_code=$1
              AND created_at::date>=$2 AND created_at::date<=$3
            ORDER BY created_at DESC LIMIT 30
        """, inf_code, d1, d2)
    mio = rep["detalle"][0] if rep["detalle"] else {
        "escaneos":0,"jugadas":0,"conversion":0,"cuota_prom":0}
    return {
        "desde": d1.isoformat(), "hasta": d2.isoformat(),
        "escaneos": mio["escaneos"], "jugadas": mio["jugadas"],
        "conversion": mio["conversion"], "cuota_prom": mio["cuota_prom"],
        "ultimos": [{
            "picks_leidos": u["picks_leidos"], "picks_ok": u["picks_ok"],
            "cuota": float(u["cuota_total"] or 0), "jugo": u["jugo"],
            "betslip": u["betslip_code"],
            "fecha": u["created_at"].strftime("%d/%m %H:%M") if u["created_at"] else "",
        } for u in ultimos],
    }


@app.get("/api/influencer/me/panel")
async def influencer_panel(desde: str = "", hasta: str = "",
                           inf_code: str = Depends(_requiere_influencer)):
    """Panel del influencer: sus datos, % y comisión sobre jugadas firmadas."""
    from datetime import date as _date
    hoy = _date.today()
    d1 = _date.fromisoformat(desde) if desde else hoy.replace(day=1)
    d2 = _date.fromisoformat(hasta) if hasta else hoy
    pool = await get_db()
    async with pool.acquire() as conn:
        yo = await conn.fetchrow("""
            SELECT name, codigo_ref, pct_ggr, pct_ventas FROM agencias WHERE code=$1
        """, inf_code)
        # Jugadas firmadas por este influencer (por combo o por código de referido)
        apostado = await conn.fetchval("""
            SELECT COALESCE(SUM(stake),0) FROM betslips
            WHERE influencer_code=$1
              AND created_at::date>=$2 AND created_at::date<=$3
        """, inf_code, d1, d2) or 0
        premios = await conn.fetchval("""
            SELECT COALESCE(SUM(potential_win),0) FROM betslips
            WHERE influencer_code=$1 AND lower(status) IN ('won','ganada','paid')
              AND created_at::date>=$2 AND created_at::date<=$3
        """, inf_code, d1, d2) or 0
        n_jugadas = await conn.fetchval("""
            SELECT COUNT(*) FROM betslips
            WHERE influencer_code=$1
              AND created_at::date>=$2 AND created_at::date<=$3
        """, inf_code, d1, d2) or 0
    apostado = float(apostado); premios = float(premios)
    ggr = apostado - premios
    pg = float(yo["pct_ggr"] or 0); pv = float(yo["pct_ventas"] or 0)
    com = round(ggr * pg / 100 + apostado * pv / 100, 2)
    return {
        "name": yo["name"], "codigo_ref": yo["codigo_ref"],
        "pct_ggr": pg, "pct_ventas": pv,
        "desde": d1.isoformat(), "hasta": d2.isoformat(),
        "apostado": apostado, "premios": premios, "ggr": ggr,
        "jugadas": n_jugadas, "comision": com,
    }


@app.get("/api/agencias/me/destinatarios")
async def listar_destinatarios(agencia_code: str = Depends(requiere_agencia)):
    """Subs e influencers de la rama, para elegir con quién compartir un combo."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        subs = await conn.fetch("""
            SELECT code, name FROM agencias
            WHERE code = ANY($1) AND code <> $2
              AND COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY name
        """, rama, agencia_code)
        infs = await conn.fetch("""
            SELECT code, name FROM agencias
            WHERE tipo='influencer' AND parent_code = ANY($1)
            ORDER BY name
        """, rama)
    return {
        "subs": [{"code": r["code"], "name": r["name"]} for r in subs],
        "influencers": [{"code": r["code"], "name": r["name"]} for r in infs],
    }


@app.post("/api/agencias/me/combos")
async def crear_combo_agencia(request: Request,
                              agencia_code: str = Depends(requiere_agencia)):
    """La agencia crea un combo para sus propias terminales."""
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:80] or "Combo de la agencia"
    inf_asignado = (body.get("influencer_code") or "").strip().upper() or None
    codigo_salida = (body.get("codigo") or "").strip()[:40].upper() or None
    picks = body.get("picks") or []
    if not picks:
        raise HTTPException(400, "El combo no tiene selecciones")
    if len(picks) > 12:
        raise HTTPException(400, "Máximo 12 selecciones")

    limpios, odd_total = [], 1.0
    for p in picks:
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= 50):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        limpios.append({
            "h": str(p.get("home") or p.get("h") or "")[:80],
            "a": str(p.get("away") or p.get("a") or "")[:80],
            "sel": str(p.get("sel") or "")[:120],
            "odd": round(odd, 2),
            "sport": str(p.get("sport") or "")[:60],
            "event_id": str(p.get("event_id") or "")[:64] or None,
            "sport_key": str(p.get("sport_key") or "")[:60] or None,
            # Hora de inicio: la necesita la anulación para saber si el
            # evento está por empezar. Sin esto no se puede anular nada.
            "commence_time": str(p.get("commence_time")
                                 or p.get("start_time") or "")[:40] or None,
        })
        odd_total *= odd

    pool = await get_db()
    async with pool.acquire() as conn:
        # Si se asigna influencer, validar que sea de la rama de la agencia
        if inf_asignado:
            rama = await codes_de_la_rama(conn, agencia_code)
            ok = await conn.fetchval("""
                SELECT 1 FROM agencias
                WHERE code=$1 AND tipo='influencer' AND parent_code = ANY($2)
            """, inf_asignado, rama)
            if not ok:
                raise HTTPException(403, "Ese influencer no es de tu rama")
        if codigo_salida:
            existe = await conn.fetchval(
                "SELECT 1 FROM combos_manuales WHERE codigo=$1", codigo_salida)
            if existe:
                raise HTTPException(409, "Ese código ya está en uso")
        row = await conn.fetchrow("""
            INSERT INTO combos_manuales
                (origen, creado_por, nombre, picks, odd_total, visible,
                 influencer_code, codigo)
            VALUES ('agencia', $1, $2, $3, $4, true, $5, $6)
            RETURNING id
        """, agencia_code, nombre, str(limpios), round(odd_total, 2),
             inf_asignado, codigo_salida)
        combo_id = row["id"]

        # ── Compartir con varios subs/influencers ────────────────
        # body puede traer: compartir_subs (lista de codes o "todos"),
        # compartir_influencers (lista o "todos").
        await _compartir_combo(conn, combo_id, agencia_code, body)

    return {"id": combo_id, "odd_total": round(odd_total, 2),
            "influencer_code": inf_asignado, "codigo": codigo_salida}


async def _compartir_combo(conn, combo_id, dueno_code, body):
    """Registra en combos_compartidos los subs/influencers destinatarios.
    Acepta 'todos' (toda la rama) o listas de codes específicos."""
    subs = body.get("compartir_subs")
    infs = body.get("compartir_influencers")
    if not subs and not infs:
        return
    rama = await codes_de_la_rama(conn, dueno_code)

    # Sub-agencias de la rama (sin influencers, sin uno mismo)
    if subs:
        if subs == "todos" or subs == ["todos"]:
            rows = await conn.fetch("""
                SELECT code FROM agencias
                WHERE code = ANY($1) AND code <> $2
                  AND COALESCE(tipo,'agencia') <> 'influencer'
            """, rama, dueno_code)
            destinos = [r["code"] for r in rows]
        else:
            destinos = [str(c).upper() for c in subs if str(c).upper() in rama]
        for code in destinos:
            await conn.execute("""
                INSERT INTO combos_compartidos (combo_id, destino_code, tipo, creado_por)
                VALUES ($1, $2, 'agencia', $3)
            """, combo_id, code, dueno_code)

    # Influencers de la rama
    if infs:
        if infs == "todos" or infs == ["todos"]:
            rows = await conn.fetch("""
                SELECT code FROM agencias
                WHERE tipo='influencer' AND parent_code = ANY($1)
            """, rama)
            destinos = [r["code"] for r in rows]
        else:
            rows = await conn.fetch("""
                SELECT code FROM agencias
                WHERE tipo='influencer' AND code = ANY($1) AND parent_code = ANY($2)
            """, [str(c).upper() for c in infs], rama)
            destinos = [r["code"] for r in rows]
        for code in destinos:
            await conn.execute("""
                INSERT INTO combos_compartidos (combo_id, destino_code, tipo, creado_por)
                VALUES ($1, $2, 'influencer', $3)
            """, combo_id, code, dueno_code)


@app.get("/api/agencias/me/combos")
async def listar_combos_agencia(agencia_code: str = Depends(requiere_agencia)):
    """Combos que ve esta agencia: los propios + los del admin dirigidos a ella."""
    agencia_code = agencia_code.upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, origen, creado_por, nombre, picks, odd_total, visible, created_at
            FROM combos_manuales
            WHERE visible = true
              AND (
                -- combos propios de esta agencia
                (origen='agencia' AND creado_por=$1)
                -- combos del admin dirigidos a agencias (destino_agencia),
                -- para todas o específicamente para esta
                OR (origen='admin' AND COALESCE(destino_agencia,false)
                    AND (agencias IS NULL
                     OR $1 = ANY(string_to_array(agencias, ','))))
                -- combos que otra agencia de arriba le compartió
                OR id IN (SELECT combo_id FROM combos_compartidos
                          WHERE destino_code=$1 AND tipo='agencia')
              )
            ORDER BY created_at DESC
        """, agencia_code)
    out = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        es_admin = r["origen"] == "admin"
        out.append({"id": r["id"], "nombre": r["nombre"], "picks": picks,
                    "odd_total": float(r["odd_total"]), "visible": r["visible"],
                    "origen": r["origen"],
                    "de_la_casa": es_admin,
                    "etiqueta": "🏛️ De la casa" if es_admin else "Mío"})
    return {"combos": out}


@app.delete("/api/agencias/me/combos/{combo_id}")
async def borrar_combo_agencia(combo_id: int,
                               agencia_code: str = Depends(requiere_agencia)):
    """La agencia borra un combo propio."""
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            DELETE FROM combos_manuales
            WHERE id=$1 AND origen='agencia' AND creado_por=$2
        """, combo_id, agencia_code)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# MONEDAS — lista central. Para agregar una moneda nueva, sumá una
# entrada acá: código, símbolo, nombre y los países (ISO-2) que la
# detectan por IP. Todo el sistema (selector admin, formateo, IP)
# lee de acá, así que con esto alcanza.
# ═══════════════════════════════════════════════════════════════
MONEDAS = {
    "ARS": {"simbolo": "$",    "nombre": "Peso argentino",  "paises": ["AR"]},
    "BRL": {"simbolo": "R$",   "nombre": "Real brasileño",  "paises": ["BR"]},
    "UYU": {"simbolo": "$U",   "nombre": "Peso uruguayo",   "paises": ["UY"]},
    "CLP": {"simbolo": "$",    "nombre": "Peso chileno",    "paises": ["CL"]},
    "PYG": {"simbolo": "₲",    "nombre": "Guaraní",         "paises": ["PY"]},
    "BOB": {"simbolo": "Bs",   "nombre": "Boliviano",       "paises": ["BO"]},
    "PEN": {"simbolo": "S/",   "nombre": "Sol peruano",     "paises": ["PE"]},
    "COP": {"simbolo": "$",    "nombre": "Peso colombiano", "paises": ["CO"]},
    "VES": {"simbolo": "Bs",   "nombre": "Bolívar",         "paises": ["VE"]},
    "MXN": {"simbolo": "$",    "nombre": "Peso mexicano",   "paises": ["MX"]},
    "USD": {"simbolo": "US$",  "nombre": "Dólar",           "paises": ["US", "EC"]},
    "EUR": {"simbolo": "€",    "nombre": "Euro",            "paises": ["ES"]},
}

# Mapa país→moneda derivado automáticamente de MONEDAS
PAIS_MONEDA = {p: cod for cod, d in MONEDAS.items() for p in d["paises"]}


@app.get("/api/monedas")
async def listar_monedas():
    """Lista de monedas habilitadas (para selectores del admin/app)."""
    return {"monedas": [
        {"codigo": cod, "simbolo": d["simbolo"], "nombre": d["nombre"]}
        for cod, d in MONEDAS.items()
    ]}

def _moneda_por_ip(request):
    """Intenta deducir la moneda por el país de la IP. Best-effort:
    si falla, devuelve None y el llamador usa ARS por defecto."""
    try:
        # IP real detrás del proxy de Railway
        xff = request.headers.get("x-forwarded-for", "")
        ip = (xff.split(",")[0].strip() if xff else None) or \
             (request.client.host if request.client else None)
        if not ip:
            return None
        # Consulta síncrona rápida a un geo-IP gratuito
        import urllib.request, json as _json
        url = f"http://ip-api.com/json/{ip}?fields=countryCode"
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = _json.loads(resp.read().decode())
        cc = (data.get("countryCode") or "").upper()
        return PAIS_MONEDA.get(cc)
    except Exception:
        return None


@app.post("/api/telegram/onboarding")
async def telegram_onboarding(request: Request):
    """Lo llama el BOT cuando un usuario nuevo comparte sus datos.
    Guarda nombre/tel/email en su registro de Telegram y busca si hay un
    cliente de mostrador con el mismo teléfono para ofrecer vincular.
    body: {telegram_id, nombre?, telefono?, email?}"""
    body = await request.json()
    tg_id = body.get("telegram_id")
    if not tg_id:
        raise HTTPException(400, "Falta telegram_id")
    tg_id = int(tg_id)
    nombre = (body.get("nombre") or "").strip()[:100] or None
    telefono = (body.get("telefono") or "").strip()[:30] or None
    email = (body.get("email") or "").strip()[:120] or None
    # Moneda: la que eligió el usuario, o se detecta por IP del país
    moneda = (body.get("moneda") or "").strip().upper()[:4] or None
    if not moneda:
        moneda = _moneda_por_ip(request) or "ARS"

    # normalizar teléfono a solo dígitos para comparar
    def _solo_digitos(t):
        return "".join(ch for ch in (t or "") if ch.isdigit())
    tel_norm = _solo_digitos(telefono)

    pool = await get_db()
    async with pool.acquire() as conn:
        # Crear o actualizar el registro de Telegram del usuario con sus datos
        await conn.execute("""
            INSERT INTO users (telegram_id, nombre_completo, telefono, email, moneda, balance)
            VALUES ($1, $2, $3, $4, $5, 0)
            ON CONFLICT (telegram_id) DO UPDATE SET
                nombre_completo = COALESCE(EXCLUDED.nombre_completo, users.nombre_completo),
                telefono = COALESCE(EXCLUDED.telefono, users.telefono),
                email = COALESCE(EXCLUDED.email, users.email),
                moneda = COALESCE(users.moneda, EXCLUDED.moneda)
        """, tg_id, nombre, telefono, email, moneda)

        match = None
        if tel_norm and len(tel_norm) >= 8:
            # Buscar un cliente de mostrador (telegram_id negativo) con ese teléfono
            cli = await conn.fetchrow("""
                SELECT u.id, u.nombre_completo, u.balance, u.creado_por,
                       a.name AS agencia_nombre
                FROM users u
                LEFT JOIN agencias a ON a.code = u.creado_por
                WHERE u.telegram_id < 0
                  AND regexp_replace(COALESCE(u.telefono,''), '[^0-9]', '', 'g') = $1
                LIMIT 1
            """, tel_norm)
            if cli:
                match = {
                    "user_id": cli["id"],
                    "nombre": cli["nombre_completo"],
                    "agencia": cli["agencia_nombre"] or cli["creado_por"],
                    "saldo": (cli["balance"] or 0) / 100,
                }
    return {"ok": True, "match": match}


@app.post("/api/telegram/confirmar-match")
async def confirmar_match(request: Request):
    """El usuario confirmó que es el cliente de mostrador. Fusiona las cuentas
    (suma saldos), igual que la vinculación por código.
    body: {telegram_id, user_id}"""
    body = await request.json()
    tg_id = int(body.get("telegram_id"))
    user_id = int(body.get("user_id"))
    pool = await get_db()
    async with pool.acquire() as conn:
        cli = await conn.fetchrow(
            "SELECT id, balance, nombre_completo, moneda FROM users WHERE id=$1 AND telegram_id < 0", user_id)
        if not cli:
            raise HTTPException(404, "Cliente no encontrado o ya vinculado")
        tg_user = await conn.fetchrow(
            "SELECT id, balance, moneda FROM users WHERE telegram_id=$1", tg_id)
        # No se puede vincular si las monedas no coinciden
        moneda_cli = (cli["moneda"] or "ARS")
        moneda_tg = (tg_user["moneda"] or "ARS") if tg_user else moneda_cli
        if moneda_tg != moneda_cli:
            raise HTTPException(409,
                f"No se puede vincular: tu cuenta está en {moneda_tg} y la de "
                f"la agencia en {moneda_cli}. Contactá a la agencia.")
        async with conn.transaction():
            if tg_user and tg_user["id"] != user_id:
                await conn.execute(
                    "UPDATE users SET balance = balance + $2 WHERE id=$1",
                    user_id, tg_user["balance"] or 0)
                for tabla in ("betslips", "sports_bets", "wallet_transactions"):
                    try:
                        await conn.execute(
                            f"UPDATE {tabla} SET user_id=$1 WHERE user_id=$2",
                            user_id, tg_user["id"])
                    except Exception:
                        pass
                await conn.execute("DELETE FROM users WHERE id=$1", tg_user["id"])
            await conn.execute(
                "UPDATE users SET telegram_id=$2 WHERE id=$1", user_id, tg_id)
        saldo = await conn.fetchval("SELECT balance FROM users WHERE id=$1", user_id)
    return {"ok": True, "nombre": cli["nombre_completo"], "saldo": (saldo or 0) / 100}


def _gen_codigo_retiro():
    import random, string
    return "RT-" + "".join(random.choices(string.digits, k=5))


@app.post("/api/me/retirar")
async def me_retirar(request: Request):
    """El cliente solicita un retiro desde la app. Se descuenta del saldo y
    queda un código para cobrar en efectivo en el mostrador de su agencia.
    body: {init_data, monto}"""
    body = await request.json()
    user = validar_init_data(body.get("init_data", ""))
    if not user or not user.get("id"):
        raise HTTPException(401, "No autenticado")
    try:
        monto = int(body.get("monto", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    if monto <= 0:
        raise HTTPException(400, "El monto debe ser mayor a cero")

    tg_id = str(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT id, balance, moneda, creado_por FROM users
            WHERE telegram_id::text=$1 OR id::text=$1
        """, tg_id)
        if not u:
            raise HTTPException(404, "Usuario no encontrado")
        saldo_pesos = (u["balance"] or 0) / 100
        if monto > saldo_pesos:
            raise HTTPException(400, f"Saldo insuficiente (tenés {saldo_pesos:.0f})")

        code = _gen_codigo_retiro()
        async with conn.transaction():
            # Descontar del saldo (balance en centavos)
            await conn.execute(
                "UPDATE users SET balance = balance - $2 WHERE id=$1",
                u["id"], int(round(monto * 100)))
            # Crear el retiro pendiente con código
            await conn.execute("""
                INSERT INTO retiros (code, user_id, monto, moneda, estado, agencia_code)
                VALUES ($1, $2, $3, $4, 'pendiente', $5)
            """, code, u["id"], monto, u["moneda"] or "ARS", u["creado_por"])
        saldo = await conn.fetchval("SELECT balance FROM users WHERE id=$1", u["id"])

    return {"ok": True, "code": code, "monto": monto,
            "moneda": u["moneda"] or "ARS",
            "saldo": (saldo or 0) / 100,
            "mensaje": f"Mostrá el código {code} en tu agencia para cobrar"}


@app.post("/api/me/vincular-telefono")
async def me_vincular_telefono(request: Request):
    """El cliente ya registrado busca su cuenta de mostrador por teléfono.
    body: {init_data, telefono}"""
    body = await request.json()
    user = validar_init_data(body.get("init_data", ""))
    if not user or not user.get("id"):
        raise HTTPException(401, "No autenticado")
    telefono = (body.get("telefono") or "").strip()
    tel_norm = "".join(ch for ch in telefono if ch.isdigit())
    if len(tel_norm) < 8:
        raise HTTPException(400, "Teléfono inválido")

    tg_id = int(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        # Moneda del usuario de la app
        mi_moneda = await conn.fetchval(
            "SELECT moneda FROM users WHERE telegram_id=$1", tg_id) or "ARS"
        cli = await conn.fetchrow("""
            SELECT u.id, u.nombre_completo, u.balance, u.creado_por, u.moneda,
                   a.name AS agencia_nombre
            FROM users u
            LEFT JOIN agencias a ON a.code = u.creado_por
            WHERE u.telegram_id < 0
              AND regexp_replace(COALESCE(u.telefono,''), '[^0-9]', '', 'g') = $1
            LIMIT 1
        """, tel_norm)
        if not cli:
            return {"match": None}
        # Validar moneda
        if (cli["moneda"] or "ARS") != mi_moneda:
            raise HTTPException(409,
                f"No se puede vincular: tu cuenta está en {mi_moneda} y la de "
                f"la agencia en {cli['moneda'] or 'ARS'}.")
    return {"match": {
        "user_id": cli["id"], "nombre": cli["nombre_completo"],
        "agencia": cli["agencia_nombre"] or cli["creado_por"],
        "saldo": (cli["balance"] or 0) / 100,
    }}


@app.post("/api/telegram/canjear-vinculo")
async def canjear_vinculo(request: Request):
    """Lo llama el BOT cuando alguien entra con start=link_CODIGO.
    Canjea el código: fusiona el cliente de mostrador con su Telegram
    (sumando saldos) o guarda el telegram_id de la agencia.
    body: {codigo, telegram_id, username?, first_name?}"""
    body = await request.json()
    codigo = (body.get("codigo") or "").strip().upper()
    tg_id = body.get("telegram_id")
    if not codigo or not tg_id:
        raise HTTPException(400, "Faltan datos")
    tg_id = int(tg_id)

    pool = await get_db()
    async with pool.acquire() as conn:
        v = await conn.fetchrow("SELECT * FROM vinculos_telegram WHERE codigo=$1", codigo)
        if not v:
            raise HTTPException(404, "Código inválido")
        if v["usado"]:
            raise HTTPException(410, "Ese código ya se usó")
        if v["expira_at"] and v["expira_at"] < datetime.now(timezone.utc):
            raise HTTPException(410, "El código venció")

        if v["tipo"] == "cliente":
            user_id = int(v["objetivo"])
            cli = await conn.fetchrow("SELECT id, balance, telegram_id, nombre_completo, moneda FROM users WHERE id=$1", user_id)
            if not cli:
                raise HTTPException(404, "Cliente no encontrado")
            # ¿Ya existe un usuario con ese telegram_id? (cuenta que el cliente usó en el bot)
            tg_user = await conn.fetchrow("SELECT id, balance, moneda FROM users WHERE telegram_id=$1", tg_id)
            # No vincular si las monedas difieren
            if tg_user:
                m_cli = cli["moneda"] or "ARS"
                m_tg = tg_user["moneda"] or "ARS"
                if m_tg != m_cli:
                    raise HTTPException(409,
                        f"No se puede vincular: tu cuenta está en {m_tg} y la de "
                        f"la agencia en {m_cli}.")
            async with conn.transaction():
                if tg_user and tg_user["id"] != user_id:
                    # Fusionar: sumar el saldo del Telegram al cliente de mostrador,
                    # migrar sus apuestas, y borrar el registro duplicado de Telegram.
                    await conn.execute(
                        "UPDATE users SET balance = balance + $2 WHERE id=$1",
                        user_id, tg_user["balance"] or 0)
                    for tabla in ("betslips", "sports_bets", "wallet_transactions"):
                        try:
                            await conn.execute(
                                f"UPDATE {tabla} SET user_id=$1 WHERE user_id=$2",
                                user_id, tg_user["id"])
                        except Exception:
                            pass
                    await conn.execute("DELETE FROM users WHERE id=$1", tg_user["id"])
                # Poner el telegram_id real en el cliente de mostrador
                await conn.execute(
                    "UPDATE users SET telegram_id=$2 WHERE id=$1", user_id, tg_id)
                await conn.execute(
                    "UPDATE vinculos_telegram SET usado=true, telegram_id=$2 WHERE codigo=$1",
                    codigo, tg_id)
            nuevo_saldo = await conn.fetchval("SELECT balance FROM users WHERE id=$1", user_id)
            return {"ok": True, "tipo": "cliente", "nombre": cli["nombre_completo"],
                    "saldo": (nuevo_saldo or 0) / 100}

        elif v["tipo"] == "agencia":
            code = v["objetivo"]
            await conn.execute("UPDATE agencias SET telegram_id=$2 WHERE code=$1", code, tg_id)
            await conn.execute(
                "UPDATE vinculos_telegram SET usado=true, telegram_id=$2 WHERE codigo=$1",
                codigo, tg_id)
            ag = await conn.fetchrow("SELECT name FROM agencias WHERE code=$1", code)
            return {"ok": True, "tipo": "agencia", "nombre": ag["name"] if ag else code}

    raise HTTPException(400, "No se pudo canjear")


# ── VINCULACIÓN CON TELEGRAM ──────────────────────────────────
def _gen_link_code():
    return "L" + secrets.token_hex(4).upper()   # ej: L3A9F2C1


@app.post("/api/cliente/{user_id}/vincular-telegram")
async def generar_vinculo_cliente(user_id: int, request: Request):
    """Genera un código para que un cliente conecte su Telegram.
    Lo puede pedir el admin (X-Admin-Key) o la agencia dueña (Bearer)."""
    admin_key = request.headers.get("X-Admin-Key")
    es_admin = admin_key and auth.ADMIN_API_KEY and hmac.compare_digest(admin_key, auth.ADMIN_API_KEY)
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("SELECT id, creado_por, nombre_completo FROM users WHERE id=$1", user_id)
        if not u:
            raise HTTPException(404, "Cliente no encontrado")
        if not es_admin:
            token = request.headers.get("Authorization","").replace("Bearer ","")
            solicitante = await sesion_buscar(token) if token else None
            if not solicitante:
                raise HTTPException(401, "No autorizado")
            rama = await codes_de_la_rama(conn, solicitante)
            if u["creado_por"] not in rama:
                raise HTTPException(403, "Ese cliente no es de tu rama")
        codigo = _gen_link_code()
        expira = datetime.now(timezone.utc) + timedelta(hours=24)
        await conn.execute("""
            INSERT INTO vinculos_telegram (codigo, tipo, objetivo, creado_por, expira_at)
            VALUES ($1, 'cliente', $2, $3, $4)
        """, codigo, str(user_id), ("admin" if es_admin else "agencia"), expira)
    link = f"https://t.me/quartzplay_bot?start=link_{codigo}"
    return {"codigo": codigo, "link": link, "expira_en_horas": 24,
            "nombre": u["nombre_completo"]}


@app.post("/api/agencias/me/vincular-telegram")
async def generar_vinculo_agencia(agencia_code: str = Depends(requiere_agencia)):
    """Una agencia genera un código para conectar SU Telegram (para avisos)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        codigo = _gen_link_code()
        expira = datetime.now(timezone.utc) + timedelta(hours=24)
        await conn.execute("""
            INSERT INTO vinculos_telegram (codigo, tipo, objetivo, creado_por, expira_at)
            VALUES ($1, 'agencia', $2, $2, $3)
        """, codigo, agencia_code, expira)
    link = f"https://t.me/quartzplay_bot?start=link_{codigo}"
    return {"codigo": codigo, "link": link, "expira_en_horas": 24}


@app.get("/api/admin/destinatarios")
async def admin_destinatarios(_=Depends(auth.require_admin)):
    """Todas las agencias e influencers, para que el admin comparta combos."""
    pool = await get_db()
    async with pool.acquire() as conn:
        subs = await conn.fetch("""
            SELECT code, name FROM agencias
            WHERE COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY name
        """)
        infs = await conn.fetch("""
            SELECT code, name FROM agencias WHERE tipo='influencer' ORDER BY name
        """)
    return {
        "subs": [{"code": r["code"], "name": r["name"]} for r in subs],
        "influencers": [{"code": r["code"], "name": r["name"]} for r in infs],
    }


@app.post("/api/admin/combos")
async def crear_combo_admin(request: Request, _=Depends(auth.require_admin)):
    """El admin crea un combo y elige qué agencias lo ven."""
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:80] or "Combo de la casa"
    picks = body.get("picks") or []
    # agencias: lista de codes, o vacío/None = todas
    agencias = body.get("agencias")
    if isinstance(agencias, list):
        agencias = ",".join(a.strip().upper() for a in agencias if a.strip())
    agencias = (agencias or "").strip() or None

    if not picks:
        raise HTTPException(400, "El combo no tiene selecciones")

    limpios, odd_total = [], 1.0
    for p in picks:
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= 100):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        limpios.append({
            "h": str(p.get("home") or p.get("h") or "")[:80],
            "a": str(p.get("away") or p.get("a") or "")[:80],
            "sel": str(p.get("sel") or "")[:120],
            "odd": round(odd, 2),
            "sport": str(p.get("sport") or "")[:60],
            "event_id": str(p.get("event_id") or "")[:64] or None,
            "sport_key": str(p.get("sport_key") or "")[:60] or None,
            # Hora de inicio: la necesita la anulación para saber si el
            # evento está por empezar. Sin esto no se puede anular nada.
            "commence_time": str(p.get("commence_time")
                                 or p.get("start_time") or "")[:40] or None,
        })
        odd_total *= odd

    # Destinos: dónde se muestra el combo (combinables)
    dest_box     = bool(body.get("destino_box", True))
    dest_app     = bool(body.get("destino_app", False))
    dest_agencia = bool(body.get("destino_agencia", False))
    fuente       = (body.get("fuente") or "manual")[:20]
    inf_asignado = (body.get("influencer_code") or "").strip().upper() or None
    codigo_salida = (body.get("codigo") or "").strip()[:40].upper() or None

    pool = await get_db()
    async with pool.acquire() as conn:
        if inf_asignado:
            ok = await conn.fetchval("""
                SELECT 1 FROM agencias WHERE code=$1 AND tipo='influencer'
            """, inf_asignado)
            if not ok:
                raise HTTPException(404, "Influencer no encontrado")
        if codigo_salida:
            existe = await conn.fetchval(
                "SELECT 1 FROM combos_manuales WHERE codigo=$1", codigo_salida)
            if existe:
                raise HTTPException(409, "Ese código ya está en uso")
        row = await conn.fetchrow("""
            INSERT INTO combos_manuales
                (origen, creado_por, nombre, picks, odd_total, visible,
                 agencias, destino_box, destino_app, destino_agencia, fuente,
                 influencer_code, codigo)
            VALUES ('admin', 'admin', $1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        """, nombre, str(limpios), round(odd_total, 2), agencias,
             dest_box, dest_app, dest_agencia, fuente, inf_asignado, codigo_salida)
        combo_id = row["id"]

        # ── Compartir con varias agencias/subs/influencers ──────
        await _compartir_combo_admin(conn, combo_id, body)

    return {"id": combo_id, "odd_total": round(odd_total, 2),
            "agencias": agencias or "todas", "influencer_code": inf_asignado,
            "codigo": codigo_salida,
            "destinos": {"box":dest_box, "app":dest_app, "agencia":dest_agencia}}


async def _compartir_combo_admin(conn, combo_id, body):
    """El admin comparte un combo con agencias/subs (tipo 'agencia') e
    influencers. Acepta 'todos' o listas de codes."""
    subs = body.get("compartir_subs")
    infs = body.get("compartir_influencers")
    if subs:
        if subs == "todos" or subs == ["todos"]:
            rows = await conn.fetch("""
                SELECT code FROM agencias WHERE COALESCE(tipo,'agencia') <> 'influencer'
            """)
            destinos = [r["code"] for r in rows]
        else:
            destinos = [str(c).upper() for c in subs]
        for code in destinos:
            await conn.execute("""
                INSERT INTO combos_compartidos (combo_id, destino_code, tipo, creado_por)
                VALUES ($1, $2, 'agencia', 'admin')
            """, combo_id, code)
    if infs:
        if infs == "todos" or infs == ["todos"]:
            rows = await conn.fetch("SELECT code FROM agencias WHERE tipo='influencer'")
            destinos = [r["code"] for r in rows]
        else:
            destinos = [str(c).upper() for c in infs]
        for code in destinos:
            await conn.execute("""
                INSERT INTO combos_compartidos (combo_id, destino_code, tipo, creado_por)
                VALUES ($1, $2, 'influencer', 'admin')
            """, combo_id, code)


@app.post("/api/admin/escanear-combo")
async def admin_escanear_combo(request: Request, _=Depends(auth.require_admin)):
    """
    El admin sube una captura. Devolvemos los picks leídos con NUESTRA
    cuota (ajustada hasta el tope) y también la cuota ORIGINAL, para que
    el admin elija con cuál publicar el combo.
    """
    body = await request.json()
    imagenes = body.get("imagenes")
    if not imagenes:
        una = body.get("imagen","")
        if not una:
            raise HTTPException(400, "Falta la imagen")
        imagenes = [{"data": una, "media_type": body.get("media_type","image/jpeg")}]
    if len(imagenes) > 6:
        raise HTTPException(400, "Máximo 6 fotos")

    leidos = []
    vistos = set()
    for img in imagenes:
        data = img.get("data","")
        if not data or len(data) > 8_000_000:
            continue
        r = await leer_captura_con_claude(data, img.get("media_type","image/jpeg"))
        picks_img = r.get("picks", []) if isinstance(r, dict) else (r or [])
        for p in picks_img:
            clave = (str(p.get("home","")).lower().strip(),
                     str(p.get("away","")).lower().strip(),
                     str(p.get("selection","")).lower().strip())
            if clave in vistos:
                continue
            vistos.add(clave)
            leidos.append(p)

    if not leidos:
        return {"ok": False, "mensaje": "No se pudieron leer apuestas en las fotos"}

    # Tope vigente, configurable desde el admin (6% por defecto)
    _pct_mejora = await _mejora_pct()

    picks = []
    for p in leidos:
        home = p.get("home") or ""
        away = p.get("away") or ""
        market = p.get("market") or ""
        selection = p.get("selection") or ""
        odd_orig = p.get("odd")

        nuestra, ev = await buscar_cuota_nuestra(home, away, market, selection)
        item = {
            "home": home, "away": away, "market": market,
            "selection": selection, "odd_original": odd_orig,
            "odd_nuestra": None, "odd_ajustada": None,
            "event_id": None, "sport_key": None, "estado": "",
        }
        if ev is None:
            cands = await candidatos_parecidos(home, away)
            item["candidatos"] = cands

            # Si hay un candidato claro, se asume en vez de rechazar.
            #
            # POR QUÉ: decir "no tenemos ese partido" y al mismo tiempo
            # ofrecerlo como primera opción al tocar Corregir es
            # contradictorio, y deja al cajero sin saber qué hacer. Si
            # el sistema ya sabe cuál es, que lo ponga y lo marque como
            # sugerido: corregir algo puesto es más fácil que elegir
            # desde cero.
            if cands and (cands[0].get("parecido") or 0) >= 0.62:
                sug = cands[0]
                item["estado"] = "ok"
                item["event_id"] = sug.get("event_id")
                item["sport_key"] = sug.get("sport_key")
                item["opciones"] = sug.get("opciones")
                item["home_real"] = sug.get("home")
                item["away_real"] = sug.get("away")
                item["parecido"] = sug.get("parecido")
                # Sin aviso por pick: el botón de corregir ya está y
                # marcar cada uno agrega ruido. El aviso general va
                # arriba de la lista, una sola vez.
                # La cuota se busca contra el evento sugerido
                try:
                    nueva, ev2 = await buscar_cuota_nuestra(
                        sug.get("home"), sug.get("away"), market, selection)
                    if nueva:
                        item["odd_nuestra"] = round(nueva, 2)
                        # Al sugerido se le aplica la misma mejora que
                        # a cualquier otro: si nuestra cuota es más
                        # baja, se sube hasta el tope configurado.
                        if odd_orig and nueva < odd_orig:
                            tope = round(nueva * (1 + _pct_mejora/100), 2)
                            if tope >= odd_orig:
                                item["odd_final"] = round(odd_orig, 2)
                                item["estado"] = "igualada"
                            else:
                                item["odd_final"] = tope
                                item["estado"] = "mejorada_parcial"
                            item["ajustada"] = True
                        else:
                            item["odd_final"] = round(nueva, 2)
                            item["estado"] = "ok"
                except Exception as e:
                    log.warning(f"[ESCANER] cuota del sugerido: {e}")
                log.warning(
                    f"[ESCANER] '{home}' vs '{away}' → sugerido "
                    f"'{sug.get('home')}' vs '{sug.get('away')}' "
                    f"({sug.get('parecido')})")
            else:
                item["estado"] = "sin_partido"
                if cands:
                    c = cands[0]
                    log.warning(
                        f"[ESCANER] sin match: '{home}' vs '{away}' — el más "
                        f"parecido era '{c.get('home')}' vs '{c.get('away')}' "
                        f"({c.get('parecido')})")
                else:
                    log.warning(
                        f"[ESCANER] sin match ni candidatos: "
                        f"'{home}' vs '{away}'")
        elif nuestra is None:
            # El evento SÍ está pero no se encontró la selección. Es
            # el caso que confunde: el corrector muestra el partido
            # completo y parece que el escáner falló al buscarlo.
            log.warning(
                f"[ESCANER] evento OK pero sin cuota: "
                f"'{home}' vs '{away}' · mercado='{market}' "
                f"selección='{selection}' · el feed tiene "
                f"{list((ev.get('markets') or {}).keys())[:6]}")
            item["estado"] = "sin_mercado"
            item["event_id"] = ev.get("id")
            item["sport_key"] = ev.get("sport_key")
            item["opciones"] = opciones_de_evento(ev)
            item["home_real"] = ev.get("h")
            item["away_real"] = ev.get("a")
        else:
            item["odd_nuestra"] = round(nuestra, 2)
            item["event_id"] = ev.get("id")
            item["sport_key"] = ev.get("sport_key")
            item["opciones"] = opciones_de_evento(ev)
            item["home_real"] = ev.get("h")
            item["away_real"] = ev.get("a")
            if odd_orig and nuestra < odd_orig:
                tope = round(nuestra * (1 + _pct_mejora/100), 2)
                item["odd_ajustada"] = min(tope, round(odd_orig, 2))
            else:
                item["odd_ajustada"] = round(nuestra, 2)
            item["estado"] = "ok"
        picks.append(item)

    return {"ok": True, "picks": picks,
            "picks_ok": sum(1 for p in picks if p["odd_nuestra"]),
            "picks_total": len(picks),
            "tope_ajuste_pct": _pct_mejora}


@app.get("/api/admin/combos")
async def listar_combos_admin(_=Depends(auth.require_admin)):
    """Todos los combos manuales, de admin y de agencias."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, origen, creado_por, nombre, picks, odd_total,
                   visible, agencias, created_at
            FROM combos_manuales
            ORDER BY created_at DESC
        """)
    out = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        out.append({
            "id": r["id"], "origen": r["origen"], "creado_por": r["creado_por"],
            "nombre": r["nombre"], "picks": picks,
            "odd_total": float(r["odd_total"]), "visible": r["visible"],
            "agencias": r["agencias"] or "todas",
        })
    return {"combos": out}


@app.delete("/api/admin/combos/{combo_id}")
async def borrar_combo_admin(combo_id: int, _=Depends(auth.require_admin)):
    """El admin puede borrar cualquier combo."""
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM combos_manuales WHERE id=$1", combo_id)
    return {"ok": True}


# ── BOX / TERMINAL DE AUTOCONSULTA ────────────────────────────
# El cliente arma su apuesta en una terminal de la agencia y saca un
# código. El boleto queda pendiente y ASOCIADO A LA AGENCIA desde el
# vamos (registro en agencia_tickets con tipo 'box'), para que el cierre
# sea preciso aunque todavía no esté cobrado.

@app.get("/api/box/{agencia_code}/valida")
async def box_valida(agencia_code: str):
    """Confirma que la agencia del box existe y está activa."""
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT code, name, moneda FROM agencias WHERE code=$1",
            agencia_code.upper())
    if not row:
        raise HTTPException(404, "Agencia no encontrada")
    # La moneda define los montos sugeridos: 20.000 es una apuesta
    # normal en pesos y una barbaridad en dólares.
    return {"code": row["code"], "name": row["name"],
            "moneda": row["moneda"] or "ARS"}


@app.post("/api/box/{agencia_code}/betslip")
async def box_crear_betslip(agencia_code: str, request: Request):
    """
    Crea un boleto pendiente desde el box, asociado a la agencia.
    No cobra: el cliente paga después en el mostrador con el código.
    """
    agencia_code = agencia_code.upper()
    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT code FROM agencias WHERE code=$1", agencia_code)
        if not ag:
            raise HTTPException(404, "Agencia no encontrada")

    body  = await request.json()
    picks = body.get("picks") or []
    cliente = (body.get("cliente") or "")[:80] or None
    codigo_influencer = (body.get("codigo_influencer") or "")[:40] or None
    combo_id = body.get("combo_id")
    agencia_juego = (body.get("agencia_code") or body.get("agencia") or "") or None
    if not picks:
        raise HTTPException(400, "No hay selecciones")
    if len(picks) > MAX_PICKS:
        raise HTTPException(400, f"Máximo {MAX_PICKS} selecciones")

    # Validar y limpiar picks (misma lógica que create_betslip)
    limpios, odd_total = [], 1.0
    for p in picks:
        home = str(p.get("home") or p.get("h") or "")[:80]
        away = str(p.get("away") or p.get("a") or "")[:80]
        sel  = str(p.get("sel") or "")[:120]
        sport= str(p.get("sport") or "")[:60]
        event_id  = str(p.get("event_id") or p.get("id") or "")[:64] or None
        sport_key = str(p.get("sport_key") or "")[:60] or None
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= MAX_ODD_PICK):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        if not home or not sel:
            raise HTTPException(400, "Faltan datos de la selección")
        limpios.append({"home":home,"away":away,"sel":sel,"odd":round(odd,2),
                        "sport":sport,"event_id":event_id,"sport_key":sport_key})
        odd_total *= odd
    odd_total = round(odd_total, 2)
    # Bet builder de mismo partido: aplicar margen de correlación (protección)
    if body.get("mismo_partido"):
        pool_bb = await get_db()
        async with pool_bb.acquire() as conn_bb:
            bbcfg = await _bb_config(conn_bb)
        if len(limpios) > bbcfg["max_picks"]:
            raise HTTPException(400,
                f"El máximo es {bbcfg['max_picks']} selecciones del mismo partido")
        odd_total = _cuota_mismo_partido([{"odd": p["odd"]} for p in limpios],
                                          bbcfg["margen_correlacion"],
                                          bbcfg["margen_escalon"], bbcfg["escalon_desde"])
    if odd_total > MAX_ODD_TOTAL:
        raise HTTPException(400, "Cuota combinada demasiado alta")

    code = "QP-" + str(secrets.randbelow(90000) + 10000)
    async with pool.acquire() as conn:
        async with conn.transaction():
            firma = await _resolver_influencer(conn, codigo_influencer, combo_id, agencia_code)

            # Nivel superior manda: si está bloqueado arriba, la agencia
            # no puede tomarlo aunque a ella no se lo hayan bloqueado.
            trabados = await _picks_bloqueados(
                conn, limpios, agencia_code=agencia_code, es_live=False)
            if trabados:
                raise HTTPException(400, "No se puede apostar. " +
                    "; ".join(f"{t['pick']}: {t['motivo']}"
                              for t in trabados[:3]))

            # Reintenta si el código ya existe
            for _ in range(5):
                existe = await conn.fetchval(
                    "SELECT 1 FROM betslips WHERE code=$1", code)
                if not existe:
                    break
                code = "QP-" + str(secrets.randbelow(90000) + 10000)
            await conn.execute("""
                INSERT INTO betslips
                    (code, user_id, picks, stake, odd_total,
                     potential_win, status, influencer_code, cliente_nombre,
                     created_at, expires_at)
                VALUES ($1, NULL, $2, 0, $3, 0, 'pending', $4, $5,
                        NOW(), NOW() + interval '24 hours')
            """, code, str(limpios), odd_total, firma, cliente)
            await _sellar_huella(conn, code, request,
                                     terminal=body.get("terminal"))
            # Registro en agencia_tickets con tipo 'box' y stake 0 (aún sin cobrar)
            await conn.execute("""
                INSERT INTO agencia_tickets
                    (agencia_code, betslip_code, tipo, stake, potential_win)
                VALUES ($1, $2, 'box', 0, 0)
            """, agencia_code, code)

    return {"code": code, "odd_total": odd_total,
            "picks": len(limpios), "agencia": agencia_code}


# ── BETSLIP — CREAR desde la web ──────────────────────────────
MAX_PICKS     = 10
MAX_ODD_PICK  = 20.0     # cuota máxima por selección
MAX_ODD_TOTAL = 1000.0   # cuota máxima combinada

async def _validar_alcance(conn, inf_code, agencia_juego):
    """
    Verifica que el influencer pueda operar donde se está jugando.
      agencia_juego = code de la agencia donde se juega, o None si es el bot/Telegram.
    Alcance:
      solo_agencia -> solo la agencia que lo creó (su parent_code)
      rama         -> su parent y toda la rama hacia abajo de ese parent
      global       -> cualquier lado + bot
    Si no corresponde, lanza HTTPException 403 (se rechaza la jugada).
    """
    inf = await conn.fetchrow("""
        SELECT parent_code, COALESCE(alcance,'rama') AS alcance, name
        FROM agencias WHERE code=$1 AND tipo='influencer'
    """, inf_code)
    if not inf:
        return  # no es influencer válido; no bloquea (no firma igual)
    alcance = inf["alcance"]
    parent = inf["parent_code"]
    # Influencer sin agencia madre (creado por el admin) = global de hecho
    if alcance == "global" or not parent:
        return  # vale en todos lados, incluido el bot
    # A partir de acá NO es global: el bot no está permitido
    if not agencia_juego:
        raise HTTPException(403,
            "Ese código es de otra agencia y no puede usarse en Telegram.")
    if alcance == "solo_agencia":
        if agencia_juego.upper() != (parent or "").upper():
            raise HTTPException(403,
                "Ese código es de otra agencia y no puede usarse acá.")
    else:  # 'rama'
        rama = await codes_de_la_rama(conn, parent) if parent else []
        if agencia_juego.upper() not in [x.upper() for x in rama]:
            raise HTTPException(403,
                "Ese código es de otra agencia y no puede usarse acá.")


async def _resolver_influencer(conn, codigo=None, combo_id=None, agencia_juego=None):
    """
    Devuelve el influencer_code que debe firmar la jugada, validando alcance.
    Prioridad: 1) combo firmado  2) código ingresado (de combo o de referido).
    Si el código es de un influencer sin permiso para 'agencia_juego', rechaza.
    """
    firma = None
    # 1) Si la jugada viene de un combo firmado
    if combo_id:
        try:
            r = await conn.fetchrow(
                "SELECT influencer_code FROM combos_manuales WHERE id=$1", int(combo_id))
            if r and r["influencer_code"]:
                firma = r["influencer_code"]
        except Exception:
            pass
    # 2) Código ingresado a mano
    if not firma and codigo:
        c = str(codigo).strip().upper()
        if c:
            r = await conn.fetchrow(
                "SELECT influencer_code FROM combos_manuales WHERE upper(codigo)=$1", c)
            if r and r["influencer_code"]:
                firma = r["influencer_code"]
            else:
                r = await conn.fetchrow(
                    "SELECT code FROM agencias WHERE upper(codigo_ref)=$1 AND tipo='influencer'", c)
                if r:
                    firma = r["code"]
    if firma:
        await _validar_alcance(conn, firma, agencia_juego)
    return firma


@app.post("/api/betslip")
async def create_betslip(request: Request):
    """
    Crea un boleto pendiente y devuelve el código QP-XXXXX.
    El cliente lo lleva al local y ahí paga en efectivo.

    OJO: las cuotas todavía llegan del navegador. Los topes de acá abajo
    acotan el daño, pero antes de habilitar efectivo en serio hay que
    validar cada cuota contra el feed real del servidor.
    """
    body  = await request.json()
    picks = body.get("picks") or []
    inf   = (body.get("inf_code") or "")[:64] or None
    codigo_influencer = (body.get("codigo_influencer") or "")[:40] or None
    combo_id = body.get("combo_id")
    agencia_juego = (body.get("agencia_code") or body.get("agencia") or "") or None
    # Lo escribe el cajero en el mostrador; antes solo salía impreso
    # en el ticket y no quedaba en ningún lado.
    cliente = (body.get("cliente") or "")[:80] or None

    if not isinstance(picks, list) or not (1 <= len(picks) <= MAX_PICKS):
        raise HTTPException(400, f"El boleto debe tener entre 1 y {MAX_PICKS} selecciones")

    limpios = []
    odd_total = 1.0
    for p in picks:
        if not isinstance(p, dict):
            raise HTTPException(400, "Selección inválida")
        home = str(p.get("home") or p.get("h") or "")[:80]
        away = str(p.get("away") or p.get("a") or "")[:80]
        sel  = str(p.get("sel") or "")[:120]
        sport= str(p.get("sport") or "")[:60]
        # event_id y sport_key permiten cruzar la apuesta con el
        # resultado final para la auto-liquidación.
        event_id  = str(p.get("event_id") or p.get("id") or "")[:64] or None
        sport_key = str(p.get("sport_key") or "")[:60] or None
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= MAX_ODD_PICK):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        if not home or not sel:
            raise HTTPException(400, "Faltan datos de la selección")
        limpios.append({"home":home,"away":away,"sel":sel,
                        "odd":round(odd,2),"sport":sport,
                        "event_id":event_id,"sport_key":sport_key,
                        "commence_time":(str(p.get("commence_time")
                                         or p.get("start_time") or "")[:40]
                                         or None)})
        odd_total *= odd

    odd_total = round(odd_total, 3)

    # Bet builder de mismo partido: aplicar el margen de correlación (protección).
    # El servidor recalcula, no confía en la cuota del cliente.
    if body.get("mismo_partido"):
        pool_bb = await get_db()
        async with pool_bb.acquire() as conn_bb:
            bbcfg = await _bb_config(conn_bb)
        if len(limpios) > bbcfg["max_picks"]:
            raise HTTPException(400,
                f"El máximo es {bbcfg['max_picks']} selecciones del mismo partido")
        odd_total = _cuota_mismo_partido([{"odd": p["odd"]} for p in limpios],
                                          bbcfg["margen_correlacion"],
                                          bbcfg["margen_escalon"], bbcfg["escalon_desde"])

    if odd_total > MAX_ODD_TOTAL:
        raise HTTPException(400, "La cuota combinada supera el máximo permitido")

    # Contrasta cada cuota contra el feed real antes de guardar nada
    problemas = await validar_cuotas(limpios)
    if problemas:
        if ODDS_VALIDATION == "strict":
            log.warning(f"Boleto rechazado por cuotas: {problemas}")
            raise HTTPException(400,
                "Las cuotas cambiaron o no se pudieron verificar. Volvé a armar el boleto.")
        log.warning(f"[ODDS-WARN] boleto aceptado con observaciones: {problemas}")

    pool = await get_db()
    async with pool.acquire() as conn:
        # Resolver qué influencer firma la jugada (combo firmado o código ingresado)
        # agencia_juego=None significa que se juega desde el bot/Telegram
        firma = await _resolver_influencer(conn, codigo_influencer, combo_id, agencia_juego)

        # Bloqueos: se valida antes de emitir el código de reserva, para
        # que el cliente no llegue al mostrador con un boleto que no se
        # puede cobrar.
        trabados = await _picks_bloqueados(
            conn, limpios, agencia_code=agencia_juego, es_live=False)
        if trabados:
            raise HTTPException(400, "No se puede apostar. " +
                "; ".join(f"{t['pick']}: {t['motivo']}" for t in trabados[:3]))

        # Reintenta si el código sorteado ya existe.
        # Requiere UNIQUE en betslips.code, si no los duplicados entran callados.
        for _ in range(20):
            code = f"QP-{secrets.randbelow(90000)+10000}"
            try:
                await conn.execute("""
                    INSERT INTO betslips
                        (code, user_id, picks, stake, odd_total,
                         potential_win, status, inf_code, influencer_code,
                         cliente_nombre, created_at, expires_at)
                    VALUES ($1, NULL, $2, 0, $3, 0, 'pending', $4, $5, $6,
                            NOW(), NOW() + interval '24 hours')
                """, code, str(limpios), odd_total, inf, firma, cliente)
                await _sellar_huella(conn, code, request,
                                     terminal=body.get("terminal"))
                return {
                    "code": code,
                    "odd_total": odd_total,
                    "picks": len(limpios),
                    "expires_in_hours": 24,
                }
            except asyncpg.UniqueViolationError:
                continue
    log.error("No se pudo generar un código único tras 20 intentos")
    raise HTTPException(503, "No se pudo generar el código, probá de nuevo")

@app.post("/api/apuesta")
async def crear_apuesta(request: Request):
    """
    Apuesta desde la web app del cliente. Tres modos que elige el cliente:

      saldo     -> debita users.balance,    boleto 'active'
      bono      -> debita users.saldo_bono, boleto 'active' con con_bono=true
      reservada -> no toca plata,           boleto 'pending' para pagar en agencia

    En los tres casos el boleto queda con user_id, asi aparece en Mis apuestas.

    UNIDADES: stake viaja en PESOS; balance y saldo_bono estan en CENTAVOS.
    Por eso se debita stake*100. Confundir esto cobra centavos en vez de pesos.
    """
    body  = await request.json()
    user  = validar_init_data(body.get("init_data", ""))
    if not user or not user.get("id"):
        raise HTTPException(401, "Abri la app desde el bot de Telegram para apostar")

    modo  = (body.get("modo") or "reservada").lower()
    if modo not in ("saldo", "bono", "reservada"):
        raise HTTPException(400, "Modo de apuesta invalido")

    picks = body.get("picks") or []
    if not isinstance(picks, list) or not (1 <= len(picks) <= MAX_PICKS):
        raise HTTPException(400, f"El boleto debe tener entre 1 y {MAX_PICKS} selecciones")

    inf   = (body.get("inf_code") or "")[:64] or None
    codigo_influencer = (body.get("codigo_influencer") or "")[:40] or None
    combo_id = body.get("combo_id")

    # ── Selecciones: mismas validaciones que el boleto de mostrador ──
    limpios = []
    odd_total = 1.0
    mercados = []
    for p in picks:
        if not isinstance(p, dict):
            raise HTTPException(400, "Seleccion invalida")
        home = str(p.get("home") or p.get("h") or "")[:80]
        away = str(p.get("away") or p.get("a") or "")[:80]
        sel  = str(p.get("sel") or "")[:120]
        sport= str(p.get("sport") or "")[:60]
        event_id  = str(p.get("event_id") or p.get("id") or "")[:64] or None
        sport_key = str(p.get("sport_key") or "")[:60] or None
        market    = str(p.get("market") or "")[:40] or None
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota invalida")
        if not (1.01 <= odd <= MAX_ODD_PICK):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        if not home or not sel:
            raise HTTPException(400, "Faltan datos de la seleccion")
        limpios.append({"home":home,"away":away,"sel":sel,
                        "odd":round(odd,2),"sport":sport,
                        "event_id":event_id,"sport_key":sport_key,
                        "commence_time":(str(p.get("commence_time")
                                         or p.get("start_time") or "")[:40]
                                         or None)})
        if market:
            mercados.append(market)
        odd_total *= odd

    odd_total = round(odd_total, 3)

    # Bet builder de mismo partido: el servidor recalcula con el margen
    if body.get("mismo_partido"):
        pool_bb = await get_db()
        async with pool_bb.acquire() as conn_bb:
            bbcfg = await _bb_config(conn_bb)
        if len(limpios) > bbcfg["max_picks"]:
            raise HTTPException(400,
                f"El maximo es {bbcfg['max_picks']} selecciones del mismo partido")
        odd_total = _cuota_mismo_partido([{"odd": p["odd"]} for p in limpios],
                                          bbcfg["margen_correlacion"],
                                          bbcfg["margen_escalon"], bbcfg["escalon_desde"])

    if odd_total > MAX_ODD_TOTAL:
        raise HTTPException(400, "La cuota combinada supera el maximo permitido")

    # Las cuotas siguen llegando del navegador: contrastarlas contra el feed.
    # Con saldo propio el debito es inmediato, asi que esto pesa mas que en
    # el boleto de mostrador.
    problemas = await validar_cuotas(limpios)
    if problemas:
        if ODDS_VALIDATION == "strict":
            log.warning(f"Apuesta rechazada por cuotas: {problemas}")
            raise HTTPException(400,
                "Las cuotas cambiaron o no se pudieron verificar. Volve a armar el boleto.")
        log.warning(f"[ODDS-WARN] apuesta aceptada con observaciones: {problemas}")

    tg_id = str(user["id"])
    pool  = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT id, balance, saldo_bono, moneda, creado_por, bloqueado
            FROM users WHERE telegram_id::text=$1 OR id::text=$1
        """, tg_id)
        if not u:
            raise HTTPException(404, "Todavia no estas registrado")
        if u["bloqueado"]:
            raise HTTPException(403, "Tu cuenta esta bloqueada. Contactate con tu agencia.")

        # Sin agencia (creado_por NULL) la jugada se imputa directo al admin
        agencia_juego = u["creado_por"]
        firma = await _resolver_influencer(conn, codigo_influencer, combo_id, agencia_juego)

        # ── Modo reservada: no toca plata, pero queda con user_id ──
        if modo == "reservada":
            async with conn.transaction():
                for _ in range(20):
                    code = f"QP-{secrets.randbelow(90000)+10000}"
                    try:
                        await conn.execute("""
                            INSERT INTO betslips
                                (code, user_id, picks, stake, odd_total,
                                 potential_win, status, inf_code, influencer_code,
                                 created_at, expires_at)
                            VALUES ($1, $2, $3, 0, $4, 0, 'pending', $5, $6,
                                    NOW(), NOW() + interval '24 hours')
                        """, code, u["id"], str(limpios), odd_total, inf, firma)
                        await _sellar_huella(conn, code, request,
                                     terminal=body.get("terminal"))
                        break
                    except asyncpg.UniqueViolationError:
                        continue
                else:
                    raise HTTPException(503, "No se pudo generar el codigo, proba de nuevo")
            return {"ok": True, "code": code, "modo": "reservada",
                    "odd_total": odd_total, "picks": len(limpios),
                    "expires_in_hours": 24,
                    "mensaje": "Guardada. Presenta el codigo en una agencia para pagarla."}

        # ── Modos con plata: validar el monto ──
        try:
            stake = int(body.get("stake", 0))
        except (TypeError, ValueError):
            raise HTTPException(400, "Monto invalido")

        lim = await _limite_efectivo(conn, agencia_juego)
        min_ap = lim.get("monto_min") if lim.get("monto_min") is not None else MIN_STAKE
        max_ap = lim.get("monto_max") if lim.get("monto_max") is not None else MAX_STAKE
        pago_max = lim.get("pago_max")
        if stake < min_ap or stake > max_ap:
            raise HTTPException(400,
                f"El monto debe estar entre ${min_ap:,} y ${max_ap:,}".replace(",","."))

        if modo == "bono":
            ok_bono, motivo = await _validar_apuesta_bono(
                conn, u["id"], stake, odd_total,
                mercados[0] if len(mercados) == 1 else None)
            if not ok_bono:
                raise HTTPException(400, motivo)

        # Potencializador: extra sobre el premio por combinar. Se
        # calcula acá y se guarda, para que el monto quede congelado
        # aunque el admin cambie la tabla después.
        boost_cfg = await _boost_config(conn)
        boost_pct, _, con_extra, boost_picks = _boost_calcular(
            boost_cfg, limpios, stake, odd_total)
        pot_win = round(con_extra)
        boost_extra = round(con_extra - stake * odd_total)
        if pago_max is not None and pot_win > pago_max:
            pot_win = int(pago_max)

        # Jugador marcado: si el admin le puso un tope, se respeta.
        # 'observado' no limita nada, solo deja rastro para revisar.
        nivel_riesgo = u.get("riesgo_nivel") if hasattr(u, "get") else None
        try:
            marca = await conn.fetchrow(
                "SELECT riesgo_nivel, riesgo_tope FROM users WHERE id=$1", u["id"])
            if marca and marca["riesgo_nivel"] == "limitado" and marca["riesgo_tope"]:
                if stake > float(marca["riesgo_tope"]):
                    raise HTTPException(400,
                        f"El monto máximo para esta cuenta es "
                        f"{int(marca['riesgo_tope']):,}".replace(",", ".") +
                        ". Consultá en tu agencia.")
        except HTTPException:
            raise
        except Exception as e:
            log.warning(f"[RIESGO] no se pudo leer la marca del jugador: {e}")

        # Ajustes de cuota: si el admin le bajó la cuota a este evento,
        # se recalcula ANTES de guardar el boleto. El cliente ve la
        # cuota ajustada en el detalle, no la original.
        try:
            ajustes = await _cargar_ajustes(conn)
            if ajustes:
                _ag = (body.get("agencia_code") or "").upper() or None
                _ruta = await conn.fetchval(
                    "SELECT ruta FROM agencias WHERE code=$1", _ag) if _ag else None
                cambio = False
                for p in limpios:
                    nueva = _aplicar_ajuste(
                        p["odd"], ajustes, p.get("event_id"),
                        p.get("market") or "h2h", p.get("sel"), _ag, _ruta)
                    if nueva != p["odd"]:
                        p["odd"] = nueva
                        cambio = True
                if cambio:
                    # Se recalcula igual que arriba: producto de las patas
                    nuevo_total = 1.0
                    for p in limpios:
                        nuevo_total *= p["odd"]
                    odd_total = round(nuevo_total, 3)
        except Exception as e:
            log.warning(f"[AJUSTE] no se pudo aplicar: {e}")

        # Eventos o mercados bloqueados: se corta antes de cobrar nada.
        # El bloqueo más restrictivo gana, así que alcanza con que uno
        # de los picks esté trabado en cualquier nivel.
        trabados = await _picks_bloqueados(
            conn, limpios,
            agencia_code=(body.get("agencia_code") or "").upper() or None,
            es_live=bool(body.get("live")))
        if trabados:
            detalle = "; ".join(f"{t['pick']}: {t['motivo']}"
                                for t in trabados[:3])
            raise HTTPException(400, f"No se puede apostar. {detalle}")

        # Control de riesgo: se mira ANTES de tocar el saldo
        # La moneda del jugador define el tope que corresponde
        _moneda_riesgo = None
        try:
            _moneda_riesgo = await conn.fetchval(
                "SELECT moneda FROM users WHERE id=$1", u["id"])
        except Exception:
            pass
        ok_riesgo, motivo_riesgo = await _controlar_riesgo(
            conn, limpios, pot_win, _moneda_riesgo)
        if not ok_riesgo:
            raise HTTPException(400, motivo_riesgo)

        stake_cent = int(round(stake * 100))
        col = "balance" if modo == "saldo" else "saldo_bono"

        async with conn.transaction():
            # FOR UPDATE: si el cliente toca dos veces el boton, el segundo
            # espera al primero y no se debita dos veces.
            fila = await conn.fetchrow(
                f"SELECT {col} AS disp FROM users WHERE id=$1 FOR UPDATE", u["id"])
            disponible = int(fila["disp"] or 0)
            if disponible < stake_cent:
                falta = (stake_cent - disponible) / 100
                raise HTTPException(400,
                    f"Saldo insuficiente: te faltan ${falta:,.0f}".replace(",","."))

            await conn.execute(
                f"UPDATE users SET {col} = {col} - $2 WHERE id=$1",
                u["id"], stake_cent)

            for _ in range(20):
                code = f"QP-{secrets.randbelow(90000)+10000}"
                try:
                    await conn.execute("""
                        INSERT INTO betslips
                            (code, user_id, picks, stake, odd_total,
                             potential_win, status, inf_code, influencer_code,
                             con_bono, boost_pct, boost_extra,
                             created_at, paid_at)
                        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8,
                                $9, $10, $11, NOW(), NOW())
                    """, code, u["id"], str(limpios), stake, odd_total,
                         pot_win, inf, firma, modo == "bono",
                         boost_pct, boost_extra)
                    break
                except asyncpg.UniqueViolationError:
                    continue
            else:
                raise HTTPException(503, "No se pudo generar el codigo, proba de nuevo")

            # El sellado va DESPUÉS del bucle de reintentos: adentro, si
            # el código chocaba y se reintentaba, la huella se aplicaba
            # sobre un boleto que después cambiaba de código.
            await _sellar_huella(conn, code, request,
                                 es_live=bool(body.get("live")))

            await conn.execute("""
                INSERT INTO sports_bets
                    (user_id, picks, stake, odd_total, potential_win, status, mode)
                VALUES ($1,$2,$3,$4,$5,'active','app')
            """, u["id"], str(limpios), stake, odd_total, pot_win)

            # Queda registrada la exposicion que genera este boleto
            await _registrar_exposicion(conn, code, limpios, pot_win)

            # El rollover avanza con lo apostado, sea con bono o con saldo real
            await _procesar_rollover(conn, u["id"], stake, odd_total)

            saldo_nuevo = await conn.fetchrow(
                "SELECT balance, saldo_bono FROM users WHERE id=$1", u["id"])

    return {
        "ok": True, "code": code, "modo": modo,
        "stake": stake, "odd_total": odd_total, "potential_win": pot_win,
        "boost_pct": boost_pct,
        "boost_extra": boost_extra,
        "boost_picks": boost_picks,
        "con_bono": modo == "bono",
        "saldo": int(saldo_nuevo["balance"] or 0) // 100,
        "saldo_bono": int(saldo_nuevo["saldo_bono"] or 0) // 100,
        "moneda": u["moneda"] or "ARS",
    }


# ── LOGIN DEL CLIENTE EN EL SITIO WEB ─────────────────────────
# El cliente de mostrador no tiene Telegram: entra con el usuario y la
# clave que le cargó la agencia al darlo de alta.
#
# QUÉ PUEDE HACER: consultar su cuenta y apostar.
# QUÉ NO: cargar ni retirar saldo. Eso sigue siendo presencial, en la
# agencia. Es una decisión de negocio, no una limitación técnica.
#
# La comisión de la agencia no cambia: se calcula por users.creado_por,
# así que da igual si el cliente apostó por Telegram, por el sitio o en
# el mostrador. La apuesta sigue siendo de su agencia.

@app.post("/api/cliente/login")
async def cliente_login(request: Request):
    body = await request.json()
    uname  = (body.get("username") or "").strip().lower()[:40]
    passwd = body.get("password") or ""
    if not uname or not passwd:
        raise HTTPException(400, "Faltan usuario o clave")

    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, username, nombre_completo, balance, saldo_bono,
                   moneda, password_hash, bloqueado, creado_por
            FROM users WHERE LOWER(username)=$1
        """, uname)
        # Mismo mensaje para usuario inexistente y clave incorrecta: si
        # se distinguen, se puede averiguar qué usuarios existen.
        if not row or not row["password_hash"] or \
           not auth.verify_password(passwd, row["password_hash"]):
            raise HTTPException(401, "Usuario o clave incorrectos")
        if row["bloqueado"]:
            raise HTTPException(403, "Tu cuenta está bloqueada. Consultá en tu agencia.")

        if auth.needs_rehash(row["password_hash"]):
            await conn.execute("UPDATE users SET password_hash=$2 WHERE id=$1",
                               row["id"], auth.hash_password(passwd))

    token = auth.create_session(f"cliente:{row['id']}")
    # Tambien en base: las sesiones que viven solo en memoria se pierden
    # en cada deploy y dejarian a todos los clientes afuera.
    await sesion_guardar(token, f"cliente:{row['id']}")
    return {
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "nombre": row["nombre_completo"] or row["username"],
            "saldo": int(row["balance"] or 0) // 100,
            "saldo_bono": int(row["saldo_bono"] or 0) // 100,
            "moneda": row["moneda"] or "ARS",
            "agencia": row["creado_por"],
            # El sitio no permite mover plata: lo dice explícito para que
            # el frontend no muestre botones que van a fallar.
            "puede_cargar": False,
            "puede_retirar": False,
        },
    }


async def requiere_cliente(authorization: str = Header(default="")):
    """Sesión de cliente web. Devuelve el user_id."""
    token = (authorization or "").replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(401, "Falta token de sesión")

    quien = None
    try:
        quien = auth.verify_session(token)      # memoria: instantáneo
    except Exception:
        quien = None
    if not quien:
        quien = await sesion_buscar(token)      # base: sobrevive al deploy

    if not quien or not str(quien).startswith("cliente:"):
        raise HTTPException(401, "Sesión vencida. Volvé a entrar.")
    return int(str(quien).split(":", 1)[1])


@app.get("/api/cliente/me")
async def cliente_me(user_id: int = Depends(requiere_cliente)):
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT id, username, nombre_completo, balance, saldo_bono,
                   moneda, bloqueado, creado_por
            FROM users WHERE id=$1
        """, user_id)
    if not u:
        raise HTTPException(404, "Cliente inexistente")
    return {
        "id": u["id"], "username": u["username"],
        "nombre": u["nombre_completo"] or u["username"],
        "saldo": int(u["balance"] or 0) // 100,
        "saldo_bono": int(u["saldo_bono"] or 0) // 100,
        "moneda": u["moneda"] or "ARS",
        "bloqueado": bool(u["bloqueado"]),
        "agencia": u["creado_por"],
        "puede_cargar": False, "puede_retirar": False,
    }


@app.post("/api/cliente/cambiar-clave")
async def cliente_cambiar_clave(request: Request,
                                user_id: int = Depends(requiere_cliente)):
    body = await request.json()
    actual = body.get("actual") or ""
    nueva  = body.get("nueva") or ""
    if len(nueva) < 6:
        raise HTTPException(400, "La clave nueva debe tener al menos 6 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        h = await conn.fetchval("SELECT password_hash FROM users WHERE id=$1", user_id)
        if not h or not auth.verify_password(actual, h):
            raise HTTPException(401, "La clave actual no coincide")
        await conn.execute("""
            UPDATE users SET password_hash=$2, debe_cambiar_pass=false WHERE id=$1
        """, user_id, auth.hash_password(nueva))
    return {"ok": True}


# ── IDENTIDAD DEL USUARIO DE TELEGRAM ─────────────────────────
# La web app no sabía quién era el usuario, por eso el saldo estaba
# escrito a mano. Telegram firma los datos del usuario con el token del
# bot; validando esa firma sabemos de verdad quién entró.
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "")


async def avisar_telegram(chat_id, texto):
    """Manda un mensaje por Telegram. Silencioso si falla (no rompe el flujo)."""
    if not TELEGRAM_TOKEN or not chat_id:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": int(chat_id), "text": texto})
    except Exception as e:
        log.warning(f"[TG] no se pudo avisar a {chat_id}: {e}")


async def avisar_cliente(conn, user_id, texto):
    """Avisa a un cliente si tiene Telegram vinculado (telegram_id positivo)."""
    tg = await conn.fetchval(
        "SELECT telegram_id FROM users WHERE id=$1 AND telegram_id > 0", user_id)
    if tg:
        await avisar_telegram(tg, texto)


async def avisar_agencia(conn, code, texto):
    """Avisa a una agencia si tiene Telegram vinculado."""
    tg = await conn.fetchval(
        "SELECT telegram_id FROM agencias WHERE code=$1", code)
    if tg:
        await avisar_telegram(tg, texto)


def validar_init_data(init_data: str):
    """
    Verifica la firma de Telegram.WebApp.initData.
    Devuelve el dict del usuario o None si la firma no cierra.
    """
    if not init_data or not TELEGRAM_TOKEN:
        return None
    import urllib.parse
    try:
        pares = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
        datos = dict(pares)
        recibido = datos.pop("hash", None)
        if not recibido:
            return None

        # No aceptar sesiones viejas
        try:
            if time.time() - int(datos.get("auth_date", 0)) > 86400:
                return None
        except ValueError:
            return None

        cadena = "\n".join(f"{k}={datos[k]}" for k in sorted(datos))
        secreto = hmac.new(b"WebAppData", TELEGRAM_TOKEN.encode(),
                           hashlib.sha256).digest()
        esperado = hmac.new(secreto, cadena.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(esperado, recibido):
            return None
        return json.loads(datos.get("user", "{}")) or None
    except Exception as e:
        log.error(f"initData inválido: {e}")
        return None


@app.post("/api/me")
async def quien_soy(request: Request):
    """
    Identifica al usuario de la web app y devuelve su saldo real.
    Sin firma válida no devuelve saldo: preferimos no mostrar nada
    antes que mostrar un número inventado.
    """
    body = await request.json()
    user = validar_init_data(body.get("init_data",""))
    if not user or not user.get("id"):
        return {"autenticado": False}

    tg_id = str(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, username, first_name, balance, telefono, nombre_completo, moneda,
                   creado_por,
                   COALESCE(saldo_bono,0) AS saldo_bono, COALESCE(rollover_pendiente,0) AS rollover_pendiente
            FROM users WHERE id::text = $1 OR telegram_id::text = $1
        """, tg_id)
        activas = 0
        psp_ok = False
        bb_ok = False
        if row:
            activas = await conn.fetchval("""
                SELECT COUNT(*) FROM sports_bets
                WHERE user_id = $1 AND status = 'active'
            """, row["id"]) or 0
            try:
                psp_ok = await _psp_activa_para(conn, row["creado_por"] or "")
            except Exception:
                psp_ok = False
            try:
                bb_ok = await _bb_activo_para(conn, row["creado_por"] or "")
            except Exception:
                bb_ok = False

    if not row:
        # Entró por la web pero nunca usó el bot
        return {"autenticado": True, "registrado": False,
                "nombre": user.get("first_name") or user.get("username") or "",
                "saldo": None, "apuestas_activas": 0}

    # "registrado" = completó el alta (tiene teléfono). Si no, la web app
    # le muestra el formulario de registro.
    completo = bool((row["telefono"] or "").strip())
    return {
        "autenticado": True,
        "registrado": completo,
        # El id lo necesita el chat de soporte y cualquier cosa que
        # consulte la cuenta. Sin esto, el botón de ayuda no aparecía.
        "id": row["id"],
        "creado_por": row["creado_por"],
        "nombre": row["nombre_completo"] or row["username"] or row["first_name"] or "",
        "moneda": row["moneda"] or "ARS",
        "saldo": int(row["balance"] or 0) // 100 if completo else None,
        "saldo_bono": int(row["saldo_bono"] or 0) // 100 if completo else None,
        "rollover_pendiente": int(row["rollover_pendiente"] or 0) // 100 if completo else None,
        "apuestas_activas": activas,
        "psp_activa": psp_ok,
        "bb_activa": bb_ok,
    }


@app.post("/api/me/apuestas")
async def mis_apuestas(request: Request):
    """Apuestas del usuario. Lista vacía si no está registrado."""
    body = await request.json()
    user = validar_init_data(body.get("init_data",""))
    if not user or not user.get("id"):
        return {"apuestas": [], "autenticado": False}

    tg_id = str(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow(
            "SELECT id FROM users WHERE id::text=$1 OR telegram_id::text=$1", tg_id)
        if not u:
            return {"apuestas": [], "autenticado": True, "registrado": False}
        # Las 'pending' son las apuestas reservadas: el cliente las armo
        # desde la app y las va a pagar en una agencia. Antes se filtraban
        # y por eso no aparecian nunca en Mis apuestas.
        rows = await conn.fetch("""
            SELECT code, picks, stake, odd_total, potential_win, status,
                   created_at, expires_at, con_bono
            FROM betslips
            WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 30
        """, u["id"])

    salida = []
    for r in rows:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        salida.append({
            "code": r["code"],
            "picks": picks,
            "resumen": " + ".join(
                p.get("sel","") for p in picks[:2] if isinstance(p, dict)) or "—",
            "stake": r["stake"] or 0,
            "odd_total": float(r["odd_total"]) if r["odd_total"] else 1,
            "potential_win": r["potential_win"] or 0,
            "status": r["status"],
            "mode": "local",
            "con_bono": bool(r["con_bono"]),
            "reservada": r["status"] == "pending",
            "vence": r["expires_at"].strftime("%d/%m %H:%M") if r["expires_at"] else None,
            "fecha": r["created_at"].strftime("%d/%m %H:%M") if r["created_at"] else "",
        })
    return {"apuestas": salida, "autenticado": True, "registrado": True}


# ── AUTO-LIQUIDACIÓN POR RESULTADOS ───────────────────────────
# The Odds API da el marcador final en /scores. Con eso se resuelven
# los mercados que dependen solo del resultado: 1X2, Over/Under de goles
# y ambos-anotan. Córners, tarjetas y goleadores NO (el marcador no
# alcanza) y quedan para el botón manual.

def _norm(t):
    return "".join(c for c in (t or "").lower() if c.isalnum())


def resolver_pick_sr(pick, sh, sa, home, away, stats_home=None, stats_away=None):
    """Resuelve un pick usando el marcador Y las estadísticas de Sportradar.
    Extiende resolver_pick para córners, tarjetas y tiros cuando hay stats.
    Devuelve True (ganó), False (perdió) o None (no se puede resolver)."""
    import re
    sel = (pick.get("sel") or pick.get("label") or "").strip()
    low = sel.lower()
    sh_home = stats_home or {}
    sh_away = stats_away or {}

    def _stat(campo):
        """Suma la stat de ambos equipos (o None si no hay)."""
        vh, va = sh_home.get(campo), sh_away.get(campo)
        if vh is None and va is None:
            return None, None, None
        vh = vh or 0; va = va or 0
        return vh, va, vh + va

    def _over_under(total):
        m = re.search(r"m[áa]s de\s*([\d.]+)", low) or re.search(r"over\s*([\d.]+)", low)
        if m: return total > float(m.group(1))
        m = re.search(r"menos de\s*([\d.]+)", low) or re.search(r"under\s*([\d.]+)", low)
        if m: return total < float(m.group(1))
        return None

    # Córners (Sportradar: 'corner_kicks')
    if "córner" in low or "corner" in low:
        vh, va, tot = _stat("corner_kicks")
        if tot is None: return None
        r = _over_under(tot)
        if r is not None: return r
        return None

    # Tarjetas (amarillas + rojas)
    if "tarjeta" in low or "card" in low:
        yh, ya, yt = _stat("yellow_cards")
        rh, ra, rt = _stat("red_cards")
        if yt is None and rt is None: return None
        tot = (yt or 0) + (rt or 0)
        r = _over_under(tot)
        if r is not None: return r
        return None

    # Tiros (al arco: 'shots_on_target', totales: 'shots_total')
    if "tiro" in low or "remate" in low or "shot" in low:
        campo = "shots_on_target" if ("al arco" in low or "on target" in low or "al goal" in low) else "shots_total"
        vh, va, tot = _stat(campo)
        if tot is None: return None
        r = _over_under(tot)
        if r is not None: return r
        return None

    # Para el resto, usar el resolver de goles normal
    return resolver_pick(pick, sh, sa, home, away)


def resolver_pick(pick, sh, sa, home, away):
    """
    Decide si un pick ganó (True), perdió (False) o no se puede
    resolver con el marcador (None).
    pick = {'sel': 'River gana' | 'Más de 2.5' | 'Ambos anotan: Sí' ...}
    sh, sa = goles local y visitante (int)
    """
    sel = (pick.get("sel") or pick.get("label") or "").strip()
    low = sel.lower()
    total = sh + sa

    # 1X2 / ganador
    if _norm(home) in _norm(sel) and ("gana" in low or _norm(sel)==_norm(home)):
        return sh > sa
    if _norm(away) in _norm(sel) and ("gana" in low or _norm(sel)==_norm(away)):
        return sa > sh
    if "empate" in low or low == "draw":
        return sh == sa
    if "doble" in low:  # doble oportunidad: no la resolvemos sola
        return None

    # Estos mercados usan "más/menos" pero NO se resuelven con el marcador
    # de goles: córners, tarjetas, tiros, hándicaps. Los excluimos primero.
    NO_ES_GOLES = ("córner","corner","tarjeta","card","tiro","remate",
                   "shot","hándicap","handicap","spread","gol de","1er tiempo",
                   "primer tiempo","half")
    if any(t in low for t in NO_ES_GOLES):
        return None

    # Más / Menos de goles (totales del partido)
    import re
    m = re.search(r"m[áa]s de\s*([\d.]+)", low) or re.search(r"over\s*([\d.]+)", low)
    if m:
        return total > float(m.group(1))
    m = re.search(r"menos de\s*([\d.]+)", low) or re.search(r"under\s*([\d.]+)", low)
    if m:
        return total < float(m.group(1))

    # Ambos anotan (btts). Ojo: "anotan" contiene "no", así que hay que
    # detectar la negación por el sufijo ": no" / " no", no por "no" suelto.
    if "ambos" in low or "btts" in low:
        ambos = sh > 0 and sa > 0
        niega = low.rstrip().endswith("no") or ": no" in low or "= no" in low
        return (not ambos) if niega else ambos

    # Córners, tarjetas, goleadores, hándicaps: el marcador no alcanza
    return None


async def _traer_resultados(sport_ids):
    """
    Trae resultados finales. sport_ids es {sport_key: [event_id, ...]}.
    Usamos el parámetro eventIds para pedir solo los partidos que nos
    interesan, en vez de todos los del deporte.
    """
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    resultados = {}
    async with httpx.AsyncClient(timeout=15) as client:
        async def uno(sk, ids):
            params = {"apiKey": ODDS_API_KEY, "daysFrom": 3}
            if ids:
                params["eventIds"] = ",".join(ids)
            d = await odds_get(client, f"/v4/sports/{sk}/scores/", params)
            return d
        tareas = [uno(sk, ids) for sk, ids in sport_ids.items()]
        for fut in asyncio.as_completed(tareas):
            data = await fut
            for ev in (data or []):
                if ev.get("completed") and ev.get("scores"):
                    resultados[ev["id"]] = ev
    return resultados


@app.post("/api/agencias/me/auto-liquidar")
async def auto_liquidar(agencia_code: str = Depends(requiere_agencia)):
    """
    Liquida automáticamente las apuestas pendientes cuyos partidos ya
    terminaron y cuyos mercados se resuelven con el marcador.
    Devuelve un resumen: cuántas ganaron, perdieron y cuántas quedan
    para revisar a mano.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        pendientes = await conn.fetch("""
            SELECT b.code, b.picks, b.potential_win
            FROM betslips b
            JOIN agencia_tickets at ON at.betslip_code = b.code
            WHERE at.agencia_code = $1
              AND b.resultado IS NULL
              AND b.created_at > NOW() - interval '4 days'
        """, agencia_code)

    if not pendientes:
        return {"revisadas": 0, "ganadas": 0, "perdidas": 0,
                "sin_resolver": 0, "mensaje": "No hay apuestas pendientes"}

    # Mapa sport_key -> {event_ids} para pedir solo lo necesario
    sport_ids, boletos = {}, []
    for r in pendientes:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        for p in picks:
            if isinstance(p, dict) and p.get("sport_key") and p.get("event_id"):
                sport_ids.setdefault(p["sport_key"], set()).add(p["event_id"])
        boletos.append((r["code"], picks, r["potential_win"]))

    # convertir sets a listas
    sport_ids = {k: list(v) for k, v in sport_ids.items()}
    resultados = await _traer_resultados(sport_ids) if sport_ids else {}

    ganadas = perdidas = sin_resolver = 0
    async with pool.acquire() as conn:
        for code, picks, premio in boletos:
            estados = []
            for p in picks:
                if not isinstance(p, dict):
                    estados.append(None); continue
                res = resultados.get(p.get("event_id") or p.get("id"))
                if not res:
                    estados.append(None); continue
                sh = sa = None
                for sc in res.get("scores", []):
                    if _norm(sc["name"]) == _norm(res["home_team"]):
                        sh = int(sc["score"])
                    elif _norm(sc["name"]) == _norm(res["away_team"]):
                        sa = int(sc["score"])
                if sh is None or sa is None:
                    estados.append(None); continue
                estados.append(resolver_pick(p, sh, sa,
                                             res["home_team"], res["away_team"]))

            # Una combinada: si algún pick no se puede resolver, queda manual.
            # Si todos resueltos: gana solo si TODOS ganaron.
            if any(e is None for e in estados) or not estados:
                sin_resolver += 1
                continue
            gano = all(e is True for e in estados)
            await conn.execute("""
                UPDATE betslips
                SET resultado=$2, liquidado_at=NOW(), liquidado_por='auto'
                WHERE code=$1
            """, code, "ganada" if gano else "perdida")
            if gano: ganadas += 1
            else:    perdidas += 1

    return {
        "revisadas": len(boletos),
        "ganadas": ganadas,
        "perdidas": perdidas,
        "sin_resolver": sin_resolver,
        "mensaje": f"{ganadas} ganadas, {perdidas} perdidas. "
                   f"{sin_resolver} quedan para revisar a mano.",
    }


# ── LIQUIDACIÓN Y PAGO DE PREMIOS (manual) ────────────────────
@app.post("/api/agencias/me/liquidar")
async def liquidar_apuesta(request: Request,
                           agencia_code: str = Depends(requiere_agencia)):
    """
    Marca una apuesta como ganada o perdida. No mueve plata todavía:
    el pago del premio es un paso aparte, para que el cajero controle
    antes de entregar el efectivo.
    """
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    resultado = body.get("resultado")   # 'ganada' | 'perdida'
    if resultado not in ("ganada", "perdida"):
        raise HTTPException(400, "Resultado inválido")
    if not code:
        raise HTTPException(400, "Falta el código")

    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM betslips WHERE code=$1", code)
        if not row:
            raise HTTPException(404, "Código no encontrado")
        await conn.execute("""
            UPDATE betslips
            SET resultado = $2, liquidado_at = NOW(), liquidado_por = $3
            WHERE code = $1
        """, code, resultado, agencia_code)
    return {"ok": True, "code": code, "resultado": resultado,
            "premio": row["potential_win"] if resultado == "ganada" else 0}


@app.post("/api/agencias/me/pagar-premio")
async def pagar_premio(request: Request,
                       agencia_code: str = Depends(requiere_agencia)):
    """
    Paga el premio de una apuesta ganada: registra el movimiento y,
    si el boleto tiene dueño, le suma el premio al saldo.
    El índice único mov_premio_unico impide pagarlo dos veces.
    """
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(400, "Falta el código")

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT * FROM betslips WHERE code=$1 FOR UPDATE", code)
            if not row:
                raise HTTPException(404, "Código no encontrado")
            if row["resultado"] != "ganada":
                raise HTTPException(400,
                    "La apuesta no está marcada como ganada")
            if row["pagado_at"]:
                raise HTTPException(409, "El premio ya fue pagado")

            premio = int(row["potential_win"] or 0)
            try:
                await conn.execute("""
                    INSERT INTO agencia_movimientos
                        (agencia_code, tipo, user_id, betslip_code,
                         monto, detalle, operador)
                    VALUES ($1, 'pago_premio', $2, $3, $4,
                            'Premio apuesta ganada', $1)
                """, agencia_code, row["user_id"], code, premio)
            except asyncpg.UniqueViolationError:
                raise HTTPException(409, "El premio ya fue pagado")

            await conn.execute("""
                UPDATE betslips
                SET pagado_at = NOW(), pagado_por = $2, status = 'paid'
                WHERE code = $1
            """, code, agencia_code)

            # Si el boleto es de un usuario, el premio va a su saldo
            if row["user_id"]:
                await conn.execute(
                    "UPDATE users SET balance = balance + $2 WHERE id = $1",
                    row["user_id"], premio * 100)

            # Cuenta corriente: al pagar el premio, el saldo de la agencia SUBE
            # (puso plata de su caja, el sistema se la reconoce).
            await _mover_cc(conn, agencia_code, premio, "pago_premio",
                            f"Premio pagado {code}", agencia_code,
                            contra=code, validar=False)
        # Aviso por Telegram al cliente ganador (si tiene vinculado)
        if row["user_id"]:
            await avisar_cliente(conn, row["user_id"],
                f"🎉 ¡Ganaste! Tu apuesta {code} fue premiada.\n"
                f"Premio: ${premio:,.0f} ARS acreditado en tu cuenta.".replace(",","."))
    return {"ok": True, "code": code, "pagado": premio}


# ── CLIENTES DE AGENCIA: alta, búsqueda y carga de saldo ──────
@app.get("/api/agencias/me/usuarios")
async def buscar_usuarios(q: str = "", limite: int = 20,
                          agencia_code: str = Depends(requiere_agencia)):
    """
    Busca usuarios por documento, nombre, usuario o telegram_id.
    Con q vacío devuelve los últimos que creó esta agencia.
    """
    limite = max(1, min(int(limite), 50))
    pool = await get_db()
    async with pool.acquire() as conn:
        if q.strip():
            patron = f"%{q.strip().lower()}%"
            rows = await conn.fetch("""
                SELECT id, username, nombre_completo, documento, telefono,
                       telegram_id, balance, creado_por, created_at
                FROM users
                WHERE lower(COALESCE(documento,''))       LIKE $1
                   OR lower(COALESCE(nombre_completo,''))  LIKE $1
                   OR lower(COALESCE(username,''))         LIKE $1
                   OR CAST(telegram_id AS TEXT)            LIKE $1
                ORDER BY created_at DESC NULLS LAST
                LIMIT $2
            """, patron, limite)
        else:
            rows = await conn.fetch("""
                SELECT id, username, nombre_completo, documento, telefono,
                       telegram_id, balance, creado_por, created_at
                FROM users
                WHERE creado_por = $1
                ORDER BY created_at DESC NULLS LAST
                LIMIT $2
            """, agencia_code, limite)
    return {"usuarios": [{
        "id": r["id"],
        "username": r["username"],
        "nombre": r["nombre_completo"] or r["username"] or "Sin nombre",
        "documento": r["documento"],
        "telefono": r["telefono"],
        "telegram_id": r["telegram_id"],
        "saldo": int(r["balance"] or 0) // 100,
        "de_esta_agencia": r["creado_por"] == agencia_code,
        "tiene_telegram": r["telegram_id"] is not None,
    } for r in rows]}


@app.post("/api/admin/usuarios")
async def admin_crear_usuario(request: Request, _=Depends(auth.require_admin)):
    """El admin da de alta un cliente. Puede colgar del admin (sin agencia)
    o asignarse a una agencia si viene 'agencia_code'."""
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:120]
    doc    = (body.get("documento") or "").strip()[:40] or None
    tel    = (body.get("telefono") or "").strip()[:40] or None
    dueno  = (body.get("agencia_code") or "").strip().upper() or "admin"
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")

    pool = await get_db()
    async with pool.acquire() as conn:
        if dueno != "admin":
            existe_ag = await conn.fetchval(
                "SELECT 1 FROM agencias WHERE code=$1", dueno)
            if not existe_ag:
                raise HTTPException(404, "Agencia no encontrada")
        if doc:
            existe = await conn.fetchrow(
                "SELECT id FROM users WHERE documento = $1", doc)
            if existe:
                raise HTTPException(409, "Ya existe un usuario con ese documento")
        # Moneda: si lo crea una agencia, hereda la de esa agencia; admin => ARS
        moneda = "ARS"
        if dueno != "admin":
            moneda = await conn.fetchval(
                "SELECT moneda FROM agencias WHERE code=$1", dueno) or "ARS"
        base_user = "loc_" + (doc or str(int(time.time())))
        fake_tg = -(int(time.time() * 1000) % 2_000_000_000)
        row = await conn.fetchrow("""
            INSERT INTO users
                (username, nombre_completo, documento, telefono, telegram_id,
                 balance, creado_por, moneda, created_at)
            VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NOW())
            RETURNING id
        """, base_user, nombre, doc, tel, fake_tg, dueno, moneda)
    return {"id": row["id"], "nombre": nombre, "documento": doc,
            "creado_por": dueno, "moneda": moneda, "saldo": 0, "creado": True}


@app.post("/api/agencias/me/usuarios")
async def crear_usuario(request: Request,
                        agencia_code: str = Depends(requiere_agencia)):
    """Da de alta un cliente en el mostrador."""
    body = await request.json()
    nombre = (body.get("nombre") or "").strip()[:120]
    doc    = (body.get("documento") or "").strip()[:40] or None
    tel    = (body.get("telefono") or "").strip()[:40] or None
    # El cajero elige usuario y clave: son las credenciales con las que
    # el cliente entra al sitio web. El documento es opcional.
    uname  = (body.get("username") or "").strip().lower()[:40]
    passwd = body.get("password") or ""

    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")
    if not uname:
        raise HTTPException(400, "El usuario es obligatorio")
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", uname):
        raise HTTPException(400,
            "El usuario admite letras, números, punto, guion y guion bajo (3 a 40)")
    if len(passwd) < 6:
        raise HTTPException(400, "La clave debe tener al menos 6 caracteres")

    pool = await get_db()
    async with pool.acquire() as conn:
        if doc:
            existe = await conn.fetchrow(
                "SELECT id FROM users WHERE documento = $1", doc)
            if existe:
                raise HTTPException(409, "Ya existe un usuario con ese documento")
        # El usuario tiene que ser único en TODA la tabla, no solo en la
        # agencia: es con lo que se entra al sitio.
        if await conn.fetchval("SELECT 1 FROM users WHERE LOWER(username)=$1", uname):
            raise HTTPException(409,
                f"El usuario '{uname}' ya está tomado. Probá con otro.")
        # Y no puede chocar con el de una agencia, que usa el mismo login
        if await conn.fetchval("SELECT 1 FROM agencias WHERE LOWER(username)=$1", uname):
            raise HTTPException(409,
                f"El usuario '{uname}' ya está tomado. Probá con otro.")

        # El cliente hereda la moneda de la agencia (no se puede cambiar)
        moneda = await conn.fetchval(
            "SELECT moneda FROM agencias WHERE code=$1", agencia_code) or "ARS"
        # telegram_id es NOT NULL; cliente de mostrador no tiene Telegram
        fake_tg = -(int(time.time() * 1000) % 2_000_000_000)
        try:
            row = await conn.fetchrow("""
                INSERT INTO users
                    (username, nombre_completo, documento, telefono,
                     telegram_id, balance, creado_por, moneda,
                     password_hash, created_at)
                VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, NOW())
                RETURNING id
            """, uname, nombre, doc, tel, fake_tg, agencia_code, moneda,
                 auth.hash_password(passwd))
        except Exception as e:
            # Sin esto el fallo salía como 500 mudo y no había forma de
            # saber qué columna o restricción lo causó.
            log.error(f"[ALTA] no se pudo crear el cliente {uname}: "
                      f"{type(e).__name__}: {e}")
            raise HTTPException(500,
                f"No se pudo crear el cliente: {str(e)[:200]}")
    return {"id": row["id"], "nombre": nombre, "documento": doc,
            "username": uname, "moneda": moneda, "saldo": 0, "creado": True}


@app.post("/api/agencias/me/cargar")
async def cargar_saldo(request: Request,
                       agencia_code: str = Depends(requiere_agencia)):
    """
    Carga (o descuenta) saldo a un usuario y lo deja registrado en
    agencia_movimientos. Un monto negativo es un retiro.
    """
    body = await request.json()
    try:
        user_id = int(body.get("user_id"))
        monto   = int(body.get("monto"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Datos inválidos")
    if monto == 0:
        raise HTTPException(400, "El monto no puede ser cero")
    if abs(monto) > 5_000_000:
        raise HTTPException(400, "Monto fuera de rango")
    detalle = (body.get("detalle") or "").strip()[:200] or None

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            u = await conn.fetchrow(
                "SELECT id, balance FROM users WHERE id = $1 FOR UPDATE", user_id)
            if not u:
                raise HTTPException(404, "Usuario no encontrado")
            # monto va en pesos; balance en centavos
            nuevo = u["balance"] + monto * 100
            if nuevo < 0:
                raise HTTPException(400, "Saldo insuficiente para el retiro")
            # Cuenta corriente de la agencia: cargar crédito le baja el saldo,
            # retirar se lo devuelve. Si no tiene saldo para cargar, corta.
            await _mover_cc(conn, agencia_code, -monto,
                            "carga_cliente" if monto > 0 else "retiro_cliente",
                            f"{'Carga a' if monto>0 else 'Retiro de'} cliente #{user_id}",
                            agencia_code, contra=str(user_id),
                            validar=(monto > 0))
            await conn.execute(
                "UPDATE users SET balance = $2 WHERE id = $1", user_id, nuevo)
            await conn.execute("""
                INSERT INTO agencia_movimientos
                    (agencia_code, tipo, user_id, monto, detalle, operador)
                VALUES ($1, $2, $3, $4, $5, $1)
            """, agencia_code, "carga" if monto > 0 else "retiro",
                user_id, abs(monto), detalle)
            # Bono automático: si el depósito dispara un bono, se otorga acá
            bono_otorgado = None
            if monto > 0:
                try:
                    bono_otorgado = await _intentar_otorgar_bono_auto(
                        conn, user_id, agencia_code, "primer_deposito", monto)
                    if not bono_otorgado:
                        bono_otorgado = await _intentar_otorgar_bono_auto(
                            conn, user_id, agencia_code, "cualquier_deposito", monto)
                except Exception as e:
                    log.error(f"[BONO] auto error: {e}")
        # Aviso por Telegram al cliente (si tiene vinculado)
        if monto > 0:
            msg_carga = (f"💰 Te cargaron ${monto:,.0f} en tu cuenta QuartzPlay.\n"
                f"Saldo actual: ${nuevo//100:,.0f} ARS".replace(",","."))
            if bono_otorgado:
                msg_carga += (f"\n\n🎁 ¡Recibiste un bono de ${bono_otorgado['monto']:,.0f}! "
                    f"Jugalo para liberarlo.".replace(",","."))
            await avisar_cliente(conn, user_id, msg_carga)
        else:
            await avisar_cliente(conn, user_id,
                f"➖ Se retiraron ${abs(monto):,.0f} de tu cuenta.\n"
                f"Saldo actual: ${nuevo//100:,.0f} ARS".replace(",","."))
    return {"ok": True, "saldo": nuevo // 100,
            "bono": bono_otorgado,
            "movimiento": "carga" if monto > 0 else "retiro"}


@app.get("/api/agencias/me/usuarios/{user_id}/movimientos")
async def movimientos_usuario(user_id: int,
                              agencia_code: str = Depends(requiere_agencia)):
    """Historial de cargas, retiros y premios de un usuario."""
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow(
            "SELECT nombre_completo, username, balance FROM users WHERE id=$1",
            user_id)
        if not u:
            raise HTTPException(404, "Usuario no encontrado")
        rows = await conn.fetch("""
            SELECT tipo, monto, detalle, betslip_code, agencia_code, created_at
            FROM agencia_movimientos
            WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 50
        """, user_id)
    return {
        "nombre": u["nombre_completo"] or u["username"] or "Usuario",
        "saldo": int(u["balance"] or 0) // 100,
        "movimientos": [{
            "tipo": r["tipo"],
            "monto": r["monto"],
            "detalle": r["detalle"],
            "betslip": r["betslip_code"],
            "fecha": r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else "",
        } for r in rows],
    }


# ── AGENCIA — DATOS REALES DE CAJA ────────────────────────────
@app.get("/api/agencias/me/tickets")
async def mis_tickets(limite: int = 50,
                      agencia_code: str = Depends(requiere_agencia)):
    """Últimos tickets emitidos por la agencia de la sesión."""
    limite = max(1, min(int(limite), 200))
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT at.betslip_code, at.tipo, at.stake, at.potential_win,
                   at.created_at, b.status, b.odd_total,
                   b.resultado, b.pagado_at,
                   COALESCE(u.username, b.cliente_nombre) AS cliente
            FROM agencia_tickets at
            LEFT JOIN betslips b ON b.code = at.betslip_code
            LEFT JOIN users u    ON u.id   = b.user_id
            WHERE at.agencia_code = $1
            ORDER BY at.created_at DESC
            LIMIT $2
        """, agencia_code, limite)
    return {"tickets": [
        {"code": r["betslip_code"],
         "tipo": r["tipo"],
         "stake": r["stake"] or 0,
         "potential_win": r["potential_win"] or 0,
         "odd_total": float(r["odd_total"]) if r["odd_total"] else None,
         "estado": r["status"] or "—",
         "resultado": r["resultado"],
         "pagado": r["pagado_at"] is not None,
         "cliente": r["cliente"] or "Cliente mostrador",
         "fecha": r["created_at"].strftime("%d/%m %H:%M") if r["created_at"] else "",
        } for r in rows]}


@app.get("/api/agencias/me/cierre")
async def mi_cierre(desde: str = None, hasta: str = None,
                    agencia_code: str = Depends(requiere_agencia)):
    """
    Cierre de caja real: tickets vendidos, premios pagados y cargas
    de saldo hechas en el mostrador.
    """
    # asyncpg exige datetime.date cuando la consulta dice ::date.
    # Pasarle el string suelto tiraba un 500 que el navegador mostraba
    # como "sin conexión con el servidor".
    def a_fecha(txt):
        if not txt:
            return None
        try:
            return datetime.strptime(txt[:10], "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, f"Fecha inválida: {txt}")

    d1, d2 = a_fecha(desde), a_fecha(hasta)

    cond, args = ["agencia_code = $1"], [agencia_code]
    if d1:
        # created_at es timestamptz; lo pasamos a ::date para comparar
        # fecha contra fecha, sin problemas de hora ni de zona horaria.
        args.append(d1); cond.append(f"created_at::date >= ${len(args)}")
    if d2:
        args.append(d2); cond.append(f"created_at::date <= ${len(args)}")
    where = " AND ".join(cond)

    pool = await get_db()
    async with pool.acquire() as conn:
        tk = await conn.fetchrow(f"""
            SELECT COUNT(*)                              AS tickets,
                   COUNT(*) FILTER (WHERE tipo='bot')    AS tickets_bot,
                   COUNT(*) FILTER (WHERE tipo='manual') AS tickets_manual,
                   COUNT(*) FILTER (WHERE tipo='box')    AS tickets_box,
                   COALESCE(SUM(stake),0)                AS cobrado,
                   COALESCE(SUM(potential_win),0)        AS expuesto,
                   MIN(created_at)                       AS primero,
                   MAX(created_at)                       AS ultimo
            FROM agencia_tickets
            WHERE {where}
        """, *args)

        mv = await conn.fetchrow(f"""
            SELECT
              COALESCE(SUM(monto) FILTER (WHERE tipo='pago_premio'),0) AS premios,
              COUNT(*)           FILTER (WHERE tipo='pago_premio')     AS premios_n,
              COALESCE(SUM(monto) FILTER (WHERE tipo='carga'),0)       AS cargas,
              COUNT(*)           FILTER (WHERE tipo='carga')           AS cargas_n,
              COALESCE(SUM(monto) FILTER (WHERE tipo='retiro'),0)      AS retiros,
              COUNT(*)           FILTER (WHERE tipo='retiro')          AS retiros_n
            FROM agencia_movimientos
            WHERE {where}
        """, *args)

    cobrado = int(tk["cobrado"] or 0)
    premios = int(mv["premios"] or 0)
    cargas  = int(mv["cargas"] or 0)
    retiros = int(mv["retiros"] or 0)

    return {
        "tickets":         tk["tickets"] or 0,
        "tickets_bot":     tk["tickets_bot"] or 0,
        "tickets_manual":  tk["tickets_manual"] or 0,
        "tickets_box":     tk["tickets_box"] or 0,
        "cobrado":         cobrado,
        "expuesto":        int(tk["expuesto"] or 0),
        "pagado":          premios,
        "premios_n":       mv["premios_n"] or 0,
        "cargas":          cargas,
        "cargas_n":        mv["cargas_n"] or 0,
        "retiros":         retiros,
        "retiros_n":       mv["retiros_n"] or 0,
        # Lo que tiene que haber en la caja: entra plata por apuestas y
        # cargas, sale por premios y retiros.
        "neto":            cobrado + cargas - premios - retiros,
        "primero": tk["primero"].strftime("%d/%m/%Y %H:%M") if tk["primero"] else None,
        "ultimo":  tk["ultimo"].strftime("%d/%m/%Y %H:%M")  if tk["ultimo"]  else None,
    }


# ── FOOTBALL LIVE SCORES ──────────────────────────────────────
FOOTBALL_API = "https://free-api-live-football-data.p.rapidapi.com"
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY","")
FOOTBALL_HEADERS = {
    "x-rapidapi-host": "free-api-live-football-data.p.rapidapi.com",
    "x-rapidapi-key":  RAPIDAPI_KEY,
    "Content-Type":    "application/json",
}

_football_cache = {}
FOOTBALL_TTL = 30  # 30 segundos de caché

# ── CONFIGURACIÓN DE CUOTAS ───────────────────────────────────
# IMPORTANTE: el endpoint masivo /v4/sports/{sport}/odds SOLO acepta los
# mercados "destacados": h2h, spreads, totals, outrights.
# Pedir btts (u otro adicional) devuelve HTTP 422 y se cae la respuesta
# ENTERA de ese deporte — te quedás sin ninguna cuota, no solo sin btts.
# Los mercados adicionales van por /events/{id}/odds, uno por evento.
MERCADOS_VALIDOS  = {"h2h", "spreads", "totals", "outrights"}
ODDS_MARKETS      = os.environ.get("ODDS_MARKETS", "h2h,totals,spreads")
# Plan de 15M créditos/mes: no hace falta racionar. Todo al tope.
ODDS_SPORTS_LIMIT = int(os.environ.get("ODDS_SPORTS_LIMIT", "80"))
ODDS_TTL_PREMATCH = int(os.environ.get("ODDS_TTL_PREMATCH", "180"))
ODDS_TTL_LIVE     = int(os.environ.get("ODDS_TTL_LIVE", "45"))
ODDS_FULL_TOP     = int(os.environ.get("ODDS_FULL_TOP", "80"))
ODDS_MAX_EVENTOS  = int(os.environ.get("ODDS_MAX_EVENTOS", "40"))
# En vivo refresca cada 30s. Con los 80 deportes se iría a 20M/mes,
# así que acá van los que de verdad se juegan en vivo.
ODDS_LIVE_SPORTS  = int(os.environ.get("ODDS_LIVE_SPORTS", "20"))

# Mercados adicionales: NO viajan en el endpoint masivo, hay que pedirlos
# evento por evento. Por eso se traen a demanda cuando el usuario despliega
# un partido, y no de entrada para todo el catálogo.
# Claves EXACTAS según la documentación de The Odds API.
# Las que había antes (totals_corners, spreads_cards...) no existen:
# los mercados de córners y tarjetas se llaman todos "alternate_*".
MERCADOS_CANDIDATOS = [
    # Resultado
    "btts", "btts_h1", "double_chance", "double_chance_h1",
    "draw_no_bet", "h2h_3_way", "halftime_fulltime", "to_qualify",
    "correct_score", "correct_score_h1",
    # Líneas alternativas
    "alternate_totals", "alternate_spreads",
    "team_totals", "alternate_team_totals",
    # Primer tiempo
    "h2h_h1", "totals_h1", "spreads_h1",
    # Córners
    "alternate_totals_corners", "alternate_spreads_corners",
    "alternate_team_totals_corners", "corners_1x2",
    # Tarjetas
    "alternate_totals_cards", "alternate_spreads_cards",
    # Goleadores y jugadores (solo casas de US, y en las 6 ligas grandes)
    "player_goal_scorer_anytime", "player_first_goal_scorer",
    "player_last_goal_scorer", "player_to_receive_card",
    "player_to_receive_red_card", "player_shots_on_target",
    "player_shots", "player_assists",
]
MERCADOS_EXTRA = os.environ.get(
    "ODDS_MERCADOS_EXTRA", ",".join(MERCADOS_CANDIDATOS))

# La doc lo dice claro: los props de jugador de fútbol solo están en casas
# de Estados Unidos. Sin "us" en las regiones no aparece ningún goleador.
ODDS_REGIONS_EXTRA = os.environ.get("ODDS_REGIONS_EXTRA", "us,uk,eu")

# Y esto explica por qué Prematch no mostraba Over/Under ni Hándicap:
# "spreads and totals are mainly available for US sports and bookmakers".
# Pidiendo solo regions=eu, el fútbol venía con 1X2 y nada más.
ODDS_REGIONS = os.environ.get("ODDS_REGIONS", "eu,us")
ODDS_TTL_EVENTO = int(os.environ.get("ODDS_TTL_EVENTO", "120"))

# Filtra lo que no sirva, así una variable mal puesta no deja la app sin cuotas
_pedidos = [m.strip() for m in ODDS_MARKETS.split(",") if m.strip()]
_invalidos = [m for m in _pedidos if m not in MERCADOS_VALIDOS]
if _invalidos:
    log.error(f"ODDS_MARKETS tiene mercados no soportados por el endpoint "
              f"masivo: {_invalidos}. Se ignoran.")
    _pedidos = [m for m in _pedidos if m in MERCADOS_VALIDOS]
ODDS_MARKETS = ",".join(_pedidos) or "h2h"

def parse_markets(ev):
    """
    Junta los mercados de TODOS los bookmakers, quedándose con la mejor
    cuota de cada resultado.

    El código anterior cortaba en el primer bookmaker con datos: si ese
    solo traía 1X2, el Over/Under y el BTTS del resto se perdían. Por eso
    la oferta llegaba incompleta.
    """
    markets = {}
    for bm in ev.get("bookmakers", []):
        for mkt in bm.get("markets", []):
            key = mkt.get("key")
            if not key:
                continue
            destino = markets.setdefault(key, {})
            for o in mkt.get("outcomes", []):
                nombre = o.get("name", "")
                # Over/Under y hándicap necesitan la línea en el nombre:
                # sin esto quedaba "Over" pelado y el front mostraba "Más ".
                punto = o.get("point")
                if punto is not None:
                    nombre = f"{nombre} {punto}"
                try:
                    precio = round(float(o["price"]), 2)
                except (KeyError, TypeError, ValueError):
                    continue
                if precio > destino.get(nombre, 0):
                    destino[nombre] = precio
    return markets

@app.get("/api/live/football")
async def live_football():
    """Partidos de fútbol en vivo con scores en tiempo real"""
    now = time.time()
    if "live" in _football_cache:
        data, ts = _football_cache["live"]
        if now - ts < FOOTBALL_TTL:
            return data
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-current-live",
                headers=FOOTBALL_HEADERS,
            )
            if r.status_code == 200:
                data = r.json()
                _football_cache["live"] = (data, now)
                return data
            log.warning(f"Football API status: {r.status_code}")
    except Exception as e:
        log.error(f"Football API error: {e}")
    return {"response": [], "error": "No disponible"}

@app.get("/api/live/football/{match_id}")
async def live_football_match(match_id: str):
    """Detalle completo de un partido en vivo"""
    cache_key = f"match_{match_id}"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < FOOTBALL_TTL:
            return data
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-get-live-match-by-id",
                headers=FOOTBALL_HEADERS,
                params={"matchId": match_id},
            )
            if r.status_code == 200:
                data = r.json()
                _football_cache[cache_key] = (data, now)
                return data
    except Exception as e:
        log.error(f"Football match error: {e}")
    return {"error": "No disponible"}

@app.get("/api/live/football/league/{league_id}")
async def live_football_league(league_id: str):
    """Partidos en vivo de una liga específica"""
    cache_key = f"league_{league_id}"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < FOOTBALL_TTL:
            return data
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-get-live-matches-by-league",
                headers=FOOTBALL_HEADERS,
                params={"leagueId": league_id},
            )
            if r.status_code == 200:
                data = r.json()
                _football_cache[cache_key] = (data, now)
                return data
    except Exception as e:
        log.error(f"Football league error: {e}")
    return {"error": "No disponible"}


# ── LOGOS DE EQUIPOS ──────────────────────────────────────────
# El proxy anterior guardaba None en la caché cuando conseguía la imagen,
# así que el "if cached" daba falso y volvía a pegarle a RapidAPI en CADA
# logo. Con 40 partidos en pantalla eran 80 llamadas por carga.
_logo_bytes  = {}   # team_id -> (bytes, content_type, ts)
_logo_nombre = {}   # nombre normalizado -> (team_id | None, ts)
LOGO_TTL       = 86400      # la imagen no cambia: 24 h
LOGO_TTL_FALLO = 3600       # si no se encontró, no reintentar por 1 h
LOGO_MAX_BYTES = 300 * 1024

_ESCUDO_GENERICO = (
    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
    b'width="48" height="48"><circle cx="12" cy="12" r="10" fill="#7C3AED" '
    b'opacity="0.3" stroke="#7C3AED" stroke-width="1.5"/>'
    b'<circle cx="12" cy="12" r="4" fill="#00F0FF" opacity="0.8"/></svg>'
)

def _resp_generico():
    from fastapi.responses import Response
    return Response(content=_ESCUDO_GENERICO, media_type="image/svg+xml",
                    status_code=404,
                    headers={"Cache-Control":"public, max-age=3600",
                             "Access-Control-Allow-Origin":"*"})


async def _bajar_logo(team_id: str):
    """Trae la imagen del escudo y la deja en memoria."""
    now = time.time()
    hit = _logo_bytes.get(team_id)
    if hit and now - hit[2] < LOGO_TTL:
        return hit[0], hit[1]
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.get(f"{FOOTBALL_API}/football-team-logo",
                            headers=FOOTBALL_HEADERS,
                            params={"teamid": team_id})
            if r.status_code != 200:
                return None, None
            ctype = r.headers.get("content-type","")
            if "image" in ctype and len(r.content) <= LOGO_MAX_BYTES:
                _logo_bytes[team_id] = (r.content, ctype, now)
                return r.content, ctype
            # A veces responde JSON con la URL de la imagen
            try:
                url = (r.json().get("url") or r.json().get("logo")
                       or r.json().get("image"))
            except Exception:
                url = None
            if url:
                img = await c.get(url)
                if img.status_code == 200 and len(img.content) <= LOGO_MAX_BYTES:
                    ctype = img.headers.get("content-type","image/png")
                    _logo_bytes[team_id] = (img.content, ctype, now)
                    return img.content, ctype
    except Exception as e:
        log.error(f"Logo {team_id}: {e}")
    return None, None


async def buscar_team_id(nombre: str):
    """
    Resuelve nombre -> teamId. Cachea también los fallos: sin eso, cada
    equipo que no existe en el feed dispara una búsqueda por pantalla.
    """
    clave = normalize_name(nombre)
    if not clave:
        return None
    now = time.time()
    hit = _logo_nombre.get(clave)
    if hit:
        tid, ts = hit
        if now - ts < (LOGO_TTL if tid else LOGO_TTL_FALLO):
            return tid
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{FOOTBALL_API}/football-search-all-teams",
                            headers=FOOTBALL_HEADERS,
                            params={"search": nombre})
            if r.status_code == 200:
                data = r.json()
                equipos = data.get("response") or {}
                if isinstance(equipos, dict):
                    equipos = equipos.get("teams", [])
                for eq in (equipos or [])[:5]:
                    # Confirmamos que sea el mismo equipo y no un homónimo
                    if match_teams(nombre, eq.get("name","")):
                        tid = str(eq.get("id") or eq.get("teamId") or "")
                        if tid:
                            _logo_nombre[clave] = (tid, now)
                            return tid
    except Exception as e:
        log.error(f"Búsqueda de equipo '{nombre}': {e}")
    _logo_nombre[clave] = (None, now)
    return None


@app.get("/api/team-logo/id/{team_id}")
async def team_logo_by_id(team_id: str):
    """Escudo por ID del feed de fútbol."""
    from fastapi.responses import Response
    content, ctype = await _bajar_logo(team_id)
    if not content:
        return _resp_generico()
    return Response(content=content, media_type=ctype,
                    headers={"Cache-Control":"public, max-age=86400",
                             "Access-Control-Allow-Origin":"*"})


@app.get("/api/team-logo/nombre/{nombre}")
async def team_logo_by_name(nombre: str):
    """
    Escudo por nombre de equipo. Es lo que usa el front: los eventos de
    The Odds API no traen IDs, solo nombres.
    Si no se encuentra, devuelve 404 y el front dibuja las iniciales.
    """
    from fastapi.responses import Response
    tid = await buscar_team_id(nombre)
    if not tid:
        return _resp_generico()
    content, ctype = await _bajar_logo(tid)
    if not content:
        return _resp_generico()
    return Response(content=content, media_type=ctype,
                    headers={"Cache-Control":"public, max-age=86400",
                             "Access-Control-Allow-Origin":"*"})


@app.get("/api/_diag/logos")
async def diag_logos(_=Depends(auth.require_admin)):
    resueltos = sum(1 for v in _logo_nombre.values() if v[0])
    return {
        "nombres_consultados": len(_logo_nombre),
        "nombres_resueltos": resueltos,
        "nombres_sin_escudo": len(_logo_nombre) - resueltos,
        "imagenes_en_memoria": len(_logo_bytes),
    }


@app.get("/api/live/prematch")
async def prematch_odds():
    """
    Alias de /api/live/all-markets.

    Antes este endpoint tenía su propia lista de 6 ligas y pedía solo h2h:
    por eso el panel de agencia mostraba menos partidos y ningún mercado
    extra. Ahora las dos pantallas ven exactamente lo mismo.
    """
    return await all_markets()


# ── CLIENTE ASÍNCRONO DE THE ODDS API ─────────────────────────
# Antes cada request iba por asyncio.to_thread(sync_get, ...), que usa
# urllib bloqueante. El pool por defecto tiene min(32, cpu+4) hilos y el
# contenedor tiene 1 CPU: 5 hilos para 80 deportes = ~32 segundos.
# httpx async no usa hilos, así que las 80 salen de verdad en paralelo.
ODDS_CONCURRENCIA = int(os.environ.get("ODDS_CONCURRENCIA", "15"))
_odds_sem = None


def _sem():
    global _odds_sem
    if _odds_sem is None:
        _odds_sem = asyncio.Semaphore(ODDS_CONCURRENCIA)
    return _odds_sem


async def odds_get(client, path, params, timeout=12):
    """GET a The Odds API. Devuelve el JSON o None, y anota los créditos."""
    async with _sem():
        try:
            r = await client.get(f"https://api.the-odds-api.com{path}",
                                 params=params, timeout=timeout)
        except Exception as e:
            log.error(f"odds_get {path}: {e}")
            return None
    rem = r.headers.get("x-requests-remaining")
    if rem is not None:
        _odds_credits["remaining"] = rem
        _odds_credits["used"] = r.headers.get("x-requests-used")
        _odds_credits["last_check"] = time.strftime("%d/%m %H:%M")
    if r.status_code == 200:
        try:
            return r.json()
        except Exception:
            return None
    if r.status_code == 422:
        log.warning(f"odds_get 422 en {path}: mercado no soportado")
    elif r.status_code == 401:
        log.error("ODDS_API_KEY inválida")
    elif r.status_code == 429:
        log.error("Odds API: cuota agotada")
    else:
        log.warning(f"odds_get {path}: HTTP {r.status_code}")
    return None


# ── CACHÉ QUE NO HACE ESPERAR ─────────────────────────────────
_refrescando = {}

async def cache_swr(clave, ttl, productor):
    """
    Fresco  -> caché.
    Vencido -> devuelve la caché vieja YA y refresca de fondo.
    Vacío   -> espera (única vez que el usuario paga la demora).
    """
    entrada = _football_cache.get(clave)
    ahora = time.time()

    if entrada and ahora - entrada[1] < ttl:
        return entrada[0]

    if clave in _refrescando:
        if entrada:
            return entrada[0]
        return await _refrescando[clave]

    async def correr():
        try:
            datos = await productor()
            _football_cache[clave] = (datos, time.time())
            return datos
        except Exception as e:
            # Sin esto, un error acá se perdía y la pantalla quedaba vacía
            # sin ninguna pista de por qué.
            log.exception(f"Fallo armando '{clave}': {e}")
            raise
        finally:
            _refrescando.pop(clave, None)

    tarea = asyncio.create_task(correr())
    _refrescando[clave] = tarea

    if entrada:
        return entrada[0]      # vieja pero instantánea
    return await tarea


# ── DEPORTES: prioridad y nombres en español ──────────────────
# Se piden en este orden. Lo que no entre en ODDS_SPORTS_LIMIT queda afuera,
# así que arriba va lo que más se juega acá.
PRIORIDAD_SPORTS = [
    "soccer_argentina_primera_division",
    "soccer_conmebol_copa_libertadores",
    "soccer_conmebol_copa_sudamericana",
    "soccer_uefa_champs_league",
    "soccer_brazil_campeonato",
    "soccer_spain_la_liga",
    "soccer_epl",
    "soccer_italy_serie_a",
    "soccer_fifa_world_cup",
    "basketball_nba",
    "tennis_atp_wimbledon",
    "mma_mixed_martial_arts",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_mexico_ligamx",
    "soccer_usa_mls",
    "americanfootball_nfl",
    "baseball_mlb",
]

# Nombre e ícono en español por liga
SPORT_NAMES = {
    "soccer_argentina_primera_division": {"name":"Liga Argentina",     "icon":"🇦🇷"},
    "soccer_conmebol_copa_libertadores": {"name":"Libertadores",       "icon":"🏆"},
    "soccer_conmebol_copa_sudamericana": {"name":"Sudamericana",       "icon":"🏆"},
    "soccer_uefa_champs_league":         {"name":"Champions",          "icon":"⭐"},
    "soccer_uefa_europa_league":         {"name":"Europa League",      "icon":"🌍"},
    "soccer_brazil_campeonato":          {"name":"Brasileirão",        "icon":"🇧🇷"},
    "soccer_spain_la_liga":              {"name":"La Liga",            "icon":"🇪🇸"},
    "soccer_epl":                        {"name":"Premier League",     "icon":"🏴"},
    "soccer_italy_serie_a":              {"name":"Serie A",            "icon":"🇮🇹"},
    "soccer_germany_bundesliga":         {"name":"Bundesliga",         "icon":"🇩🇪"},
    "soccer_france_ligue_one":           {"name":"Ligue 1",            "icon":"🇫🇷"},
    "soccer_portugal_primeira_liga":     {"name":"Liga Portugal",      "icon":"🇵🇹"},
    "soccer_netherlands_eredivisie":     {"name":"Eredivisie",         "icon":"🇳🇱"},
    "soccer_mexico_ligamx":              {"name":"Liga MX",            "icon":"🇲🇽"},
    "soccer_usa_mls":                    {"name":"MLS",                "icon":"🇺🇸"},
    "soccer_chile_campeonato":           {"name":"Liga de Chile",      "icon":"🇨🇱"},
    "soccer_fifa_world_cup":             {"name":"Mundial",            "icon":"🌎"},
    "basketball_nba":                    {"name":"NBA",                "icon":"🏀"},
    "basketball_euroleague":             {"name":"Euroliga",           "icon":"🏀"},
    "basketball_wnba":                   {"name":"WNBA",               "icon":"🏀"},
    "basketball_ncaab":                  {"name":"Básquet NCAA",       "icon":"🏀"},
    "americanfootball_nfl":              {"name":"NFL",                "icon":"🏈"},
    "americanfootball_ncaaf":            {"name":"NCAA Fútbol Am.",    "icon":"🏈"},
    "baseball_mlb":                      {"name":"Béisbol MLB",        "icon":"⚾"},
    "icehockey_nhl":                     {"name":"Hockey NHL",         "icon":"🏒"},
    "mma_mixed_martial_arts":            {"name":"MMA / UFC",          "icon":"🥊"},
    "boxing_boxing":                     {"name":"Boxeo",              "icon":"🥊"},
    "tennis_atp_wimbledon":              {"name":"Tenis · Wimbledon",  "icon":"🎾"},
    "tennis_atp_us_open":                {"name":"Tenis · US Open",    "icon":"🎾"},
    "tennis_atp_french_open":            {"name":"Tenis · Roland G.",  "icon":"🎾"},
    "tennis_atp_aus_open":               {"name":"Tenis · Australia",  "icon":"🎾"},
    "rugbyleague_nrl":                   {"name":"Rugby NRL",          "icon":"🏉"},
    "cricket_international_t20":         {"name":"Críquet T20",        "icon":"🏏"},
    "aussierules_afl":                   {"name":"Fútbol Australiano", "icon":"🏉"},
}

# Traducción de la parte genérica para las ligas que no estén en el mapa
_GRUPOS_ES = {
    "soccer":"Fútbol", "basketball":"Básquet", "baseball":"Béisbol",
    "americanfootball":"Fútbol Am.", "icehockey":"Hockey", "tennis":"Tenis",
    "mma":"MMA", "boxing":"Boxeo", "cricket":"Críquet", "golf":"Golf",
    "rugbyleague":"Rugby", "rugbyunion":"Rugby", "aussierules":"F. Australiano",
    "lacrosse":"Lacrosse", "politics":"Política",
}
_ICONOS_ES = {
    "soccer":"⚽", "basketball":"🏀", "baseball":"⚾", "americanfootball":"🏈",
    "icehockey":"🏒", "tennis":"🎾", "mma":"🥊", "boxing":"🥊",
    "cricket":"🏏", "golf":"⛳", "rugbyleague":"🏉", "rugbyunion":"🏉",
    "aussierules":"🏉",
}

# Se llena en all_markets y lo reusa live_combined
SPORTS_ACTIVOS = []


async def listar_deportes_activos():
    """Deportes con eventos hoy, sin outrights. Cacheado 1 hora."""
    global SPORTS_ACTIVOS
    now = time.time()
    cached = _football_cache.get("sports_list")
    if cached and now - cached[1] < 3600:
        SPORTS_ACTIVOS = cached[0]
        return SPORTS_ACTIVOS

    async with httpx.AsyncClient(timeout=15) as client:
        data = await odds_get(client, "/v4/sports/",
                              {"apiKey": os.environ.get("ODDS_API_KEY","")})
    if not data:
        return SPORTS_ACTIVOS or list(PRIORIDAD_SPORTS)

    activos = [x["key"] for x in data
               if x.get("active") and not x.get("has_outrights", False)]
    # Primero lo que más se juega acá, después todo el resto
    orden, vistos = [], set()
    for k in PRIORIDAD_SPORTS:
        if k in activos:
            orden.append(k); vistos.add(k)
    orden += [k for k in activos if k not in vistos]

    SPORTS_ACTIVOS = orden[:ODDS_SPORTS_LIMIT]
    _football_cache["sports_list"] = (SPORTS_ACTIVOS, now)
    log.info(f"Deportes activos: {len(SPORTS_ACTIVOS)} de {len(activos)}")
    return SPORTS_ACTIVOS


def nombre_deporte(sport_key):
    """Nombre e ícono en español; si la liga no está mapeada, arma uno legible."""
    if sport_key in SPORT_NAMES:
        return SPORT_NAMES[sport_key]
    grupo, _, resto = sport_key.partition("_")
    etiqueta = _GRUPOS_ES.get(grupo, grupo.title())
    if resto:
        etiqueta += " · " + resto.replace("_", " ").title()
    return {"name": etiqueta, "icon": _ICONOS_ES.get(grupo, "🎯")}


@app.get("/api/live/prematch")
async def prematch_odds():
    """Cuotas prematch de todas las ligas via The Odds API"""
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    SPORTS_MAP = {
        "soccer_argentina_primera_division": {"name":"Liga Argentina","icon":"ARG"},
        "soccer_fifa_world_cup":             {"name":"Mundial 2026",  "icon":"MUN"},
        "soccer_uefa_champs_league":         {"name":"Champions",     "icon":"UCL"},
        "basketball_nba":                    {"name":"NBA",           "icon":"NBA"},
        "americanfootball_nfl":              {"name":"NFL",           "icon":"NFL"},
        "mma_mixed_martial_arts":            {"name":"MMA/UFC",       "icon":"MMA"},
    }
    now = time.time()
    cache_key = "prematch_all"
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < 300:  # 5 min cache
            return data

    result = {"sports": []}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            for sport_key, meta in SPORTS_MAP.items():
                r = await c.get(
                    "https://api.the-odds-api.com/v4/sports/{}/odds/".format(sport_key),
                    params={"apiKey":ODDS_API_KEY,"regions":"eu","markets":"h2h",
                            "oddsFormat":"decimal","dateFormat":"iso"}
                )
                if r.status_code == 200:
                    events = r.json()[:6]
                    mapped = []
                    for ev in events:
                        home = ev.get("home_team","")
                        away = ev.get("away_team","")
                        h_odd=None; d_odd=None; a_odd=None
                        for bm in ev.get("bookmakers",[]):
                            for mkt in bm.get("markets",[]):
                                if mkt["key"]=="h2h":
                                    for o in mkt.get("outcomes",[]):
                                        if o["name"]==home: h_odd=round(o["price"],2)
                                        elif o["name"]==away: a_odd=round(o["price"],2)
                                        elif o["name"]=="Draw": d_odd=round(o["price"],2)
                                    break
                            if h_odd: break
                        try:
                            from datetime import datetime
                            dt=datetime.fromisoformat(ev.get("commence_time","").replace("Z","+00:00"))
                            fecha=dt.astimezone().strftime("%d/%m %H:%M")
                        except:
                            fecha="--/-- --:--"
                        if h_odd:
                            mapped.append({"id":ev.get("id",""),"h":home,"a":away,
                                "time":fecha,"live":False,"odds":{"L":h_odd,"E":d_odd,"V":a_odd}})
                    if mapped:
                        result["sports"].append({"name":meta["name"],"icon":meta["icon"],
                            "events":mapped})
                await asyncio.sleep(0.2)
    except Exception as e:
        log.error(f"Prematch error: {e}")

    _football_cache[cache_key] = (result, now)
    return result


# ── LIVE COMBINED (scores + cuotas en vivo) ───────────────────
import re as _re
import unicodedata as _ud

# Palabras que no distinguen a un equipo de otro.
# "united", "city" y "athletic" NO van acá: son justamente lo que
# diferencia a Manchester United de Manchester City.
_RUIDO = {"fc","cf","sc","ac","afc","cd","ca","club","de","del","el","la",
          "futbol","football","futebol","calcio","if","sk","bk","aif"}

def _sin_acentos(t):
    return "".join(c for c in _ud.normalize("NFD", t)
                   if _ud.category(c) != "Mn")

def tokens_equipo(name):
    """Devuelve el conjunto de palabras significativas de un nombre."""
    t = _sin_acentos((name or "").lower())
    # Quitar apóstrofos PEGANDO las letras: "newell's" -> "newells"
    # (antes se partía en "newell" + "s", y el "s" suelto rompía el match).
    t = t.replace("'", "").replace("\u2019", "").replace("`", "")
    t = _re.sub(r'[^a-z0-9 ]', ' ', t)
    # Ignorar tokens de una sola letra (ruido tipográfico)
    return {w for w in t.split() if len(w) >= 2 and w not in _RUIDO}

def normalize_name(name):
    """Nombre normalizado y ordenado — sirve de clave estable."""
    return " ".join(sorted(tokens_equipo(name)))

def _sim_cadena(a, b):
    """Similitud 0..1 entre dos cadenas (difflib, viene en stdlib)."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()

def _token_parecido(x, conjunto, umbral=0.85):
    """¿Hay en 'conjunto' un token igual o muy parecido a x?"""
    return any(x == y or _sim_cadena(x, y) >= umbral for y in conjunto)

def match_teams(name1, name2):
    """
    Compara nombres de equipos con tolerancia tipográfica.

    Resuelve apóstrofos y acentos: "Newell's" ~ "Newells", "Grêmio" ~
    "Gremio", "Huracán" ~ "Huracan" ahora matchean, porque comparamos
    token a token con similitud difusa (no carácter exacto).

    Sigue siendo conservador con equipos realmente distintos: si algún
    lado aporta una palabra propia significativa ("City" vs "United",
    "Rivadavia" en "Independiente Rivadavia"), NO matchea, y ese caso
    queda para el corrector manual con candidatos sugeridos.
    """
    t1, t2 = tokens_equipo(name1), tokens_equipo(name2)
    if not t1 or not t2:
        return False
    if t1 == t2:
        return True
    # Tokens de cada lado que no tienen un parecido en el otro
    propios_1 = [x for x in t1 if not _token_parecido(x, t2)]
    propios_2 = [x for x in t2 if not _token_parecido(x, t1)]
    # Mismo equipo solo si ningún lado aporta palabra propia significativa.
    return not propios_1 and not propios_2

def score_equipos(name1, name2):
    """Puntaje 0..1 de parecido entre dos nombres completos, para rankear
    candidatos cuando no hubo match exacto."""
    p1 = _sin_acentos((name1 or "").lower())
    p2 = _sin_acentos((name2 or "").lower())
    p1 = "".join(c for c in p1 if c.isalnum())
    p2 = "".join(c for c in p2 if c.isalnum())
    return _sim_cadena(p1, p2)

# ── VALIDACIÓN DE CUOTAS ──────────────────────────────────────
# Las cuotas llegan del navegador. Sin este chequeo, cualquiera puede
# editar la petición y armarse un boleto de 900x para cobrar en el local.
#
# ODDS_VALIDATION:
#   warn   → deja pasar pero loguea lo sospechoso (default, para estrenar)
#   strict → rechaza el boleto
#   off    → sin chequeo
ODDS_VALIDATION = os.environ.get("ODDS_VALIDATION", "warn").lower()
ODDS_TOLERANCIA = 1.05   # 5% de margen por movimiento de cuota entre refrescos


def _recolectar_odds(dst, home, away, valores, mercados=None):
    """
    Suma las cuotas de un evento al índice.

    ADEMÁS de la lista de valores, guarda QUÉ cuota corresponde a cada
    selección. Sin eso no se puede verificar que la cuota que trae una
    captura sea la del equipo elegido: el sistema aceptaba la del
    rival y se pagaba de más o de menos.
    """
    nums = [float(v) for v in valores if isinstance(v, (int, float)) and v]
    if not nums or not home:
        return
    clave = (normalize_name(home), normalize_name(away))
    entrada = dst.get(clave)
    # Compatibilidad: si quedó como set de una versión anterior
    if isinstance(entrada, set):
        entrada = {"valores": entrada, "por_sel": {}}
        dst[clave] = entrada
    elif entrada is None:
        entrada = {"valores": set(), "por_sel": {}}
        dst[clave] = entrada
    entrada["valores"].update(nums)

    if mercados:
        for mk, opciones in mercados.items():
            if not isinstance(opciones, dict):
                continue
            for sel, cuota in opciones.items():
                if not isinstance(cuota, (int, float)) or not cuota:
                    continue
                k = normalize_name(str(sel))
                entrada["por_sel"].setdefault(k, []).append(float(cuota))


def _cuota_de_seleccion(entrada, seleccion, home=None, away=None):
    """
    La cuota que corresponde a esa selección, o None si no se sabe.

    Se prueba por nombre exacto normalizado y, si no, por parecido:
    la IA puede leer "Boca" donde el feed dice "Boca Juniors".
    """
    if not isinstance(entrada, dict):
        return None
    por_sel = entrada.get("por_sel") or {}
    if not por_sel or not seleccion:
        return None

    k = normalize_name(str(seleccion))
    if k in por_sel:
        return max(por_sel[k])

    # "Empate", "Draw" y "X" son la misma cosa
    if k in ("empate", "draw", "x"):
        for alias in ("empate", "draw", "x"):
            if alias in por_sel:
                return max(por_sel[alias])

    for nombre, cuotas in por_sel.items():
        try:
            if _mismo_club(seleccion, nombre):
                return max(cuotas)
        except Exception:
            continue
    return None


def construir_indice_odds():
    """
    Arma {(home, away): {cuotas conocidas}} a partir de lo que ya está
    en caché. No pega a ninguna API: usa lo mismo que vio el cliente.
    """
    idx = {}

    # Sportradar: es la fuente actual del prematch. Va primero.
    data = _sr_all_cache.get("data") or {}
    for sport in data.get("sports", []):
        for ev in sport.get("events", []):
            vals = []
            for mercado in (ev.get("markets") or {}).values():
                if isinstance(mercado, dict):
                    vals.extend(mercado.values())
            vals.extend((ev.get("odds") or {}).values())
            _recolectar_odds(idx, ev.get("h",""), ev.get("a",""), vals,
                             ev.get("markets"))

    # El caché viejo queda por si algo todavía lo llena.
    data, _ = _football_cache.get("all_markets", ({}, 0))
    for sport in (data or {}).get("sports", []):
        for ev in sport.get("events", []):
            vals = []
            for mercado in (ev.get("markets") or {}).values():
                if isinstance(mercado, dict):
                    vals.extend(mercado.values())
            vals.extend((ev.get("odds") or {}).values())
            _recolectar_odds(idx, ev.get("h",""), ev.get("a",""), vals,
                             ev.get("markets"))

    data, _ = _football_cache.get("prematch_all", ({}, 0))
    for sport in (data or {}).get("sports", []):
        for ev in sport.get("events", []):
            _recolectar_odds(idx, ev.get("h",""), ev.get("a",""),
                             (ev.get("odds") or {}).values())

    data, _ = _football_cache.get("live_combined", ({}, 0))
    for m in (data or {}).get("matches", []):
        _recolectar_odds(idx, m.get("home",""), m.get("away",""),
                         (m.get("odds") or {}).values())

    data, _ = _football_cache.get("ai_combos", ({}, 0))
    for combo in (data or {}).get("combos", []):
        for p in combo.get("picks", []):
            _recolectar_odds(idx, p.get("h",""), p.get("a",""), [p.get("odd")])

    return idx


# Palabras que aparecen en muchos clubes y no distinguen a ninguno.
# "Atlético Independiente" y "Atlético Tucumán" comparten "atletico":
# si esa palabra pesara, cualquier par de "atléticos" matchearía.
_GENERICAS = {"atletico", "atletica", "club", "deportivo", "deportiva",
              "sporting", "sport", "real", "union", "nacional",
              "racing", "juventud", "social", "cultural", "asociacion",
              "estudiantes", "universidad", "universitario", "san",
              "santa", "santo", "cd", "ad", "sd", "ce", "ec", "se"}


def _nucleo_equipo(nombre):
    """
    Las palabras que de verdad identifican al club, sin las genéricas.

    "Club Atlético Independiente" → {independiente}
    "Atlético Huracán"            → {huracan}
    "Independiente Rivadavia"     → {independiente, rivadavia}

    Si al sacar las genéricas no queda nada —hay clubes que se llaman
    solo "Racing" o "Nacional"— se devuelven las originales: es
    preferible eso a quedarse sin nada con qué comparar.
    """
    t = tokens_equipo(nombre)
    nucleo = {w for w in t if w not in _GENERICAS}
    return nucleo or t


def _mismo_club(a, b):
    """
    ¿Son el mismo club? Alcanza con que compartan una palabra propia.

    "Club Atlético Independiente" y "Independiente" comparten
    'independiente' → sí. Pero "Independiente" e "Independiente
    Rivadavia" comparten esa palabra y son clubes distintos, así que
    cuando los dos lados aportan palabras propias extra se exige que
    no se contradigan.
    """
    na, nb = _nucleo_equipo(a), _nucleo_equipo(b)
    if not na or not nb:
        return False
    if na == nb:
        return True

    comunes = na & nb
    if not comunes:
        # Sin palabras en común, se prueba con similitud tipográfica
        # para tolerar errores de lectura: "huracan" ~ "huracàn"
        return any(_sim_cadena(x, y) >= 0.88 for x in na for y in nb)

    # Comparten algo. Ser subconjunto NO alcanza por sí solo:
    # "Independiente" está contenido en "Independiente Rivadavia" y
    # son clubes distintos. La palabra extra tiene que ser genérica
    # o un complemento reconocible, no un nombre propio nuevo.
    if na <= nb or nb <= na:
        extra = (nb - na) if na <= nb else (na - nb)
        # Complementos que acompañan sin cambiar de club
        SUFIJOS = {"juniors", "boys", "old", "plate", "united", "city",
                   "town", "fc", "cf", "sc", "ii", "b", "sub20", "res"}
        if extra <= SUFIJOS:
            return True
        # Palabra extra propia (Rivadavia, Tucumán, Santander): son
        # equipos distintos de la misma familia
        return False

    # Los dos aportan palabras propias distintas: son equipos
    # diferentes de la misma familia (Independiente vs Independiente
    # Rivadavia). No matchea.
    return False


def _buscar_evento(idx, home, away):
    """
    Encuentra el evento del feed que corresponde a estos dos equipos.

    LA CLAVE: el partido lo identifica el PAR, no cada equipo por
    separado. Si la captura dice "Club Atlético Independiente vs
    Huracán" y el feed dice "Independiente vs Atlético Huracán", es
    el mismo partido — y antes no matcheaba porque comparaba lado a
    lado con nombres completos.

    También se prueba invertido: algunas casas muestran al visitante
    primero, y un partido dado vuelta sigue siendo el mismo partido.
    """
    clave = (normalize_name(home), normalize_name(away))
    if clave in idx:
        return idx[clave]

    # Segundo intento: el matcher difuso de siempre, lado a lado
    for (h, a), vals in idx.items():
        if match_teams(home, h) and match_teams(away, a):
            return vals

    # Tercer intento: por núcleo, que resuelve los prefijos distintos
    for (h, a), vals in idx.items():
        if _mismo_club(home, h) and _mismo_club(away, a):
            return vals

    # Cuarto: el partido invertido. Algunas casas muestran primero al
    # visitante, y dado vuelta sigue siendo el mismo partido.
    for (h, a), vals in idx.items():
        if _mismo_club(home, a) and _mismo_club(away, h):
            log.info(f"[MATCH] {home} vs {away} encontrado invertido")
            return vals

    # Quinto: EL PAR IDENTIFICA EL EVENTO. Si un lado coincide con
    # certeza y el otro comparte al menos una palabra propia, es ese
    # partido: no existen dos partidos simultáneos donde jueguen
    # Independiente y algo parecido a Vélez.
    for (h, a), vals in idx.items():
        for izq, der in ((home, away), (away, home)):
            if _mismo_club(izq, h) and (_nucleo_equipo(der) & _nucleo_equipo(a)):
                log.info(f"[MATCH] {home} vs {away} → {h} vs {a} por el par")
                return vals
            if _mismo_club(der, a) and (_nucleo_equipo(izq) & _nucleo_equipo(h)):
                log.info(f"[MATCH] {home} vs {away} → {h} vs {a} por el par")
                return vals

    return None


def _candidatos_evento(idx, home, away, tope=4):
    """
    Cuando no hay match, los partidos más parecidos para que el
    cajero elija. Mejor ofrecer tres opciones que un rechazo seco.
    """
    na, nb = _nucleo_equipo(home), _nucleo_equipo(away)
    puntuados = []
    for (h, a), vals in idx.items():
        nh, naw = _nucleo_equipo(h), _nucleo_equipo(a)
        # Cuántas palabras propias comparte cada lado
        p = len(na & nh) + len(nb & naw)
        if p == 0:
            p = (len(na & naw) + len(nb & nh)) * 0.8   # invertido vale menos
        if p > 0:
            puntuados.append((p, h, a, vals))
    puntuados.sort(key=lambda x: -x[0])
    return [{"home": h, "away": a, "odds": v}
            for _, h, a, v in puntuados[:tope]]


async def validar_cuotas(picks):
    """
    Devuelve lista de problemas encontrados (vacía = todo bien).
    Solo bloquea cuotas INFLADAS: una cuota menor a la real no perjudica
    a la casa, así que no hace falta rechazarla.
    """
    if ODDS_VALIDATION == "off":
        return []

    idx = construir_indice_odds()
    if not idx:
        # Caché fría (recién arrancó la API). La calentamos una vez.
        try:
            await _sr_all_markets_cacheado()
            idx = construir_indice_odds()
        except Exception as e:
            log.error(f"No se pudo calentar la caché de cuotas: {e}")

    if not idx:
        # Sin índice no hay con qué comparar. Rechazar todo dejaría la
        # casa sin poder tomar apuestas por un problema propio.
        log.error("[ODDS] índice vacío: no se puede validar, se deja pasar")
        return []

    problemas = []
    for p in picks:
        entrada = _buscar_evento(idx, p["home"], p["away"])
        if not entrada:
            problemas.append(
                f"{p['home']} vs {p['away']}: evento no encontrado en el feed")
            continue

        # Compatibilidad con el formato viejo
        conocidas = (entrada.get("valores") if isinstance(entrada, dict)
                     else entrada) or set()

        # LO IMPORTANTE: se compara contra la cuota de LA SELECCIÓN
        # elegida, no contra el máximo del evento. Antes, si el
        # cliente iba al favorito que paga 1.50 y la captura decía
        # 4.00, el sistema lo aceptaba porque el rival pagaba 4.20.
        propia = _cuota_de_seleccion(entrada, p.get("sel"),
                                     p["home"], p["away"])
        if propia:
            if p["odd"] > propia * ODDS_TOLERANCIA:
                problemas.append(
                    f"{p['home']} vs {p['away']} ({p.get('sel','')}): "
                    f"la captura dice {p['odd']} pero esa selección paga "
                    f"{propia:.2f}. Puede ser la cuota del rival.")
            continue

        # Sin poder identificar la selección, se valida contra el
        # máximo como antes: es menos preciso pero no bloquea.
        if conocidas:
            techo = max(conocidas) * ODDS_TOLERANCIA
            if p["odd"] > techo:
                problemas.append(
                    f"{p['home']} vs {p['away']}: cuota {p['odd']} supera "
                    f"el máximo real {max(conocidas):.2f}")
    return problemas


@app.get("/api/live/combined")
async def live_combined():
    """Partidos en vivo apostables (la cuota manda; el marcador acompaña)."""
    return await cache_swr("live_combined", ODDS_TTL_LIVE, _armar_live)


async def _armar_live():
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    ahora = datetime.now(timezone.utc)
    deportes = (await listar_deportes_activos())[:ODDS_LIVE_SPORTS]
    base = {"apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS,
            "oddsFormat": "decimal", "dateFormat": "iso",
            "markets": ODDS_MARKETS}

    en_vivo = []
    async with httpx.AsyncClient(timeout=12) as client:
        pares = await asyncio.gather(
            *[odds_get(client, f"/v4/sports/{sk}/odds/", base) for sk in deportes],
            return_exceptions=True)

    for sk, data in zip(deportes, pares):
        if isinstance(data, Exception) or not data:
            continue
        meta = nombre_deporte(sk)
        for ev in data:
            try:
                comienzo = datetime.fromisoformat(
                    ev.get("commence_time","").replace("Z","+00:00"))
            except Exception:
                continue
            if comienzo > ahora:
                continue
            markets = parse_markets(ev)
            home = ev.get("home_team","")
            away = ev.get("away_team","")
            h2h  = markets.get("h2h", {})
            odds = {"L": h2h.get(home), "E": h2h.get("Draw"), "V": h2h.get(away)}
            if odds["L"] is None and odds["V"] is None:
                continue

            # Minuto estimado desde el inicio, como respaldo si el feed
            # de fútbol no cruza. Solo tiene sentido para fútbol (90').
            transcurrido = int((ahora - comienzo).total_seconds() // 60)
            es_futbol = sk.startswith("soccer")
            min_estimado = ""
            if es_futbol and 0 <= transcurrido <= 130:
                if transcurrido <= 45:
                    min_estimado = f"~{transcurrido}'"
                elif transcurrido <= 60:
                    min_estimado = "~ET"          # entretiempo aprox
                elif transcurrido <= 105:
                    min_estimado = f"~{transcurrido-15}'"
                else:
                    min_estimado = "~90+'"

            en_vivo.append({
                "id": ev.get("id",""), "sport_key": sk,
                "home": home, "away": away,
                "homeId": None, "awayId": None,
                "homeScore": None, "awayScore": None,
                "scoreStr": "", "minute": min_estimado, "minuteLong": "",
                "minuto_estimado": bool(min_estimado),
                "comenzo_hace": transcurrido,
                "liga": meta["name"], "icon": meta["icon"],
                "status": "live", "ongoing": True,
                "markets": markets, "odds": odds,
                "hasOdds": True, "hasScore": False,
            })

    # Marcadores del feed de fútbol, si se pueden cruzar
    live_scores = []
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{FOOTBALL_API}/football-current-live",
                            headers=FOOTBALL_HEADERS)
            if r.status_code == 200:
                live_scores = r.json().get("response",{}).get("live",[])
    except Exception as e:
        log.error(f"Football live error: {e}")

    sin_score = []
    for ev in en_vivo:
        for m in live_scores:
            mh = m.get("home",{}).get("name","")
            ma = m.get("away",{}).get("name","")
            invertido = False
            if match_teams(ev["home"], mh) and match_teams(ev["away"], ma):
                pass
            elif match_teams(ev["home"], ma) and match_teams(ev["away"], mh):
                invertido = True
            else:
                continue
            hs = m.get("home",{}).get("score", 0)
            aw = m.get("away",{}).get("score", 0)
            ev["homeScore"] = aw if invertido else hs
            ev["awayScore"] = hs if invertido else aw
            min_real = m.get("liveTime",{}).get("short","")
            if min_real:                       # el real pisa al estimado
                ev["minute"] = min_real
                ev["minuto_estimado"] = False
            ev["minuteLong"] = m.get("liveTime",{}).get("long","")
            ev["hasScore"]   = True
            break
        else:
            sin_score.append(f"{ev['home']} vs {ev['away']}")

    # Completar marcadores faltantes con Sportradar (más confiable)
    try:
        sr_live = await _sr_live_cacheado()
        if sr_live:
            for ev in en_vivo:
                if ev.get("hasScore"):
                    continue
                ch = _sr_normalizar(ev["home"]); ca = _sr_normalizar(ev["away"])
                match = sr_live.get(f"{ch}|{ca}")
                invert = False
                if not match:
                    match = sr_live.get(f"{ca}|{ch}")
                    invert = bool(match)
                if match and match.get("home_score") is not None:
                    hs = match["home_score"]; aw = match["away_score"]
                    ev["homeScore"] = aw if invert else hs
                    ev["awayScore"] = hs if invert else aw
                    if match.get("minute"):
                        ev["minute"] = f"{match['minute']}'"
                    ev["hasScore"] = True
                    ev["fuente_score"] = "sportradar"
    except Exception as e:
        log.error(f"SR live scores error: {e}")

    en_vivo.sort(key=lambda e: (not e["hasScore"], e["liga"], e["home"]))
    _football_cache["live_sin_match"] = (
        {"sin_cuotas": sin_score,
         "claves_odds": [f"{m.get('home',{}).get('name','')}|"
                         f"{m.get('away',{}).get('name','')}"
                         for m in live_scores][:40]}, time.time())
    log.info(f"En vivo: {len(en_vivo)} apostables, {len(sin_score)} sin marcador")
    return {"matches": en_vivo, "count": len(en_vivo)}


@app.get("/api/_diag/sesiones")
async def diag_sesiones(_=Depends(auth.require_admin)):
    """Cuántas sesiones hay guardadas y si la tabla responde."""
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            total = await conn.fetchval("SELECT COUNT(*) FROM agencia_sesiones")
            vigentes = await conn.fetchval(
                "SELECT COUNT(*) FROM agencia_sesiones WHERE expira_at > NOW()")
        return {"tabla_ok": True, "total": total, "vigentes": vigentes,
                "en_memoria": len(auth._sessions)}
    except Exception as e:
        return {"tabla_ok": False, "error": str(e)}


@app.get("/api/_diag/prematch")
async def diag_prematch(_=Depends(auth.require_admin)):
    """
    Radiografía del prematch: qué se pide, qué contesta y dónde se corta.
    Prueba con pocos deportes para no gastar créditos de más.
    """
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    reporte = {
        "api_key_configurada": bool(ODDS_API_KEY),
        "regiones": ODDS_REGIONS,
        "mercados": ODDS_MARKETS,
        "limite_deportes": ODDS_SPORTS_LIMIT,
    }

    # 1. ¿Contesta la lista de deportes?
    async with httpx.AsyncClient(timeout=15) as client:
        lista = await odds_get(client, "/v4/sports/", {"apiKey": ODDS_API_KEY})
    if not lista:
        reporte["error"] = "No se pudo obtener la lista de deportes"
        reporte["deportes_totales"] = 0
        return reporte

    activos = [x for x in lista
               if x.get("active") and not x.get("has_outrights", False)]
    reporte["deportes_totales"] = len(lista)
    reporte["deportes_activos"] = len(activos)

    # 2. Probar los primeros deportes de la lista de prioridad
    claves = [x["key"] for x in activos]
    prueba = [k for k in PRIORIDAD_SPORTS if k in claves][:5] or claves[:5]
    reporte["probados"] = prueba

    base = {"apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS,
            "oddsFormat": "decimal", "dateFormat": "iso"}
    detalle = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for sk in prueba:
            d = await odds_get(client, f"/v4/sports/{sk}/odds/",
                               {**base, "markets": ODDS_MARKETS})
            if d is None:
                # ¿Es el combo de mercados o el deporte?
                solo_h2h = await odds_get(client, f"/v4/sports/{sk}/odds/",
                                          {**base, "markets": "h2h"})
                detalle[sk] = {
                    "con_mercados_completos": "falló",
                    "solo_h2h": len(solo_h2h) if solo_h2h is not None else "falló",
                }
                continue
            con_mkt = sum(1 for ev in d if parse_markets(ev))
            ejemplo = {}
            for ev in d:
                mk = parse_markets(ev)
                if mk:
                    ejemplo = {"partido": f"{ev.get('home_team')} vs {ev.get('away_team')}",
                               "mercados": {k: len(v) for k, v in mk.items()},
                               "bookmakers": len(ev.get("bookmakers", []))}
                    break
            detalle[sk] = {"eventos": len(d), "con_mercados": con_mkt,
                           "ejemplo": ejemplo}
    reporte["detalle"] = detalle

    entrada = _football_cache.get("all_markets")
    reporte["cache"] = {
        "tiene_datos": bool(entrada),
        "deportes_en_cache": len((entrada[0] or {}).get("sports", [])) if entrada else 0,
        "antiguedad_seg": round(time.time() - entrada[1]) if entrada else None,
    }
    reporte["creditos"] = dict(_odds_credits)
    return reporte


@app.get("/api/_diag/live")
async def diag_live(_=Depends(auth.require_admin)):
    """
    Por qué un partido en vivo no muestra cuotas.
    Compara los nombres que da el feed de scores contra los del feed
    de cuotas: casi siempre el problema es que se escriben distinto.
    """
    data, ts = _football_cache.get("live_sin_match", ({}, 0))
    return {
        "sin_cuotas": (data or {}).get("sin_cuotas", []),
        "nombres_en_feed_de_cuotas": (data or {}).get("claves_odds", []),
        "actualizado_hace_seg": round(time.time() - ts) if ts else None,
    }


@app.get("/api/_diag/creditos")
async def diag_creditos(_=Depends(auth.require_admin)):
    """Saldo de créditos de The Odds API."""
    return {
        **_odds_credits,
        "markets_configurados": ODDS_MARKETS,
        "sports_limit": ODDS_SPORTS_LIMIT,
        "ttl_prematch_seg": ODDS_TTL_PREMATCH,
    }


@app.get("/api/event/{sport_key}/{event_id}/markets")
async def event_markets(sport_key: str, event_id: str):
    """
    TODOS los mercados de un evento: destacados + adicionales
    (ambos anotan, córners, tarjetas, goleadores, líneas alternativas).

    The Odds API no acepta estos mercados en el endpoint masivo y tampoco
    ofrece una forma de preguntar cuáles existen para un evento dado.
    Así que se piden todos juntos y, si rebota, de a uno: nos quedamos con
    los que respondan. Lo que no exista simplemente no aparece.
    """
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    cache_key = f"evmkt_{event_id}"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < ODDS_TTL_EVENTO:
            return data

    ruta = f"/v4/sports/{sport_key}/events/{event_id}/odds/"
    base = {"apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS_EXTRA,
            "oddsFormat": "decimal", "dateFormat": "iso"}

    combinado, disponibles, rechazados = {}, [], []
    home = away = ""

    # Intento 1: todo junto (1 request si el deporte los soporta todos)
    todos = f"{ODDS_MARKETS},{MERCADOS_EXTRA}"
    async with httpx.AsyncClient(timeout=15) as client:
        data = await odds_get(client, ruta, {**base, "markets": todos}, 15)
    if data:
        combinado = parse_markets(data)
        disponibles = sorted(combinado.keys())
        home, away = data.get("home_team",""), data.get("away_team","")
    else:
        # Intento 2: de a uno, en paralelo, para ver cuáles existen
        async def probar(m):
            async with httpx.AsyncClient(timeout=10) as c:
                d = await odds_get(c, ruta, {**base, "markets": m}, 10)
            return m, d

        candidatos = [m.strip() for m in todos.split(",") if m.strip()]
        resultados = await asyncio.gather(*[probar(m) for m in candidatos],
                                          return_exceptions=True)
        for r in resultados:
            if isinstance(r, Exception) or not r:
                continue
            m, d = r
            if not d:
                rechazados.append(m)
                continue
            if not home:
                home, away = d.get("home_team",""), d.get("away_team","")
            for k, v in parse_markets(d).items():
                combinado.setdefault(k, {}).update(v)
                if k not in disponibles:
                    disponibles.append(k)
        disponibles.sort()

    salida = {
        "markets":     combinado,
        "disponibles": disponibles,
        "sin_datos":   rechazados,
        "event_id":    event_id,
        "home": home, "away": away,
    }
    _football_cache[cache_key] = (salida, now)
    return salida


# ═══════════════════════════════════════════════════════════════
# CASH OUT — retirar una apuesta antes de que termine
# The Odds API no da cash out; lo calculamos con las cuotas en vivo.
# Fórmula: valor = (odd_total_original × stake) ÷ odd_total_actual
# donde odd_total_actual usa la cuota EN VIVO de cada pick todavía abierto.
# ═══════════════════════════════════════════════════════════════

CASHOUT_MARGEN = float(os.environ.get("CASHOUT_MARGEN", "0.90"))
# margen de la casa: se paga el 90% del valor teórico

async def _cuota_viva_pick(pick):
    """Devuelve la cuota EN VIVO de un pick, o None si no se puede seguir.
    Busca el evento por sport_key+event_id y ubica la selección (sel)."""
    sk = pick.get("sport_key")
    eid = pick.get("event_id")
    sel = (pick.get("sel") or "").strip()
    if not sk or not eid or not sel:
        return None
    try:
        data = await event_markets(sk, eid)   # reusa el endpoint (con caché)
    except Exception:
        return None
    markets = (data or {}).get("markets") or {}
    # Buscar la selección en cualquier mercado (comparación flexible)
    sel_low = sel.lower()
    for mkt, outcomes in markets.items():
        for nombre, cuota in outcomes.items():
            if nombre.lower() == sel_low:
                try:
                    return round(float(cuota), 2)
                except (TypeError, ValueError):
                    return None
    return None


async def _calcular_cashout(picks, stake, odd_total):
    """Calcula el valor de cash out actual de una apuesta.
    Devuelve dict con: disponible, valor, detalle por pick."""
    stake = float(stake or 0)
    odd_total = float(odd_total or 0)
    if stake <= 0 or odd_total <= 0 or not picks:
        return {"disponible": False, "motivo": "Apuesta inválida"}

    detalle = []
    odd_actual = 1.0
    todos_seguibles = True
    algun_perdido = False

    for p in picks:
        viva = await _cuota_viva_pick(p)
        orig = float(p.get("odd") or 1)
        if viva is None:
            # No se puede seguir este pick (evento no encontrado o terminado)
            todos_seguibles = False
            detalle.append({"sel": p.get("sel"), "orig": orig, "viva": None,
                            "estado": "no_seguible"})
        else:
            odd_actual *= viva
            # Si la cuota viva se disparó mucho, la selección va perdiendo
            if viva >= orig * 3:
                algun_perdido = True
            detalle.append({"sel": p.get("sel"), "orig": orig, "viva": viva,
                            "estado": "vivo"})

    if not todos_seguibles:
        return {"disponible": False,
                "motivo": "Hay selecciones que ya no se pueden seguir en vivo",
                "detalle": detalle}

    if odd_actual <= 0:
        return {"disponible": False, "motivo": "Sin cuotas en vivo", "detalle": detalle}

    # Valor teórico: cuánto vale hoy la apuesta
    valor_teorico = (odd_total * stake) / odd_actual
    valor = round(valor_teorico * CASHOUT_MARGEN, 2)
    # Nunca pagar más que la ganancia potencial ni menos que 0
    ganancia_pot = odd_total * stake
    valor = max(0.0, min(valor, ganancia_pot))

    return {
        "disponible": True,
        "valor": round(valor, 2),
        "stake": stake,
        "ganancia_potencial": round(ganancia_pot, 2),
        "odd_original": round(odd_total, 2),
        "odd_actual": round(odd_actual, 2),
        "detalle": detalle,
    }


@app.get("/api/betslip/{code}/cashout")
async def cashout_valor(code: str):
    """Consulta el valor de cash out actual de una apuesta (sin ejecutarlo)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT code, picks, stake, odd_total, potential_win, status, user_id,
                   COALESCE(con_bono, FALSE) AS con_bono
            FROM betslips WHERE code=$1
        """, code)
    if not row:
        raise HTTPException(404, "Apuesta no encontrada")
    if row["status"] not in ("active", "paid"):
        return {"disponible": False, "motivo": f"La apuesta está {row['status']}"}
    # Las apuestas con saldo de bono NO tienen cash out (evita sacar el bono sin rollover)
    if row["con_bono"]:
        return {"disponible": False,
                "motivo": "Las apuestas con bono no tienen cash out"}
    try:
        picks = ast.literal_eval(row["picks"]) if row["picks"] else []
    except Exception:
        picks = []
    res = await _calcular_cashout(picks, row["stake"], row["odd_total"])
    res["code"] = code
    return res


@app.post("/api/betslip/{code}/cashout")
async def cashout_ejecutar(code: str, request: Request):
    """Ejecuta el cash out: paga el valor calculado al cliente y cierra la apuesta.
    body: {ejecutor?: 'cliente'|'agencia'|'box', valor_esperado?: number}"""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    valor_esperado = body.get("valor_esperado")
    ejecutor = (body.get("ejecutor") or "cliente")[:20]
    # destino: 'cuenta' acredita al saldo; 'mostrador' deja un código cobrable en caja
    destino = (body.get("destino") or "cuenta")[:12]
    agencia_ejec = (body.get("agencia_code") or "").upper() or None

    pool = await get_db()
    async with pool.acquire() as conn:
        # Si lo ejecuta una agencia, tiene que tenerlo habilitado. El
        # permiso lo da el admin, por agencia o por rama.
        if agencia_ejec:
            ok = await conn.fetchval(
                "SELECT puede_cashout FROM agencias WHERE code=$1", agencia_ejec)
            if not ok:
                raise HTTPException(403,
                    "Tu agencia no tiene habilitado el cash out. "
                    "Pedíselo al administrador.")
        row = await conn.fetchrow("""
            SELECT code, picks, stake, odd_total, potential_win, status, user_id,
                   COALESCE(con_bono, FALSE) AS con_bono
            FROM betslips WHERE code=$1
        """, code)
        if not row:
            raise HTTPException(404, "Apuesta no encontrada")
        if row["status"] not in ("active", "paid"):
            raise HTTPException(400, f"La apuesta está {row['status']}, no se puede cashear")
        # Las apuestas con bono no tienen cash out
        if row["con_bono"]:
            raise HTTPException(400, "Las apuestas con bono no tienen cash out")

        # ¿La apuesta tiene una cuenta real detrás? (telegram_id > 0 = cuenta de usuario)
        tiene_cuenta = False
        if row["user_id"]:
            tg = await conn.fetchval(
                "SELECT telegram_id FROM users WHERE id=$1", row["user_id"])
            tiene_cuenta = (tg or 0) > 0
        # Si pidió acreditar a cuenta pero no hay cuenta, forzar mostrador
        if destino == "cuenta" and not tiene_cuenta:
            destino = "mostrador"

        try:
            picks = ast.literal_eval(row["picks"]) if row["picks"] else []
        except Exception:
            picks = []
        res = await _calcular_cashout(picks, row["stake"], row["odd_total"])
        if not res.get("disponible"):
            raise HTTPException(400, res.get("motivo", "Cash out no disponible"))

        valor = res["valor"]
        # Protección: si el valor cambió mucho desde que el usuario lo vio, rechazar
        if valor_esperado is not None:
            try:
                ve = float(valor_esperado)
                if abs(ve - valor) > max(1.0, valor * 0.05):
                    raise HTTPException(409, f"El valor cambió (ahora {valor}). Reintentá.")
            except (TypeError, ValueError):
                pass

        async with conn.transaction():
            if destino == "cuenta":
                # Acreditar el valor al usuario (balance en centavos)
                await conn.execute(
                    "UPDATE users SET balance = balance + $2 WHERE id=$1",
                    row["user_id"], int(round(valor * 100)))
                await conn.execute("""
                    UPDATE betslips
                    SET status='cashed_out', potential_win=$2, resultado='cashout'
                    WHERE code=$1
                """, code, valor)
                try:
                    await conn.execute("""
                        INSERT INTO wallet_transactions (user_id, type, amount, method, status)
                        VALUES ($1, 'cashout', $2, $3, 'done')
                    """, row["user_id"], int(round(valor * 100)),
                        f"apuesta {code} por {ejecutor}")
                except Exception:
                    pass
            else:
                # MOSTRADOR: cerrar la apuesta y dejarla lista para cobrar en caja.
                # status 'cashout_pending' = el valor está fijado, falta que la caja pague.
                await conn.execute("""
                    UPDATE betslips
                    SET status='cashout_pending', potential_win=$2, resultado='cashout'
                    WHERE code=$1
                """, code, valor)

    saldo = None
    if destino == "cuenta":
        async with pool.acquire() as conn:
            saldo = await conn.fetchval("SELECT balance FROM users WHERE id=$1", row["user_id"])
        saldo = (saldo or 0) / 100

    return {"ok": True, "valor": valor, "code": code, "destino": destino,
            "tiene_cuenta": tiene_cuenta,
            "saldo": saldo,
            "mensaje": ("Acreditado a tu cuenta" if destino == "cuenta"
                        else f"Mostrá el código {code} en la caja para cobrar {round(valor)}")}


@app.post("/api/betslip/{code}/cashout/pagar-caja")
async def cashout_pagar_caja(code: str, request: Request,
                             agencia_code: str = Depends(requiere_agencia)):
    """La caja paga en efectivo un cash out que quedó pendiente (destino mostrador)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT code, potential_win, status FROM betslips WHERE code=$1", code.upper())
        if not row:
            raise HTTPException(404, "Código no encontrado")
        if row["status"] != "cashout_pending":
            raise HTTPException(400, f"Este código no está pendiente de cash out (está {row['status']})")
        valor = row["potential_win"]
        await conn.execute("""
            UPDATE betslips SET status='cashed_out', pagado_at=NOW(), pagado_por=$2
            WHERE code=$1
        """, code.upper(), agencia_code)
    return {"ok": True, "code": code.upper(), "valor": valor}


@app.get("/api/retiro/{code}")
async def get_retiro(code: str, agencia_code: str = Depends(requiere_agencia)):
    """La caja consulta un retiro por código."""
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow("""
            SELECT r.code, r.monto, r.moneda, r.estado, r.creado_at,
                   u.nombre_completo, u.creado_por
            FROM retiros r LEFT JOIN users u ON u.id = r.user_id
            WHERE r.code=$1
        """, code.upper())
    if not r:
        raise HTTPException(404, "Retiro no encontrado")
    if (r["creado_por"] or "") != agencia_code:
        raise HTTPException(403,
            "Este retiro solo se puede cobrar en la agencia donde el cliente tiene su cuenta.")
    return {"code": r["code"], "monto": r["monto"], "moneda": r["moneda"],
            "estado": r["estado"], "cliente": r["nombre_completo"] or "—",
            "agencia": r["creado_por"],
            "fecha": r["creado_at"].strftime("%d/%m/%Y %H:%M") if r["creado_at"] else ""}


@app.post("/api/retiro/{code}/pagar")
async def pagar_retiro(code: str, agencia_code: str = Depends(requiere_agencia)):
    """La caja paga un retiro pendiente en efectivo.
    Solo puede pagarlo la agencia que creó/vinculó al usuario."""
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(
            "SELECT code, monto, estado, agencia_code FROM retiros WHERE code=$1", code.upper())
        if not r:
            raise HTTPException(404, "Retiro no encontrado")
        if r["estado"] != "pendiente":
            raise HTTPException(400, f"Este retiro ya está {r['estado']}")
        # Solo la agencia exacta que creó al usuario puede pagar
        if (r["agencia_code"] or "") != agencia_code:
            raise HTTPException(403,
                "Este retiro solo se puede cobrar en la agencia donde el cliente "
                "tiene su cuenta.")
        await conn.execute("""
            UPDATE retiros SET estado='pagado', pagado_at=NOW(), pagado_por=$2
            WHERE code=$1
        """, code.upper(), agencia_code)
    return {"ok": True, "code": code.upper(), "monto": r["monto"]}


@app.get("/api/_diag/mercados/{sport_key}/{event_id}")
async def diag_mercados(sport_key: str, event_id: str,
                        _=Depends(auth.require_admin)):
    """
    Prueba uno por uno qué mercados existen de verdad para este evento.
    Sirve para saber si tu plan y tus casas ofrecen córners, tarjetas
    o goleadores antes de prometerlos en pantalla.
    """
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    ruta = f"/v4/sports/{sport_key}/events/{event_id}/odds/"
    base = {"apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS_EXTRA,
            "oddsFormat": "decimal", "dateFormat": "iso"}

    async def probar(m):
        async with httpx.AsyncClient(timeout=10) as c:
            d = await odds_get(c, ruta, {**base, "markets": m}, 10)
        if not d:
            return m, None
        mk = parse_markets(d)
        return m, {k: len(v) for k, v in mk.items()}

    res = await asyncio.gather(
        *[probar(m) for m in MERCADOS_CANDIDATOS], return_exceptions=True)

    hay, no_hay = {}, []
    for r in res:
        if isinstance(r, Exception) or not r:
            continue
        m, info = r
        if info:
            hay[m] = info
        else:
            no_hay.append(m)
    return {"con_datos": hay, "sin_datos": no_hay,
            "regiones": ODDS_REGIONS_EXTRA}


@app.get("/api/live/markets/{sport_key}")
async def live_markets(sport_key: str):
    """Todos los mercados disponibles para un deporte"""
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    cache_key = f"markets_{sport_key}"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < 60:
            return data
    async with httpx.AsyncClient(timeout=20) as client:
        data = await odds_get(client, f"/v4/sports/{sport_key}/odds/", {
            "apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS,
            "markets": ODDS_MARKETS, "oddsFormat": "decimal",
            "dateFormat": "iso"}, 20)
    if data is not None:
        result = {"events": data, "sport": sport_key}
        _football_cache[cache_key] = (result, now)
        return result
    return {"events": [], "sport": sport_key}

@app.get("/api/admin/sportradar/consumo")
async def sr_consumo(_=Depends(auth.require_admin)):
    """
    Cuántas llamadas se le hicieron a Sportradar desde que arrancó el
    servicio. El trial son 1000 EN TOTAL: conviene mirarlo seguido.
    """
    por_refresco = len(SR_DEPORTES) * SR_DIAS
    refrescos_dia = 86400 / max(60, _SR_ALL_TTL - 60)
    return {
        "llamadas_desde_el_arranque": _sr_llamadas["total"],
        "contando_desde": _sr_llamadas["desde"],
        "ultimo_error": _sr_llamadas["ultimo_error"],
        "config": {
            "deportes": [d[1] for d in SR_DEPORTES],
            "dias_de_agenda": SR_DIAS,
            "refresco_minutos": round(_SR_ALL_TTL / 60),
        },
        "proyeccion": {
            "llamadas_por_refresco": por_refresco,
            "llamadas_por_dia": round(refrescos_dia * por_refresco),
            "dias_que_dura_un_trial_de_1000":
                round(1000 / max(1, refrescos_dia * por_refresco), 1),
        },
        "aviso": ("El trial de Sportradar son 1000 llamadas en total, no "
                  "por día. Con el plan pago, subir SR_DEPORTES, SR_DIAS "
                  "y bajar SR_TTL."),
    }


@app.on_event("startup")
async def _precalentar_prematch():
    """
    Arma el catálogo en segundo plano apenas arranca. Sin esto, el
    primero que entra espera las seis llamadas a Sportradar, y mientras
    tanto ocupa una conexión del pool.
    """
    async def tarea():
        await asyncio.sleep(3)          # dejar que termine el arranque
        while True:
            try:
                await _sr_all_markets_cacheado()
                log.info("[SR] catálogo prematch al día")
            except Exception as e:
                log.error(f"[SR] precalentado: {e}")
            await asyncio.sleep(_SR_ALL_TTL - 60)   # refrescar antes de vencer
    asyncio.create_task(tarea())


@app.get("/api/live/all-markets")
async def all_markets():
    """
    Catálogo de prematch. La fuente principal es Sportradar: el event_id
    que se guarda al apostar es el mismo que consulta la liquidación,
    que era justamente lo que fallaba con The Odds API.

    RESPALDO: si Sportradar no devuelve nada —crédito agotado, clave
    vencida, caída— se usa The Odds API. Una pantalla vacía deja a las
    agencias sin poder vender; con cuotas de otra fuente al menos se
    sigue operando.

    Ojo: los event_id de las dos fuentes son distintos, así que los
    boletos tomados durante un respaldo pueden necesitar liquidación
    manual. Es un mal menor frente a no vender nada.
    """
    datos = await _sr_all_markets_cacheado()
    # Se exige que traiga eventos de verdad, no solo la lista de
    # deportes vacía: con un feed a medias el escáner no encuentra
    # nada y el respaldo nunca se activa.
    if sum(len(d.get("events") or []) for d in (datos or {}).get("sports", [])) > 0:
        return datos

    log.warning("[PREMATCH] Sportradar sin datos, se usa el respaldo")
    try:
        entrada = _football_cache.get("all_markets")
        alt = entrada[0] if entrada else None
        if not alt:
            alt = await cache_swr("all_markets", ODDS_TTL_PREMATCH,
                                  _armar_all_markets)
        if (alt or {}).get("sports"):
            alt = dict(alt)
            alt["fuente"] = "respaldo"
            return alt
    except Exception as e:
        log.error(f"[PREMATCH] el respaldo también falló: {e}")
    return datos or {"sports": [], "fuente": "sportradar"}


async def _armar_all_markets():
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    SPORTS = await listar_deportes_activos()
    log.info(f"Prematch: pidiendo {len(SPORTS)} deportes")

    base = {"apiKey": ODDS_API_KEY, "regions": ODDS_REGIONS,
            "oddsFormat": "decimal", "dateFormat": "iso"}

    async with httpx.AsyncClient(timeout=15) as client:
        async def uno(sk):
            d = await odds_get(client, f"/v4/sports/{sk}/odds/",
                               {**base, "markets": ODDS_MARKETS})
            if d is None and ODDS_MARKETS != "h2h":
                d = await odds_get(client, f"/v4/sports/{sk}/odds/",
                                   {**base, "markets": "h2h"})
            return sk, d

        pares = await asyncio.gather(*[uno(sk) for sk in SPORTS],
                                     return_exceptions=True)

    result = {"sports": []}
    for par in pares:
        if isinstance(par, Exception) or not par:
            continue
        sport_key, data = par
        if not data:
            continue
        eventos = []
        for ev in data[:ODDS_MAX_EVENTOS]:
            home = ev.get("home_team","")
            away = ev.get("away_team","")
            markets = parse_markets(ev)
            if not markets:
                continue
            try:
                dt = datetime.fromisoformat(
                    ev.get("commence_time","").replace("Z","+00:00"))
                fecha = dt.astimezone(TZ_CASA).strftime("%d/%m %H:%M")
            except Exception:
                fecha = "--/-- --:--"
            eventos.append({
                "id": ev.get("id",""),
                "sport_key": sport_key,
                "h": home, "a": away,
                "time": fecha,
                "markets": markets,
                "odds": {
                    "L": markets.get("h2h",{}).get(home),
                    "E": markets.get("h2h",{}).get("Draw"),
                    "V": markets.get("h2h",{}).get(away),
                },
            })
        if eventos:
            meta = nombre_deporte(sport_key)
            result["sports"].append({
                "key": sport_key, "name": meta["name"],
                "icon": meta["icon"], "events": eventos,
            })

    log.info(f"Prematch: {len(result['sports'])} deportes con eventos")
    if not result["sports"]:
        log.error("Prematch vacío: revisá /api/_diag/prematch")
    return result


# ── BILLETERA COMPARTIDA CON IAQP ─────────────────────────────
# El casino IAQP corre aparte, con su propio repo y su propia base,
# pero NO guarda saldos: el saldo vive solo aca. IAQP pide debitos y
# creditos por esta API y espera confirmacion.
#
# Una sola fuente de verdad para la plata. Es tambien lo que pregunta
# la certificacion: quien tiene el saldo y como se concilia.
#
# UNIDADES: esta API habla en CENTAVOS, distinto del resto del sistema
# que usa pesos. Es a proposito: en juego de casino el redondeo es
# plata, y ademas evita la confusion del x100.
#
# IDEMPOTENCIA: cada movimiento trae una 'ref' unica de IAQP. Si se
# corta la red y se reintenta, se devuelve el resultado del original
# sin volver a mover un centavo.

IAQP_SERVICE_KEY = os.environ.get("IAQP_SERVICE_KEY", "")


async def requiere_servicio(x_service_key: str = Header(default="")):
    """Autenticacion entre servicios. No da acceso al panel de admin."""
    if not IAQP_SERVICE_KEY:
        raise HTTPException(503, "Billetera de servicio no configurada")
    if not hmac.compare_digest(x_service_key or "", IAQP_SERVICE_KEY):
        raise HTTPException(401, "Servicio no autorizado")
    return True


async def _buscar_jugador(conn, jugador_id: str):
    return await conn.fetchrow("""
        SELECT id, balance, saldo_bono, moneda, bloqueado
        FROM users WHERE id::text=$1 OR telegram_id::text=$1
    """, str(jugador_id))


@app.post("/api/wallet/saldo")
async def wallet_saldo(request: Request, _=Depends(requiere_servicio)):
    body = await request.json()
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await _buscar_jugador(conn, body.get("jugador_id", ""))
    if not u:
        raise HTTPException(404, "Jugador inexistente")
    return {
        "jugador_id": str(u["id"]),
        "saldo_centavos": int(u["balance"] or 0),
        "moneda": u["moneda"] or "ARS",
        "bloqueado": bool(u["bloqueado"]),
    }


@app.post("/api/wallet/debito")
async def wallet_debito(request: Request, _=Depends(requiere_servicio)):
    """Cobra una apuesta de casino. Rechaza si no alcanza."""
    body = await request.json()
    ref = str(body.get("ref") or "")[:80]
    if not ref:
        raise HTTPException(400, "Falta la referencia de idempotencia")
    try:
        monto = int(body.get("monto_centavos", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto invalido")
    if monto <= 0:
        raise HTTPException(400, "El monto tiene que ser positivo")

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Si ya se proceso, se devuelve lo mismo sin mover nada
            previo = await conn.fetchrow(
                "SELECT jugador_id, monto, saldo_post FROM casino_movimientos "
                "WHERE ref=$1", ref)
            if previo:
                return {"ok": True, "repetido": True,
                        "saldo_centavos": int(previo["saldo_post"])}

            u = await _buscar_jugador(conn, body.get("jugador_id", ""))
            if not u:
                raise HTTPException(404, "Jugador inexistente")
            if u["bloqueado"]:
                raise HTTPException(403, "Jugador bloqueado")

            fila = await conn.fetchrow(
                "SELECT balance FROM users WHERE id=$1 FOR UPDATE", u["id"])
            saldo = int(fila["balance"] or 0)
            if saldo < monto:
                raise HTTPException(400, "Saldo insuficiente")

            nuevo = saldo - monto
            await conn.execute("UPDATE users SET balance=$2 WHERE id=$1",
                               u["id"], nuevo)
            await conn.execute("""
                INSERT INTO casino_movimientos
                    (ref, jugador_id, tipo, monto, saldo_previo, saldo_post,
                     juego, mesa_id, creado_en)
                VALUES ($1,$2,'debito',$3,$4,$5,$6,$7,NOW())
            """, ref, u["id"], monto, saldo, nuevo,
                 str(body.get("juego") or "")[:40],
                 str(body.get("mesa_id") or "")[:40])

    return {"ok": True, "repetido": False, "saldo_centavos": nuevo}


@app.post("/api/wallet/credito")
async def wallet_credito(request: Request, _=Depends(requiere_servicio)):
    """Paga un premio o devuelve una ronda anulada."""
    body = await request.json()
    ref = str(body.get("ref") or "")[:80]
    if not ref:
        raise HTTPException(400, "Falta la referencia de idempotencia")
    try:
        monto = int(body.get("monto_centavos", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto invalido")
    if monto <= 0:
        raise HTTPException(400, "El monto tiene que ser positivo")

    tipo = "devolucion" if body.get("devolucion") else "credito"

    pool = await get_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            previo = await conn.fetchrow(
                "SELECT saldo_post FROM casino_movimientos WHERE ref=$1", ref)
            if previo:
                return {"ok": True, "repetido": True,
                        "saldo_centavos": int(previo["saldo_post"])}

            u = await _buscar_jugador(conn, body.get("jugador_id", ""))
            if not u:
                raise HTTPException(404, "Jugador inexistente")

            fila = await conn.fetchrow(
                "SELECT balance FROM users WHERE id=$1 FOR UPDATE", u["id"])
            saldo = int(fila["balance"] or 0)
            nuevo = saldo + monto
            await conn.execute("UPDATE users SET balance=$2 WHERE id=$1",
                               u["id"], nuevo)
            await conn.execute("""
                INSERT INTO casino_movimientos
                    (ref, jugador_id, tipo, monto, saldo_previo, saldo_post,
                     juego, mesa_id, creado_en)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            """, ref, u["id"], tipo, monto, saldo, nuevo,
                 str(body.get("juego") or "")[:40],
                 str(body.get("mesa_id") or "")[:40])

    return {"ok": True, "repetido": False, "saldo_centavos": nuevo}


@app.get("/api/admin/casino/conciliacion")
async def casino_conciliacion(_=Depends(auth.require_admin), dias: int = 7):
    """Cuanto entro y cuanto salio por el casino. Para cuadrar con IAQP."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT tipo, COUNT(*) AS n, COALESCE(SUM(monto),0) AS total
            FROM casino_movimientos
            WHERE creado_en > NOW() - ($1 || ' days')::interval
            GROUP BY tipo
        """, str(max(1, min(dias, 365))))
    datos = {f["tipo"]: {"movimientos": int(f["n"]),
                         "centavos": int(f["total"])} for f in filas}
    apostado = datos.get("debito", {}).get("centavos", 0)
    pagado = (datos.get("credito", {}).get("centavos", 0)
              + datos.get("devolucion", {}).get("centavos", 0))
    return {
        "dias": dias, "detalle": datos,
        "apostado_centavos": apostado,
        "pagado_centavos": pagado,
        "margen_centavos": apostado - pagado,
        "rtp_real": round(pagado / apostado * 100, 3) if apostado else None,
    }


# ── GESTION DE RIESGO: EXPOSICION POR EVENTO ──────────────────
# Cuanto tendria que pagar la casa si gana cada resultado. Es el numero
# que decide si un mercado se suspende o se le baja la cuota.
#
# Criterio: en una combinada el premio entero esta en riesgo en CADA
# pata, porque tienen que ganar todas. Asi que se registra el
# potential_win completo contra cada seleccion. Es conservador y es lo
# correcto: si se repartiera entre las patas, se subestimaria el riesgo.
#
# Se escribe al crear la apuesta en vez de calcularse leyendo y
# parseando todos los boletos, porque los picks estan guardados como
# texto y eso no escala.

async def _cfg_riesgo(conn, moneda=None):
    """
    Tope de exposición. Es POR MONEDA: un tope de 500.000 tiene sentido
    en pesos y es absurdo en dólares. Si no hay uno cargado para esa
    moneda, cae al de pesos antes que quedar sin control.
    """
    filas = await conn.fetch(
        "SELECT clave, valor FROM app_config WHERE clave LIKE 'riesgo_%'")
    cfg = {f["clave"]: f["valor"] for f in filas}

    def num(k, d):
        try: return float(cfg.get(k) or d)
        except (TypeError, ValueError): return d

    m = (moneda or "ARS").upper()
    # Las claves con moneda son 'riesgo_max_evento_USD'; las viejas sin
    # sufijo se toman como pesos, que es lo que había hasta ahora.
    sufijo = "" if m == "ARS" else f"_{m}"
    max_ev = num(f"riesgo_max_evento{sufijo}", 0)
    max_sel = num(f"riesgo_max_seleccion{sufijo}", 0)
    if sufijo and max_ev == 0 and max_sel == 0:
        max_ev = num("riesgo_max_evento", 0)
        max_sel = num("riesgo_max_seleccion", 0)

    return {
        "max_evento": max_ev,
        "max_seleccion": max_sel,
        "activo": (cfg.get("riesgo_activo", "0") == "1"),
        "moneda": m,
    }


async def _registrar_exposicion(conn, code, picks, potential_win):
    """Una fila por seleccion del boleto. Se llama dentro de la transaccion."""
    for p in picks:
        ev = (p.get("event_id") or "")[:64]
        if not ev:
            continue   # sin id no hay con que agrupar
        await conn.execute("""
            INSERT INTO exposicion
                (code, event_id, sport_key, seleccion, mercado,
                 monto_riesgo, creado_at)
            VALUES ($1,$2,$3,$4,$5,$6,NOW())
            ON CONFLICT DO NOTHING
        """, code, ev, (p.get("sport_key") or "")[:60],
             (p.get("sel") or "")[:120], (p.get("market") or "h2h")[:40],
             int(potential_win or 0))


async def _exposicion_de(conn, event_id, seleccion):
    """Lo que ya se debe si gana esa seleccion, sin contar la apuesta nueva."""
    fila = await conn.fetchrow("""
        SELECT COALESCE(SUM(e.monto_riesgo),0) AS total
        FROM exposicion e
        JOIN betslips b ON b.code = e.code
        WHERE e.event_id=$1 AND e.seleccion=$2 AND b.status='active'
    """, event_id, seleccion)
    return int(fila["total"] or 0)


async def _controlar_riesgo(conn, picks, potential_win, moneda=None):
    """
    Devuelve (ok, motivo). Se llama ANTES de debitar.
    La moneda define qué tope aplica: los números de pesos y de
    dólares no son comparables.
    """
    cfg = await _cfg_riesgo(conn, moneda)
    if not cfg["activo"]:
        return True, ""
    tope = cfg["max_seleccion"] or cfg["max_evento"]
    if tope <= 0:
        return True, ""
    for p in picks:
        ev = p.get("event_id") or ""
        if not ev:
            continue
        ya = await _exposicion_de(conn, ev, p.get("sel") or "")
        if ya + int(potential_win or 0) > tope:
            log.warning(f"[RIESGO] tope alcanzado en {ev} / {p.get('sel')}: "
                        f"{ya} + {potential_win} > {tope}")
            return False, ("Esta apuesta supera el límite de la casa para ese "
                           "resultado. Probá con un monto menor.")
    return True, ""


@app.get("/api/admin/riesgo/exposicion")
async def admin_exposicion(_=Depends(auth.require_admin), limite: int = 40,
                           moneda: str = "ARS"):
    """Ranking de lo que mas se deberia pagar. Es el tablero de riesgo."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT e.event_id, e.sport_key, e.seleccion, e.mercado,
                   SUM(e.monto_riesgo) AS riesgo,
                   COUNT(*) AS boletos
            FROM exposicion e
            JOIN betslips b ON b.code = e.code
            WHERE b.status='active'
            GROUP BY e.event_id, e.sport_key, e.seleccion, e.mercado
            ORDER BY riesgo DESC
            LIMIT $1
        """, max(1, min(limite, 200)))
        cfg = await _cfg_riesgo(conn, moneda)
        total = await conn.fetchval("""
            SELECT COALESCE(SUM(b.potential_win),0) FROM betslips b
            WHERE b.status='active'
        """)
    tope = cfg["max_seleccion"] or cfg["max_evento"]
    return {
        "control_activo": cfg["activo"],
        "moneda": cfg.get("moneda", "ARS"),
        "tope_por_seleccion": tope,
        "riesgo_total_abierto": int(total or 0),
        "lineas": [{
            "event_id": f["event_id"], "sport_key": f["sport_key"],
            "seleccion": f["seleccion"], "mercado": f["mercado"],
            "riesgo": int(f["riesgo"] or 0), "boletos": int(f["boletos"] or 0),
            "supera_tope": bool(tope and int(f["riesgo"] or 0) > tope),
        } for f in filas],
    }


@app.get("/api/admin/riesgo/topes")
async def riesgo_topes(_=Depends(auth.require_admin)):
    """
    Todos los topes cargados, por moneda. Sin esto no había forma de
    saber cuáles estaban configurados: se veía solo el de la moneda
    que estuviera seleccionada.
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch(
            "SELECT clave, valor, updated_at FROM app_config "
            "WHERE clave LIKE 'riesgo_max_seleccion%' ORDER BY clave")
        activo = await conn.fetchval(
            "SELECT valor FROM app_config WHERE clave='riesgo_activo'")
        # Las monedas que realmente se usan, para marcar las que faltan
        usadas = await conn.fetch(
            "SELECT DISTINCT moneda FROM agencias WHERE moneda IS NOT NULL")

    topes = []
    for f in filas:
        # 'riesgo_max_seleccion' es pesos; '..._USD' es dólares
        resto = f["clave"].replace("riesgo_max_seleccion", "")
        moneda = resto.lstrip("_") or "ARS"
        try:
            valor = int(float(f["valor"] or 0))
        except (TypeError, ValueError):
            valor = 0
        topes.append({
            "moneda": moneda, "tope": valor,
            "fecha": _fecha_local(f["updated_at"]),
        })

    cargadas = {t["moneda"] for t in topes if t["tope"] > 0}
    faltan = sorted({(u["moneda"] or "ARS") for u in usadas} - cargadas)
    return {
        "activo": activo == "1",
        "topes": sorted(topes, key=lambda x: x["moneda"]),
        # Monedas en uso sin tope propio: usan el de pesos, mal escalado
        "sin_tope": faltan,
    }


@app.post("/api/admin/riesgo/config")
async def admin_riesgo_config(request: Request, _=Depends(auth.require_admin)):
    body = request and await request.json()
    # El tope se guarda por moneda: la clave lleva el sufijo salvo en
    # pesos, que mantiene la clave vieja para no perder lo cargado.
    moneda = (body.get("moneda") or "ARS").upper()[:4]
    sufijo = "" if moneda == "ARS" else f"_{moneda}"
    # La pantalla manda un solo tope; se guarda en las dos claves para
    # que el control lo encuentre mire cual mire.
    tope = int(body.get("max_seleccion", 0) or body.get("max_evento", 0) or 0)
    vals = {
        "riesgo_activo": "1" if body.get("activo") else "0",
        f"riesgo_max_seleccion{sufijo}": str(tope),
        f"riesgo_max_evento{sufijo}": str(tope),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at) VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    return {"ok": True, **vals}


# ── BANNERS DEL SITIO PUBLICO ─────────────────────────────────
# Los carga el admin y los muestra el carrusel de /sitio. Si no hay
# ninguno cargado, el sitio cae al arte generado y no se ve un hueco.
# Se guardan en app_config como JSON bajo la clave 'web_banners'.

# Firmas reales de archivo. Se valida el CONTENIDO, no la extension:
# alguien podria subir un HTML llamado "foto.jpg" y, si despues lo
# servimos desde tu dominio, se ejecutaria como pagina tuya.
FIRMAS_IMAGEN = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
]
MAX_BANNER_BYTES = 2 * 1024 * 1024   # 2 MB por imagen


def _tipo_de_imagen(datos: bytes):
    """Devuelve el content-type real, o None si no es una imagen conocida."""
    for firma, tipo in FIRMAS_IMAGEN:
        if datos.startswith(firma):
            return tipo
    # WEBP: 'RIFF' .... 'WEBP'
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "image/webp"
    return None


@app.get("/api/web/banners")
async def web_banners():
    """Banners del sitio publico. Sin auth: los ve cualquier visitante."""
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT id, titulo, texto, link, orden
            FROM web_banners WHERE activo = true
            ORDER BY orden, id LIMIT 8
        """)
    return {"banners": [{
        "imagen": f"/api/web/banner/{f['id']}",
        "titulo": f["titulo"] or "",
        "texto":  f["texto"] or "",
        "link":   f["link"] or "",
    } for f in filas]}


@app.get("/api/web/banner/{banner_id}")
async def web_banner_imagen(banner_id: int):
    """Sirve los bytes de la imagen. Publico y cacheable."""
    pool = await get_db()
    async with pool.acquire() as conn:
        f = await conn.fetchrow(
            "SELECT datos, mime FROM web_banners WHERE id=$1 AND activo=true",
            banner_id)
    if not f:
        raise HTTPException(404, "Banner inexistente")
    from fastapi.responses import Response
    return Response(
        content=bytes(f["datos"]),
        media_type=f["mime"] or "image/jpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            # Aunque validamos la firma, esto evita que el navegador
            # adivine el tipo y termine ejecutando algo.
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        })


@app.get("/api/admin/web/banners")
async def admin_listar_banners(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        filas = await conn.fetch("""
            SELECT id, titulo, texto, link, orden, activo,
                   octet_length(datos) AS peso, mime, creado_en
            FROM web_banners ORDER BY orden, id
        """)
    return {"banners": [{
        "id": f["id"], "titulo": f["titulo"], "texto": f["texto"],
        "link": f["link"], "orden": f["orden"], "activo": f["activo"],
        "peso_kb": round((f["peso"] or 0)/1024),
        "mime": f["mime"],
        "url": f"/api/web/banner/{f['id']}",
    } for f in filas]}


@app.post("/api/admin/web/banners/subir")
async def admin_subir_banner(request: Request, _=Depends(auth.require_admin)):
    """
    Recibe la imagen en base64 desde el panel. Se usa base64 y no
    multipart para no depender de python-multipart, que puede no estar
    instalado, y porque desde el celular es mas simple.
    """
    body = await request.json()
    b64 = str(body.get("imagen_base64") or "")
    if "," in b64[:80]:              # viene como data:image/jpeg;base64,....
        b64 = b64.split(",", 1)[1]
    if not b64:
        raise HTTPException(400, "Falta la imagen")

    import base64
    try:
        datos = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(400, "La imagen no se pudo decodificar")

    if len(datos) > MAX_BANNER_BYTES:
        raise HTTPException(400,
            f"La imagen pesa {len(datos)//1024} KB. El maximo es 2048 KB.")
    if len(datos) < 100:
        raise HTTPException(400, "El archivo esta vacio o corrupto")

    mime = _tipo_de_imagen(datos)
    if not mime:
        raise HTTPException(400,
            "El archivo no es una imagen valida (JPG, PNG, GIF o WEBP)")

    pool = await get_db()
    async with pool.acquire() as conn:
        cuantos = await conn.fetchval("SELECT COUNT(*) FROM web_banners")
        if cuantos >= 8:
            raise HTTPException(400,
                "Ya hay 8 banners. Borra alguno antes de subir otro.")
        nuevo_id = await conn.fetchval("""
            INSERT INTO web_banners
                (titulo, texto, link, orden, activo, datos, mime, creado_en)
            VALUES ($1,$2,$3,$4,true,$5,$6,NOW())
            RETURNING id
        """, str(body.get("titulo") or "")[:80],
             str(body.get("texto") or "")[:160],
             str(body.get("link") or "")[:300],
             int(body.get("orden") or 0), datos, mime)

    return {"ok": True, "id": nuevo_id, "mime": mime,
            "peso_kb": round(len(datos)/1024)}


@app.post("/api/admin/web/banners/{banner_id}")
async def admin_editar_banner(banner_id: int, request: Request,
                              _=Depends(auth.require_admin)):
    """Cambia textos, orden o si esta visible. No toca la imagen."""
    body = await request.json()
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.execute("""
            UPDATE web_banners
            SET titulo=$2, texto=$3, link=$4, orden=$5, activo=$6
            WHERE id=$1
        """, banner_id, str(body.get("titulo") or "")[:80],
             str(body.get("texto") or "")[:160],
             str(body.get("link") or "")[:300],
             int(body.get("orden") or 0), bool(body.get("activo", True)))
    if r.endswith("0"):
        raise HTTPException(404, "Banner inexistente")
    return {"ok": True}


@app.post("/api/admin/web/banners/{banner_id}/borrar")
async def admin_borrar_banner(banner_id: int, _=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM web_banners WHERE id=$1", banner_id)
    return {"ok": True}


# ── AI COMBOS ─────────────────────────────────────────────────
@app.get("/api/ai/combos")
async def ai_combos():
    """Genera 3 combos IA con eventos reales del día"""
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    cache_key = "ai_combos"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < 300:  # 5 min cache
            return data

    # Traer todos los eventos disponibles
    SPORTS_TO_CHECK = [
        "baseball_mlb","basketball_wnba","americanfootball_nfl",
        "soccer_usa_mls","soccer_argentina_primera_division",
        "soccer_conmebol_copa_libertadores","soccer_mexico_ligamx",
        "tennis_atp_wimbledon","mma_mixed_martial_arts",
        "aussierules_afl","cricket_international_t20",
        "americanfootball_cfl",
    ]

    all_events = []

    async def _fetch_ai(sk):
        async with httpx.AsyncClient(timeout=12) as c:
            data = await odds_get(c, f"/v4/sports/{sk}/odds/",
                {"apiKey":ODDS_API_KEY,"regions":ODDS_REGIONS,
                 "markets":"h2h,totals","oddsFormat":"decimal",
                 "dateFormat":"iso"}, 12)
        return sk, data

    ai_sport_data = {}
    try:
        pairs = await asyncio.gather(*[_fetch_ai(sk) for sk in SPORTS_TO_CHECK],
                                     return_exceptions=True)
        for p in pairs:
            if isinstance(p, Exception):
                continue
            sk, d = p
            if d: ai_sport_data[sk] = d
    except Exception as e:
        log.error(f"AI combo fetch error: {e}")

    for sport_key in SPORTS_TO_CHECK:
        data = ai_sport_data.get(sport_key)
        if data:
            for ev in data[:4]:
                home = ev.get("home_team","")
                away = ev.get("away_team","")
                h_odd=None; d_odd=None; a_odd=None
                over_odd=None; under_odd=None
                over_line=None
                for bm in ev.get("bookmakers",[]):
                    for mkt in bm.get("markets",[]):
                        if mkt["key"]=="h2h":
                            for o in mkt.get("outcomes",[]):
                                if o["name"]==home: h_odd=round(o["price"],2)
                                elif o["name"]==away: a_odd=round(o["price"],2)
                                elif o["name"]=="Draw": d_odd=round(o["price"],2)
                        elif mkt["key"]=="totals":
                            for o in mkt.get("outcomes",[]):
                                if o["name"].startswith("Over"):
                                    over_odd=round(o["price"],2)
                                    try: over_line=float(o["name"].split()[-1])
                                    except: over_line=2.5
                                elif o["name"].startswith("Under"):
                                    under_odd=round(o["price"],2)
                    if h_odd: break
                if h_odd:
                    try:
                        from datetime import datetime
                        dt=datetime.fromisoformat(ev.get("commence_time","").replace("Z","+00:00"))
                        fecha=dt.astimezone().strftime("%d/%m %H:%M")
                    except:
                        fecha="--/-- --:--"
                    all_events.append({
                        "id": ev.get("id",""),
                        "sport_key": sport_key,
                        "h": home, "a": away,
                        "time": fecha,
                        "commence_iso": ev.get("commence_time",""),
                        "sport": sport_key.replace("_"," ").title(),
                        "odds": {"L":h_odd,"E":d_odd,"V":a_odd},
                        "over_odd": over_odd,
                        "under_odd": under_odd,
                        "over_line": over_line,
                        "fav_odd": min(h_odd, a_odd) if h_odd and a_odd else h_odd,
                        "fav_team": home if h_odd and a_odd and h_odd <= a_odd else away,
                    })

    if not all_events:
        return {"combos": [], "error": "No hay eventos disponibles"}

    # ── COMBO 1: Favoritos seguros (cuotas 1.10-1.65) ──
    seguros = [e for e in all_events if e["fav_odd"] and 1.10 <= e["fav_odd"] <= 1.65]
    seguros.sort(key=lambda x: x["fav_odd"])
    combo1_picks = []
    for ev in seguros[:4]:
        combo1_picks.append({
            "h": ev["h"], "a": ev["a"],
            "sel": f"{ev['fav_team']} gana",
            "odd": ev["fav_odd"],
            "mkt": "1X2",
            "sport": ev["sport"],
            "time": ev["time"],
            "commence_iso": ev.get("commence_iso",""),
            "live": False,
            "event_id": ev["id"],
            "sport_key": ev["sport_key"],
        })

    # ── COMBO 2: Goles/Over (cuotas 1.70-2.20) ──
    goles = [e for e in all_events if e["over_odd"] and 1.60 <= e["over_odd"] <= 2.20]
    combo2_picks = []
    for ev in goles[:4]:
        combo2_picks.append({
            "h": ev["h"], "a": ev["a"],
            "sel": f"Más de {ev['over_line']} goles/puntos",
            "odd": ev["over_odd"],
            "mkt": "O/U",
            "sport": ev["sport"],
            "time": ev["time"],
            "commence_iso": ev.get("commence_iso",""),
            "live": False,
            "event_id": ev["id"],
            "sport_key": ev["sport_key"],
        })

    # ── COMBO 3: Alta cuota (cuotas 2.00-4.00) ──
    altas = [e for e in all_events if e["fav_odd"] and 1.80 <= e["fav_odd"] <= 4.00]
    altas.sort(key=lambda x: x["fav_odd"], reverse=True)
    combo3_picks = []
    for ev in altas[:3]:
        combo3_picks.append({
            "h": ev["h"], "a": ev["a"],
            "sel": f"{ev['fav_team']} gana",
            "odd": ev["fav_odd"],
            "mkt": "1X2",
            "sport": ev["sport"],
            "time": ev["time"],
            "commence_iso": ev.get("commence_iso",""),
            "live": False,
            "event_id": ev["id"],
            "sport_key": ev["sport_key"],
        })

    def calc_odd(picks):
        r = 1
        for p in picks: r *= p["odd"]
        return round(r, 2)

    combos = []
    if combo1_picks:
        combos.append({
            "id": "c1",
            "name": "Combo Seguros",
            "tag": "Baja cuota · Alta confianza",
            "tagColor": "#00FF88",
            "conf": 9,
            "picks": combo1_picks,
            "odd_total": calc_odd(combo1_picks),
            "note": "Favoritos claros en sus respectivos deportes",
        })
    if combo2_picks:
        combos.append({
            "id": "c2",
            "name": "Combo Goles",
            "tag": "Over/Under · Partidos con goles",
            "tagColor": "#FFB800",
            "conf": 7,
            "picks": combo2_picks,
            "odd_total": calc_odd(combo2_picks),
            "note": "Partidos con historial ofensivo y cuotas equilibradas",
        })
    if combo3_picks:
        combos.append({
            "id": "c3",
            "name": "Combo Alta Cuota",
            "tag": "Riesgo moderado · Gran retorno",
            "tagColor": "#9F5FFF",
            "conf": 6,
            "picks": combo3_picks,
            "odd_total": calc_odd(combo3_picks),
            "note": "Favoritos con mayor margen pero mayor retorno potencial",
        })

    result = {"combos": combos, "generated_at": time.strftime("%d/%m %H:%M")}
    _football_cache[cache_key] = (result, now)
    return result


# ── GENERADOR PERSISTENTE DE COMBOS IA ────────────────────────
# Guarda los 3 combos IA en combos_manuales (fuente='ia') para que los
# lean el influencer, la web y el bot desde una sola fuente de verdad.
# Cada combo guarda primer_evento_at = horario del partido más temprano;
# cuando NOW() lo alcanza, el combo pasa a "expirado" (calculado al vuelo).
def _primer_evento_iso(picks):
    """Devuelve el datetime del partido más temprano del combo, o None."""
    fechas = []
    for p in picks:
        iso = (p.get("commence_iso") or "").replace("Z","+00:00")
        if iso:
            try:
                fechas.append(datetime.fromisoformat(iso))
            except Exception:
                pass
    return min(fechas) if fechas else None


async def _generar_y_guardar_combos_ia():
    """Genera los 3 combos IA y los persiste. Marca los del batch anterior
    como no visibles solo si ya expiraron (los activos siguen jugables)."""
    try:
        data = await ai_combos()
    except Exception as e:
        log.error(f"[IA] error generando combos: {e}")
        return
    combos = (data or {}).get("combos") or []
    if not combos:
        log.info("[IA] sin combos para guardar")
        return

    batch = time.strftime("%Y%m%d-%H%M")
    pool = await get_db()
    async with pool.acquire() as conn:
        for c in combos:
            picks = c.get("picks") or []
            if not picks:
                continue
            # normalizar picks al formato que usa el resto (h/a/sel/odd/...)
            limpios = [{
                "h": p.get("h",""), "a": p.get("a",""),
                "sel": p.get("sel",""), "odd": p.get("odd"),
                "sport": p.get("sport",""), "mkt": p.get("mkt",""),
                "time": p.get("time",""),
                "event_id": p.get("event_id"), "sport_key": p.get("sport_key"),
            } for p in picks]
            primer = _primer_evento_iso(picks)
            await conn.execute("""
                INSERT INTO combos_manuales
                    (origen, creado_por, nombre, picks, odd_total, visible,
                     fuente, destino_box, destino_app, destino_agencia,
                     primer_evento_at, auto_batch)
                VALUES ('ia', 'sistema', $1, $2, $3, true,
                        'ia', true, true, true, $4, $5)
            """, c.get("name","Combo IA"), str(limpios),
                 float(c.get("odd_total") or 0), primer, batch)
        # Los combos IA viejos que YA expiraron dejan de mostrarse en el panel
        # activo (quedan en historial). Los que siguen activos se mantienen.
        await conn.execute("""
            UPDATE combos_manuales
            SET visible = false
            WHERE fuente = 'ia' AND auto_batch <> $1
              AND primer_evento_at IS NOT NULL
              AND primer_evento_at <= NOW()
        """, batch)
    log.info(f"[IA] {len(combos)} combos guardados (batch {batch})")


async def _loop_riesgo():
    """
    Corre el motor de riesgo cada hora. Detectar contrapartida al día
    siguiente no sirve de mucho: para cuando se revisa, el evento ya
    terminó y el premio está pagado.

    Arranca con retraso para no competir con el resto del arranque.
    """
    await asyncio.sleep(300)
    while True:
        try:
            pool = await get_db()
            async with pool.acquire() as conn:
                res = await _correr_motor_riesgo(conn)
            nuevas = sum(v for v in res.values() if v > 0)
            if nuevas:
                log.warning(f"[RIESGO] {nuevas} alertas nuevas: "
                            + ", ".join(f"{k}={v}" for k, v in res.items() if v > 0))
        except Exception as e:
            log.error(f"[RIESGO] el motor falló: {e}")
        await asyncio.sleep(3600)


async def _loop_combos_ia():
    """Tarea de fondo: genera combos IA al arrancar y cada 3 horas."""
    await asyncio.sleep(20)   # dar tiempo a que la DB y las odds estén listas
    while True:
        try:
            await _generar_y_guardar_combos_ia()
        except Exception as e:
            log.error(f"[IA] loop error: {e}")
        await asyncio.sleep(3 * 3600)   # cada 3 horas


async def _loop_liquidaciones():
    """Tarea de fondo: una vez al día revisa si toca liquidar.
    Lunes => liquida la semana anterior. Día 1 => liquida el mes anterior.
    Respeta la config (qué períodos están activos)."""
    from datetime import date as _date
    await asyncio.sleep(60)   # arrancar después de todo lo demás
    while True:
        try:
            pool = await get_db()
            async with pool.acquire() as conn:
                val = await conn.fetchval(
                    "SELECT valor FROM app_config WHERE clave='liquidacion_periodo'")
            activos = (val or "semanal,mensual").split(",")
            hoy = _date.today()
            if "semanal" in activos and hoy.weekday() == 0:   # lunes
                r = await _generar_liquidaciones_auto("semanal")
                log.info(f"[LIQ] semanal: {r}")
            if "mensual" in activos and hoy.day == 1:
                r = await _generar_liquidaciones_auto("mensual")
                log.info(f"[LIQ] mensual: {r}")
        except Exception as e:
            log.error(f"[LIQ] loop error: {e}")
        await asyncio.sleep(24 * 3600)   # una vez al día


@app.on_event("startup")
async def _arrancar_combos_ia():
    asyncio.create_task(_loop_combos_ia())
    asyncio.create_task(_loop_liquidaciones())
    asyncio.create_task(_loop_riesgo())
    log.info("[IA] generador de combos programado (cada 3h)")
    log.info("[LIQ] liquidaciones automáticas programadas (diario)")


@app.post("/api/admin/combos-ia/generar")
async def admin_forzar_combos_ia(_=Depends(auth.require_admin)):
    """Fuerza la generación de combos IA ahora (para probar sin esperar 3h)."""
    await _generar_y_guardar_combos_ia()
    return {"ok": True}


# ── MEJORAR COMBINADA (lee captura con Claude) ────────────────
# Flujo: el cliente sube una foto de una apuesta de otro sitio. Claude
# lee los partidos y mercados. Buscamos esos eventos en NUESTRAS cuotas
# reales y armamos la combinada. Si nuestra cuota es más baja, la subimos
# hasta un tope. Nunca damos una cuota que no podamos sostener.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# ═══════════════════════════════════════════════════════════════
# PSP — CashInProcessor (carga y retiro digital)
# ═══════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════
# SPORTRADAR — Soccer API v4 (estadísticas, resultados, logos)
# ═══════════════════════════════════════════════════════════════
SPORTRADAR_KEY = os.environ.get("SPORTRADAR_KEY", "")
SPORTRADAR_ACCESS = os.environ.get("SPORTRADAR_ACCESS", "trial")  # trial | production
SPORTRADAR_LANG = os.environ.get("SPORTRADAR_LANG", "en")
SPORTRADAR_BASE = "https://api.sportradar.com/soccer"


async def _sr_get(path):
    """Llama al Soccer API de Sportradar. path arranca después del idioma.
    Ej: '/sport_events/{id}/summary.json'."""
    if not SPORTRADAR_KEY:
        raise HTTPException(503, "Sportradar no configurado (falta SPORTRADAR_KEY)")
    url = f"{SPORTRADAR_BASE}/{SPORTRADAR_ACCESS}/v4/{SPORTRADAR_LANG}{path}"
    sep = "&" if "?" in url else "?"
    url = f"{url}{sep}api_key={SPORTRADAR_KEY}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url)
    if r.status_code == 429:
        raise HTTPException(429, "Sportradar: límite de requests alcanzado")
    if r.status_code >= 400:
        log.error(f"[SR] GET {path} -> {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, f"Error consultando Sportradar ({r.status_code})")
    return r.json()


# ── Odds Comparison Prematch v2 (cuotas) ──────────────────────
SR_ODDS_BASE = "https://api.sportradar.com/oddscomparison-prematch"

async def _sr_odds_get(path):
    """Llama al Odds Comparison Prematch v2. path arranca después del idioma.
    La key va en el header x-api-key (según la doc de Sportradar).
    Los ':' de los IDs (sr:sport:1) se codifican a %3A sin doble codificación."""
    if not SPORTRADAR_KEY:
        raise HTTPException(503, "Sportradar no configurado (falta SPORTRADAR_KEY)")
    # Codificar los ':' de los IDs de Sportradar (sr:sport:1 -> sr%3Asport%3A1)
    path_enc = path.replace(":", "%3A")
    url = f"{SR_ODDS_BASE}/{SPORTRADAR_ACCESS}/v2/{SPORTRADAR_LANG}{path_enc}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, headers={
            "accept": "application/json",
            "x-api-key": SPORTRADAR_KEY,
        })
    if r.status_code == 429:
        raise HTTPException(429, "Sportradar: límite de requests alcanzado")
    if r.status_code >= 400:
        log.error(f"[SR-ODDS] GET {path} -> {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, f"Error consultando cuotas Sportradar ({r.status_code}): {r.text[:100]}")
    return r.json()


# Cache de deportes y de eventos con cuotas (evita gastar requests)
_sr_odds_cache = {"sports": None, "sports_ts": 0}

async def _sr_odds_sports():
    """Lista de deportes con cuotas disponibles (cacheado 1 hora)."""
    import time
    ahora = time.time()
    if _sr_odds_cache["sports"] and (ahora - _sr_odds_cache["sports_ts"] < 3600):
        return _sr_odds_cache["sports"]
    data = await _sr_odds_get("/sports.json")
    sports = data.get("sports", [])
    _sr_odds_cache["sports"] = sports
    _sr_odds_cache["sports_ts"] = ahora
    return sports


async def _sr_odds_eventos_dia(sport_id, fecha_iso):
    """Eventos con cuotas de un deporte en una fecha (Daily Schedules).
    Ruta oficial: /sports/{sport_id}/schedules/{date}/schedules.json"""
    path = f"/sports/{sport_id}/schedules/{fecha_iso}/schedules.json"
    data = await _sr_odds_get(path)
    return data.get("schedules", []) or data.get("sport_events", [])


async def _sr_odds_mercados_evento(sport_event_id):
    """Mercados (cuotas) de un evento (Sport Event Markets).
    Ruta oficial: /sport_events/{id}/sport_event_markets.json"""
    path = f"/sport_events/{sport_event_id}/sport_event_markets.json"
    return await _sr_odds_get(path)


async def _sr_odds_mercados_dia(sport_id, fecha_iso):
    """Cuotas de TODOS los eventos de un deporte en un día (Daily Sport Event Markets).
    Ruta: /sports/{sport_id}/schedules/{date}/sport_event_markets.json
    Trae partidos + cuotas en una sola llamada (más eficiente)."""
    path = f"/sports/{sport_id}/schedules/{fecha_iso}/sport_event_markets.json"
    data = await _sr_odds_get(path)
    return (data.get("sport_schedule_sport_event_markets")
            or data.get("sport_event_markets") or data.get("schedules") or [])


# Casas de referencia para tomar la cuota (en orden de preferencia)
_SR_BOOKS_PREF = ["Consensus", "DraftKings", "FanDuel", "MGM", "BetRivers"]

def _sr_mejor_book(books):
    """Elige la casa de referencia de una lista de books (por preferencia).
    Si no hay ninguna preferida, usa la primera disponible."""
    if not books:
        return None
    activos = [b for b in books if not b.get("removed")]
    if not activos:
        return None
    for pref in _SR_BOOKS_PREF:
        for b in activos:
            if b.get("name") == pref:
                return b
    return activos[0]


def _sr_cuota_1x2(markets):
    """Extrae las cuotas 1X2 (home/draw/away) de los mercados de un evento."""
    for m in markets or []:
        if m.get("name", "").lower() in ("1x2", "3way", "3-way"):
            book = _sr_mejor_book(m.get("books", []))
            if not book:
                return None
            cuotas = {}
            for o in book.get("outcomes", []):
                t = o.get("type")
                try:
                    dec = float(o.get("odds_decimal", 0) or 0)
                except (TypeError, ValueError):
                    dec = 0
                if t == "home": cuotas["home"] = dec
                elif t == "away": cuotas["away"] = dec
                elif t == "draw": cuotas["draw"] = dec
            return cuotas if cuotas else None
    return None


def _sr_extraer_mercados(markets, home_name, away_name):
    """Extrae TODOS los mercados de un evento al formato de la app.
    Devuelve una lista de {key, label, odd} lista para mostrar como botones."""
    salida = []
    for m in markets or []:
        nombre = (m.get("name") or "").lower()
        book = _sr_mejor_book(m.get("books", []))
        if not book:
            continue
        outcomes = book.get("outcomes", [])
        # Datos extra del mercado (línea de hándicap / total)
        for o in outcomes:
            if o.get("removed"):
                continue
            try:
                dec = float(o.get("odds_decimal", 0) or 0)
            except (TypeError, ValueError):
                dec = 0
            if dec <= 1:
                continue
            tipo = o.get("type", "")
            # Línea (para total y hándicap): viene en el outcome o el market
            linea = o.get("total") or o.get("handicap") or o.get("line") or ""
            # Armar etiqueta legible según el mercado
            if nombre == "1x2":
                lbl = {"home": home_name, "draw": "Empate", "away": away_name}.get(tipo, tipo)
                key = f"1x2:{tipo}"
            elif nombre == "draw no bet":
                lbl = {"home": f"{home_name} (DNB)", "away": f"{away_name} (DNB)"}.get(tipo, tipo)
                key = f"dnb:{tipo}"
            elif nombre == "total":
                ln = linea or o.get("total_value") or ""
                lbl = f"{'Más' if tipo=='over' else 'Menos'} de {ln} goles" if ln else ("Over" if tipo=="over" else "Under")
                key = f"total:{tipo}:{ln}"
            elif "handicap" in nombre:
                ln = linea or ""
                who = home_name if tipo=="home" else away_name if tipo=="away" else tipo
                lbl = f"{who} {ln}".strip()
                key = f"hcp:{tipo}:{ln}"
            elif nombre == "odd/even":
                lbl = "Par" if tipo=="even" else "Impar"
                key = f"oe:{tipo}"
            else:
                lbl = f"{nombre} {tipo}".strip()
                key = f"{nombre}:{tipo}"
            salida.append({"key": key, "label": lbl, "odd": round(dec, 2), "market": nombre})
    return salida


def _sr_evento_a_app(item):
    """Convierte un evento de Sportradar (con cuotas) al formato que usa la app.
    Devuelve un dict con TODOS los mercados o None si no tiene cuotas."""
    ev = item.get("sport_event", {})
    comps = ev.get("competitors", [])
    home = next((c for c in comps if c.get("qualifier") == "home"), {})
    away = next((c for c in comps if c.get("qualifier") == "away"), {})
    if not home or not away:
        return None
    cuotas = _sr_cuota_1x2(item.get("markets", []))
    todos = _sr_extraer_mercados(item.get("markets", []),
                                 home.get("name"), away.get("name"))
    if not todos:
        return None
    return {
        "id": ev.get("id"),
        "event_id": ev.get("id"),
        "sport_key": "soccer_sr",
        "sport": "Fútbol",
        "home": home.get("name"),
        "away": away.get("name"),
        "h": home.get("name"),
        "a": away.get("name"),
        "commence_time": ev.get("start_time"),
        "time": ev.get("start_time"),
        "status": ev.get("status"),
        "home_odd": (cuotas or {}).get("home"),
        "draw_odd": (cuotas or {}).get("draw"),
        "away_odd": (cuotas or {}).get("away"),
        "mercados": todos,
        "pais": home.get("country"),
    }


async def _sr_partidos_con_cuotas(sport_id="sr:sport:1", dias=2):
    """Trae los partidos de los próximos N días con cuotas, en formato app."""
    from datetime import date, timedelta
    hoy = date.today()
    salida = []
    for d in range(0, dias):
        dia = (hoy + timedelta(days=d)).strftime("%Y-%m-%d")
        try:
            items = await _sr_odds_mercados_dia(sport_id, dia)
        except Exception:
            continue
        for it in items:
            ev = _sr_evento_a_app(it)
            if ev:
                salida.append(ev)
    return salida


# Caché de partidos con cuotas para la app (evita gastar el límite del trial)
_sr_partidos_cache = {"data": None, "ts": 0}
_SR_PARTIDOS_TTL = 180  # segundos (3 min); en prod se puede subir

async def _sr_partidos_cacheados(sport_id="sr:sport:1", dias=2):
    """Devuelve los partidos con cuotas usando caché (no pega a Sportradar
    en cada request de cada cliente)."""
    import time
    ahora = time.time()
    if _sr_partidos_cache["data"] is not None and (ahora - _sr_partidos_cache["ts"] < _SR_PARTIDOS_TTL):
        return _sr_partidos_cache["data"]
    try:
        partidos = await _sr_partidos_con_cuotas(sport_id, dias)
        _sr_partidos_cache["data"] = partidos
        _sr_partidos_cache["ts"] = ahora
        return partidos
    except Exception:
        # Si falla, devolver lo último cacheado (aunque esté viejo) o vacío
        return _sr_partidos_cache["data"] or []


# ── PREMATCH DESDE SPORTRADAR ─────────────────────────────────
# Reemplaza a The Odds API como fuente de cuotas previas.
#
# EL MOTIVO NO ES PREFERENCIA, ES CORRECCION:
# las cuotas venian de The Odds API y la liquidacion consulta
# Sportradar. Son dos universos de identificadores distintos, asi que
# los picks quedaban con un event_id que la liquidacion no podia usar
# y las apuestas nunca se resolvian solas. Con un unico proveedor el
# id que se guarda al apostar es el mismo que se consulta al liquidar.
#
# Se respeta el formato que ya consume la app (sports[].events[] con
# odds L/E/V y markets) para no tocar el frontend.

# CUIDADO CON EL CONSUMO
# El trial de Sportradar son 1000 llamadas EN TOTAL (no por dia) y
# 1 consulta por segundo. Cada deporte y cada dia de agenda es una
# llamada por refresco:
#
#   3 deportes x 2 dias, refrescando cada 9 min = 960 llamadas/dia
#   -> el trial se agota en UN dia.
#
# Para que 1000 llamadas duren los 30 dias hay un presupuesto de ~33
# por dia: un deporte, un dia de agenda, refrescando cada ~45 minutos.
# Con eso arranca configurado. Al pasar al plan pago se sube por
# variables de entorno, sin tocar el codigo.

SR_DEPORTES_TODOS = [
    ("sr:sport:1",  "soccer_sr",     "Fútbol",   "⚽"),
    ("sr:sport:2",  "basketball_sr", "Básquet",  "🏀"),
    ("sr:sport:5",  "tennis_sr",     "Tenis",    "🎾"),
]

# Por defecto solo futbol. SR_DEPORTES="soccer_sr,basketball_sr" para sumar.
_sr_activos = [d.strip() for d in
               os.environ.get("SR_DEPORTES", "soccer_sr").split(",") if d.strip()]
SR_DEPORTES = [d for d in SR_DEPORTES_TODOS if d[1] in _sr_activos] \
              or SR_DEPORTES_TODOS[:1]

SR_DIAS = max(1, int(os.environ.get("SR_DIAS", "1")))

_sr_all_cache = {"data": None, "ts": 0}
_SR_ALL_TTL = int(os.environ.get("SR_TTL", "2700"))   # 45 minutos

# Contador para ver el consumo sin tener que entrar al portal
_sr_llamadas = {"total": 0, "desde": None, "ultimo_error": None}


def _sr_mercados_formato_app(item, home, away):
    """
    Pasa los mercados de Sportradar a la forma {mercado: {opcion: cuota}},
    que es la que ya entienden la app y el bet builder.
    """
    salida = {}
    for m in (item.get("markets") or []):
        nombre = (m.get("name") or "").lower()
        libros = m.get("books") or []
        # Se toma el primer libro con cuotas; alcanza para mostrar
        outcomes = []
        for b in libros:
            if b.get("outcomes"):
                outcomes = b["outcomes"]
                break
        if not outcomes:
            continue

        if "3way" in nombre or nombre in ("1x2", "match result"):
            clave = "h2h"
        elif "total" in nombre and "corner" not in nombre:
            clave = "totals"
        elif "both teams" in nombre or "btts" in nombre:
            clave = "btts"
        elif "handicap" in nombre or "spread" in nombre:
            clave = "spreads"
        else:
            clave = (m.get("name") or "otros")[:40]

        opciones = {}
        for o in outcomes:
            tipo = (o.get("type") or o.get("name") or "").lower()
            try:
                cuota = float(o.get("odds_decimal") or o.get("odds") or 0)
            except (TypeError, ValueError):
                continue
            if cuota < 1.01:
                continue
            # Se nombran las opciones como las espera la app
            if tipo in ("home", "1"):
                etiqueta = home
            elif tipo in ("away", "2"):
                etiqueta = away
            elif tipo in ("draw", "x"):
                etiqueta = "Draw"
            else:
                etiqueta = (o.get("name") or tipo or "?")[:40]
            opciones[etiqueta] = cuota
        if opciones:
            salida[clave] = opciones
    return salida


async def _sr_armar_all_markets():
    """Arma la respuesta de /api/live/all-markets desde Sportradar."""
    from datetime import date, timedelta
    hoy = date.today()
    result = {"sports": [], "fuente": "sportradar"}

    for sport_id, sport_key, nombre, icono in SR_DEPORTES:
        eventos = []
        for d in range(0, SR_DIAS):
            dia = (hoy + timedelta(days=d)).strftime("%Y-%m-%d")
            try:
                if _sr_llamadas["desde"] is None:
                    _sr_llamadas["desde"] = datetime.now(timezone.utc).isoformat()
                _sr_llamadas["total"] += 1
                items = await _sr_odds_mercados_dia(sport_id, dia)
                # 1 consulta por segundo en el trial: se respeta el ritmo
                await asyncio.sleep(1.1)
            except Exception as e:
                _sr_llamadas["ultimo_error"] = str(e)[:200]
                log.warning(f"[SR] {sport_key} {dia}: {e}")
                continue

            for it in items:
                ev = it.get("sport_event", {})
                comps = ev.get("competitors", [])
                home = next((c.get("name") for c in comps
                             if c.get("qualifier") == "home"), None)
                away = next((c.get("name") for c in comps
                             if c.get("qualifier") == "away"), None)
                if not home or not away:
                    continue

                markets = _sr_mercados_formato_app(it, home, away)
                if not markets.get("h2h"):
                    continue   # sin 1X2 no hay nada que mostrar

                try:
                    dt = datetime.fromisoformat(
                        (ev.get("start_time") or "").replace("Z", "+00:00"))
                    fecha = dt.astimezone(TZ_CASA).strftime("%d/%m %H:%M")
                except Exception:
                    fecha = "--/-- --:--"

                eventos.append({
                    # El id de Sportradar: el MISMO que usa la liquidación
                    "id": ev.get("id"),
                    "event_id": ev.get("id"),
                    "sport_key": sport_key,
                    "h": home, "a": away,
                    "time": fecha,
                    "commence_time": ev.get("start_time"),
                    "markets": markets,
                    "odds": {
                        "L": markets["h2h"].get(home),
                        "E": markets["h2h"].get("Draw"),
                        "V": markets["h2h"].get(away),
                    },
                })

        if eventos:
            result["sports"].append({
                "key": sport_key, "name": nombre, "icon": icono,
                "events": eventos[:ODDS_MAX_EVENTOS],
            })

    return result


async def _sr_all_markets_cacheado():
    import time
    ahora = time.time()
    if (_sr_all_cache["data"] is not None
            and ahora - _sr_all_cache["ts"] < _SR_ALL_TTL):
        return _sr_all_cache["data"]
    try:
        datos = await _sr_armar_all_markets()
        # Se guarda aunque haya venido incompleto: mejor tener dos
        # deportes cacheados que volver a pedir los seis en la próxima
        # visita. Antes, si un deporte fallaba, no se guardaba nada.
        if datos.get("sports"):
            _sr_all_cache["data"] = datos
            _sr_all_cache["ts"] = ahora
        elif _sr_all_cache["data"]:
            return _sr_all_cache["data"]
        return datos
    except Exception as e:
        # El motivo tiene que verse: antes esto devolvía una lista
        # vacía en silencio y no había forma de saber si era la clave,
        # el crédito o un fallo puntual de la API.
        log.error(f"[SR] all-markets falló: {type(e).__name__}: {e}")
        previo = _sr_all_cache["data"]
        if previo and previo.get("sports"):
            log.warning("[SR] se devuelve el último feed cacheado")
            return previo
        return {"sports": [], "fuente": "sportradar",
                "error": f"{type(e).__name__}: {str(e)[:160]}"}


@app.get("/api/admin/sportradar/estado")
async def sr_estado(_=Depends(auth.require_admin)):
    """
    Por qué el feed viene vacío. Sin esto había que adivinar entre
    clave ausente, crédito agotado o fallo puntual.
    """
    import time
    cache = _sr_all_cache.get("data") or {}
    edad = time.time() - (_sr_all_cache.get("ts") or 0)
    diag = {
        "clave_configurada": bool(SPORTRADAR_KEY),
        "deportes_en_cache": len(cache.get("sports") or []),
        "eventos_en_cache": sum(len(d.get("events") or [])
                                for d in cache.get("sports") or []),
        "antiguedad_seg": int(edad) if _sr_all_cache.get("ts") else None,
        "llamadas_hechas": _sr_llamadas.get("total", 0),
        "desde": _sr_llamadas.get("desde"),
    }
    if not SPORTRADAR_KEY:
        diag["diagnostico"] = ("Falta la variable SPORTRADAR_KEY en el "
                               "servidor. Sin eso no se puede pedir nada.")
    else:
        # Se prueba una llamada real para ver qué responde
        try:
            from datetime import date
            hoy = date.today().strftime("%Y-%m-%d")
            items = await _sr_odds_mercados_dia(SR_DEPORTES[0][0], hoy)
            diag["prueba"] = f"{len(items)} eventos hoy en "\
                             f"{SR_DEPORTES[0][2]}"
            diag["diagnostico"] = ("La API responde. Si el catálogo está "
                                   "vacío, puede que no haya partidos en "
                                   "los próximos días.") if not items else \
                                  "La API responde con datos."
        except Exception as e:
            diag["prueba"] = f"{type(e).__name__}: {str(e)[:200]}"
            diag["diagnostico"] = ("La API rechazó la consulta. Suele ser "
                                   "la clave vencida o el crédito agotado.")
    return diag


@app.get("/api/sportradar/partidos")
async def sportradar_partidos_publico():
    """Endpoint público para la app: partidos de fútbol con cuotas (Sportradar).
    Usa caché para no gastar el límite del trial."""
    partidos = await _sr_partidos_cacheados("sr:sport:1", dias=2)
    return {"fuente": "sportradar", "total": len(partidos), "partidos": partidos}


@app.get("/api/admin/sportradar/test")
async def sportradar_test(_=Depends(auth.require_admin)):
    """Prueba que la key de Sportradar funcione. Trae las competiciones."""
    try:
        data = await _sr_get("/competitions.json")
        comps = data.get("competitions", [])
        return {"ok": True, "total_competiciones": len(comps),
                "ejemplos": [{"id": c.get("id"), "nombre": c.get("name")}
                             for c in comps[:5]]}
    except HTTPException as e:
        return {"ok": False, "error": e.detail}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@app.get("/api/admin/sportradar/test-cuotas")
async def sportradar_test_cuotas(_=Depends(auth.require_admin)):
    """Verifica si la cuenta tiene acceso a cuotas de Sportradar."""
    al = SPORTRADAR_ACCESS
    lg = SPORTRADAR_LANG
    intentos = [
        ("OC Prematch v2 sports",
         f"https://api.sportradar.com/oddscomparison-prematch/{al}/v2/{lg}/sports.json"),
        ("OC Prematch v2 books",
         f"https://api.sportradar.com/oddscomparison-prematch/{al}/v2/{lg}/books.json"),
    ]
    resultados = []
    async with httpx.AsyncClient(timeout=20) as client:
        for nombre, url in intentos:
            try:
                r = await client.get(url, headers={
                    "accept": "application/json", "x-api-key": SPORTRADAR_KEY})
                resultados.append({
                    "producto": nombre, "status": r.status_code,
                    "acceso": r.status_code < 400,
                    "detalle": ("OK" if r.status_code < 400 else r.text[:120]),
                })
            except Exception as e:
                resultados.append({"producto": nombre, "status": 0,
                                   "acceso": False, "detalle": str(e)[:120]})
    hay_cuotas = any(r["acceso"] for r in resultados)
    return {"tiene_cuotas": hay_cuotas, "intentos": resultados}


@app.get("/api/admin/sportradar/test-cuotas-real")
async def sportradar_test_cuotas_real(_=Depends(auth.require_admin)):
    """Prueba real: trae los deportes con cuotas y un evento de ejemplo."""
    try:
        sports = await _sr_odds_sports()
        return {"ok": True, "total_deportes": len(sports),
                "deportes": [{"id": s.get("id"), "nombre": s.get("name")}
                             for s in sports[:15]]}
    except HTTPException as e:
        return {"ok": False, "error": e.detail}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@app.get("/api/admin/sportradar/inspeccionar-cuotas")
async def sportradar_inspeccionar_cuotas(variante: int = 1, _=Depends(auth.require_admin)):
    """Prueba UNA sola ruta de cuotas por vez (para no gastar el límite del trial).
    Cambiar ?variante=1..6 para probar distintas rutas."""
    from datetime import date
    dia = date.today().strftime("%Y-%m-%d")
    sid = "sr:sport:1"
    rutas = {
        1: f"/sports/{sid}/schedules/{dia}/schedules.json",
        2: f"/sports/{sid}/schedules/{dia}/summaries.json",
        3: f"/sports/{sid}/competitions.json",
    }
    ruta = rutas.get(variante, rutas[1])
    try:
        data = await _sr_odds_get(ruta)
        claves = list(data.keys()) if isinstance(data, dict) else []
        eventos = None
        for k in ("sport_events","schedules","sport_event_markets","summaries"):
            if isinstance(data.get(k), list) and data.get(k):
                eventos = data[k]; break
        return {"ok": bool(eventos), "ruta": ruta, "claves": claves,
                "cant_eventos": len(eventos) if eventos else 0,
                "muestra_evento": eventos[0] if eventos else None,
                "respuesta_cruda": (data if not eventos else None)}
    except HTTPException as e:
        return {"ok": False, "ruta": ruta, "error": str(e.detail)}
    except Exception as e:
        return {"ok": False, "ruta": ruta, "error": str(e)[:150]}


@app.get("/api/admin/sportradar/mercados-evento")
async def sportradar_mercados_evento(event_id: str, _=Depends(auth.require_admin)):
    """Trae los mercados (cuotas) de un evento para ver la estructura."""
    try:
        data = await _sr_odds_mercados_evento(event_id)
        return {"ok": True, "estructura": data}
    except HTTPException as e:
        return {"ok": False, "error": str(e.detail)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:150]}


@app.get("/api/admin/sportradar/mercados-disponibles")
async def sportradar_mercados_disponibles(_=Depends(auth.require_admin)):
    """Lista TODOS los tipos de mercados que traen los partidos de hoy/mañana,
    para saber qué se puede ofrecer (1x2, totales, córners, tarjetas, etc.)."""
    from datetime import date, timedelta
    hoy = date.today()
    nombres = {}
    for d in range(0, 2):
        dia = (hoy + timedelta(days=d)).strftime("%Y-%m-%d")
        try:
            items = await _sr_odds_mercados_dia("sr:sport:1", dia)
        except Exception:
            continue
        for it in items:
            for m in it.get("markets", []):
                nom = m.get("name", "?")
                nombres[nom] = nombres.get(nom, 0) + 1
        if nombres:
            break
    # Ordenar por frecuencia
    ordenados = sorted(nombres.items(), key=lambda x: -x[1])
    return {"ok": True, "total_tipos": len(ordenados),
            "mercados": [{"nombre": n, "partidos": c} for n, c in ordenados]}


@app.get("/api/admin/sportradar/partidos-cuotas")
async def sportradar_partidos_cuotas(_=Depends(auth.require_admin)):
    """Prueba el mapeo: trae los partidos con cuotas ya convertidos al formato app."""
    try:
        partidos = await _sr_partidos_con_cuotas("sr:sport:1", dias=2)
        return {"ok": True, "total": len(partidos), "partidos": partidos[:10]}
    except HTTPException as e:
        return {"ok": False, "error": str(e.detail)}
    except Exception as e:
        return {"ok": False, "error": str(e)[:150]}


@app.get("/api/admin/sportradar/mercados-dia")
async def sportradar_mercados_dia(fecha: str = "", _=Depends(auth.require_admin)):
    """Trae las cuotas de todos los eventos de fútbol (Daily Sport Event Markets)
    y devuelve la estructura CRUDA para inspeccionar cómo vienen las cuotas."""
    from datetime import date
    dia = fecha or date.today().strftime("%Y-%m-%d")
    path = f"/sports/sr:sport:1/schedules/{dia}/sport_event_markets.json"
    try:
        data = await _sr_odds_get(path)
        claves = list(data.keys()) if isinstance(data, dict) else []
        # Ver qué hay en cada clave de nivel superior
        resumen = {}
        for k in claves:
            v = data[k]
            if isinstance(v, list):
                resumen[k] = f"lista de {len(v)} items"
            else:
                resumen[k] = str(type(v).__name__)
        # Tomar el primer item de la lista principal (sea cual sea su nombre)
        primer = None
        for k in claves:
            if isinstance(data[k], list) and data[k]:
                primer = data[k][0]; break
        return {"ok": True, "fecha": dia, "claves": claves,
                "resumen_claves": resumen, "primer_item": primer}
    except HTTPException as e:
        return {"ok": False, "error": str(e.detail), "fecha": dia}
    except Exception as e:
        return {"ok": False, "error": str(e)[:150], "fecha": dia}


@app.get("/api/admin/sportradar/partidos-hoy")
async def sportradar_partidos_hoy(_=Depends(auth.require_admin)):
    """Trae los partidos del día desde Sportradar (para inspeccionar la estructura)."""
    from datetime import date
    hoy = date.today().strftime("%Y-%m-%d")
    try:
        data = await _sr_get(f"/schedules/{hoy}/summaries.json")
        summaries = data.get("summaries", [])
        partidos = []
        for s in summaries[:20]:
            ev = s.get("sport_event", {})
            st = s.get("sport_event_status", {})
            comps = ev.get("competitors", [])
            home = next((c["name"] for c in comps if c.get("qualifier")=="home"), "?")
            away = next((c["name"] for c in comps if c.get("qualifier")=="away"), "?")
            partidos.append({
                "id": ev.get("id"),
                "home": home, "away": away,
                "inicio": ev.get("start_time"),
                "estado": st.get("status"),
                "marcador": f"{st.get('home_score','-')}-{st.get('away_score','-')}",
            })
        return {"ok": True, "fecha": hoy, "total": len(summaries), "partidos": partidos}
    except HTTPException as e:
        return {"ok": False, "error": e.detail}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@app.get("/api/admin/sportradar/resumen/{event_id}")
async def sportradar_resumen(event_id: str, _=Depends(auth.require_admin)):
    """Trae el resumen completo de un partido (marcador + estadísticas)
    para ver qué campos trae Sportradar (córners, tarjetas, etc.)."""
    try:
        data = await _sr_get(f"/sport_events/{event_id}/summary.json")
        st = data.get("sport_event_status", {})
        stats = st.get("statistics", {})
        return {"ok": True, "estado": st.get("status"),
                "marcador": {"home": st.get("home_score"), "away": st.get("away_score")},
                "tiene_estadisticas": bool(stats),
                "estadisticas": stats}
    except HTTPException as e:
        return {"ok": False, "error": e.detail}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


def _sr_normalizar(nombre):
    """Normaliza un nombre de equipo para comparar (saca acentos, minúsculas, sufijos)."""
    import unicodedata, re
    n = unicodedata.normalize("NFKD", nombre or "").encode("ascii","ignore").decode()
    n = n.lower()
    # Sacar sufijos y prefijos comunes que ensucian el match
    for x in ["fc","cf","ca","sc","ac","cd","club","atletico","atlético",
              "deportivo","de","el","la","los","las"," am"," sc"]:
        n = re.sub(rf"\b{x}\b", "", n)
    n = re.sub(r"[^a-z0-9]", "", n)
    return n


def _sr_stats_equipo(statistics, qualifier):
    """Extrae las stats de un equipo (home/away) del summary de Sportradar.
    Devuelve dict con corners, yellow_cards, red_cards, shots, etc."""
    if not statistics:
        return {}
    totals = statistics.get("totals", {})
    comps = totals.get("competitors", [])
    for c in comps:
        if c.get("qualifier") == qualifier:
            return c.get("statistics", {})
    return {}


async def _sr_live_scores():
    """Trae los partidos en vivo de Sportradar con su marcador.
    Devuelve dict {normalizado_home|normalizado_away: {home_score, away_score, minute}}."""
    try:
        data = await _sr_get("/schedules/live/summaries.json")
    except Exception:
        return {}
    out = {}
    for sm in data.get("summaries", []):
        ev = sm.get("sport_event", {})
        st = sm.get("sport_event_status", {})
        if st.get("status") not in ("live", "started", "1st_half", "2nd_half", "halftime"):
            continue
        comps = ev.get("competitors", [])
        h = next((c["name"] for c in comps if c.get("qualifier")=="home"), "")
        a = next((c["name"] for c in comps if c.get("qualifier")=="away"), "")
        if not h or not a:
            continue
        clave = f"{_sr_normalizar(h)}|{_sr_normalizar(a)}"
        out[clave] = {
            "home_score": st.get("home_score"),
            "away_score": st.get("away_score"),
            "minute": (st.get("clock", {}) or {}).get("played", ""),
            "sr_id": ev.get("id"),
        }
    return out


# Cache de live scores (10s, para no gastar el límite)
_sr_live_cache = {"data": None, "ts": 0}

async def _sr_live_cacheado():
    import time
    ahora = time.time()
    if _sr_live_cache["data"] is not None and (ahora - _sr_live_cache["ts"] < 10):
        return _sr_live_cache["data"]
    data = await _sr_live_scores()
    _sr_live_cache["data"] = data
    _sr_live_cache["ts"] = ahora
    return data


async def _sr_resultado(event_id):
    """Trae el resultado de un partido de Sportradar por su ID.
    Devuelve {estado, home_score, away_score, stats_home, stats_away} o None."""
    try:
        data = await _sr_get(f"/sport_events/{event_id}/summary.json")
    except Exception:
        return None
    st = data.get("sport_event_status", {})
    estado = st.get("status")
    if estado not in ("closed", "ended"):
        return None
    stats = st.get("statistics", {})
    return {
        "estado": estado,
        "home_score": st.get("home_score"),
        "away_score": st.get("away_score"),
        "stats_home": _sr_stats_equipo(stats, "home"),
        "stats_away": _sr_stats_equipo(stats, "away"),
        "tiene_stats": bool(stats),
    }


# Cache simple de partidos de Sportradar por día (evita repetir llamadas)
_sr_schedule_cache = {}

async def _sr_buscar_partido(home, away, fecha_iso=None):
    """Busca en Sportradar el partido que coincide con home/away (por nombre).
    fecha_iso: 'YYYY-MM-DD'. Devuelve el event_id de Sportradar o None."""
    from datetime import date, datetime, timedelta
    if fecha_iso:
        dias = [fecha_iso]
    else:
        hoy = date.today()
        dias = [(hoy - timedelta(days=d)).strftime("%Y-%m-%d") for d in range(0, 3)]
    nh, na = _sr_normalizar(home), _sr_normalizar(away)
    for dia in dias:
        if dia not in _sr_schedule_cache:
            try:
                data = await _sr_get(f"/schedules/{dia}/summaries.json")
                _sr_schedule_cache[dia] = data.get("summaries", [])
            except Exception:
                _sr_schedule_cache[dia] = []
        for sm in _sr_schedule_cache[dia]:
            ev = sm.get("sport_event", {})
            comps = ev.get("competitors", [])
            h = next((c["name"] for c in comps if c.get("qualifier")=="home"), "")
            a = next((c["name"] for c in comps if c.get("qualifier")=="away"), "")
            if _sr_normalizar(h)==nh and _sr_normalizar(a)==na:
                return ev.get("id")
    return None


def _sr_fmt_stats(stats_home, stats_away):
    """Da formato a las stats de un partido para mostrar en la app."""
    if not stats_home and not stats_away:
        return []
    campos = [
        ("ball_possession", "Posesión", "%"),
        ("shots_total", "Tiros", ""),
        ("shots_on_target", "Tiros al arco", ""),
        ("corner_kicks", "Córners", ""),
        ("yellow_cards", "Tarjetas amarillas", ""),
        ("red_cards", "Tarjetas rojas", ""),
        ("fouls", "Faltas", ""),
        ("offsides", "Offsides", ""),
    ]
    out = []
    for campo, label, unidad in campos:
        vh = (stats_home or {}).get(campo)
        va = (stats_away or {}).get(campo)
        if vh is None and va is None:
            continue
        out.append({"label": label, "home": vh or 0, "away": va or 0, "unidad": unidad})
    return out


@app.get("/api/partido/stats")
async def partido_stats(home: str = "", away: str = "", fecha: str = "", event_id: str = ""):
    """Stats en vivo/finales de un partido. Si viene event_id de Sportradar,
    lo usa directo; si no, empareja por nombre. Lo usan app, agencia y box."""
    if event_id and str(event_id).startswith("sr:sport_event:"):
        eid = event_id
    else:
        eid = await _sr_buscar_partido(home, away, fecha or None)
    if not eid:
        return {"disponible": False, "motivo": "Partido no encontrado en el proveedor de datos"}
    try:
        data = await _sr_get(f"/sport_events/{eid}/summary.json")
    except Exception:
        return {"disponible": False, "motivo": "No se pudieron traer las estadísticas"}
    st = data.get("sport_event_status", {})
    stats = st.get("statistics", {})
    sh = _sr_stats_equipo(stats, "home")
    sa = _sr_stats_equipo(stats, "away")
    filas = _sr_fmt_stats(sh, sa)
    return {
        "disponible": True,
        "estado": st.get("status"),
        "marcador": {"home": st.get("home_score"), "away": st.get("away_score")},
        "tiene_stats": bool(filas),
        "stats": filas,
        "sr_id": eid,
    }


@app.get("/api/partido/previa")
async def partido_previa(home: str = "", away: str = "", fecha: str = "", event_id: str = ""):
    """Datos previos: head-to-head y forma reciente de cada equipo.
    Si viene event_id de Sportradar, lo usa directo."""
    if event_id and str(event_id).startswith("sr:sport_event:"):
        eid = event_id
    else:
        eid = await _sr_buscar_partido(home, away, fecha or None)
    if not eid:
        return {"disponible": False, "motivo": "Partido no encontrado"}
    try:
        data = await _sr_get(f"/sport_events/{eid}/summaries.json?")
    except Exception:
        data = {}
    # Head-to-head (Sportradar: endpoint de versus)
    h2h = []
    forma_home = []
    forma_away = []
    try:
        comps = data.get("summaries", [])
        # Últimos enfrentamientos
        for sm in comps[:5]:
            ev = sm.get("sport_event", {})
            st = sm.get("sport_event_status", {})
            cs = ev.get("competitors", [])
            hn = next((c["name"] for c in cs if c.get("qualifier")=="home"), "?")
            an = next((c["name"] for c in cs if c.get("qualifier")=="away"), "?")
            h2h.append({
                "home": hn, "away": an,
                "marcador": f"{st.get('home_score','-')}-{st.get('away_score','-')}",
                "fecha": str(ev.get("start_time",""))[:10],
            })
    except Exception:
        pass
    return {
        "disponible": True,
        "head_to_head": h2h,
        "forma_home": forma_home,
        "forma_away": forma_away,
    }


@app.get("/api/admin/sportradar/diagnostico-liquidacion")
async def sportradar_diag_liquidacion(_=Depends(auth.require_admin)):
    """Diagnostica por qué las apuestas no se liquidan: muestra qué datos
    tiene cada pick y si se encuentra el partido en Sportradar."""
    _sr_schedule_cache.clear()
    pool = await get_db()
    async with pool.acquire() as conn:
        pendientes = await conn.fetch("""
            SELECT code, picks FROM betslips
            WHERE status IN ('pending','active') AND resultado IS NULL
            ORDER BY created_at DESC LIMIT 10
        """)
    diag = []
    for r in pendientes:
        try:
            picks = ast.literal_eval(r["picks"]) if r["picks"] else []
        except Exception:
            picks = []
        info_picks = []
        for p in picks:
            if not isinstance(p, dict):
                continue
            home = p.get("home") or p.get("h") or ""
            away = p.get("away") or p.get("a") or ""
            fecha = str(p.get("commence_time",""))[:10] or None
            eid = await _sr_buscar_partido(home, away, fecha) if home and away else None
            res = await _sr_resultado(eid) if eid else None
            info_picks.append({
                "home": home, "away": away, "sel": p.get("sel") or p.get("label"),
                "fecha_pick": fecha,
                "encontrado_en_sr": bool(eid),
                "sr_id": eid,
                "tiene_resultado": bool(res),
                "marcador": f"{res['home_score']}-{res['away_score']}" if res else None,
            })
        diag.append({"code": r["code"], "picks": info_picks})
    return {"diagnostico": diag}


@app.post("/api/admin/sportradar/liquidar")
async def sportradar_liquidar(_=Depends(auth.require_admin)):
    """Liquidación automática usando Sportradar. Empareja cada partido por
    nombre + fecha, trae el resultado y resuelve todos los mercados
    (goles, córners, tarjetas, tiros cuando hay stats)."""
    _sr_schedule_cache.clear()   # refrescar el cache al liquidar
    pool = await get_db()
    async with pool.acquire() as conn:
        pendientes = await conn.fetch("""
            SELECT code, picks, potential_win, user_id, con_bono
            FROM betslips
            WHERE status IN ('pending','active') AND resultado IS NULL
            ORDER BY created_at ASC LIMIT 200
        """)
    if not pendientes:
        return {"revisadas": 0, "ganadas": 0, "perdidas": 0, "sin_resolver": 0,
                "mensaje": "No hay apuestas pendientes"}

    # Cache de resultados por partido (evita repetir llamadas)
    cache_result = {}
    async def _resultado_de(home, away, fecha, event_id=None):
        # Si el pick ya tiene el ID de Sportradar, usarlo directo (sin emparejar nombres)
        if event_id and str(event_id).startswith("sr:sport_event:"):
            if event_id in cache_result:
                return cache_result[event_id]
            res = await _sr_resultado(event_id)
            cache_result[event_id] = res
            return res
        clave = f"{_sr_normalizar(home)}|{_sr_normalizar(away)}"
        if clave in cache_result:
            return cache_result[clave]
        eid = await _sr_buscar_partido(home, away, fecha)
        res = await _sr_resultado(eid) if eid else None
        cache_result[clave] = res
        return res

    ganadas = perdidas = sin_resolver = 0
    detalle_sin = []
    async with pool.acquire() as conn:
        for r in pendientes:
            try:
                picks = ast.literal_eval(r["picks"]) if r["picks"] else []
            except Exception:
                picks = []
            estados = []
            for p in picks:
                if not isinstance(p, dict):
                    estados.append(None); continue
                home = p.get("home") or p.get("h") or ""
                away = p.get("away") or p.get("a") or ""
                fecha = None
                if p.get("commence_time"):
                    fecha = str(p["commence_time"])[:10]
                res = await _resultado_de(home, away, fecha,
                                          p.get("event_id") or p.get("id"))
                if not res or res["home_score"] is None:
                    estados.append(None); continue
                try:
                    sh = int(res["home_score"]); sa = int(res["away_score"])
                except (TypeError, ValueError):
                    estados.append(None); continue
                estado = resolver_pick_sr(p, sh, sa, home, away,
                                          res.get("stats_home"), res.get("stats_away"))
                estados.append(estado)

            if any(e is None for e in estados) or not estados:
                sin_resolver += 1
                detalle_sin.append(r["code"])
                continue
            gano = all(e is True for e in estados)
            await conn.execute("""
                UPDATE betslips SET resultado=$2, liquidado_at=NOW(), liquidado_por='sportradar'
                WHERE code=$1
            """, r["code"], "ganada" if gano else "perdida")
            # Pagar el premio si ganó (a saldo real, salvo que sea con bono)
            if gano:
                premio = r["potential_win"] or 0
                if r["con_bono"]:
                    # El premio del bono va al saldo de bono (respeta rollover)
                    await conn.execute(
                        "UPDATE users SET saldo_bono = saldo_bono + $2 WHERE id=$1",
                        r["user_id"], int(premio * 100))
                else:
                    await conn.execute(
                        "UPDATE users SET balance = balance + $2 WHERE id=$1",
                        r["user_id"], int(premio * 100))
                await conn.execute(
                    "UPDATE betslips SET status='paid', paid_at=NOW() WHERE code=$1", r["code"])
                ganadas += 1
            else:
                await conn.execute(
                    "UPDATE betslips SET status='paid' WHERE code=$1", r["code"])
                perdidas += 1

    return {
        "revisadas": len(pendientes),
        "ganadas": ganadas, "perdidas": perdidas, "sin_resolver": sin_resolver,
        "sin_resolver_codigos": detalle_sin[:20],
        "mensaje": f"{ganadas} ganadas, {perdidas} perdidas, {sin_resolver} sin resolver (revisar a mano).",
    }


PSP_BASE_URL = os.environ.get("PSP_BASE_URL", "https://ingress.soportecallcenter.com")
PSP_API_KEY = os.environ.get("PSP_API_KEY", "")
# URL pública de esta API, para armar los callbacks que la PSP va a llamar
API_PUBLIC_URL = os.environ.get("API_PUBLIC_URL", "https://amusing-vision-production.up.railway.app")


async def _psp_get(path):
    if not PSP_API_KEY:
        raise HTTPException(503, "PSP no configurada (falta PSP_API_KEY)")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{PSP_BASE_URL}{path}",
            headers={"X-API-Key": PSP_API_KEY})
    if r.status_code >= 400:
        log.error(f"[PSP] GET {path} -> {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, "Error consultando la PSP")
    return r.json()


async def _psp_post(path, body):
    if not PSP_API_KEY:
        raise HTTPException(503, "PSP no configurada (falta PSP_API_KEY)")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{PSP_BASE_URL}{path}",
            headers={"X-API-Key": PSP_API_KEY, "Content-Type": "application/json"},
            json=body)
    if r.status_code >= 400:
        log.error(f"[PSP] POST {path} -> {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, f"Error en la PSP: {r.text[:150]}")
    return r.json() if r.text else {}


async def _bb_config(conn):
    """Config del bet builder de mismo partido."""
    rows = await conn.fetch(
        "SELECT clave, valor FROM app_config WHERE clave LIKE 'bb_%'")
    cfg = {r["clave"]: r["valor"] for r in rows}
    return {
        "activo": cfg.get("bb_activo", "true") == "true",
        "margen_correlacion": float(cfg.get("bb_margen_correlacion", "15") or 15),
        "stake_max": int(cfg.get("bb_stake_max", "20000") or 20000),
        "min_picks": int(cfg.get("bb_min_picks", "2") or 2),
        "max_picks": int(cfg.get("bb_max_picks", "4") or 4),
        "margen_escalon": float(cfg.get("bb_margen_escalon", "3") or 3),
        "escalon_desde": int(cfg.get("bb_escalon_desde", "3") or 3),
        "ramas": [x for x in (cfg.get("bb_ramas", "") or "").split(",") if x],
        # Excluidas: agencias donde NO se ofrece aunque esté activo
        # para el resto. Sin esto, para sacárselo a una había que
        # listar a todas las demás en 'ramas'.
        "excluidas": [x for x in (cfg.get("bb_excluidas", "") or "").split(",") if x],
    }


async def _bb_activo_para(conn, agencia_code):
    """
    ¿El bet builder está disponible para esta agencia?

    La exclusión gana sobre la habilitación: si una agencia está
    excluida no lo tiene, sin importar que su rama esté habilitada.
    Es lo que permite sacárselo a una sola sin tocar el resto.
    """
    cfg = await _bb_config(conn)
    if not cfg["activo"]:
        return False

    ruta = None
    if agencia_code and (cfg["excluidas"] or cfg["ramas"]):
        ruta = await conn.fetchval(
            "SELECT ruta FROM agencias WHERE code=$1", agencia_code)
    partes = [p for p in (ruta or "").split("/") if p]

    # Excluida ella o alguna de la que cuelga
    if cfg["excluidas"]:
        if agencia_code in cfg["excluidas"]:
            return False
        if any(p in cfg["excluidas"] for p in partes):
            return False

    if not cfg["ramas"]:
        return True   # activo para todos salvo las excluidas
    if agencia_code in cfg["ramas"]:
        return True
    return any(p in cfg["ramas"] for p in partes)


def _margen_efectivo(margen_base, n_picks, escalon=0.0, escalon_desde=3):
    """Escala el margen: +escalon% por cada pick por encima de escalon_desde."""
    extra = 0.0
    if escalon > 0 and n_picks > escalon_desde:
        extra = escalon * (n_picks - escalon_desde)
    return margen_base + extra


def _cuota_mismo_partido(picks, margen_correlacion, escalon=0.0, escalon_desde=3):
    """Calcula la cuota combinada de selecciones del MISMO partido aplicando
    un margen de correlación (descuento) para proteger a la casa.
    El margen escala con la cantidad de picks (más picks = más correlación).
    picks: lista de {odd}. margen en % (ej 15 = -15%)."""
    if not picks:
        return 1.0
    bruto = 1.0
    for p in picks:
        bruto *= float(p.get("odd", 1) or 1)
    margen = _margen_efectivo(margen_correlacion, len(picks), escalon, escalon_desde)
    # Aplicar el descuento por correlación sobre la ganancia (bruto - 1)
    ganancia = bruto - 1.0
    factor = max(0.0, 1.0 - margen / 100.0)
    neto = 1.0 + ganancia * factor
    return round(neto, 2)


@app.get("/api/bet-builder/config")
async def bb_config_publico(agencia: str = ""):
    """Config pública del bet builder (para la app)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _bb_config(conn)
        activo = await _bb_activo_para(conn, agencia) if agencia else cfg["activo"]
    return {"activo": activo, "stake_max": cfg["stake_max"],
            "min_picks": cfg["min_picks"], "max_picks": cfg["max_picks"]}


@app.post("/api/bet-builder/cotizar")
async def bb_cotizar(request: Request):
    """Cotiza una apuesta del mismo partido: devuelve la cuota con el margen
    de correlación aplicado. body: {picks:[{odd,...}], mismo_partido: bool}"""
    body = await request.json()
    picks = body.get("picks", [])
    mismo = body.get("mismo_partido", False)
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _bb_config(conn)
    if mismo:
        cuota = _cuota_mismo_partido(picks, cfg["margen_correlacion"],
                                     cfg["margen_escalon"], cfg["escalon_desde"])
    else:
        # Partidos distintos: multiplicación normal
        cuota = 1.0
        for p in picks:
            cuota *= float(p.get("odd", 1) or 1)
        cuota = round(cuota, 2)
    return {"cuota": cuota, "stake_max": cfg["stake_max"],
            "margen_aplicado": cfg["margen_correlacion"] if mismo else 0}


@app.get("/api/agencias/me/features")
async def agencia_features(agencia_code: str = Depends(requiere_agencia)):
    """Le dice a la agencia qué funciones tiene activas (bet builder, PSP)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        bb = await _bb_activo_para(conn, agencia_code)
        psp = await _psp_activa_para(conn, agencia_code)
        cfg = await _bb_config(conn)
    return {
        "bet_builder": bb,
        "psp": psp,
        "bb_max_picks": cfg["max_picks"],
        "bb_stake_max": cfg["stake_max"],
    }


@app.get("/api/admin/bet-builder/config")
async def admin_bb_config(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _bb_config(conn)
        # Registro de agencias con el bet builder activo
        agencias = await conn.fetch("SELECT code, name, ruta FROM agencias WHERE status='active'")
        activas = []
        for a in agencias:
            try:
                if await _bb_activo_para(conn, a["code"]):
                    activas.append({"code": a["code"], "name": a["name"]})
            except Exception:
                pass
        cfg["agencias_activas"] = activas
        cfg["total_activas"] = len(activas)
    return cfg


@app.post("/api/admin/bet-builder/config")
async def admin_bb_set_config(request: Request, _=Depends(auth.require_admin)):
    """body: {activo, margen_correlacion, stake_max, min_picks}"""
    body = await request.json()
    vals = {
        "bb_activo": "true" if body.get("activo", True) else "false",
        "bb_margen_correlacion": str(body.get("margen_correlacion", 15)),
        "bb_stake_max": str(int(body.get("stake_max", 20000))),
        "bb_min_picks": str(int(body.get("min_picks", 2))),
        "bb_max_picks": str(int(body.get("max_picks", 4))),
        "bb_margen_escalon": str(body.get("margen_escalon", 3)),
        "bb_escalon_desde": str(int(body.get("escalon_desde", 3))),
        "bb_ramas": ",".join(body.get("ramas") or []),
        "bb_excluidas": ",".join(body.get("excluidas") or []),
    }
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in vals.items():
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at) VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    return {"ok": True}


@app.post("/api/admin/bet-builder/analizar")
async def admin_bb_analizar(request: Request, _=Depends(auth.require_admin)):
    """La IA asesora sobre la config del bet builder de mismo partido."""
    body = await request.json()
    config = body.get("config", {})
    prompt = f"""Sos analista de riesgo de una casa de apuestas deportivas.
Evaluá esta configuración del BET BUILDER de MISMO PARTIDO (mercados combinados
del mismo evento, ej: gana local + ambos marcan + córners).

Config actual:
{json.dumps(config, ensure_ascii=False, indent=2)}

Contexto clave: las cuotas se calculan multiplicando las selecciones y aplicando
un "margen de correlación" (descuento %) porque los eventos del mismo partido están
correlacionados y multiplicar puro le paga de más al cliente (riesgo de correlated parlay).

Analizá:
1. Nivel de riesgo (BAJO/MEDIO/ALTO) para la casa.
2. Si el margen de correlación es suficiente (15-30% suele ser lo prudente; menos es riesgoso).
3. Si el límite de stake protege bien.
4. Recomendación concreta de valores.

Español, máximo 6 líneas, directo. Empezá con el nivel de riesgo."""
    texto = await _consultar_claude_texto(prompt)
    return {"analisis": texto.strip()}


async def _psp_config(conn):
    """Lee la config PSP desde app_config."""
    rows = await conn.fetch(
        "SELECT clave, valor FROM app_config WHERE clave LIKE 'psp_%'")
    cfg = {r["clave"]: r["valor"] for r in rows}
    return {
        "activo": cfg.get("psp_activo", "false") == "true",
        "retiro_modo": cfg.get("psp_retiro_modo", "manual"),
        "ramas": [x for x in (cfg.get("psp_ramas", "") or "").split(",") if x],
    }


async def _psp_activa_para(conn, agencia_code):
    """True si la PSP está activa para esa agencia (global o por rama)."""
    cfg = await _psp_config(conn)
    if not cfg["activo"]:
        return False
    if not cfg["ramas"]:
        return True   # activa global
    # Activa solo si la agencia o algún ancestro está en las ramas habilitadas
    if agencia_code in cfg["ramas"]:
        return True
    ruta = await conn.fetchval("SELECT ruta FROM agencias WHERE code=$1", agencia_code)
    if ruta:
        partes = [p for p in ruta.split("/") if p]
        return any(p in cfg["ramas"] for p in partes)
    return False


@app.get("/api/admin/psp/config")
async def admin_psp_config(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        cfg = await _psp_config(conn)
        # ¿Hay credenciales cargadas?
        cfg["configurada"] = bool(PSP_API_KEY)
    return cfg


@app.post("/api/admin/psp/config")
async def admin_psp_set_config(request: Request, _=Depends(auth.require_admin)):
    """body: {activo: bool, retiro_modo: 'manual'|'automatico', ramas: [codes]}"""
    body = await request.json()
    activo = "true" if body.get("activo") else "false"
    modo = body.get("retiro_modo", "manual")
    if modo not in ("manual", "automatico"):
        modo = "manual"
    ramas = ",".join(body.get("ramas") or [])
    pool = await get_db()
    async with pool.acquire() as conn:
        for k, v in [("psp_activo", activo), ("psp_retiro_modo", modo), ("psp_ramas", ramas)]:
            await conn.execute("""
                INSERT INTO app_config (clave, valor, updated_at) VALUES ($1,$2,NOW())
                ON CONFLICT (clave) DO UPDATE SET valor=$2, updated_at=NOW()
            """, k, v)
    return {"ok": True}


@app.get("/api/admin/psp/saldo")
async def admin_psp_saldo(_=Depends(auth.require_admin)):
    """Saldo de la cuenta recaudadora en la PSP."""
    data = await _psp_get("/api/v1/balances/summary")
    return data


# ── CASHIN (carga digital del cliente) ────────────────────────

@app.post("/api/me/psp/cargar")
async def me_psp_cargar(request: Request):
    """El cliente pide cargar por PSP. Registra el CashIn Request y devuelve
    el CVU para que transfiera. body: {init_data, monto, cuit}"""
    body = await request.json()
    user = validar_init_data(body.get("init_data", ""))
    if not user or not user.get("id"):
        raise HTTPException(401, "No autenticado")
    try:
        monto = int(body.get("monto", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    cuit = "".join(ch for ch in (body.get("cuit") or "") if ch.isdigit())
    if monto <= 0:
        raise HTTPException(400, "El monto debe ser mayor a cero")
    if len(cuit) != 11:
        raise HTTPException(400, "El CUIT debe tener 11 dígitos")

    tg_id = str(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT id, creado_por FROM users WHERE telegram_id::text=$1 OR id::text=$1
        """, tg_id)
        if not u:
            raise HTTPException(404, "Usuario no encontrado")
        if not await _psp_activa_para(conn, u["creado_por"] or ""):
            raise HTTPException(403, "La carga digital no está disponible")

    # Obtener el CVU recaudador
    cvu_data = await _psp_get("/api/v1/cvu")
    # Registrar el CashIn Request (referenciaInt = user_id para correlacionar)
    from datetime import datetime, timedelta, timezone as _tz
    expira = (datetime.now(_tz.utc) + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    req = await _psp_post("/api/v1/cashin-requests", {
        "cuit": cuit,
        "accountNumber": str(u["id"]),
        "currency": "032",
        "expectedAmount": float(monto),
        "expiresAt": expira,
        "clientCallbackUrl": f"{API_PUBLIC_URL}/api/psp/webhook/cashin",
        "referenciaString": f"carga-{u['id']}",
        "referenciaInt": int(u["id"]),
    })
    request_id = req.get("id")
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO psp_cargas (request_id, user_id, cuit, monto, estado, agencia_code)
            VALUES ($1,$2,$3,$4,'pendiente',$5)
        """, request_id, u["id"], cuit, monto, u["creado_por"])

    return {"ok": True, "request_id": request_id,
            "cvu": cvu_data.get("cvu"), "alias": cvu_data.get("alias"),
            "nombre": cvu_data.get("nombre"),
            "monto": monto,
            "mensaje": "Transferí desde tu CUIT al CVU. Se acredita solo al llegar."}


@app.post("/api/psp/webhook/cashin")
async def psp_webhook_cashin(request: Request):
    """La PSP llama acá cuando un pago entrante fue matcheado (o expiró)."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
    # Evento EXPIRED: marcar la carga como vencida
    if body.get("event") == "EXPIRED":
        request_id = body.get("requestId")
        if request_id:
            pool = await get_db()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE psp_cargas SET estado='vencido' WHERE request_id=$1 AND estado='pendiente'",
                    request_id)
        return {"ok": True}

    # Evento MATCHED: acreditar
    request_id = body.get("requestId")
    monto_psp = body.get("amount")
    if not request_id:
        return {"ok": True}

    pool = await get_db()
    async with pool.acquire() as conn:
        carga = await conn.fetchrow("""
            SELECT id, user_id, monto, estado, agencia_code FROM psp_cargas
            WHERE request_id=$1
        """, request_id)
        if not carga:
            return {"ok": True}
        # Idempotencia: si ya está acreditada, no duplicar
        if carga["estado"] == "acreditado":
            return {"ok": True}
        # Usar el monto real del pago si vino, si no el esperado
        monto = int(float(monto_psp)) if monto_psp else carga["monto"]
        async with conn.transaction():
            await conn.execute("""
                UPDATE users SET balance = balance + $2 WHERE id=$1
            """, carga["user_id"], monto * 100)
            await conn.execute("""
                UPDATE psp_cargas SET estado='acreditado', monto=$2, acreditado_at=NOW()
                WHERE id=$1
            """, carga["id"], monto)
            try:
                await conn.execute("""
                    INSERT INTO wallet_transactions (user_id, type, amount, method, status)
                    VALUES ($1, 'deposito', $2, 'psp', 'done')
                """, carga["user_id"], monto * 100)
            except Exception:
                pass
            # Registrar en agencia_movimientos para que aparezca en los reportes
            try:
                await conn.execute("""
                    INSERT INTO agencia_movimientos
                        (agencia_code, tipo, user_id, monto, detalle, operador)
                    VALUES ($1, 'carga', $2, $3, $4, 'psp')
                """, carga["agencia_code"] or "admin", carga["user_id"], monto,
                    "Carga digital PSP")
            except Exception:
                pass
            # Disparar bono automático si corresponde (primer depósito)
            try:
                b = await _intentar_otorgar_bono_auto(
                    conn, carga["user_id"], carga["agencia_code"] or "", "primer_deposito", monto)
                if not b:
                    await _intentar_otorgar_bono_auto(
                        conn, carga["user_id"], carga["agencia_code"] or "", "cualquier_deposito", monto)
            except Exception as e:
                log.error(f"[PSP] bono auto error: {e}")
        # Aviso al cliente
        try:
            await avisar_cliente(conn, carga["user_id"],
                f"✅ Se acreditó tu carga de ${monto:,.0f}".replace(",","."))
        except Exception:
            pass
    return {"ok": True}


# ── PAYOUT (retiro digital del cliente) ───────────────────────

async def _ejecutar_payout(conn, retiro_id):
    """Ejecuta el PayOut en la PSP para un retiro ya aprobado."""
    r = await conn.fetchrow("SELECT id, destino, monto FROM psp_retiros WHERE id=$1", retiro_id)
    if not r:
        return None
    resp = await _psp_post("/api/v1/payout/requests", {
        "destination": r["destino"],
        "amount": float(r["monto"]),
        "receiptFormat": "stringbase64",
        "callbackUrl": f"{API_PUBLIC_URL}/api/psp/webhook/payout",
    })
    payout_id = str(resp.get("id") or "")
    await conn.execute("""
        UPDATE psp_retiros SET payout_id=$2, estado='procesando', procesado_at=NOW()
        WHERE id=$1
    """, retiro_id, payout_id)
    return payout_id


@app.post("/api/me/psp/retirar")
async def me_psp_retirar(request: Request):
    """El cliente pide retiro digital. Descuenta del saldo y crea la solicitud.
    Según el modo (auto/manual) se ejecuta o espera aprobación.
    body: {init_data, monto, destino (CVU/CBU)}"""
    body = await request.json()
    user = validar_init_data(body.get("init_data", ""))
    if not user or not user.get("id"):
        raise HTTPException(401, "No autenticado")
    try:
        monto = int(body.get("monto", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Monto inválido")
    destino = "".join(ch for ch in (body.get("destino") or "") if ch.isdigit())
    if monto <= 0:
        raise HTTPException(400, "El monto debe ser mayor a cero")
    if len(destino) != 22:
        raise HTTPException(400, "El CVU/CBU debe tener 22 dígitos")

    tg_id = str(user["id"])
    pool = await get_db()
    async with pool.acquire() as conn:
        u = await conn.fetchrow("""
            SELECT id, balance, creado_por, rollover_pendiente FROM users
            WHERE telegram_id::text=$1 OR id::text=$1
        """, tg_id)
        if not u:
            raise HTTPException(404, "Usuario no encontrado")
        if not await _psp_activa_para(conn, u["creado_por"] or ""):
            raise HTTPException(403, "El retiro digital no está disponible")
        # No se puede retirar si tiene rollover de bono pendiente
        if (u["rollover_pendiente"] or 0) > 0:
            raise HTTPException(400,
                "Tenés un bono con rollover pendiente. Completá el rollover antes de retirar.")
        saldo_pesos = (u["balance"] or 0) / 100
        if monto > saldo_pesos:
            raise HTTPException(400, f"Saldo insuficiente (tenés {saldo_pesos:.0f})")

        cfg = await _psp_config(conn)
        estado_inicial = "aprobado" if cfg["retiro_modo"] == "automatico" else "solicitado"
        async with conn.transaction():
            # Descontar del saldo ya (se reintegra si se rechaza)
            await conn.execute(
                "UPDATE users SET balance = balance - $2 WHERE id=$1",
                u["id"], monto * 100)
            row = await conn.fetchrow("""
                INSERT INTO psp_retiros (user_id, destino, monto, estado, agencia_code)
                VALUES ($1,$2,$3,$4,$5) RETURNING id
            """, u["id"], destino, monto, estado_inicial, u["creado_por"])
        # Si es automático, ejecutar el PayOut ya
        if cfg["retiro_modo"] == "automatico":
            try:
                await _ejecutar_payout(conn, row["id"])
            except Exception as e:
                log.error(f"[PSP] payout auto error: {e}")

    return {"ok": True, "estado": estado_inicial, "monto": monto,
            "mensaje": ("Tu retiro se está procesando" if estado_inicial == "aprobado"
                        else "Tu retiro quedó pendiente de aprobación")}


@app.get("/api/admin/psp/historial")
async def admin_psp_historial(tipo: str = "cargas", _=Depends(auth.require_admin)):
    """Historial de cargas o retiros digitales (todo el sistema)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        if tipo == "retiros":
            rows = await conn.fetch("""
                SELECT r.id, r.monto, r.estado, r.destino, r.agencia_code, r.creado_at,
                       u.nombre_completo
                FROM psp_retiros r LEFT JOIN users u ON u.id=r.user_id
                ORDER BY r.creado_at DESC LIMIT 200
            """)
            return {"items": [{
                "id": x["id"], "cliente": x["nombre_completo"] or "—",
                "monto": x["monto"], "estado": x["estado"], "destino": x["destino"],
                "agencia": x["agencia_code"],
                "fecha": x["creado_at"].strftime("%d/%m/%Y %H:%M") if x["creado_at"] else "",
            } for x in rows]}
        rows = await conn.fetch("""
            SELECT c.id, c.monto, c.estado, c.cuit, c.agencia_code, c.creado_at,
                   u.nombre_completo
            FROM psp_cargas c LEFT JOIN users u ON u.id=c.user_id
            ORDER BY c.creado_at DESC LIMIT 200
        """)
    return {"items": [{
        "id": x["id"], "cliente": x["nombre_completo"] or "—",
        "monto": x["monto"], "estado": x["estado"], "cuit": x["cuit"],
        "agencia": x["agencia_code"],
        "fecha": x["creado_at"].strftime("%d/%m/%Y %H:%M") if x["creado_at"] else "",
    } for x in rows]}


@app.get("/api/agencias/me/psp/historial")
async def agencia_psp_historial(tipo: str = "cargas",
                                agencia_code: str = Depends(requiere_agencia)):
    """Historial de cargas/retiros digitales de la rama de la agencia."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rama = await codes_de_la_rama(conn, agencia_code)
        if tipo == "retiros":
            rows = await conn.fetch("""
                SELECT r.id, r.monto, r.estado, r.agencia_code, r.creado_at, u.nombre_completo
                FROM psp_retiros r LEFT JOIN users u ON u.id=r.user_id
                WHERE r.agencia_code = ANY($1)
                ORDER BY r.creado_at DESC LIMIT 200
            """, rama)
        else:
            rows = await conn.fetch("""
                SELECT c.id, c.monto, c.estado, c.agencia_code, c.creado_at, u.nombre_completo
                FROM psp_cargas c LEFT JOIN users u ON u.id=c.user_id
                WHERE c.agencia_code = ANY($1)
                ORDER BY c.creado_at DESC LIMIT 200
            """, rama)
    return {"items": [{
        "id": x["id"], "cliente": x["nombre_completo"] or "—",
        "monto": x["monto"], "estado": x["estado"], "agencia": x["agencia_code"],
        "fecha": x["creado_at"].strftime("%d/%m/%Y %H:%M") if x["creado_at"] else "",
    } for x in rows]}


@app.get("/api/admin/psp/retiros")
async def admin_psp_retiros(estado: str = "solicitado", _=Depends(auth.require_admin)):
    """Lista los retiros digitales (por defecto los pendientes de aprobar)."""
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT r.id, r.user_id, r.destino, r.monto, r.estado, r.agencia_code,
                   r.creado_at, u.nombre_completo
            FROM psp_retiros r LEFT JOIN users u ON u.id=r.user_id
            WHERE ($1='' OR r.estado=$1)
            ORDER BY r.creado_at DESC LIMIT 100
        """, estado)
    return {"retiros": [{
        "id": r["id"], "cliente": r["nombre_completo"] or "—",
        "destino": r["destino"], "monto": r["monto"], "estado": r["estado"],
        "agencia": r["agencia_code"],
        "fecha": r["creado_at"].strftime("%d/%m/%Y %H:%M") if r["creado_at"] else "",
    } for r in rows]}


@app.post("/api/admin/psp/retiros/{retiro_id}/aprobar")
async def admin_psp_aprobar_retiro(retiro_id: int, request: Request,
                                   _=Depends(auth.require_admin)):
    """El admin aprueba (ejecuta el PayOut) o rechaza (reintegra el saldo).
    body: {aprobar: bool}"""
    body = await request.json()
    aprobar = bool(body.get("aprobar", True))
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(
            "SELECT id, user_id, monto, estado FROM psp_retiros WHERE id=$1", retiro_id)
        if not r:
            raise HTTPException(404, "Retiro no encontrado")
        if r["estado"] != "solicitado":
            raise HTTPException(400, f"El retiro ya está {r['estado']}")
        if aprobar:
            await conn.execute(
                "UPDATE psp_retiros SET estado='aprobado', aprobado_por='admin' WHERE id=$1",
                retiro_id)
            try:
                await _ejecutar_payout(conn, retiro_id)
            except Exception as e:
                log.error(f"[PSP] payout error: {e}")
                raise HTTPException(502, "No se pudo ejecutar el pago")
            return {"ok": True, "estado": "procesando"}
        else:
            # Rechazar: reintegrar el saldo
            async with conn.transaction():
                await conn.execute(
                    "UPDATE users SET balance = balance + $2 WHERE id=$1",
                    r["user_id"], r["monto"] * 100)
                await conn.execute(
                    "UPDATE psp_retiros SET estado='rechazado' WHERE id=$1", retiro_id)
            return {"ok": True, "estado": "rechazado"}


@app.post("/api/psp/webhook/payout")
async def psp_webhook_payout(request: Request):
    """La PSP avisa el resultado del PayOut."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
    payout_id = str(body.get("id") or "")
    status = body.get("status", "")
    if not payout_id:
        return {"ok": True}
    pool = await get_db()
    async with pool.acquire() as conn:
        r = await conn.fetchrow(
            "SELECT id, user_id, monto, estado FROM psp_retiros WHERE payout_id=$1", payout_id)
        if not r:
            return {"ok": True}
        if status == "COMPLETED":
            await conn.execute(
                "UPDATE psp_retiros SET estado='completado' WHERE id=$1", r["id"])
            # Registrar en agencia_movimientos
            try:
                ag = await conn.fetchval("SELECT creado_por FROM users WHERE id=$1", r["user_id"])
                await conn.execute("""
                    INSERT INTO agencia_movimientos
                        (agencia_code, tipo, user_id, monto, detalle, operador)
                    VALUES ($1, 'retiro', $2, $3, $4, 'psp')
                """, ag or "admin", r["user_id"], r["monto"], "Retiro digital PSP")
            except Exception:
                pass
            try:
                await avisar_cliente(conn, r["user_id"],
                    f"✅ Tu retiro de ${r['monto']:,.0f} se acreditó en tu cuenta bancaria.".replace(",","."))
            except Exception:
                pass
        elif status == "FAILED":
            # Reintegrar el saldo si falló
            if r["estado"] != "fallido":
                async with conn.transaction():
                    await conn.execute(
                        "UPDATE users SET balance = balance + $2 WHERE id=$1",
                        r["user_id"], r["monto"] * 100)
                    await conn.execute(
                        "UPDATE psp_retiros SET estado='fallido' WHERE id=$1", r["id"])
                try:
                    await avisar_cliente(conn, r["user_id"],
                        f"⚠️ Tu retiro no se pudo procesar. Te devolvimos ${r['monto']:,.0f} al saldo.".replace(",","."))
                except Exception:
                    pass
    return {"ok": True}


# Tope de mejora de Bet Best. Arranca de la variable de entorno pero se
# puede cambiar desde el admin sin reiniciar: es una palanca comercial,
# no un parámetro de infraestructura. Subirlo capta más boletos de la
# competencia; bajarlo protege el margen.
MEJORA_MAX_PCT = float(os.environ.get("MEJORA_MAX_PCT", "6"))
_mejora_cache = {"pct": None, "ts": 0}


async def _mejora_pct(conn=None):
    """Tope vigente. Cacheado 60s para no consultar en cada boleto."""
    import time as _t
    ahora = _t.time()
    if _mejora_cache["pct"] is not None and ahora - _mejora_cache["ts"] < 60:
        return _mejora_cache["pct"]
    try:
        if conn is None:
            pool = await get_db()
            async with pool.acquire() as c2:
                v = await c2.fetchval(
                    "SELECT valor FROM app_config WHERE clave='mejora_max_pct'")
        else:
            v = await conn.fetchval(
                "SELECT valor FROM app_config WHERE clave='mejora_max_pct'")
        pct = float(v) if v else MEJORA_MAX_PCT
    except Exception:
        pct = MEJORA_MAX_PCT
    _mejora_cache["pct"] = pct
    _mejora_cache["ts"] = ahora
    return pct


async def leer_captura_con_claude(imagen_b64: str, media_type: str):
    """
    Le pide a Claude que extraiga las apuestas de la imagen.
    Devuelve {"picks":[...], "total_odd": cuota_del_cupon}.
    """
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Falta configurar ANTHROPIC_API_KEY")

    prompt = (
        "Esta es la captura de un cupón de apuestas deportivas. "
        "Extraé cada selección de la combinada. Devolvé SOLO un JSON válido, "
        "sin texto adicional, con esta forma exacta:\n"
        '{"picks":[{"home":"equipo local","away":"equipo visitante",'
        '"market":"tipo de apuesta (1X2/Over/Under/BTTS/etc)",'
        '"selection":"lo que se apostó","odd":cuota_decimal}],'
        '"total_odd":cuota_total_si_aparece}\n'
        "Si no podés leer algún dato, poné null en ese campo. "
        "Las cuotas siempre en formato decimal (ej 2.50)."
    )

    cuerpo = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1500,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": media_type, "data": imagen_b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    }
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=cuerpo)
    except Exception as e:
        log.error(f"Claude visión error: {e}")
        raise HTTPException(502, "No se pudo procesar la imagen")

    if r.status_code != 200:
        log.error(f"Claude HTTP {r.status_code}: {r.text[:200]}")
        raise HTTPException(502, "El lector de imágenes no respondió bien")

    try:
        data = r.json()
        texto = "".join(b.get("text","") for b in data.get("content",[])
                        if b.get("type")=="text")
        # Claude a veces envuelve en ```json ... ```
        texto = texto.strip()
        if texto.startswith("```"):
            texto = texto.split("```")[1]
            if texto.startswith("json"):
                texto = texto[4:]
        parsed = json.loads(texto.strip())
        return {"picks": parsed.get("picks", []),
                "total_odd": parsed.get("total_odd")}
    except Exception as e:
        log.error(f"No se pudo parsear la respuesta de Claude: {e}")
        raise HTTPException(502, "No se entendió el contenido de la imagen")


async def buscar_cuota_nuestra(home, away, market, selection):
    """
    Busca el evento en nuestras cuotas reales (prematch cacheado) y
    devuelve nuestra cuota para ese mercado, o None si no lo tenemos.
    """
    # La fuente es la misma que ve el cliente. Antes se leía
    # _football_cache, que ya no se llena: por eso no matcheaba nada.
    catalogo = await all_markets() or {}

    mkt_low = (market or "").lower()
    sel_low = (selection or "").lower()

    for sport in catalogo.get("sports", []):
        for ev in sport.get("events", []):
            h, a = ev.get("h",""), ev.get("a","")
            # Se cruza en las dos orientaciones, y también por núcleo:
            # "Club Atlético Independiente" y "Independiente" son el
            # mismo equipo aunque el nombre venga distinto.
            directo = ((match_teams(home, h) and match_teams(away, a))
                       or (_mismo_club(home, h) and _mismo_club(away, a)))
            invertido = ((match_teams(home, a) and match_teams(away, h))
                         or (_mismo_club(home, a) and _mismo_club(away, h)))
            if not (directo or invertido):
                continue

            markets = ev.get("markets", {})

            # 1X2 / ganador
            if "1x2" in mkt_low or "gana" in sel_low or "winner" in mkt_low or "h2h" in mkt_low:
                h2h = markets.get("h2h", {})
                # LO IMPORTANTE: la cuota se busca por la SELECCIÓN que
                # eligió el cliente, no por la posición del equipo.
                # Antes, con el partido invertido, se devolvía la cuota
                # del rival: el cliente elegía al favorito y cobraba la
                # cuota del que perdía.
                if selection:
                    for nombre, cuota in h2h.items():
                        if _mismo_club(selection, nombre):
                            return cuota, ev
                    # El empate viene con varios nombres según la fuente
                    if any(x in sel_low for x in ("empate", "draw", "x")):
                        for k in ("Draw", "Empate", "X"):
                            if k in h2h:
                                return h2h[k], ev
                # Sin selección clara, se usa la posición como antes
                if "local" in sel_low:
                    return h2h.get(h), ev
                if "visit" in sel_low:
                    return h2h.get(a), ev
                if "empate" in sel_low or "draw" in sel_low:
                    return h2h.get("Draw"), ev
            # Over/Under
            if "over" in sel_low or "más" in sel_low or "mas" in sel_low:
                tot = markets.get("totals", {})
                for k, v in tot.items():
                    if k.lower().startswith("over"):
                        return v, ev
            if "under" in sel_low or "menos" in sel_low:
                tot = markets.get("totals", {})
                for k, v in tot.items():
                    if k.lower().startswith("under"):
                        return v, ev
            # Encontramos el partido pero no el mercado exacto
            return None, ev
    return None, None


# ── OPCIONES DE UN EVENTO (para corregir picks mal leídos) ────
def opciones_de_evento(ev):
    """Lista de selecciones apostables de un evento, para el corrector."""
    h = ev.get("h",""); a = ev.get("a","")
    markets = ev.get("markets", {})
    opciones = []
    h2h = markets.get("h2h", {})
    if h2h.get(h):     opciones.append({"sel":f"{h} gana", "odd":h2h[h], "mkt":"1X2"})
    if h2h.get("Draw"):opciones.append({"sel":"Empate", "odd":h2h["Draw"], "mkt":"1X2"})
    if h2h.get(a):     opciones.append({"sel":f"{a} gana", "odd":h2h[a], "mkt":"1X2"})
    for k, v in (markets.get("totals", {}) or {}).items():
        etiqueta = k
        m = _re.match(r"Over\s*([\d.]+)", k, _re.I)
        if m: etiqueta = f"Más de {m.group(1)}"
        m = _re.match(r"Under\s*([\d.]+)", k, _re.I)
        if m: etiqueta = f"Menos de {m.group(1)}"
        opciones.append({"sel":etiqueta, "odd":v, "mkt":"Más/Menos"})
    return opciones


async def candidatos_parecidos(home, away, limite=4):
    """
    Cuando no matcheamos un partido, devuelve los eventos de nuestro
    catálogo más parecidos por nombre, para sugerirlos en el corrector.
    """
    # La misma fuente que usa buscar_cuota_nuestra. Si cada una mira
    # un catálogo distinto pasa lo peor: el escáner dice "no
    # encontrado" y el corrector muestra el evento enseguida.
    catalogo = await all_markets() or {}
    objetivo = f"{home} {away}"
    puntuados = []
    for sport in catalogo.get("sports", []):
        for ev in sport.get("events", []):
            sc = max(
                score_equipos(objetivo, f"{ev.get('h','')} {ev.get('a','')}"),
                (score_equipos(home, ev.get('h','')) + score_equipos(away, ev.get('a',''))) / 2,
            )
            if sc >= 0.55:
                puntuados.append((sc, ev))
    puntuados.sort(key=lambda x: -x[0])
    return [{
        "home": ev.get("h"), "away": ev.get("a"),
        "event_id": ev.get("id"), "sport_key": ev.get("sport_key"),
        "opciones": opciones_de_evento(ev),
        "parecido": round(sc, 2),
    } for sc, ev in puntuados[:limite]]


@app.get("/api/evento-opciones")
async def evento_opciones(sport_key: str = "", event_id: str = "",
                          home: str = "", away: str = ""):
    """
    Devuelve las opciones apostables de un evento. Se usa para corregir
    un pick que la IA leyó mal: el cliente elige la correcta de la lista.
    Se puede buscar por event_id, o por nombres de equipo.
    """
    entrada = _football_cache.get("all_markets")
    if entrada:
        catalogo = entrada[0]        # (data, ts)
    else:
        catalogo = await cache_swr("all_markets", ODDS_TTL_PREMATCH,
                                   _armar_all_markets)
    catalogo = catalogo or {}

    for sport in catalogo.get("sports", []):
        for ev in sport.get("events", []):
            match_id = event_id and ev.get("id")==event_id
            match_nombre = (home and away and
                ((match_teams(home, ev.get("h","")) and match_teams(away, ev.get("a",""))) or
                 (match_teams(home, ev.get("a","")) and match_teams(away, ev.get("h","")))))
            if match_id or match_nombre:
                return {"encontrado": True,
                        "home": ev.get("h"), "away": ev.get("a"),
                        "event_id": ev.get("id"),
                        "sport_key": ev.get("sport_key"),
                        "opciones": opciones_de_evento(ev)}
    return {"encontrado": False, "opciones": []}


@app.get("/api/buscar-eventos")
async def buscar_eventos(q: str = "", limite: int = 15):
    """
    Busca eventos por nombre de equipo. Para cuando la IA leyó mal los
    equipos y hay que cambiar el partido entero.
    """
    q = (q or "").strip().lower()
    if len(q) < 2:
        return {"eventos": []}
    entrada = _football_cache.get("all_markets")
    if entrada:
        catalogo = entrada[0]        # (data, ts)
    else:
        catalogo = await cache_swr("all_markets", ODDS_TTL_PREMATCH,
                                   _armar_all_markets)
    catalogo = catalogo or {}

    res = []
    for sport in catalogo.get("sports", []):
        for ev in sport.get("events", []):
            texto = f"{ev.get('h','')} {ev.get('a','')}".lower()
            if q in texto:
                res.append({
                    "home": ev.get("h"), "away": ev.get("a"),
                    "event_id": ev.get("id"), "sport_key": ev.get("sport_key"),
                    "liga": sport.get("name"), "time": ev.get("time"),
                    "opciones": opciones_de_evento(ev),
                })
                if len(res) >= limite:
                    return {"eventos": res}
    return {"eventos": res}


@app.post("/api/mejorar-combinada")
async def mejorar_combinada(request: Request):
    """
    Recibe una captura, extrae las apuestas y las replica con nuestras
    cuotas reales, ajustando hasta MEJORA_MAX_PCT. Devuelve el detalle
    pick por pick para que el usuario confirme antes de aceptar.
    """
    body = await request.json()
    # Acepta una imagen ("imagen") o varias ("imagenes": [{data, media_type}])
    imagenes = body.get("imagenes")
    if not imagenes:
        una = body.get("imagen","")
        if not una:
            raise HTTPException(400, "Falta la imagen")
        imagenes = [{"data": una, "media_type": body.get("media_type","image/jpeg")}]
    if len(imagenes) > 6:
        raise HTTPException(400, "Máximo 6 fotos")

    # Leer todas las capturas y juntar los picks, sin duplicar
    leidos = []
    total_odd_cupon = None
    vistos = set()
    for img in imagenes:
        data = img.get("data","")
        if not data or len(data) > 8_000_000:
            continue
        r = await leer_captura_con_claude(data, img.get("media_type","image/jpeg"))
        picks_img = r.get("picks", []) if isinstance(r, dict) else (r or [])
        if isinstance(r, dict) and r.get("total_odd"):
            # Nos quedamos con la mayor cuota total vista (la del cupón completo)
            try:
                t = float(r["total_odd"])
                if total_odd_cupon is None or t > total_odd_cupon:
                    total_odd_cupon = t
            except (TypeError, ValueError):
                pass
        for p in picks_img:
            # Clave para no duplicar el mismo partido+selección entre fotos
            clave = (str(p.get("home","")).lower().strip(),
                     str(p.get("away","")).lower().strip(),
                     str(p.get("selection","")).lower().strip())
            if clave in vistos:
                continue
            vistos.add(clave)
            leidos.append(p)

    if not leidos:
        return {"ok": False, "motivo": "no_se_leyo",
                "mensaje": "No pudimos leer apuestas en las fotos. "
                           "Probá con imágenes más nítidas."}

    # Tope vigente, configurable desde el admin (6% por defecto)
    _pct_mejora = await _mejora_pct()

    resultado = []
    for p in leidos:
        home = p.get("home") or ""
        away = p.get("away") or ""
        market = p.get("market") or ""
        selection = p.get("selection") or ""
        odd_orig = p.get("odd")

        nuestra, ev = await buscar_cuota_nuestra(home, away, market, selection)

        item = {
            "home": home, "away": away,
            "market": market, "selection": selection,
            "odd_original": odd_orig,
            "odd_nuestra": None,
            "odd_final": None,
            "ajustada": False,
            "estado": "",
        }

        if ev is None:
            cands = await candidatos_parecidos(home, away)
            item["candidatos"] = cands

            # Si hay un candidato claro, se asume en vez de rechazar.
            #
            # POR QUÉ: decir "no tenemos ese partido" y a la vez
            # ofrecerlo como primera opción al tocar Corregir es
            # contradictorio. Si el sistema ya sabe cuál es, que lo
            # ponga marcado para revisar: corregir algo cargado es
            # más fácil que elegir desde cero.
            if cands and (cands[0].get("parecido") or 0) >= 0.62:
                sug = cands[0]
                item["estado"] = "ok"
                item["event_id"] = sug.get("event_id")
                item["sport_key"] = sug.get("sport_key")
                item["opciones"] = sug.get("opciones")
                item["home_real"] = sug.get("home")
                item["away_real"] = sug.get("away")
                item["parecido"] = sug.get("parecido")
                # Sin aviso por pick: el botón de corregir ya está y
                # marcar cada uno agrega ruido. El aviso general va
                # arriba de la lista, una sola vez.
                try:
                    nueva, _ev2 = await buscar_cuota_nuestra(
                        sug.get("home"), sug.get("away"), market, selection)
                    if nueva:
                        item["odd_nuestra"] = round(nueva, 2)
                        # Misma mejora que cualquier otro pick
                        # El estado sale del resultado real, no de la
                        # certeza del match: al cliente le importa si
                        # le igualamos la cuota, no cómo la buscamos.
                        if odd_orig and nueva < odd_orig:
                            tope = round(nueva * (1 + _pct_mejora/100), 2)
                            if tope >= odd_orig:
                                item["odd_final"] = round(odd_orig, 2)
                                item["estado"] = "igualada"
                            else:
                                item["odd_final"] = tope
                                item["estado"] = "mejorada_parcial"
                            item["ajustada"] = True
                        else:
                            item["odd_final"] = round(nueva, 2)
                            item["estado"] = "ok"
                except Exception as e:
                    log.warning(f"[ESCANER] cuota del sugerido: {e}")
                log.warning(
                    f"[ESCANER] '{home}' vs '{away}' → sugerido "
                    f"'{sug.get('home')}' vs '{sug.get('away')}' "
                    f"({sug.get('parecido')})")
            else:
                item["estado"] = "sin_partido"
                if cands:
                    c0 = cands[0]
                    log.warning(
                        f"[ESCANER] sin match: '{home}' vs '{away}' — el más "
                        f"parecido era '{c0.get('home')}' vs "
                        f"'{c0.get('away')}' ({c0.get('parecido')})")
                else:
                    log.warning(f"[ESCANER] sin match ni candidatos: "
                                f"'{home}' vs '{away}'")
        elif nuestra is None:
            item["estado"] = "sin_mercado"       # tenemos el partido, no el mercado
            item["event_id"] = ev.get("id")
            item["sport_key"] = ev.get("sport_key")
            item["opciones"] = opciones_de_evento(ev)   # para corregir
            item["home_real"] = ev.get("h")
            item["away_real"] = ev.get("a")
        else:
            item["odd_nuestra"] = round(nuestra, 2)
            item["event_id"] = ev.get("id")
            item["sport_key"] = ev.get("sport_key")
            item["opciones"] = opciones_de_evento(ev)   # para corregir
            item["home_real"] = ev.get("h")
            item["away_real"] = ev.get("a")
            # ¿Nuestra cuota es más baja que la del original?
            if odd_orig and nuestra < odd_orig:
                tope = round(nuestra * (1 + _pct_mejora/100), 2)
                if tope >= odd_orig:
                    item["odd_final"] = round(odd_orig, 2)   # la igualamos
                    item["ajustada"] = True
                    item["estado"] = "igualada"
                else:
                    item["odd_final"] = tope                 # subimos hasta el tope
                    item["ajustada"] = True
                    item["estado"] = "mejorada_parcial"      # lo máximo alcanzable
            else:
                item["odd_final"] = round(nuestra, 2)        # ya somos iguales o mejores
                item["estado"] = "ok"
        resultado.append(item)

    # Cuota total con lo que sí podemos ofrecer
    validos = [i for i in resultado if i["odd_final"]]
    total_nuestra = 1.0
    for i in validos:
        total_nuestra *= i["odd_final"]

    # Verificación: multiplicar las cuotas ORIGINALES leídas y comparar con
    # la cuota total del cupón. Si no coinciden, probablemente falta algún
    # partido (la combinada no entró entera en la/s foto/s).
    faltan_picks = False
    if total_odd_cupon:
        prod_leido = 1.0
        con_odd = 0
        for i in resultado:
            if i.get("odd_original"):
                prod_leido *= i["odd_original"]; con_odd += 1
        # Margen del 8% para redondeos del sitio
        if con_odd and prod_leido < total_odd_cupon * 0.92:
            faltan_picks = True

    return {
        "ok": True,
        "picks": resultado,
        "cuota_total": round(total_nuestra, 2) if validos else None,
        "picks_ok": len(validos),
        "picks_total": len(resultado),
        "tope_ajuste_pct": _pct_mejora,
        "total_odd_cupon": total_odd_cupon,
        "faltan_picks": faltan_picks,
    }


# ── INFLUENCER TRACKING WEB ───────────────────────────────────
@app.post("/api/influencer/track")
async def track_influencer(request: Request):
    """Trackea eventos de influencer desde la web app"""
    try:
        body = await request.json()
        code   = (body.get("code","") or "")[:64]
        event  = body.get("event","click_web")
        if event not in ("click_web","apuesta_web","registro"):
            event = "click_web"
        try:
            amount = int(body.get("amount", 0) or 0)
        except (TypeError, ValueError):
            amount = 0
        if not code:
            return {"ok": False}
        pool = await get_db()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO influencer_events
                    (influencer_code, user_id, event, amount)
                VALUES ($1, NULL, $2, $3)
            """, code, event, amount)
        return {"ok": True}
    except Exception as e:
        log.error(f"Track influencer error: {e}")
        return {"ok": False}

@app.get("/api/influencer/{code}/stats")
async def influencer_stats(code: str, _=Depends(auth.require_admin)):
    """Stats de un influencer específico"""
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    COUNT(*) FILTER (WHERE event='click') as clics_bot,
                    COUNT(*) FILTER (WHERE event='click_web') as clics_web,
                    COUNT(*) FILTER (WHERE event='registro') as registros,
                    COUNT(*) FILTER (WHERE event='apuesta') as apuestas_bot,
                    COUNT(*) FILTER (WHERE event='apuesta_web') as apuestas_web,
                    COALESCE(SUM(amount) FILTER (WHERE event IN ('apuesta','apuesta_web')),0) as volumen
                FROM influencer_events
                WHERE influencer_code=$1
            """, code)
            return dict(row) if row else {}
    except Exception as e:
        log.error(f"Stats error: {e}")
        return {}

@app.get("/api/influencer/link/{code}")
async def influencer_link(code: str):
    """Genera los links del influencer (bot + web)"""
    return {
        "code": code,
        "link_bot": f"https://t.me/QuartzPlayBot?start=combo_{code}",
        "link_web": f"https://valiant-gentleness-production-a779.up.railway.app?ref={code}",
        "link_short": f"https://t.me/QuartzPlayBot?start=combo_{code}",
    }

# ── WALLET API (44neoluck) ────────────────────────────────────
@app.post("/api/wallet/")
@app.post("/api/wallet/getBalance")
@app.post("/api/wallet/setBalance")
async def wallet(request: Request):
    body_raw = await request.body()
    x_code   = request.headers.get("X-Code","")
    x_time   = request.headers.get("X-Time","")
    x_sign   = request.headers.get("X-Sign","")
    if not validate_sign(body_raw, x_code, x_time, x_sign):
        return JSONResponse({"status":False,"error":"invalid_signature"})
    try:
        data = json.loads(body_raw)
    except:
        return JSONResponse({"status":False,"error":"invalid_packet"})
    method = data.get("method") or request.url.path.split("/")[-1]
    player = data.get("player","")
    pool   = await get_db()
    if method == "getBalance":
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT balance FROM users WHERE username=$1 OR id::text=$1", player)
        if not row:
            return JSONResponse({"status":False,"error":"player_not_found"})
        bal = Decimal(row["balance"]) / 100
        return JSONResponse({"status":True,
            "balance":str(bal.quantize(Decimal("0.01")))})
    elif method == "setBalance":
        try:
            amount = Decimal(data.get("amount","0"))
            bet    = Decimal(data.get("bet","0"))
            win    = Decimal(data.get("win","0"))
        except:
            return JSONResponse({"status":False,"error":"invalid_packet"})
        amount_cents = int(amount * 100)
        bet_cents    = int(bet * 100)
        transaction  = data.get("transaction","")
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT id,balance FROM users WHERE username=$1 OR id::text=$1",
                    player)
                if not row:
                    return JSONResponse({"status":False,"error":"player_not_found"})
                uid=row["id"]; balance=row["balance"]
                dup = await conn.fetchrow(
                    "SELECT id FROM casino_rounds WHERE external_tx=$1", transaction)
                if dup:
                    bal = Decimal(balance)/100
                    return JSONResponse({"status":True,
                        "balance":str(bal.quantize(Decimal("0.01"))),
                        "transaction":transaction})
                if amount_cents < 0 and balance < abs(amount_cents):
                    return JSONResponse({"status":False,"error":"insufficient_funds"})
                new_balance = balance + amount_cents
                await conn.execute(
                    "UPDATE users SET balance=balance+$2 WHERE id=$1",
                    uid, amount_cents)
                await conn.execute("""
                    INSERT INTO casino_rounds
                        (user_id,game,provider,stake,win,ggr,external_tx,created_at)
                    VALUES ($1,$2,'44neoluck',$3,$4,$5,$6,NOW())
                    ON CONFLICT DO NOTHING
                """, uid, data.get("action","gameplay"),
                    bet_cents, int(win*100),
                    bet_cents-int(win*100), transaction)
        new_bal = Decimal(new_balance)/100
        return JSONResponse({"status":True,
            "balance":str(new_bal.quantize(Decimal("0.01"))),
            "transaction":transaction})
    return JSONResponse({"status":False,"error":"invalid_packet"})
