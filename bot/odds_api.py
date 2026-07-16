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

    async def get_odds(self, sport_key, regio
