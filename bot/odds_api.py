import os, asyncio, logging, time
import httpx

log = logging.getLogger(__name__)

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")
BASE_URL = "https://api.the-odds-api.com/v4"

SPORTS_MAP = {
    "soccer_argentina_primera_division": {"name":"Liga Argentina",  "icon":"ARG"},
    "soccer_fifa_world_cup":             {"name":"Mundial 2026",     "icon":"MUN"},
    "soccer_uefa_champs_league":         {"name":"Champions League", "icon":"UCL"},
    "soccer_spain_la_liga":              {"name":"La Liga",          "icon":"ESP"},
    "soccer_epl":                        {"name":"Premier League",   "icon":"ENG"},
    "basketball_nba":                    {"name":"NBA",              "icon":"NBA"},
    "americanfootball_nfl":              {"name":"NFL",              "icon":"NFL"},
    "tennis_atp_wimbledon":              {"name":"Wimbledon",        "icon":"TEN"},
    "mma_mixed_martial_arts":            {"name":"MMA / UFC",        "icon":"MMA"},
    "icehockey_nhl":                     {"name":"NHL",              "icon":"NHL"},
}

class OddsAPI:

    async def get_odds(self, sport_key, regions="eu", markets="h2h"):
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{BASE_URL}/sports/{sport_key}/odds/",
                params={
                    "apiKey":     ODDS_API_KEY,
                    "regions":    regions,
                    "markets":    markets,
                    "oddsFormat": "decimal",
                    "dateFormat": "iso",
                }
            )
            if r.status_code != 200:
                log.warning(f"Odds API {sport_key}: {r.status_code}")
                return []
            remaining = r.headers.get("x-requests-remaining", "?")
            log.info(f"Odds API requests restantes: {remaining}")
            return r.json()

    async def get_all_sports_odds(self):
        result = {}
        for sport_key, meta in SPORTS_MAP.items():
            try:
                events = await self.get_odds(sport_key)
                if events:
                    result[sport_key] = {
                        "meta":   meta,
                        "events": [self._parse(e) for e in events[:6]],
                    }
                await asyncio.sleep(0.3)
            except Exception as e:
                log.error(f"Error {sport_key}: {e}")
        return result

    def _parse(self, raw):
        home = raw.get("home_team", "")
        away = raw.get("away_team", "")
        odds = {"home": None, "draw": None, "away": None}
        for bm in raw.get("bookmakers", []):
            for mkt in bm.get("markets", []):
                if mkt["key"] == "h2h":
                    for o in mkt.get("outcomes", []):
                        if o["name"] == home:
                            odds["home"] = round(o["price"], 2)
                        elif o["name"] == away:
                            odds["away"] = round(o["price"], 2)
                        elif o["name"] == "Draw":
                            odds["draw"] = round(o["price"], 2)
                    break
            if odds["home"]:
                break
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(
                raw.get("commence_time", "").replace("Z", "+00:00"))
            hora = dt.astimezone().strftime("%H:%M")
        except Exception:
            hora = "--:--"
        return {
            "id":   raw.get("id", ""),
            "home": home,
            "away": away,
            "time": hora,
            "live": False,
            "odds": {
                "L": odds["home"],
                "E": odds["draw"],
                "V": odds["away"],
            },
        }

odds_api = OddsAPI()

_cache = {}
CACHE_TTL = 300

async def get_all_odds_cached():
    now = time.time()
    if "__all__" in _cache:
        data, ts = _cache["__all__"]
        if now - ts < CACHE_TTL:
            return data
    data = await odds_api.get_all_sports_odds()
    _cache["__all__"] = (data, now)
    return data
