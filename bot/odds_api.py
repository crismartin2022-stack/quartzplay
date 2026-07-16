import os, asyncio, logging, time
import httpx

log = logging.getLogger(__name__)

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")
BASE_URL     = "https://api.the-odds-api.com/v4"

SPORTS_MAP = {
    "soccer_argentina_primera_division": {"name":"Liga Argentina",  "icon":"🇦🇷"},
    "soccer_fifa_world_cup":             {"name":"Mundial 2026",     "icon":"🏆"},
    "soccer_uefa_champs_league":         {"name":"Champions League", "icon":"⚽"},
    "soccer_spain_la_liga":              {"name":"La Liga",          "icon":"🇪🇸"},
    "soccer_epl":                        {"name":"Premier League",   "icon":"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
    "basketball_nba":                    {"name":"NBA",              "icon":"🏀"},
    "americanfootball_nfl":              {"name":"NFL",              "icon":"🏈"},
    "tennis_atp_wimbledon":              {"name":"Wimbledon",        "icon":"🎾"},
    "mma_mixed_martial_arts":            {"name":"MMA / UFC",        "icon":"🥊"},
    "icehockey_nhl":                     {"name":"NHL",              "icon":"🏒"},
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
            remaining = r.headers.get("x-requests-remaining","?")
            log.info(f"Odds API requests restantes: {remaining}")
            return r.json()

    async def get_all_sports_odds(self):
        result = {}
        for sport_key, me
