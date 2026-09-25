"""El envío del código, probado sin salir a internet.

Lo que importa acá: que falle cerrado sin credenciales, que el código nunca
aparezca en el registro, que el texto no delate el vertical, y que cambiar de
SMS a WhatsApp sea un parámetro y no una reescritura.

Esa última garantía ya se cobró sola: Twilio cerró la cuenta y mudarse a
Dexatel costó reescribir un módulo. Estas pruebas son las que permiten que la
próxima mudanza cueste lo mismo.
"""

import asyncio
import logging

import httpx
import pytest

import mensajeria
from mensajeria import (
    SMS,
    WHATSAPP,
    Credenciales,
    EnvioFallido,
    MensajeriaNoConfigurada,
    canales_disponibles,
    enviar_codigo,
    texto_del_codigo,
)

SOLO_SMS = Credenciales(clave="secreta", remitente_sms="iaqp")
COMPLETAS = Credenciales(clave="secreta", remitente_sms="iaqp",
                         remitente_whatsapp="+15550002222")
VACIAS = Credenciales(clave="", remitente_sms="", remitente_whatsapp="")


class ProveedorFalso:
    """Se queda con lo que se le manda, en vez de mandarlo."""

    def __init__(self, status=201, cuerpo=None):
        self.status = status
        self.cuerpo = cuerpo if cuerpo is not None else {"data": [{"id": "MSG999"}]}
        self.pedidos = []

    def parchear(self, monkeypatch):
        prueba = self

        class ClienteFalso:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, json=None, headers=None):
                prueba.pedidos.append({"url": url, "json": json, "headers": headers})
                return httpx.Response(prueba.status, json=prueba.cuerpo,
                                      request=httpx.Request("POST", url))

        monkeypatch.setattr(mensajeria.httpx, "AsyncClient", ClienteFalso)
        return self


# ── Sin credenciales, falla cerrado ──────────────────────────────

def test_sin_credenciales_no_se_manda_nada():
    """Mejor no registrar a nadie que dejar cuentas esperando un mensaje
    que nunca salió."""
    with pytest.raises(MensajeriaNoConfigurada):
        asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=VACIAS))


def test_whatsapp_sin_remitente_aprobado_avisa_claro():
    with pytest.raises(MensajeriaNoConfigurada, match="WhatsApp"):
        asyncio.run(enviar_codigo("+593991234567", "123456", WHATSAPP, cred=SOLO_SMS))


def test_los_canales_disponibles_dependen_de_lo_configurado():
    """La pantalla pregunta esto: no tiene sentido ofrecer WhatsApp mientras
    el remitente espera aprobación."""
    assert canales_disponibles(SOLO_SMS) == [SMS]
    assert canales_disponibles(COMPLETAS) == [SMS, WHATSAPP]
    assert canales_disponibles(VACIAS) == []


# ── El envío ─────────────────────────────────────────────────────

def test_un_sms_va_al_numero_con_la_clave_en_la_cabecera(monkeypatch):
    proveedor = ProveedorFalso().parchear(monkeypatch)

    ident = asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS))

    assert ident == "MSG999"
    pedido = proveedor.pedidos[0]
    assert pedido["url"] == mensajeria.DEXATEL_API
    assert pedido["headers"]["X-Dexatel-Key"] == "secreta"
    datos = pedido["json"]["data"]
    assert datos["to"] == ["593991234567"]
    assert datos["from"] == "iaqp"
    assert datos["channel"] == "SMS"
    assert "123456" in datos["text"]


def test_el_cuerpo_va_envuelto_en_data_y_to_es_una_lista(monkeypatch):
    """Fijado por un 400 real en staging el 2026-09-25: mandar el JSON plano
    devuelve "Request data is missing" (código 1007). La página de
    "get started" de Dexatel lo muestra sin envolver y está equivocada."""
    proveedor = ProveedorFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+573218952770", "123456", SMS, cred=SOLO_SMS))

    cuerpo = proveedor.pedidos[0]["json"]
    assert set(cuerpo) == {"data"}
    assert isinstance(cuerpo["data"]["to"], list)


def test_el_numero_viaja_sin_el_mas(monkeypatch):
    """La referencia pide el código de país sin espacios ni caracteres
    especiales, y su ejemplo lo escribe así."""
    proveedor = ProveedorFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+573218952770", "123456", SMS, cred=SOLO_SMS))

    assert proveedor.pedidos[0]["json"]["data"]["to"] == ["573218952770"]


