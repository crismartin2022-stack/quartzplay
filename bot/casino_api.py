import os, time, hashlib, hmac, json, logging, ast
from decimal import Decimal
from datetime import datetime, timezone
import httpx
import asyncpg
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger(__name__)

CASINO_API_URL = os.environ.get("CASINO_API_URL","https://client.44neoluck.xyz/api/v1")
X_CODE         = os.environ.get("CASINO_X_CODE","")
SECRET_KEY     = os.environ.get("CASINO_SECRET_KEY","")
DATABASE_URL   = os.environ.get("DATABASE_URL","")

def make_sign(body_json, x_code, x_time):
    if body_json:
        payload = f"{body_json}X-Code={x_code}&X-Time={x_time}"
    else:
        payload = f"X-Code={x_code}&X-Time={x_time}"
    return hmac.new(
        SECRET_KEY.encode(), payload.encode(), hashlib.sha1
    ).hexdigest()

def build_headers(body_json=None):
    x_time = str(int(time.time()))
    sign   = make_sign(body_json, X_CODE, x_time)
    h = {"X-Code": X_CODE, "X-Time": x_time, "X-Sign": sign}
    if body_json:
        h["Content-Type"] = "application/json"
    return h

app = FastAPI(title="QuartzPlay API")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"])

_db_pool = None

async def get_db():
    global _db_pool
    if not _db_pool:
        _db_pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=2, max_size=10)
    return _db_pool

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

# ── BETSLIP ENDPOINT ──────────────────────────────────────────
@app.get("/api/betslip/{code}")
async def get_betslip(code: str):
    """
    La agencia consulta este endpoint con el código QP-XXXXX
    Devuelve la combinada completa con picks, cuota y retorno
    """
    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT b.*, u.username, u.first_name
            FROM betslips b
            LEFT JOIN users u ON u.id = b.user_id
            WHERE b.code = $1
        """, code.upper())

    if not row:
        raise HTTPException(status_code=404, detail="Codigo no encontrado")

    # Verificar expiración
    if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Codigo expirado")

    # Parsear picks
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

@app.post("/api/betslip/{code}/pay")
async def pay_betslip(code: str, request: Request):
    """
    La agencia llama este endpoint cuando confirma el pago
    Actualiza el estado a 'paid' y registra quién cobró
    """
    body = await request.json()
    stake    = body.get("stake", 0)
    agent_id = body.get("agent_id", "agencia")

    pool = await get_db()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM betslips WHERE code=$1", code.upper())

        if not row:
            raise HTTPException(status_code=404, detail="Codigo no encontrado")
        if row["status"] == "paid":
            raise HTTPException(status_code=409, detail="Ya fue pagado")

        pot_win = round(stake * float(row["odd_total"]))

        await conn.execute("""
            UPDATE betslips
            SET status='active', stake=$2, potential_win=$3,
                paid_at=NOW(), paid_by=$4
            WHERE code=$1
        """, code.upper(), stake, pot_win, agent_id)

        # Registrar apuesta en sports_bets
        await conn.execute("""
            INSERT INTO sports_bets
                (user_id, picks, stake, odd_total, potential_win, status, mode)
            VALUES ($1, $2, $3, $4, $5, 'active', 'local')
        """, row["user_id"], row["picks"], stake,
            row["odd_total"], pot_win)

    return {
        "success":       True,
        "code":          code.upper(),
        "stake":         stake,
        "odd_total":     float(row["odd_total"]),
        "potential_win": pot_win,
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
                "SELECT balance FROM users WHERE username=$1 OR id::text=$1",
                player)
        if not row:
            return JSONResponse({"status":False,"error":"player_not_found"})
        bal = Decimal(row["balance"]) / 100
        return JSONResponse({"status":True,"balance":str(bal.quantize(Decimal("0.01")))})

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
        sid_ext      = data.get("sid_ext","")

        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT id, balance FROM users WHERE username=$1 OR id::text=$1",
                    player)
                if not row:
                    return JSONResponse({"status":False,"error":"player_not_found"})

                uid     = row["id"]
                balance = row["balance"]

                dup = await conn.fetchrow(
                    "SELECT id FROM casino_rounds WHERE external_tx=$1", transaction)
                if dup:
                    bal = Decimal(balance) / 100
                    return JSONResponse({
                        "status":True,
                        "balance":str(bal.quantize(Decimal("0.01"))),
                        "transaction":transaction,
                    })

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

        new_bal = Decimal(new_balance) / 100
        return JSONResponse({
            "status":True,
            "balance":str(new_bal.quantize(Decimal("0.01"))),
            "transaction":transaction,
        })

    return JSONResponse({"status":False,"error":"invalid_packet"})
