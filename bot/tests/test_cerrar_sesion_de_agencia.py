"""Salir del panel de la agencia cierra la sesión en el servidor.

Revocar ya funcionaba —borrar la fila de `agencia_sesiones` echa al token en
el pedido siguiente— pero nadie la disparaba: salir solo limpiaba el
navegador y el token seguía abriendo hasta `SESSION_TTL_H`. Quien se hubiera
copiado ese token, o encontrado un teléfono perdido, seguía moviendo la plata
de los jugadores de esa agencia.

Estas pruebas fijan lo que importa: el endpoint BORRA LA FILA (la base es la
única fuente), el token deja de abrir en el pedido siguiente sin esperar
ningún vencimiento, y cerrar una sesión no toca las de otras agencias ni las
de otro dispositivo de la misma.
"""
import asyncio
import importlib

import pytest

from test_runtime_config import settings
from test_sesion_de_agencia_se_puede_revocar import (
    FakeConnection, FakePool, AGENCIA, _norm,
)

OTRA = "AG002"


class ConexionConLogout(FakeConnection):
    """Suma el DELETE del logout al doble de la tabla, respetando el filtro
    por token Y agencia: si la consulta perdiera el segundo, la prueba de
    "no toca a otra agencia" lo vería."""

    def __init__(self):
        super().__init__()
        self.deletes = []

    async def execute(self, query, *args):
        q = _norm(query)
        if q == "DELETE FROM agencia_sesiones WHERE token=$1 AND agencia_code=$2":
            token, code = args
            self.deletes.append((token, code))
            fila = self.filas.get(token)
            if fila and fila[0] == code:
                del self.filas[token]
                return "DELETE 1"
            return "DELETE 0"
        return await super().execute(query, *args)


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


@pytest.fixture
def conn(api, monkeypatch):
    c = ConexionConLogout()

    async def fake_get_db():
        return FakePool(c)

    monkeypatch.setattr(api, "get_db", fake_get_db)
    return c


def salir(api, token):
    """El pedido de logout completo: la dependencia y después el endpoint,
    como los encadena FastAPI."""
    cabecera = f"Bearer {token}"
    code = asyncio.run(api.requiere_agencia(cabecera))
    return asyncio.run(api.agencia_logout(cabecera, code))


def abrir(api, token):
    return asyncio.run(api.requiere_agencia(f"Bearer {token}"))


def test_cerrar_sesion_borra_la_fila(api, conn):
    conn.poner_sesion("t-mia")

    assert salir(api, "t-mia") == {"ok": True}

    assert "t-mia" not in conn.filas
    assert conn.deletes == [("t-mia", AGENCIA)]


def test_el_token_deja_de_abrir_en_el_pedido_siguiente(api, conn):
    """Sin viajar en el tiempo y sin TTL: abre, sale, y el pedido que sigue
    ya es 401."""
    conn.poner_sesion("t-mia")
    assert abrir(api, "t-mia") == AGENCIA

    salir(api, "t-mia")

    with pytest.raises(api.HTTPException) as caso:
        abrir(api, "t-mia")
    assert caso.value.status_code == 401


def test_cerrar_una_sesion_no_toca_las_de_otras_agencias(api, conn):
    conn.poner_sesion("t-mia", AGENCIA)
    conn.poner_sesion("t-ajena", OTRA)

    salir(api, "t-mia")

    assert abrir(api, "t-ajena") == OTRA


def test_cerrar_una_sesion_no_toca_otro_dispositivo_de_la_misma_agencia(api, conn):
    conn.poner_sesion("t-celu", AGENCIA)
    conn.poner_sesion("t-compu", AGENCIA)

    salir(api, "t-celu")

    assert abrir(api, "t-compu") == AGENCIA


def test_el_delete_va_atado_a_la_agencia_que_valido_la_dependencia(api, conn):
    """Aunque alguien llamara al endpoint con un code ajeno, la fila de otra
    agencia no cae: el filtro es token Y agencia."""
    conn.poner_sesion("t-ajena", OTRA)

    asyncio.run(api.agencia_logout("Bearer t-ajena", AGENCIA))

    assert "t-ajena" in conn.filas


def test_sin_sesion_valida_no_se_llega_al_endpoint(api, conn):
    with pytest.raises(api.HTTPException) as caso:
        salir(api, "t-inexistente")
    assert caso.value.status_code == 401
    assert conn.deletes == []


def test_el_token_de_un_jugador_no_cierra_nada_por_esta_puerta(api, conn):
    conn.poner_sesion("t-jugador", "cliente:701")

    with pytest.raises(api.HTTPException) as caso:
        salir(api, "t-jugador")
    assert caso.value.status_code == 403
    assert "t-jugador" in conn.filas


def test_si_la_base_falla_el_endpoint_no_dice_que_cerro(api, conn, monkeypatch):
    """Un `ok` con la fila todavía en la base le haría creer a la persona que
    cerró una sesión que sigue abierta."""
    conn.poner_sesion("t-mia")
    code = abrir(api, "t-mia")

    async def roto(query, *args):
        raise RuntimeError("base caída")

    monkeypatch.setattr(conn, "execute", roto)

    with pytest.raises(api.HTTPException) as caso:
        asyncio.run(api.agencia_logout("Bearer t-mia", code))
    assert caso.value.status_code == 503


def test_create_session_ya_no_existe(api):
    """Aceptaba un `agencia_code` y lo ignoraba: un parámetro de autenticación
    que se acepta y no se usa hace creer que el token quedó atado a alguien.
    Ahora se llama por lo que hace."""
    assert not hasattr(api.auth, "create_session")
    assert api.auth.nuevo_token()
    with pytest.raises(TypeError):
        api.auth.nuevo_token("AG001")


def test_la_puerta_del_logout_es_requiere_agencia(api):
    """Las demás pruebas llaman a la función directo y se saltean el
    `Depends`. Sin esto, el endpoint podría quedar abierto a cualquiera y
    ninguna se enteraría."""
    ruta = next(r for r in api.app.routes
                if getattr(r, "path", "") == "/api/agencias/logout")
    assert "POST" in ruta.methods
    puertas = [d.call for d in ruta.dependant.dependencies]
    assert api.requiere_agencia in puertas