def test_la_clave_viaja_en_la_cabecera_y_nunca_en_el_cuerpo(monkeypatch):
    """Si se colara en el cuerpo terminaría en cualquier registro de pedidos
    del proveedor, y una clave en un log es una clave filtrada."""
    proveedor = ProveedorFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS))

    assert "secreta" not in str(proveedor.pedidos[0]["json"])


def test_cambiar_a_whatsapp_es_un_parametro(monkeypatch):
    """Es la razón de que el canal esté detrás de esta puerta: el día que
    aprueben el remitente, no se reescribe nada."""
    proveedor = ProveedorFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+584121234567", "123456", WHATSAPP, cred=COMPLETAS))

    datos = proveedor.pedidos[0]["json"]["data"]
    assert datos["to"] == ["584121234567"]
    assert datos["from"] == "+15550002222"
    assert datos["channel"] == "WHATSAPP"


def test_si_el_proveedor_rechaza_se_avisa_sin_detalles(monkeypatch):
    ProveedorFalso(status=400, cuerpo={"message": "unverified number"}).parchear(monkeypatch)

    with pytest.raises(EnvioFallido):
        asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS))


def test_el_codigo_nunca_queda_en_el_registro(monkeypatch, caplog):
    """El registro lo lee mucha más gente que la base. Un código ahí es una
    cuenta ajena servida."""
    ProveedorFalso(status=500, cuerpo={"message": "boom"}).parchear(monkeypatch)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(EnvioFallido):
            asyncio.run(enviar_codigo("+593991234567", "987654", SMS, cred=SOLO_SMS))

    assert "987654" not in caplog.text
    assert "+593991234567" in caplog.text   # el número sí, para poder investigar


# ── El identificador que devuelve el proveedor ───────────────────
#
# La documentación pública muestra el pedido pero no una respuesta de ejemplo.
# Estas pruebas fijan que ninguna de las formas plausibles rompa el registro:
# quedarse sin identificador no puede costarle la cuenta a una persona.

@pytest.mark.parametrize("cuerpo,esperado", [
    # La forma real, tomada de /reference/messages-send.
    ({"id": "550e8400-e29b-41d4-a716-446655440000", "status": "sent"},
     "550e8400-e29b-41d4-a716-446655440000"),
    ({"data": [{"id": "A1"}]}, "A1"),
    ({"data": {"id": "B2"}}, "B2"),
    ({"id": "C3"}, "C3"),
    ({"message_id": "D4"}, "D4"),
    ({}, ""),
    ([], ""),
])
def test_el_identificador_se_lee_de_cualquier_forma_razonable(monkeypatch, cuerpo, esperado):
    ProveedorFalso(cuerpo=cuerpo).parchear(monkeypatch)

    assert asyncio.run(
        enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS)) == esperado


def test_una_respuesta_que_no_es_json_no_tumba_el_registro(monkeypatch):
    """El mensaje salió: el proveedor contestó 200. Fallar acá sería negarle
    la verificación a alguien por un detalle de formato."""
    class SinJson(ProveedorFalso):
        def parchear(self, monkeypatch):
            class ClienteFalso:
                def __init__(self, *a, **k):
                    pass

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *a):
                    return False

                async def post(self, url, json=None, headers=None):
                    return httpx.Response(200, text="OK",
                                          request=httpx.Request("POST", url))

            monkeypatch.setattr(mensajeria.httpx, "AsyncClient", ClienteFalso)
            return self

    SinJson().parchear(monkeypatch)

    assert asyncio.run(
        enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS)) == ""


# ── El texto ─────────────────────────────────────────────────────

def test_el_mensaje_dice_el_codigo_el_plazo_y_que_no_se_comparte():
    texto = texto_del_codigo("123456", 10)

    assert "123456" in texto
    assert "10" in texto
    assert "compartas" in texto.lower()


def test_el_mensaje_no_lleva_enlaces():
    """Un mensaje con enlace parece una estafa, y varios operadores de la
    región directamente lo bloquean."""
    texto = texto_del_codigo("123456", 10)

    assert "http" not in texto.lower()


def test_el_mensaje_no_menciona_el_vertical():
    """Es lo que sostiene que esto es un OTP transaccional y no publicidad de
    apuestas. Twilio cerró la cuenta justamente por esa clasificación, y el
    texto es la evidencia que se muestra al postular."""
    texto = texto_del_codigo("123456", 10).lower()

    for palabra in ("apuesta", "casino", "juego", "bono", "gana"):
        assert palabra not in texto
