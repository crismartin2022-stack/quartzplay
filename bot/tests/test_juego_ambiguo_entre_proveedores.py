"""Un mismo `game_id` en dos proveedores: el jugador abre el que tocó.

Caso real en staging: alguien abrió Gates of Olympus Roulette (Content360) y
le abrió Tinkerbot (Atomic), porque los dos usan ids numéricos y chocan. La
consulta de lanzamiento se simula acá con la lógica de la real (filtrar por
game_id, por integración si viene, y ordenar por prioridad).
"""

import asyncio
import importlib
import logging

import pytest

from test_runtime_config import settings
from test_wallet_setbalance import use_fake_pool


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def fila(integracion, titulo, adaptador, prioridad):
    return {"game_id": "10181", "titulo": titulo, "marca": "x",
            "es_vivo": False, "integracion": integracion,
            "url": "https://p.example", "api_code": "C", "api_secret": "S",
            "api_secret_cifrado": None, "monedas": "ARS",
            "adaptador": adaptador, "prioridad": prioridad}


class Conexion:
    def __init__(self, juegos):
        self.juegos = juegos

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT id, username, moneda, bloqueado, creado_por"):
            return {"id": 42, "username": "juanito", "moneda": "ARS",
                    "bloqueado": False, "creado_por": "AG-01"}
        if q.startswith("SELECT j.*, i.url"):
            game_id, integracion = args
            candidatos = sorted(
                (j for j in self.juegos if j["game_id"] == game_id),
                key=lambda j: j["prioridad"])
            elegidos = [j for j in candidatos
                        if integracion is None or j["integracion"] == integracion]
            if not elegidos:
                return None
            return {**elegidos[0],
                    "proveedores_con_el_juego":
                        len({j["integracion"] for j in candidatos})}
        if q.startswith("SELECT motivo FROM casino_proveedores"):
            return None
        raise AssertionError(f"fetchrow inesperado: {q}")


def abrir(api, monkeypatch, **cuerpo):
    juegos = [fila("atomic_test", "Tinkerbot", "atomic", 10),
              fila("content360", "Gates of Olympus Roulette", "content360", 20)]
    use_fake_pool(api, monkeypatch, Conexion(juegos))
    abiertos = []

    async def productos(*_):
        return {"casino", "casino_vivo"}

    async def lanzar(pool, u, j, game_id, body):
        abiertos.append(j["titulo"])
        return {"url": "https://juego.example"}

    monkeypatch.setattr(api, "_productos_de", productos)
    monkeypatch.setattr(api, "_lanzar_atomic", lanzar)
    monkeypatch.setattr(api, "_lanzar_content360", lanzar)

    class Req:
        async def json(self):
            return {"user_id": 42, "game_id": "10181", **cuerpo}

    asyncio.run(api.casino_sesion(Req()))
    return abiertos


def test_con_integracion_abre_el_juego_que_el_jugador_toco(api, monkeypatch):
    """Riesgo: el jugador apuesta plata real en un juego que no eligió."""
    assert abrir(api, monkeypatch, integracion="content360") == [
        "Gates of Olympus Roulette"]
    assert abrir(api, monkeypatch, integracion="atomic_test") == ["Tinkerbot"]


def test_sin_integracion_sigue_por_prioridad_y_deja_warning(api, monkeypatch, caplog):
    """Los clientes viejos no mandan la integración: no se rompen, pero el
    desempate silencioso queda en el log."""
    with caplog.at_level(logging.WARNING):
        assert abrir(api, monkeypatch) == ["Tinkerbot"]
    avisos = [r.getMessage() for r in caplog.records
              if r.levelno == logging.WARNING and "ambiguo" in r.getMessage()]
    assert len(avisos) == 1
    assert "10181" in avisos[0] and "2 proveedores" in avisos[0]
    assert "atomic_test" in avisos[0]


def test_con_integracion_no_hay_warning(api, monkeypatch, caplog):
    with caplog.at_level(logging.WARNING):
        abrir(api, monkeypatch, integracion="content360")
    assert not [r for r in caplog.records if "ambiguo" in r.getMessage()]
