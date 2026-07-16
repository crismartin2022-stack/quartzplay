import os, time, hashlib, hmac, json, logging
from decimal import Decimal
import httpx
import asyncpg
from fastapi import FastAPI, Request
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

app = FastAPI(title="QuartzPlay Wallet API")
app.add_middleware(CORSMiddleware, allow_origins=["*"])

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

@app.post("/api/wallet/")
@app.post("/api/wallet/getBalance")
@
