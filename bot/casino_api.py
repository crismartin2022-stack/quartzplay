import os, time, hashlib, asyncio, hmac, json, logging, ast, secrets
from decimal import Decimal
from datetime import datetime, timezone
import asyncpg
import httpx
from fastapi import FastAPI, Request, HTTPException, Depends
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
    except Exception as e:
        log.error(f"sync_get error {url}: {e}")
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
    return {
        "token":   auth.create_session(row["code"]),
        "code":    row["code"],
        "name":    row["name"],
        "address": row["address"],
        "phone":   row["phone"],
        "status":  row["status"],
    }

# ── AGENCIAS — LISTAR (solo admin) ────────────────────────────
@app.get("/api/agencias")
async def list_agencias(_=Depends(auth.require_admin)):
    pool = await get_db()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.code, a.name, a.username, a.status,
                   a.address, a.phone, a.created_at, a.last_login,
                   COUNT(at.id) as total_tickets,
                   COALESCE(SUM(at.stake),0) as total_cobrado
            FROM agencias a
            LEFT JOIN agencia_tickets at ON at.agencia_code=a.code
            GROUP BY a.id, a.code, a.name, a.username,
                     a.status, a.address, a.phone,
                     a.created_at, a.last_login
            ORDER BY a.created_at DESC
        """)
    return [dict(r) for r in rows]

# ── AGENCIAS — CREAR (solo admin) ─────────────────────────────
@app.post("/api/agencias")
async def create_agencia(request: Request, _=Depends(auth.require_admin)):
    body     = await request.json()
    name     = body.get("name","")
    username = body.get("username","")
    password = body.get("password","")
    address  = body.get("address","")
    phone    = body.get("phone","")
    if not name or not username or not password:
        raise HTTPException(status_code=400, detail="Faltan campos requeridos")
    if len(password) < 8:
        raise HTTPException(status_code=400,
            detail="La contraseña debe tener al menos 8 caracteres")
    pool = await get_db()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        code  = f"AGE{str(count+1).zfill(3)}"
        try:
            await conn.execute("""
                INSERT INTO agencias
                    (code, name, username, password_hash, address, phone)
                VALUES ($1,$2,$3,$4,$5,$6)
            """, code, name, username, auth.hash_password(password), address, phone)
        except Exception:
            raise HTTPException(status_code=409, detail="Usuario ya existe")
    return {"code":code,"name":name,"username":username}

# ── AGENCIAS — ACTUALIZAR (solo admin) ────────────────────────
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
                        agencia_code: str = Depends(auth.require_agencia)):
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
async def get_betslip(code: str, _agencia: str = Depends(auth.require_agencia)):
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
                      agencia_code: str = Depends(auth.require_agencia)):
    body = await request.json()
    # El monto lo valida el servidor: nunca se confía en el cliente.
    try:
        stake = int(body.get("stake", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Monto inválido")
    if stake < MIN_STAKE or stake > MAX_STAKE:
        raise HTTPException(status_code=400,
            detail=f"El monto debe estar entre ${MIN_STAKE:,} y ${MAX_STAKE:,}".replace(",","."))

    pool = await get_db()
    async with pool.acquire() as conn:
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

            pot_win = round(stake * float(row["odd_total"]))
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
    }

# ── BETSLIP — CREAR desde la web ──────────────────────────────
MAX_PICKS     = 10
MAX_ODD_PICK  = 20.0     # cuota máxima por selección
MAX_ODD_TOTAL = 1000.0   # cuota máxima combinada

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
        try:
            odd = float(p.get("odd"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Cuota inválida")
        if not (1.01 <= odd <= MAX_ODD_PICK):
            raise HTTPException(400, f"Cuota fuera de rango: {odd}")
        if not home or not sel:
            raise HTTPException(400, "Faltan datos de la selección")
        limpios.append({"home":home,"away":away,"sel":sel,
                        "odd":round(odd,2),"sport":sport})
        odd_total *= odd

    odd_total = round(odd_total, 3)
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
        # Reintenta si el código sorteado ya existe.
        # Requiere UNIQUE en betslips.code, si no los duplicados entran callados.
        for _ in range(20):
            code = f"QP-{secrets.randbelow(90000)+10000}"
            try:
                await conn.execute("""
                    INSERT INTO betslips
                        (code, user_id, picks, stake, odd_total,
                         potential_win, status, inf_code,
                         created_at, expires_at)
                    VALUES ($1, NULL, $2, 0, $3, 0, 'pending', $4,
                            NOW(), NOW() + interval '24 hours')
                """, code, str(limpios), odd_total, inf)
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
# OJO CON EL COSTO: The Odds API cobra 1 crédito por mercado por deporte
# por request. Pedir 4 mercados en 20 deportes = 80 créditos por refresco.
# Subí el TTL o bajá la lista antes de agrandar esto.
ODDS_MARKETS      = os.environ.get("ODDS_MARKETS", "h2h,totals,btts")
ODDS_SPORTS_LIMIT = int(os.environ.get("ODDS_SPORTS_LIMIT", "12"))
ODDS_TTL_PREMATCH = int(os.environ.get("ODDS_TTL_PREMATCH", "300"))

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


# ── TEAM LOGO PROXY ───────────────────────────────────────────
_logo_cache = {}

@app.get("/api/team-logo/{team_id}")
async def team_logo_by_id(team_id: str):
    """Proxy de imagen del equipo — devuelve la imagen directamente"""
    from fastapi.responses import Response, RedirectResponse
    if team_id in _logo_cache:
        cached = _logo_cache[team_id]
        if cached:
            return RedirectResponse(url=cached)
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-team-logo",
                headers=FOOTBALL_HEADERS,
                params={"teamid": team_id},
            )
            if r.status_code == 200:
                content_type = r.headers.get("content-type","")
                if "image" in content_type:
                    _logo_cache[team_id] = None
                    return Response(
                        content=r.content,
                        media_type=content_type,
                        headers={"Cache-Control":"public, max-age=86400",
                                 "Access-Control-Allow-Origin":"*"}
                    )
                # Si devuelve JSON con URL
                try:
                    data = r.json()
                    img_url = data.get("url") or data.get("logo") or data.get("image")
                    if img_url:
                        _logo_cache[team_id] = img_url
                        return RedirectResponse(url=img_url)
                except:
                    pass
    except Exception as e:
        log.error(f"Team logo error {team_id}: {e}")
    # Fallback — imagen genérica
    return Response(
        content=b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><circle cx="12" cy="12" r="10" fill="#7C3AED" opacity="0.3" stroke="#7C3AED" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#00F0FF" opacity="0.8"/></svg>',
        media_type="image/svg+xml",
        headers={"Access-Control-Allow-Origin":"*"}
    )

@app.get("/api/team-logo")
async def team_logo_by_name(name: str):
    """Busca teamId por nombre y redirige al logo"""
    cache_key = f"name_{name}"
    if cache_key in _logo_cache:
        return _logo_cache[cache_key]
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-search-all-teams",
                headers=FOOTBALL_HEADERS,
                params={"search": name},
            )
            if r.status_code == 200:
                data = r.json()
                teams = (data.get("response") or {})
                if isinstance(teams, dict):
                    teams = teams.get("teams", [])
                if teams:
                    team = teams[0]
                    team_id = str(team.get("id") or team.get("teamId",""))
                    if team_id:
                        result = {"teamId": team_id, "name": name,
                            "logoUrl": f"https://quartzplay-production.up.railway.app/api/team-logo/{team_id}"}
                        _logo_cache[cache_key] = result
                        return result
    except Exception as e:
        log.error(f"Team search error: {e}")
    return {"teamId": None}


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
    t = _re.sub(r'[^a-z0-9 ]', ' ', t)
    return {w for w in t.split() if w and w not in _RUIDO}

def normalize_name(name):
    """Nombre normalizado y ordenado — sirve de clave estable."""
    return " ".join(sorted(tokens_equipo(name)))

def match_teams(name1, name2):
    """
    Compara nombres de equipos.

    Antes 'Manchester United' y 'Manchester City' quedaban ambos en
    'manchester' y matcheaban: un partido en vivo podía terminar mostrando
    las cuotas del otro. Ahora exige que ninguna palabra significativa
    se contradiga.
    """
    t1, t2 = tokens_equipo(name1), tokens_equipo(name2)
    if not t1 or not t2:
        return False
    if t1 == t2:
        return True
    comunes = t1 & t2
    if not comunes:
        return False
    # Uno contenido en el otro: "Racing" vs "Racing Club" -> sí.
    if t1 <= t2 or t2 <= t1:
        return True
    # Si cada lado aporta una palabra propia distinta, son equipos distintos
    # ("manchester united" vs "manchester city").
    return False

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
    """
    Combina scores en vivo (Football API) con cuotas en vivo (The Odds API)
    Devuelve partidos en vivo con marcador + cuotas reales
    """
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    now = time.time()
    cache_key = "live_combined"
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < 30:  # 30 seg cache
            return data

    # 1. Traer scores en vivo de Football API
    live_scores = []
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-current-live",
                headers=FOOTBALL_HEADERS,
            )
            if r.status_code == 200:
                data = r.json()
                live_scores = data.get("response",{}).get("live",[])
    except Exception as e:
        log.error(f"Football live error: {e}")

    # Sin partidos en curso no tiene sentido gastar créditos de The Odds API
    if not live_scores:
        empty = {"matches": [], "count": 0}
        _football_cache[cache_key] = (empty, now)
        return empty

    # 2. Traer cuotas en vivo de The Odds API (todos los deportes)
    live_odds = {}
    LIVE_SPORTS = [
        "soccer_argentina_primera_division",
        "soccer_fifa_world_cup",
        "soccer_uefa_champs_league",
        "soccer_spain_la_liga",
        "soccer_epl",
        "basketball_nba",
        "americanfootball_nfl",
        "mma_mixed_martial_arts",
    ]
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            for sport_key in LIVE_SPORTS:
                r = await c.get(
                    f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds/",
                    params={
                        "apiKey": ODDS_API_KEY,
                        "regions": "eu",
                        "markets": "h2h",
                        "oddsFormat": "decimal",
                        "dateFormat": "iso",
                    }
                )
                if r.status_code == 200:
                    for ev in r.json():
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
                        if h_odd:
                            live_odds[f"{home}|{away}"] = {
                                "L": h_odd, "E": d_odd, "V": a_odd,
                                "sport": sport_key,
                            }
                await asyncio.sleep(0.2)
    except Exception as e:
        log.error(f"Odds live error: {e}")

    # 3. Combinar scores + cuotas
    result = []
    sin_match = []   # para el endpoint de diagnóstico
    for match in live_scores:
        home_name = match.get("home",{}).get("name","")
        away_name = match.get("away",{}).get("name","")

        # Buscar cuotas por nombre. Los dos feeds no coinciden en qué equipo
        # ponen de local, así que probamos las dos orientaciones y damos
        # vuelta las cuotas cuando el match es invertido.
        odds = {"L": None, "E": None, "V": None}
        for key, od in live_odds.items():
            partes = key.split("|")
            if len(partes) != 2:
                continue
            if match_teams(home_name, partes[0]) and match_teams(away_name, partes[1]):
                odds = {"L": od["L"], "E": od["E"], "V": od["V"]}
                break
            if match_teams(home_name, partes[1]) and match_teams(away_name, partes[0]):
                odds = {"L": od["V"], "E": od["E"], "V": od["L"]}
                break

        if odds["L"] is None:
            sin_match.append(f"{home_name} vs {away_name}")

        result.append({
            "id":        str(match.get("id","")),
            "home":      home_name,
            "away":      away_name,
            "homeId":    match.get("home",{}).get("id"),
            "awayId":    match.get("away",{}).get("id"),
            "homeScore": match.get("home",{}).get("score",0),
            "awayScore": match.get("away",{}).get("score",0),
            "scoreStr":  match.get("scoreStr","0 - 0"),
            "minute":    match.get("liveTime",{}).get("short",""),
            "minuteLong":match.get("liveTime",{}).get("long",""),
            "status":    "live",
            "ongoing":   match.get("ongoing",True),
            "odds":      odds,
            "hasOdds":   odds["L"] is not None,
        })

    if sin_match:
        log.info(f"Live sin cuotas ({len(sin_match)}): {sin_match[:5]}")
    _football_cache["live_sin_match"] = (
        {"sin_cuotas": sin_match,
         "claves_odds": sorted(live_odds.keys())[:40]}, now)

    _football_cache[cache_key] = ({"matches": result, "count": len(result)}, now)
    return {"matches": result, "count": len(result)}


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
    data = await asyncio.to_thread(
        sync_get,
        f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds/",
        {
            "apiKey": ODDS_API_KEY,
            "regions": "eu",
            "markets": "h2h,totals",
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        },
        None,
        20,
    )
    if data is not None:
        result = {"events": data, "sport": sport_key}
        _football_cache[cache_key] = (result, now)
        return result
    return {"events": [], "sport": sport_key}

@app.get("/api/live/all-markets")
async def all_markets():
    """Todos los mercados — detecta deportes activos dinamicamente"""
    ODDS_API_KEY = os.environ.get("ODDS_API_KEY","")
    cache_key = "all_markets"
    now = time.time()
    if cache_key in _football_cache:
        data, ts = _football_cache[cache_key]
        if now - ts < ODDS_TTL_PREMATCH:
            return data

    # Obtener deportes activos sin bloquear el event loop
    SPORTS = []
    all_sports_data = await asyncio.to_thread(
        sync_get,
        "https://api.the-odds-api.com/v4/sports/",
        {"apiKey": ODDS_API_KEY},
        None,
        15,
    )
    if all_sports_data:
        for s in all_sports_data:
            if s.get("active") and not s.get("has_outrights", False) and len(SPORTS) < ODDS_SPORTS_LIMIT:
                SPORTS.append(s["key"])
        log.info(f"Sports activos: {len(SPORTS)} — {SPORTS[:5]}")
    else:
        SPORTS = [
            "baseball_mlb","basketball_wnba","americanfootball_nfl",
            "soccer_usa_mls","soccer_argentina_primera_division",
            "tennis_atp_wimbledon","mma_mixed_martial_arts",
            "aussierules_afl","cricket_international_t20",
        ]
        log.warning("Usando sports fallback")

    log.info(f"Fetching markets for {len(SPORTS)} sports")

    SPORT_NAMES = {
        "soccer_argentina_primera_division": {"name":"Liga Argentina","icon":"🇦🇷"},
        "soccer_fifa_world_cup":             {"name":"Mundial 2026",  "icon":"🏆"},
        "soccer_uefa_champs_league":         {"name":"Champions",     "icon":"⚽"},
        "soccer_spain_la_liga":              {"name":"La Liga",       "icon":"🇪🇸"},
        "soccer_epl":                        {"name":"Premier",       "icon":"🏴"},
        "basketball_nba":                    {"name":"NBA",           "icon":"🏀"},
        "americanfootball_nfl":              {"name":"NFL",           "icon":"🏈"},
        "mma_mixed_martial_arts":            {"name":"MMA/UFC",       "icon":"🥊"},
        "icehockey_nhl":                     {"name":"NHL",           "icon":"🏒"},
        "tennis_atp_wimbledon":              {"name":"Wimbledon",     "icon":"🎾"},
    }

    result = {"sports": []}

    async def fetch_sport(sport_key):
        data = await asyncio.to_thread(
            sync_get,
            f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds/",
            {
                "apiKey": ODDS_API_KEY,
                "regions": "eu",
                "markets": ODDS_MARKETS,
                "oddsFormat": "decimal",
                "dateFormat": "iso",
            },
            None,
            15,
        )
        return sport_key, data

    sport_data = {}
    try:
        pairs = await asyncio.gather(*[fetch_sport(sk) for sk in SPORTS],
                                     return_exceptions=True)
        for p in pairs:
            if isinstance(p, Exception):
                log.error(f"Fetch error: {p}")
                continue
            sk, data = p
            if data:
                sport_data[sk] = data
    except Exception as e:
        log.error(f"Gather error: {e}")

    try:
        for sport_key in SPORTS:
            events_raw_data = sport_data.get(sport_key)
            if events_raw_data is not None:
                events_raw = events_raw_data[:8]
                events = []
                for ev in events_raw:
                    home = ev.get("home_team","")
                    away = ev.get("away_team","")
                    markets = parse_markets(ev)
                    try:
                        from datetime import datetime
                        dt=datetime.fromisoformat(ev.get("commence_time","").replace("Z","+00:00"))
                        fecha=dt.astimezone().strftime("%d/%m %H:%M")
                    except:
                        fecha="--/-- --:--"
                    events.append({
                        "id": ev.get("id",""),
                        "h": home, "a": away,
                        "time": fecha,
                        "markets": markets,
                        "odds": {
                            "L": markets.get("h2h",{}).get(home),
                            "E": markets.get("h2h",{}).get("Draw"),
                            "V": markets.get("h2h",{}).get(away),
                        }
                    })
                if events:
                    meta = SPORT_NAMES.get(sport_key,{"name":sport_key,"icon":"⚽"})
                    result["sports"].append({
                        "key": sport_key,
                        "name": meta["name"],
                        "icon": meta["icon"],
                        "events": events,
                    })
    except Exception as e:
        log.error(f"All markets error: {e}")

    log.info(f"All markets result: {len(result.get('sports',[]))} sports")
    _football_cache[cache_key] = (result, now)
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
        data = await asyncio.to_thread(
            sync_get,
            f"https://api.the-odds-api.com/v4/sports/{sk}/odds/",
            {"apiKey":ODDS_API_KEY,"regions":"eu",
             "markets":"h2h,totals","oddsFormat":"decimal","dateFormat":"iso"},
            None,
            12,
        )
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
                        "h": home, "a": away,
                        "time": fecha,
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
            "live": False,
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
            "live": False,
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
            "live": False,
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
