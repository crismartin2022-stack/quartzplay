import os, asyncio, logging, time
import httpx

log = logging.getLogger(__name__)
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")
BASE_URL = "https://api.the-odds-api.com/v4"

SPORTS_MAP = {
    "soccer_argentina_primera_division": "Liga Argentina",
    "soccer_fifa_world_cup": "Mundial 2026",
    "soccer_uefa_champs_league": "Champions League",
    "soccer_spain_la_liga": "La Liga",
    "soccer_epl": "Premier League",
    "basketball_nba": "NBA",
    "americanfootball_nfl": "NFL",
    "tennis_atp_wimbledon": "Wimbledon",
    "mma_mixed_martial_arts": "MMA UFC",
    "icehockey_nhl": "NHL",
}

async def fetch_odds(sport_key):
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "eu",
        "markets": "h2h",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{BASE_URL}/sports/{sport_key}/odds/", params=params)
        if r.status_code != 200:
            return []
        log.info(f"Restantes: {r.headers.get('x-requests-remaining','?')}")
        return r.json()

def parse_event(raw):
    home = raw.get("home_team", "")
    away = raw.get("away_team", "")
    h_odd = None
    d_odd = None
    a_odd = None
    for bm in raw.get("bookmakers", []):
        for mkt in bm.get("markets", []):
            if mkt["key"] == "h2h":
                for o in mkt.get("outcomes", []):
                    if o["name"] == home:
                        h_odd = round(o["price"], 2)
                    elif o["name"] == away:
                        a_odd = round(o["price"], 2)
                    elif o["name"] == "Draw":
                        d_odd = round(o["price"], 2)
                break
        if h_odd:
            break
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(
            raw.get("commence_time", "").replace("Z", "+00:00"))
        fecha = dt.astimezone().strftime("%d/%m %H:%M")
    except Exception:
        fecha = "--/-- --:--"
    return {
        "id": raw.get("id", ""),
        "home": home,
        "away": away,
        "time": fecha,
        "live": False,
        "odds": {"L": h_odd, "E": d_odd, "V": a_odd},
    }

_cache = {}
CACHE_TTL = 300

async def get_all_odds_cached():
    now = time.time()
    if "__all__" in _cache:
        data, ts = _cache["__all__"]
        if now - ts < CACHE_TTL:
            return data
    result = {}
    for sport_key, name in SPORTS_MAP.items():
        try:
            events = await fetch_odds(sport_key)
            if events:
                result[sport_key] = {
                    "meta": {"name": name, "icon": name[:3].upper()},
                    "events": [parse_event(e) for e in events[:6]],
                }
            await asyncio.sleep(0.3)
        except Exception as e:
            log.error(f"Error {sport_key}: {e}")
    _cache["__all__"] = (result, now)
    return result
