import os, time, hashlib, asyncio, hmac, json, logging, ast, secrets
from decimal import Decimal
from datetime import datetime, timezone, timedelta
import asyncpg
import httpx
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import auth

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
ALLOWED_ORIGINS = [
    "https://valiant-gentleness-production-a779.up.railway.app",
    "https://web.telegram.org",
    "http://localhost:3000",
]

app.add_middleware(CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET","POST","PUT"],
    allow_headers=["Content-Type","Authorization","X-Admin-Key"],
    allow_credentials=False,
)

_db_pool = None

async def get_db():
    global _db_pool
    if not _db_pool:
        _db_pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=2, max_size=10)
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
            SELECT code, name, pct_ggr, pct_ventas, moneda, saldo_cc, nivel
            FROM agencias
            WHERE (code=$1 OR ruta LIKE $2)
              AND COALESCE(tipo,'agencia') <> 'influencer'
            ORDER BY ruta
        """, agencia_code, ruta + "/%")

        filas = []
        tot_apostado = tot_premios = tot_com = 0.0
        for a in rama:
            apostado, premios = await _calcular_ggr(conn, [a["code"]], desde, hasta)
            ggr = apostado - premios
            pg = float(a["pct_ggr"] or 0); pv = float(a["pct_ventas"] or 0)
            com = round(ggr * pg / 100 + apostado * pv / 100, 2)
            tot_apostado += apostado; tot_premios += premios; tot_com += com
            filas.append({
                "code": a["code"], "name": a["name"], "moneda": a["moneda"],
                "nivel": a["nivel"], "saldo_cc": float(a["saldo_cc"] or 0),
                "es_mia": a["code"] == agencia_code,
                "apostado": apostado, "premios": premios, "ggr": ggr,
                "comision": com,
            })

        # Comisión de influencers que jugaron en la caja de esta rama
        from datetime import date as _d
        _d1 = _d.fromisoformat(desde); _d2 = _d.fromisoformat(hasta)
        codes_rama = [a["code"] for a in rama]
        com_inf = await _comision_influencers_en(conn, codes_rama, _d1, _d2)

    ggr_total = round(tot_apostado - tot_premios, 2)
    neto_sin_inf = round(ggr_total - tot_com, 2)
    neto_con_inf = round(neto_sin_inf - com_inf, 2)
    return {
        "desde": desde, "hasta": hasta,
        "moneda": yo["moneda"],
        "total": {
            "apostado": round(tot_apostado,2),
            "premios": round(tot_premios,2),
            "ggr": ggr_total,
            "comisiones": round(tot_com,2),
            "comision_influencers": round(com_inf,2),
            "neto_sin_influencers": neto_sin_inf,
            "neto_con_influencers": neto_con_inf,
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
    return {
        "desde": desde, "hasta": hasta,
        "global": {
            "apostado": round(tot_apostado,2),
            "premios": round(tot_premios,2),
            "ggr": ggr_g,
            "comisiones": round(tot_com,2),
            "comision_influencers": round(com_inf,2),
            "neto_casa": neto_sin,
            "neto_final": round(neto_sin - com_inf, 2),
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
                   b.picks, b.created_at, u.nombre_completo, u.creado_por, u.id AS uid
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
            "code": r["code"], "cliente": r["nombre_completo"] or "—",
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
        cond, args = ["u.creado_por = ANY($1)"], [rama]
        if cliente:
            args.append(int(cliente)); cond.append(f"b.user_id=${len(args)}")
        if desde:
            args.append(_date.fromisoformat(desde)); cond.append(f"b.created_at::date >= ${len(args)}")
        if hasta:
            args.append(_date.fromisoformat(hasta)); cond.append(f"b.created_at::date <= ${len(args)}")
        rows = await conn.fetch(f"""
            SELECT b.code, b.stake, b.odd_total, b.potential_win, b.status,
                   b.picks, b.created_at, u.nombre_completo, u.creado_por, u.id AS uid
            FROM betslips b
            JOIN users u ON u.id = b.user_id
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
            "code": r["code"], "cliente": r["nombre_completo"] or "—",
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
    # 3) Límite global
    row = await conn.fetchrow("""
        SELECT monto_min, monto_max, pago_max FROM limites_apuesta
        WHERE alcance='global' ORDER BY updated_at DESC LIMIT 1
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

    pool = await get_db()
    try:
        async with pool.acquire() as conn:
            if bid:
                await conn.execute("""
                    UPDATE bonos SET nombre=$2, tipo=$3, monto_fijo=$4, porcentaje=$5,
                        tope=$6, rollover=$7, activo=$8, deposito_minimo=$9,
                        cuota_minima=$10, requiere_verificacion=$11, evento=$12,
                        stake_max_tipo=$13, stake_max_valor=$14, cuota_maxima=$15,
                        mercados_excluidos=$16 WHERE id=$1
                """, int(bid), nombre, tipo, mf, pc, tope, rollover, activo,
                     dep_min, cuota_min, req_verif, evento,
                     stake_max_tipo, stake_max_valor, cuota_max, mercados_excl)
                return {"ok": True, "id": int(bid)}
            row = await conn.fetchrow("""
                INSERT INTO bonos (nombre, tipo, monto_fijo, porcentaje, tope, rollover, activo,
                    deposito_minimo, cuota_minima, requiere_verificacion, evento,
                    stake_max_tipo, stake_max_valor, cuota_maxima, mercados_excluidos)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id
            """, nombre, tipo, mf, pc, tope, rollover, activo,
                 dep_min, cuota_min, req_verif, evento,
                 stake_max_tipo, stake_max_valor, cuota_max, mercados_excl)
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
            # Bono cumplido: liberar el monto del bono al saldo real
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
        else:
            await conn.execute(
                "UPDATE bonos_otorgados SET rollover_cumplido=$2 WHERE id=$1",
                o["id"], nuevo_cumplido)


async def _bonos_disponibles_agencia(conn, agencia_code):
    """Bonos activos asignados a una agencia (o global)."""
    return await conn.fetch("""
        SELECT b.id, b.nombre, b.tipo, b.monto_fijo, b.porcentaje, b.tope, b.rollover
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
    return {"bonos": [{
        "id": r["id"], "nombre": r["nombre"], "tipo": r["tipo"],
        "monto_fijo": r["monto_fijo"],
        "porcentaje": float(r["porcentaje"]) if r["porcentaje"] is not None else None,
        "tope": r["tope"], "rollover": float(r["rollover"]) if r["rollover"] is not None else None,
    } for r in rows], "resumen": {
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
            SELECT b.id, b.tipo, b.monto_fijo, b.porcentaje, b.tope, b.rollover
            FROM bonos b JOIN bonos_agencias ba ON ba.bono_id=b.id
            WHERE b.id=$1 AND b.activo=TRUE AND ba.agencia_code=$2 AND ba.habilitado=TRUE
        """, bono_id, agencia_code)
        if not bono:
            raise HTTPException(404, "Bono no disponible para esta agencia")

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
                   l.pago_max, l.updated_at, a.name AS agencia_nombre
            FROM limites_apuesta l
            LEFT JOIN agencias a ON a.code = l.agencia_code
            ORDER BY l.alcance, l.agencia_code NULLS FIRST
        """)
    return {"limites": [{
        "id": r["id"], "alcance": r["alcance"], "agencia_code": r["agencia_code"],
        "agencia_nombre": r["agencia_nombre"],
        "monto_min": r["monto_min"], "monto_max": r["monto_max"],
        "pago_max": r["pago_max"],
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
    alcance = body.get("alcance", "global")
    code = (body.get("agencia_code") or "").upper() or None
    def _num(x):
        try: return int(x) if x not in (None, "") else None
        except (TypeError, ValueError): return None
    mn, mx, pm = _num(body.get("monto_min")), _num(body.get("monto_max")), _num(body.get("pago_max"))

    pool = await get_db()
    async with pool.acquire() as conn:
        if alcance == "global":
            await conn.execute("DELETE FROM limites_apuesta WHERE alcance='global'")
            await conn.execute("""
                INSERT INTO limites_apuesta (alcance, monto_min, monto_max, pago_max, updated_by)
                VALUES ('global', $1, $2, $3, 'admin')
            """, mn, mx, pm)
            return {"ok": True, "alcance": "global"}

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
          AND b.created_at::date >= $2::date AND b.created_at::date <= $3::date
    """, codes, desde, hasta) or 0
    premios = await conn.fetchval("""
        SELECT COALESCE(SUM(monto),0)
        FROM agencia_movimientos
        WHERE agencia_code = ANY($1) AND tipo='pago_premio'
          AND created_at::date >= $2::date AND created_at::date <= $3::date
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

    pool = await get_db()
    async with pool.acquire() as conn:
        ag = await conn.fetchrow(
            "SELECT pct_ggr, pct_ventas FROM agencias WHERE code=$1", code)
        if not ag:
            raise HTTPException(404, "Agencia no encontrada")
        # Solo esa agencia (sus clientes directos)
        apostado, premios = await _calcular_ggr(conn, [code], desde, hasta)
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
        """, code, desde, hasta, apostado, premios, ggr, pg, pv,
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
        raise HTTPException(400,
            f"Saldo insuficiente en {code}. Disponible: {actual:.0f}")
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
        # No puede asignar más % del que ella tiene
        if pct_ggr > float(padre["pct_ggr"] or 0):
            raise HTTPException(400, "El % GGR no puede superar el tuyo")
        if pct_ventas > float(padre["pct_ventas"] or 0):
            raise HTTPException(400, "El % de ventas no puede superar el tuyo")

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
            SELECT code, name, nivel, parent_code, pct_ggr, pct_ventas,
                   moneda, saldo_cc, status
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
        "username": r["username"], "balance": r["balance"] or 0,
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
    if not nombre:
        raise HTTPException(400, "Falta el nombre")
    pool = await get_db()
    async with pool.acquire() as conn:
        if agencia:
            existe = await conn.fetchrow("SELECT 1 FROM agencias WHERE code=$1", agencia)
            if not existe:
                raise HTTPException(404, "La agencia no existe")
            dueno = agencia
        else:
            dueno = "admin"   # cliente propio del admin, sin agencia
        uname = "cli_" + secrets.token_hex(4)
        # Los clientes de mostrador no tienen Telegram. telegram_id es NOT NULL,
        # así que le damos un id negativo único (Telegram usa positivos).
        fake_tg = -(int(time.time() * 1000) % 2_000_000_000)
        row = await conn.fetchrow("""
            INSERT INTO users (username, nombre_completo, telefono, telegram_id,
                               balance, creado_por, created_at)
            VALUES ($1,$2,$3,$4,0,$5,NOW())
            RETURNING id
        """, uname, nombre, telefono, fake_tg, dueno)
    return {"id": row["id"], "nombre": nombre, "agencia": dueno}


@app.get("/api/admin/eventos")
async def admin_eventos(tipo: str = "prematch", _=Depends(auth.require_admin)):
    """Eventos con cuotas para el panel admin: prematch o en vivo."""
    if tipo == "live":
        entrada = _football_cache.get("live")
        data = entrada[0] if entrada else None
        if not data:
            data = await cache_swr("live", ODDS_TTL_LIVE, _armar_live)
    else:
        entrada = _football_cache.get("all_markets")
        data = entrada[0] if entrada else None
        if not data:
            data = await cache_swr("all_markets", ODDS_TTL_PREMATCH, _armar_all_markets)
    data = data or {}
    # Resumen liviano: liga, equipos, cuotas 1X2
    salida = []
    for sport in data.get("sports", []):
        evs = []
        for ev in sport.get("events", [])[:40]:
            h2h = (ev.get("markets") or {}).get("h2h", {})
            evs.append({
                "home": ev.get("h"), "away": ev.get("a"),
                "time": ev.get("time"), "minute": ev.get("minute",""),
                "L": h2h.get(ev.get("h","")), "E": h2h.get("Draw"),
                "V": h2h.get(ev.get("a","")),
            })
        if evs:
            salida.append({"liga": sport.get("name"), "icon": sport.get("icon"),
                           "eventos": evs})
    return {"tipo": tipo, "deportes": salida}


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
            item["estado"] = "sin_partido"
            item["candidatos"] = await candidatos_parecidos(home, away)
        elif nuestra is None:
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
                tope = round(nuestra * (1 + MEJORA_MAX_PCT/100), 2)
                item["odd_ajustada"] = min(tope, round(odd_orig, 2))
            else:
                item["odd_ajustada"] = round(nuestra, 2)
            item["estado"] = "ok"
        picks.append(item)

    return {"ok": True, "picks": picks,
            "picks_ok": sum(1 for p in picks if p["odd_nuestra"]),
            "picks_total": len(picks),
            "tope_ajuste_pct": MEJORA_MAX_PCT}


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
            "SELECT code, name FROM agencias WHERE code=$1", agencia_code.upper())
    if not row:
        raise HTTPException(404, "Agencia no encontrada")
    return {"code": row["code"], "name": row["name"]}


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
                        "event_id":event_id,"sport_key":sport_key})
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
        rows = await conn.fetch("""
            SELECT code, picks, stake, odd_total, potential_win, status, created_at
            FROM betslips
            WHERE user_id = $1 AND status <> 'pending'
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
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio")

    pool = await get_db()
    async with pool.acquire() as conn:
        if doc:
            existe = await conn.fetchrow(
                "SELECT id FROM users WHERE documento = $1", doc)
            if existe:
                raise HTTPException(409, "Ya existe un usuario con ese documento")
        # El cliente hereda la moneda de la agencia (no se puede cambiar)
        moneda = await conn.fetchval(
            "SELECT moneda FROM agencias WHERE code=$1", agencia_code) or "ARS"
        # username interno para no chocar con los de Telegram
        base_user = "loc_" + (doc or str(int(time.time())))
        # telegram_id es NOT NULL; cliente de mostrador no tiene Telegram
        fake_tg = -(int(time.time() * 1000) % 2_000_000_000)
        row = await conn.fetchrow("""
            INSERT INTO users
                (username, nombre_completo, documento, telefono, telegram_id,
                 balance, creado_por, moneda, created_at)
            VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NOW())
            RETURNING id
        """, base_user, nombre, doc, tel, fake_tg, agencia_code, moneda)
    return {"id": row["id"], "nombre": nombre, "documento": doc,
            "moneda": moneda, "saldo": 0, "creado": True}


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


def _recolectar_odds(dst, home, away, valores):
    """Suma las cuotas conocidas de un evento al índice."""
    nums = [float(v) for v in valores if isinstance(v, (int, float)) and v]
    if not nums or not home:
        return
    dst.setdefault((normalize_name(home), normalize_name(away)), set()).update(nums)


def construir_indice_odds():
    """
    Arma {(home, away): {cuotas conocidas}} a partir de lo que ya está
    en caché. No pega a ninguna API: usa lo mismo que vio el cliente.
    """
    idx = {}

    data, _ = _football_cache.get("all_markets", ({}, 0))
    for sport in (data or {}).get("sports", []):
        for ev in sport.get("events", []):
            vals = []
            for mercado in (ev.get("markets") or {}).values():
                if isinstance(mercado, dict):
                    vals.extend(mercado.values())
            vals.extend((ev.get("odds") or {}).values())
            _recolectar_odds(idx, ev.get("h",""), ev.get("a",""), vals)

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


def _buscar_evento(idx, home, away):
    """Busca exacto y, si no, con el matcher difuso que ya usamos para live."""
    clave = (normalize_name(home), normalize_name(away))
    if clave in idx:
        return idx[clave]
    for (h, a), vals in idx.items():
        if match_teams(home, h) and match_teams(away, a):
            return vals
    return None


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
            await all_markets()
            idx = construir_indice_odds()
        except Exception as e:
            log.error(f"No se pudo calentar la caché de cuotas: {e}")

    problemas = []
    for p in picks:
        conocidas = _buscar_evento(idx, p["home"], p["away"])
        if not conocidas:
            problemas.append(
                f"{p['home']} vs {p['away']}: evento no encontrado en el feed")
            continue
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

@app.get("/api/live/all-markets")
async def all_markets():
    """Catálogo completo de prematch con todos los mercados destacados."""
    return await cache_swr("all_markets", ODDS_TTL_PREMATCH, _armar_all_markets)


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
                fecha = dt.astimezone().strftime("%d/%m %H:%M")
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
    async def _resultado_de(home, away, fecha):
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
                res = await _resultado_de(home, away, fecha)
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
    }


async def _bb_activo_para(conn, agencia_code):
    """True si el bet builder está activo para esa agencia (global o por rama)."""
    cfg = await _bb_config(conn)
    if not cfg["activo"]:
        return False
    if not cfg["ramas"]:
        return True   # activo global
    if agencia_code in cfg["ramas"]:
        return True
    ruta = await conn.fetchval("SELECT ruta FROM agencias WHERE code=$1", agencia_code)
    if ruta:
        partes = [p for p in ruta.split("/") if p]
        return any(p in cfg["ramas"] for p in partes)
    return False


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


MEJORA_MAX_PCT = float(os.environ.get("MEJORA_MAX_PCT", "6"))  # tope de ajuste


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
    entrada = _football_cache.get("all_markets")
    if entrada:
        catalogo = entrada[0]        # (data, ts)
    else:
        catalogo = await cache_swr("all_markets", ODDS_TTL_PREMATCH,
                                   _armar_all_markets)
    catalogo = catalogo or {}

    mkt_low = (market or "").lower()
    sel_low = (selection or "").lower()

    for sport in catalogo.get("sports", []):
        for ev in sport.get("events", []):
            h, a = ev.get("h",""), ev.get("a","")
            # Cruzamos en las dos orientaciones
            directo = match_teams(home, h) and match_teams(away, a)
            invertido = match_teams(home, a) and match_teams(away, h)
            if not (directo or invertido):
                continue

            markets = ev.get("markets", {})
            eh, ea = (h, a) if directo else (a, h)

            # 1X2 / ganador
            if "1x2" in mkt_low or "gana" in sel_low or "winner" in mkt_low or "h2h" in mkt_low:
                h2h = markets.get("h2h", {})
                if match_teams(home, eh) or "local" in sel_low:
                    return h2h.get(eh), ev
                if match_teams(away, ea) or "visit" in sel_low:
                    return h2h.get(ea), ev
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
    entrada = _football_cache.get("all_markets")
    if entrada:
        catalogo = entrada[0]
    else:
        catalogo = await cache_swr("all_markets", ODDS_TTL_PREMATCH,
                                   _armar_all_markets)
    catalogo = catalogo or {}
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
            item["estado"] = "sin_partido"       # no tenemos ese partido
            item["candidatos"] = await candidatos_parecidos(home, away)
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
                tope = round(nuestra * (1 + MEJORA_MAX_PCT/100), 2)
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
        "tope_ajuste_pct": MEJORA_MAX_PCT,
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
