import asyncio
import importlib

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


# Our own totals are keyed the way `parse_markets` and
# `_sr_mercados_formato_app` build them: the outcome name plus the line.
TOTALS = {"Over 1.5": 1.30, "Over 2.5": 1.90, "Over 3.5": 3.10,
          "Under 1.5": 3.40, "Under 2.5": 1.85}


# ── The threshold is read out of the selection ────────────────────────
#
# The selection is OCR of somebody else's ticket, so it arrives in
# Spanish or English, with or without a decimal comma, and sometimes
# with no number at all.

@pytest.mark.parametrize("seleccion,esperado", [
    ("Over 2.5", 2.5),
    ("Más de 2.5 goles", 2.5),
    ("Menos de 1,5", 1.5),
    ("Under 3", 3.0),
    ("O 2.5", 2.5),
    ("Ambos equipos marcan", None),
])
def test_the_threshold_is_read_from_the_selection(api, seleccion, esperado):
    assert api._umbral_de_seleccion(seleccion) == esperado


def test_the_first_number_is_the_threshold_when_several_are_named(api):
    assert api._umbral_de_seleccion("Más de 2.5 goles (2do tiempo 1.5)") == 2.5


# ── Choosing the line ─────────────────────────────────────────────────

def test_the_named_threshold_is_the_line_chosen(api):
    assert api._elegir_linea_totals(TOTALS, "over", 2.5) == ("Over 2.5", True)


def test_the_nearest_line_is_chosen_when_the_threshold_is_not_carried(api):
    assert api._elegir_linea_totals(TOTALS, "over", 3.25) == ("Over 3.5", False)


def test_no_line_is_chosen_when_no_total_is_carried(api):
    assert api._elegir_linea_totals({}, "over", 2.5) == (None, False)


def test_an_unreadable_threshold_is_never_an_exact_match(api):
    clave, exacta = api._elegir_linea_totals(TOTALS, "under", None)
    assert clave in TOTALS
    assert exacta is False


# ── buscar_cuota_nuestra answers about the line the ticket names ──────

def _buscar(api, monkeypatch, totals, selection):
    async def fake_all_markets():
        return {"sports": [{"key": "soccer_epl", "events": [{
            "id": "ev1", "sport_key": "soccer_epl", "h": "Team A", "a": "Team B",
            "commence_time": "2026-09-20T18:00:00+00:00",
            "markets": {"totals": totals},
        }]}]}

    monkeypatch.setattr(api, "all_markets", fake_all_markets)
    return asyncio.run(
        api.buscar_cuota_nuestra("Team A", "Team B", "Totales", selection))


def test_a_carried_threshold_quotes_that_exact_line(api, monkeypatch):
    resultado = _buscar(api, monkeypatch, TOTALS, "Más de 2.5 goles")
    assert (resultado.cuota, resultado.linea) == (1.90, None)


def test_the_spanish_decimal_comma_still_finds_the_exact_line(api, monkeypatch):
    resultado = _buscar(api, monkeypatch, TOTALS, "Menos de 1,5")
    assert (resultado.cuota, resultado.linea) == (3.40, None)


def test_a_threshold_we_do_not_carry_quotes_the_nearest_line_and_names_it(api, monkeypatch):
    resultado = _buscar(api, monkeypatch, TOTALS, "Over 3.25")
    assert resultado.cuota == 3.10
    assert resultado.linea == "Más de 3.5"


def test_no_total_at_all_is_refused(api, monkeypatch):
    resultado = _buscar(api, monkeypatch, {}, "Over 2.5")
    assert resultado.cuota is None
    assert resultado.ev is not None


# ── The scanners honour the substituted line ──────────────────────────

EVENTO = {"id": "ev1", "sport_key": "soccer_epl", "h": "Team A", "a": "Team B",
          "commence_time": "2026-09-20T18:00:00+00:00",
          "markets": {"totals": TOTALS}}

# Our line prices lower than the rival's odd: before this change the
# scanner improved it up to the cap, paying more for a bet nobody asked
# for.
PICK_LEIDO = {"home": "Team A", "away": "Team B", "market": "Totales",
              "selection": "Más de 3.5 goles", "odd": 2.40}


def _stub_escaner(api, monkeypatch, linea):
    async def fake_leer_captura_con_claude(imagen_b64, media_type):
        return {"picks": [PICK_LEIDO], "total_odd": None}

    async def fake_buscar_cuota_nuestra(home, away, market, selection):
        return api.CuotaNuestra(1.90, EVENTO, linea)

    async def fake_mejora_pct(conn=None):
        return 6.0

    monkeypatch.setattr(api, "leer_captura_con_claude", fake_leer_captura_con_claude)
    monkeypatch.setattr(api, "buscar_cuota_nuestra", fake_buscar_cuota_nuestra)
    monkeypatch.setattr(api, "_mejora_pct", fake_mejora_pct)


def _post(app, path, json_body, headers=None):
    async def _call():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport,
                                     base_url="http://testserver") as client:
            return await client.post(path, json=json_body, headers=headers or {})
    return asyncio.run(_call())


def test_a_pick_on_a_different_line_is_quoted_as_is_and_carries_its_own_state(api, monkeypatch):
    _stub_escaner(api, monkeypatch, "Más de 2.5")

    response = _post(api.app, "/api/mejorar-combinada", {"imagen": "fake-base64"})

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["estado"] == "otra_linea"
    assert item["odd_final"] == 1.90
    assert item["ajustada"] is False


def test_a_pick_on_the_named_line_is_still_improved(api, monkeypatch):
    _stub_escaner(api, monkeypatch, None)

    response = _post(api.app, "/api/mejorar-combinada", {"imagen": "fake-base64"})

    item = response.json()["picks"][0]
    assert item["estado"] == "mejorada_parcial"
    assert item["odd_final"] == 2.01
    assert item["ajustada"] is True


def test_the_ticket_is_built_from_the_line_we_quoted(api, monkeypatch):
    _stub_escaner(api, monkeypatch, "Más de 2.5")

    response = _post(api.app, "/api/mejorar-combinada", {"imagen": "fake-base64"})

    item = response.json()["picks"][0]
    # `selection` is what the betslip and the bet are built from, so it
    # is our line; what the rival's ticket said stays beside it, for the
    # screen to show.
    assert item["selection"] == "Más de 2.5"
    assert item["selection_leida"] == "Más de 3.5 goles"


def test_the_admin_scanner_marks_a_different_line_and_does_not_improve_it(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    _stub_escaner(api, monkeypatch, "Más de 2.5")

    response = _post(api.app, "/api/admin/escanear-combo", {"imagen": "fake-base64"},
                     headers={"X-Admin-Key": "test-admin-key"})

    assert response.status_code == 200
    item = response.json()["picks"][0]
    assert item["estado"] == "otra_linea"
    assert item["odd_ajustada"] == 1.90
    assert item["selection"] == "Más de 2.5"
    assert item["selection_leida"] == "Más de 3.5 goles"
