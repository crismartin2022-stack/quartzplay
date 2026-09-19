import asyncio
import importlib
from datetime import datetime, timezone

import httpx
import pytest

from test_runtime_config import settings


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


async def _post(app, path, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(path, json=json_body or {})


def post(app, path, json_body=None):
    return asyncio.run(_post(app, path, json_body=json_body))


# ── `_inicio_mas_proximo` only trusts a real ISO timestamp ────────────
#
# A display string like "18/09 18:00" has no year and is already
# converted to local time: guessing a year to decide a cancellation
# about money is worse than refusing. This pins that the fix belongs at
# the source (the catalog builders), not in this parser.

def test_inicio_mas_proximo_ignores_a_display_string_but_reads_an_iso_start_time(api):
    solo_texto = [{"commence_time": "18/09 18:00"}]
    assert api._inicio_mas_proximo(solo_texto) is None

    iso = [{"commence_time": "2026-09-20T18:00:00+00:00"}]
    resultado = api._inicio_mas_proximo(iso)
    assert resultado == datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)


# ── The Odds API fallback catalog keeps the raw ISO start time ────────

def test_fallback_catalog_keeps_a_parseable_iso_start_time_on_each_event(api, monkeypatch):
    async def fake_listar_deportes_activos():
        return ["soccer_epl"]

    monkeypatch.setattr(api, "listar_deportes_activos", fake_listar_deportes_activos)

    async def fake_odds_get(client, path, params, timeout=12):
        return [{
            "id": "abc123",
            "home_team": "Team A",
            "away_team": "Team B",
            "commence_time": "2026-09-20T18:00:00Z",
            "bookmakers": [{
                "markets": [{
                    "key": "h2h",
                    "outcomes": [
                        {"name": "Team A", "price": 2.1},
                        {"name": "Team B", "price": 3.4},
                    ],
                }],
            }],
        }]

    monkeypatch.setattr(api, "odds_get", fake_odds_get)

    resultado = asyncio.run(api._armar_all_markets())

    evento = resultado["sports"][0]["events"][0]
    # La cadena de exhibición sigue como estaba: sin año, ya convertida.
    assert evento["time"] != "--/-- --:--"
    # El ISO crudo queda intacto y es parseable.
    assert datetime.fromisoformat(evento["commence_time"].replace("Z", "+00:00")) == \
        datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)


# ── The corrector's candidates carry the start time too ───────────────

def test_candidatos_parecidos_candidate_carries_the_start_time(api, monkeypatch):
    async def fake_all_markets():
        return {"sports": [{"key": "soccer_epl", "events": [{
            "id": "ev1", "sport_key": "soccer_epl",
            "h": "Team Alpha", "a": "Team Beta",
            "commence_time": "2026-09-21T20:00:00+00:00",
            "markets": {},
        }]}]}

    monkeypatch.setattr(api, "all_markets", fake_all_markets)

    candidatos = asyncio.run(api.candidatos_parecidos("Team Alpha", "Team Beta"))

    assert candidatos
    assert candidatos[0]["commence_time"] == "2026-09-21T20:00:00+00:00"


# ── The scanner item carries the start time of the resolved event ─────

def stub_leer_captura(api, monkeypatch, picks):
    async def fake_leer_captura_con_claude(imagen_b64, media_type):
        return {"picks": picks, "total_odd": None}

    monkeypatch.setattr(api, "leer_captura_con_claude", fake_leer_captura_con_claude)


PICK_LEIDO = {"home": "Team A", "away": "Team B", "market": "1X2",
              "selection": "Team A gana", "odd": 2.0}


def test_scanner_item_carries_the_start_time_of_the_directly_matched_event(api, monkeypatch):
    stub_leer_captura(api, monkeypatch, [PICK_LEIDO])

    async def fake_buscar_cuota_nuestra(home, away, market, selection):
        ev = {"id": "ev1", "sport_key": "soccer_epl", "h": "Team A", "a": "Team B",
              "commence_time": "2026-09-20T18:00:00+00:00", "markets": {}}
        return 2.5, ev

    monkeypatch.setattr(api, "buscar_cuota_nuestra", fake_buscar_cuota_nuestra)

    response = post(api.app, "/api/mejorar-combinada", json_body={"imagen": "fake-base64"})

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["commence_time"] == "2026-09-20T18:00:00+00:00"


def test_scanner_item_carries_the_start_time_of_a_suggested_candidate(api, monkeypatch):
    stub_leer_captura(api, monkeypatch, [PICK_LEIDO])

    async def fake_buscar_cuota_nuestra(home, away, market, selection):
        return None, None

    async def fake_candidatos_parecidos(home, away, limite=4):
        return [{
            "home": "Team A", "away": "Team B",
            "event_id": "ev2", "sport_key": "soccer_epl",
            "opciones": [], "parecido": 0.9,
            "commence_time": "2026-09-21T20:00:00+00:00",
        }]

    monkeypatch.setattr(api, "buscar_cuota_nuestra", fake_buscar_cuota_nuestra)
    monkeypatch.setattr(api, "candidatos_parecidos", fake_candidatos_parecidos)

    response = post(api.app, "/api/mejorar-combinada", json_body={"imagen": "fake-base64"})

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["commence_time"] == "2026-09-21T20:00:00+00:00"


# ── The admin scanner (published combos) carries the same start time ──
#
# /api/admin/combos already stores whatever commence_time its picks
# carry; the admin scanner built its item without one, so a combo
# published from a scanned capture had nothing to store.

def _post_admin(app, path, json_body, admin_key):
    async def _call():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(path, json=json_body, headers={"X-Admin-Key": admin_key})
    return asyncio.run(_call())


def test_admin_scanner_item_carries_the_start_time_of_the_directly_matched_event(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    stub_leer_captura(api, monkeypatch, [PICK_LEIDO])

    async def fake_buscar_cuota_nuestra(home, away, market, selection):
        ev = {"id": "ev1", "sport_key": "soccer_epl", "h": "Team A", "a": "Team B",
              "commence_time": "2026-09-20T18:00:00+00:00", "markets": {}}
        return 2.5, ev

    monkeypatch.setattr(api, "buscar_cuota_nuestra", fake_buscar_cuota_nuestra)

    response = _post_admin(api.app, "/api/admin/escanear-combo",
        {"imagen": "fake-base64"}, "test-admin-key")

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["commence_time"] == "2026-09-20T18:00:00+00:00"


def test_admin_scanner_item_carries_the_start_time_of_a_suggested_candidate(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    stub_leer_captura(api, monkeypatch, [PICK_LEIDO])

    async def fake_buscar_cuota_nuestra(home, away, market, selection):
        return None, None

    async def fake_candidatos_parecidos(home, away, limite=4):
        return [{
            "home": "Team A", "away": "Team B",
            "event_id": "ev2", "sport_key": "soccer_epl",
            "opciones": [], "parecido": 0.9,
            "commence_time": "2026-09-21T20:00:00+00:00",
        }]

    monkeypatch.setattr(api, "buscar_cuota_nuestra", fake_buscar_cuota_nuestra)
    monkeypatch.setattr(api, "candidatos_parecidos", fake_candidatos_parecidos)

    response = _post_admin(api.app, "/api/admin/escanear-combo",
        {"imagen": "fake-base64"}, "test-admin-key")

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["commence_time"] == "2026-09-21T20:00:00+00:00"
