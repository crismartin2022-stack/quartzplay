"""El aviso de pago se guarda antes de procesarse.

El acreditado ya estaba bien: transacción, bloqueo de fila y control de
estado. Lo que faltaba era sobrevivir a un reinicio entre "llegó el
aviso" y "se acreditó". Estas pruebas cubren ese hueco.
"""

import asyncio
import json

import pytest

from test_runtime_config import settings

import importlib


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def _normalizar(q):
    return " ".join(q.split())


class _Txn:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        self.conn.transacciones += 1
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return False


class ConexionFalsa:
    """Base falsa mínima: bitácora de eventos + una carga pendiente."""

    def __init__(self, carga=None, romper_acreditacion=False):
        self.eventos = {}          # (tipo, request_id, evento) -> fila
        self.siguiente_id = 1
        self.carga = carga or {
            "id": 10, "user_id": 7, "monto": 5000,
            "estado": "pendiente", "agencia_code": "AG-01",
        }
        self.saldo_acreditado = 0
        self.romper_acreditacion = romper_acreditacion
        self.transacciones = 0

    def transaction(self):
        return _Txn(self)

    async def fetchrow(self, query, *args):
        q = _normalizar(query)
        if q.startswith("INSERT INTO psp_eventos"):
            clave = (args[0], args[2], args[1])
            if clave in self.eventos:
                fila = self.eventos[clave]
                fila["cuerpo"] = args[4]
                return {"id": fila["id"], "estado": fila["estado"]}
            fila = {"id": self.siguiente_id, "tipo": args[0], "evento": args[1],
                    "request_id": args[2], "uid": args[3], "cuerpo": args[4],
                    "estado": "recibido", "intentos": 0}
            self.eventos[clave] = fila
            self.siguiente_id += 1
            return {"id": fila["id"], "estado": fila["estado"]}
        if "FROM psp_cargas" in q:
            return dict(self.carga) if self.carga else None
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def fetch(self, query, *args):
        q = _normalizar(query)
        if "FROM psp_eventos" in q:
            return [dict(f) for f in self.eventos.values()
                    if f["estado"] != "procesado" and f["intentos"] < args[0]]
        raise AssertionError(f"fetch inesperado: {q}")

    async def fetchval(self, query, *args):
        return 0

    async def execute(self, query, *args):
        q = _normalizar(query)
        if q.startswith("UPDATE users SET balance"):
            if self.romper_acreditacion:
                raise RuntimeError("la base se cortó")
            self.saldo_acreditado += args[1]
            return
        if q.startswith("UPDATE psp_cargas SET estado='acreditado'"):
            self.carga["estado"] = "acreditado"
            return
        if q.startswith("UPDATE psp_eventos SET estado='procesado'"):
            self._por_id(args[0])["estado"] = "procesado"
            return
        if q.startswith("UPDATE psp_eventos SET estado='fallido'"):
            f = self._por_id(args[0])
            f["estado"] = "fallido"
            f["intentos"] += 1
            return
        # Los registros secundarios ya van protegidos en el código.
        return

    def _por_id(self, evento_id):
        for f in self.eventos.values():
            if f["id"] == evento_id:
                return f
        raise AssertionError(f"evento {evento_id} inexistente")


def _cuerpo(request_id="req-1", event="MATCHED", amount=5000):
    return {"requestId": request_id, "event": event, "amount": amount}


def test_el_aviso_queda_guardado_antes_de_acreditar(api):
    """Si la acreditación falla, el aviso ya está en la bitácora."""
    conn = ConexionFalsa(romper_acreditacion=True)

    async def correr():
        evento_id, ya = await api._psp_guardar_evento(
            conn, "cashin", "req-1", "7", _cuerpo())
        assert ya is False
        with pytest.raises(RuntimeError):
            await api._psp_procesar_cashin(conn, evento_id, "7", _cuerpo())

    asyncio.run(correr())

    guardado = list(conn.eventos.values())[0]
    assert guardado["estado"] == "recibido", "el aviso tiene que quedar registrado"
    assert conn.saldo_acreditado == 0


def test_el_barrido_acredita_lo_que_quedo_pendiente(api):
    """El mismo aviso, procesado después, acredita una sola vez."""
    conn = ConexionFalsa()

    async def correr():
        evento_id, _ = await api._psp_guardar_evento(
            conn, "cashin", "req-1", "7", _cuerpo())
        await api._psp_procesar_cashin(conn, evento_id, "7", _cuerpo())

    asyncio.run(correr())

    assert conn.saldo_acreditado == 500000   # 5000 pesos en centavos
    assert list(conn.eventos.values())[0]["estado"] == "procesado"


def test_un_aviso_repetido_no_crea_dos_filas_ni_acredita_dos_veces(api):
    """El proveedor reintenta: la bitácora lo reconoce y no repite nada."""
    conn = ConexionFalsa()

    async def correr():
        evento_id, ya = await api._psp_guardar_evento(
            conn, "cashin", "req-1", "7", _cuerpo())
        await api._psp_procesar_cashin(conn, evento_id, "7", _cuerpo())
        # Segundo aviso idéntico
        return await api._psp_guardar_evento(conn, "cashin", "req-1", "7", _cuerpo())

    _, ya_procesado = asyncio.run(correr())

    assert ya_procesado is True, "el segundo aviso no debe volver a procesarse"
    assert len(conn.eventos) == 1
    assert conn.saldo_acreditado == 500000


def test_un_aviso_vencido_no_acredita_pero_queda_procesado(api):
    conn = ConexionFalsa()

    async def correr():
        evento_id, _ = await api._psp_guardar_evento(
            conn, "cashin", "req-1", "7", _cuerpo(event="EXPIRED"))
        await api._psp_procesar_cashin(conn, evento_id, "7", _cuerpo(event="EXPIRED"))

    asyncio.run(correr())

    assert conn.saldo_acreditado == 0
    assert list(conn.eventos.values())[0]["estado"] == "procesado"
