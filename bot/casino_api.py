import os, time, hashlib, asyncio, hmac, json, logging, ast
from decimal import Decimal
from datetime import datetime, timezone
import asyncpg
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL","")
X_CODE       = os.environ.get("CASINO_X_CODE","")
SECRET_KEY   = os.environ.get("CASINO_SECRET_KEY","")

app = FastAPI(title="QuartzPlay API")
app.add_middleware(CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

_db_pool = None

async def get_db():
    global _db_pool
    if not _db_pool:
        _db_pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=2, max_size=10)
    return _db_pool

def hash_password(p):
    return hashlib.sha256(p.encode()).hexdigest()

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

# ── AGENCIAS — LOGIN ──────────────────────────────────────────
@app.post("/api/agencias/login")
async def agencia_login(request: Request):
    body     = await request.json()
    username = body.get("username","")
    password = body.get("password","")
    pool     = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT * FROM agencias
            WHERE username=$1 AND password_hash=$2 AND status='active'
        """, username, hash_password(password))
        if not row:
            raise HTTPException(status_code=401,
                detail="Usuario o contraseña incorrectos")
        await conn.execute(
            "UPDATE agencias SET last_login=NOW() WHERE code=$1", row["code"])
    return {
        "code":    row["code"],
        "name":    row["name"],
        "address": row["address"],
        "phone":   row["phone"],
        "status":  row["status"],
    }

# ── AGENCIAS — LISTAR ─────────────────────────────────────────
@app.get("/api/agencias")
async def list_agencias():
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

# ── AGENCIAS — CREAR ──────────────────────────────────────────
@app.post("/api/agencias")
async def create_agencia(request: Request):
    body     = await request.json()
    name     = body.get("name","")
    username = body.get("username","")
    password = body.get("password","")
    address  = body.get("address","")
    phone    = body.get("phone","")
    if not name or not username or not password:
        raise HTTPException(status_code=400, detail="Faltan campos requeridos")
    pool = await get_db()
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        code  = f"AGE{str(count+1).zfill(3)}"
        try:
            await conn.execute("""
                INSERT INTO agencias
                    (code, name, username, password_hash, address, phone)
                VALUES ($1,$2,$3,$4,$5,$6)
            """, code, name, username, hash_password(password), address, phone)
        except Exception:
            raise HTTPException(status_code=409, detail="Usuario ya existe")
    return {"code":code,"name":name,"username":username}

# ── AGENCIAS — ACTUALIZAR ─────────────────────────────────────
@app.put("/api/agencias/{code}")
async def update_agencia(code: str, request: Request):
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
            await conn.execute("""
                UPDATE agencias SET name=$2,address=$3,
                    phone=$4,status=$5,password_hash=$6 WHERE code=$1
            """, code, name, address, phone, status, hash_password(password))
        else:
            await conn.execute("""
                UPDATE agencias SET name=$2,address=$3,
                    phone=$4,status=$5 WHERE code=$1
            """, code, name, address, phone, status)
    return {"success":True}

# ── AGENCIAS — STATS ──────────────────────────────────────────
@app.get("/api/agencias/{code}/stats")
async def agencia_stats(code: str, dias: int=30):
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

# ── BETSLIP — GET ─────────────────────────────────────────────
@app.get("/api/betslip/{code}")
async def get_betslip(code: str):
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

# ── BETSLIP — PAY ─────────────────────────────────────────────
@app.post("/api/betslip/{code}/pay")
async def pay_betslip(code: str, request: Request):
    body     = await request.json()
    stake    = body.get("stake", 0)
    agent_id = body.get("agent_id","agencia")
    pool     = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM betslips WHERE code=$1", code.upper())
        if not row:
            raise HTTPException(status_code=404, detail="Codigo no encontrado")
        if row["status"] == "active":
            raise HTTPException(status_code=409, detail="Ya fue pagado")
        pot_win = round(stake * float(row["odd_total"]))
        await conn.execute("""
            UPDATE betslips
            SET status='active', stake=$2, potential_win=$3,
                paid_at=NOW(), paid_by=$4
            WHERE code=$1
        """, code.upper(), stake, pot_win, agent_id)
        await conn.execute("""
            INSERT INTO sports_bets
                (user_id,picks,stake,odd_total,potential_win,status,mode)
            VALUES ($1,$2,$3,$4,$5,'active','local')
        """, row["user_id"], row["picks"], stake, row["odd_total"], pot_win)
        await conn.execute("""
            INSERT INTO agencia_tickets
                (agencia_code,betslip_code,tipo,stake,potential_win)
            VALUES ($1,$2,'bot',$3,$4)
        """, agent_id, code.upper(), stake, pot_win)
    return {
        "success":True, "code":code.upper(),
        "stake":stake, "odd_total":float(row["odd_total"]),
        "potential_win":pot_win,
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
    """Devuelve el logo de un equipo por teamId — proxy para ocultar el API key"""
    if team_id in _logo_cache:
        return _logo_cache[team_id]
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(
                f"{FOOTBALL_API}/football-team-logo",
                headers=FOOTBALL_HEADERS,
                params={"teamid": team_id},
            )
            if r.status_code == 200:
                # La API devuelve la imagen directamente o una URL
                content_type = r.headers.get("content-type","")
                if "image" in content_type:
                    from fastapi.responses import Response
                    _logo_cache[team_id] = None
                    return Response(content=r.content, media_type=content_type)
                data = r.json()
                result = data
                _logo_cache[team_id] = result
                return result
    except Exception as e:
        log.error(f"Team logo error: {e}")
    return {"error": "No disponible"}

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
                await asyncio.sleep(0.3)
    except Exception as e:
        log.error(f"Prematch error: {e}")

    _football_cache[cache_key] = (result, now)
    return result


# ── LIVE COMBINED (scores + cuotas en vivo) ───────────────────
def normalize_name(name):
    """Normaliza nombre de equipo para matching"""
    import re
    name = name.lower()
    # Remover sufijos comunes
    for suffix in [" fc", " cf", " sc", " ac", " united", " city", " athletic"]:
        name = name.replace(suffix, "")
    # Remover caracteres especiales
    name = re.sub(r'[^a-z0-9 ]', '', name)
    return name.strip()

def match_teams(name1, name2):
    """Compara dos nombres de equipos con fuzzy matching"""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    if n1 == n2: return True
    if n1 in n2 or n2 in n1: return True
    # Comparar primeras palabras
    w1 = n1.split()[0] if n1.split() else ""
    w2 = n2.split()[0] if n2.split() else ""
    return w1 == w2 and len(w1) > 3

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
    for match in live_scores:
        home_name = match.get("home",{}).get("name","")
        away_name = match.get("away",{}).get("name","")

        # Buscar cuotas matcheando por nombre
        odds = {"L": None, "E": None, "V": None}
        for key, odd_data in live_odds.items():
            parts = key.split("|")
            if len(parts) == 2:
                if (match_teams(home_name, parts[0]) and
                    match_teams(away_name, parts[1])):
                    odds = {"L": odd_data["L"], "E": odd_data["E"], "V": odd_data["V"]}
                    break

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

    _football_cache[cache_key] = ({"matches": result, "count": len(result)}, now)
    return {"matches": result, "count": len(result)}

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
