"""Que un callback de proveedor no mueva plata dos veces.

Se prueba `aplicar_una_vez` contra una tabla `casino_movimientos` en
memoria que respeta lo que importa del índice único de `ref` y de la
consulta por ronda. La primitiva es la que van a usar Atomic y Content360:
si falla acá, falla en los dos.
"""

import asyncio

import pytest

import registro_proveedores as rp


class FakeMovimientos:
    """`casino_movimientos` con las columnas que la idempotencia consulta."""

    def __init__(self):
        self.filas = []
        self.candados = []
        self.saldo = 100_000
        self.tocado = 0  # cuántas veces se movió plata de verdad

    async def execute(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT pg_advisory_xact_lock"):
            self.candados.append(args[0])
            return
        raise AssertionError(f"execute inesperado: {q}")

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT saldo_post FROM casino_movimientos WHERE ref=$1"):
            return next(({"saldo_post": f["saldo_post"]}
                         for f in self.filas if f["ref"] == args[0]), None)
        if q.startswith("SELECT saldo_post FROM casino_movimientos WHERE proveedor=$1"):
            proveedor, ronda, tipo, monto, ventana = args
            return next(({"saldo_post": f["saldo_post"]}
                         for f in self.filas
                         if (f["proveedor"], f["ronda"], f["tipo"], f["monto"])
                         == (proveedor, ronda, tipo, monto)
                         and f["antiguedad"] <= ventana), None)
        raise AssertionError(f"fetchrow inesperado: {q}")

    def aplicador(self, proveedor, tipo, monto, ronda=None, antiguedad=0):
        async def aplicar(ref):
            self.tocado += 1
            self.saldo += monto if tipo == "credito" else -monto
            self.filas.append({"ref": ref, "proveedor": proveedor, "ronda": ronda,
                               "tipo": tipo, "monto": monto,
                               "saldo_post": self.saldo, "antiguedad": antiguedad})
            return self.saldo
        return aplicar


def correr(conn, proveedor, transaccion, tipo, monto, ronda=None):
    return asyncio.run(rp.aplicar_una_vez(
        conn, proveedor, transaccion, tipo, monto,
        conn.aplicador(proveedor, tipo, monto, ronda), ronda))


def test_la_clave_lleva_el_prefijo_del_proveedor():
    assert rp.clave_idempotencia("atomic", "abc-123") == "atomic:abc-123"
    assert rp.clave_idempotencia("c360", "abc-123") == "c360:abc-123"


def test_dos_proveedores_con_el_mismo_id_no_chocan():
    """Riesgo: el id 'tx-1' de Content360 se lee como repetido de Atomic y
    el jugador no cobra su premio."""
    conn = FakeMovimientos()

    a = correr(conn, "atomic", "tx-1", "debito", 500)
    c = correr(conn, "c360", "tx-1", "debito", 500)

    assert (a.repetido, c.repetido) == (False, False)
    assert conn.tocado == 2


def test_una_transaccion_repetida_no_mueve_nada_y_devuelve_lo_mismo():
    """Riesgo central: el reintento del proveedor descuenta dos veces."""
    conn = FakeMovimientos()

    primera = correr(conn, "atomic", "tx-9", "debito", 500)
    segunda = correr(conn, "atomic", "tx-9", "debito", 500)

    assert primera.repetido is False and segunda.repetido is True
    assert segunda.saldo_post == primera.saldo_post
    assert segunda.por == "ref"
    assert conn.tocado == 1
    assert conn.saldo == 100_000 - 500


@pytest.mark.parametrize("falta", [None, "", "   "])
def test_sin_transaccion_se_rechaza_y_no_se_inventa_una_clave(falta):
    """Riesgo: un `uniqid()` de respaldo hace que cada reintento parezca un
    pedido nuevo, y la idempotencia deja de proteger."""
    conn = FakeMovimientos()

    with pytest.raises(rp.TransaccionFaltante):
        correr(conn, "atomic", falta, "debito", 500)

    assert conn.tocado == 0 and conn.filas == []


def test_un_identificador_demasiado_largo_se_rechaza_no_se_corta():
    """Riesgo: cortar en silencio hace que dos transacciones distintas
    terminen con la misma clave."""
    with pytest.raises(rp.TransaccionFaltante):
        rp.clave_idempotencia("atomic", "x" * 200)


# ── El segundo control, por ronda ─────────────────────────────────

def test_un_reintento_con_id_nuevo_pero_misma_ronda_no_se_cobra_dos_veces():
    """Riesgo: no sabemos si Atomic reutiliza el id al reintentar. Si manda
    uno nuevo, sin este control se descuenta dos veces."""
    conn = FakeMovimientos()

    primera = correr(conn, "atomic", "uuid-A", "debito", 500, ronda="R1")
    retry = correr(conn, "atomic", "uuid-B", "debito", 500, ronda="R1")

    assert retry.repetido is True and retry.por == "ronda"
    assert retry.saldo_post == primera.saldo_post
    assert conn.tocado == 1


def test_otro_monto_o_otro_tipo_en_la_misma_ronda_es_un_movimiento_distinto():
    """Una ronda tiene apuesta Y premio: no son el mismo movimiento."""
    conn = FakeMovimientos()

    correr(conn, "atomic", "u1", "debito", 500, ronda="R1")
    otro_tipo = correr(conn, "atomic", "u2", "credito", 500, ronda="R1")
    otro_monto = correr(conn, "atomic", "u3", "debito", 700, ronda="R1")

    assert (otro_tipo.repetido, otro_monto.repetido) == (False, False)
    assert conn.tocado == 3


def test_otra_ronda_u_otro_proveedor_no_dispara_el_segundo_control():
    conn = FakeMovimientos()

    correr(conn, "atomic", "u1", "debito", 500, ronda="R1")
    otra_ronda = correr(conn, "atomic", "u2", "debito", 500, ronda="R2")
    otro_prov = correr(conn, "c360", "u3", "debito", 500, ronda="R1")

    assert (otra_ronda.repetido, otro_prov.repetido) == (False, False)


def test_fuera_de_la_ventana_no_se_considera_reintento():
    """Falso positivo acotado: dos apuestas iguales en la misma ronda,
    separadas en el tiempo, no son un reintento."""
    conn = FakeMovimientos()
    conn.filas.append({"ref": "atomic:viejo", "proveedor": "atomic",
                       "ronda": "R1", "tipo": "debito", "monto": 500,
                       "saldo_post": 1, "antiguedad": rp.VENTANA_RONDA_SEGUNDOS + 1})

    nuevo = correr(conn, "atomic", "u-nuevo", "debito", 500, ronda="R1")

    assert nuevo.repetido is False


def test_sin_ronda_solo_rige_la_clave_exacta():
    conn = FakeMovimientos()

    correr(conn, "atomic", "u1", "debito", 500)
    otro = correr(conn, "atomic", "u2", "debito", 500)

    assert otro.repetido is False


def test_serializa_los_reintentos_con_candado_de_transaccion():
    """Riesgo: dos copias simultáneas leen 'no existe' y ambas mueven plata."""
    conn = FakeMovimientos()

    correr(conn, "atomic", "u1", "debito", 500, ronda="R1")

    assert conn.candados == ["atomic:u1", "atomic|R1|debito|500"]
