"""El envío del código, probado sin salir a internet.

Lo que importa acá: que falle cerrado sin credenciales, que el código nunca
aparezca en el registro, y que cambiar de SMS a WhatsApp sea un parámetro y
no una reescritura.
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

SOLO_SMS = Credenciales(cuenta="AC123", token="secreto",
                        remitente_sms="+15550001111", remitente_whatsapp="")
COMPLETAS = Credenciales(cuenta="AC123", token="secreto",
                         remitente_sms="+15550001111",
                         remitente_whatsapp="+15550002222")
VACIAS = Credenciales(cuenta="", token="", remitente_sms="", remitente_whatsapp="")


class TwilioFalso:
    """Se queda con lo que se le manda, en vez de mandarlo."""

    def __init__(self, status=201, cuerpo=None):
        self.status = status
        self.cuerpo = cuerpo if cuerpo is not None else {"sid": "SM999"}
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

            async def post(self, url, data=None, auth=None):
                prueba.pedidos.append({"url": url, "data": data, "auth": auth})
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

def test_un_sms_va_al_numero_con_el_remitente_de_sms(monkeypatch):
    twilio = TwilioFalso().parchear(monkeypatch)

    sid = asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS))

    assert sid == "SM999"
    enviado = twilio.pedidos[0]["data"]
    assert enviado["To"] == "+593991234567"
    assert enviado["From"] == "+15550001111"
    assert "123456" in enviado["Body"]


def test_cambiar_a_whatsapp_es_un_parametro(monkeypatch):
    """Es la razón de que el canal esté detrás de esta puerta: el día que
    aprueben el remitente, no se reescribe nada."""
    twilio = TwilioFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+584121234567", "123456", WHATSAPP, cred=COMPLETAS))

    enviado = twilio.pedidos[0]["data"]
    assert enviado["To"] == "whatsapp:+584121234567"
    assert enviado["From"] == "whatsapp:+15550002222"


def test_si_el_proveedor_rechaza_se_avisa_sin_detalles(monkeypatch):
    TwilioFalso(status=400, cuerpo={"message": "unverified number"}).parchear(monkeypatch)

    with pytest.raises(EnvioFallido):
        asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=SOLO_SMS))


def test_el_codigo_nunca_queda_en_el_registro(monkeypatch, caplog):
    """El registro lo lee mucha más gente que la base. Un código ahí es una
    cuenta ajena servida."""
    TwilioFalso(status=500, cuerpo={"message": "boom"}).parchear(monkeypatch)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(EnvioFallido):
            asyncio.run(enviar_codigo("+593991234567", "987654", SMS, cred=SOLO_SMS))

    assert "987654" not in caplog.text
    assert "+593991234567" in caplog.text   # el número sí, para poder investigar


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


# ── Messaging Service ────────────────────────────────────────────

CON_SERVICIO = Credenciales(cuenta="AC123", token="secreto", remitente_sms="",
                            remitente_whatsapp="",
                            servicio_mensajeria="MG0000000000")


def test_con_un_messaging_service_alcanza_para_mandar_sms():
    """Con tres países de reglas distintas, dejar que Twilio elija el
    remitente es lo recomendado. No hace falta comprar un número suelto."""
    assert canales_disponibles(CON_SERVICIO) == [SMS]


def test_el_servicio_viaja_como_servicio_y_no_como_remitente(monkeypatch):
    twilio = TwilioFalso().parchear(monkeypatch)

    asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=CON_SERVICIO))

    enviado = twilio.pedidos[0]["data"]
    assert enviado["MessagingServiceSid"] == "MG0000000000"
    assert "From" not in enviado


def test_si_estan_los_dos_gana_el_servicio(monkeypatch):
    twilio = TwilioFalso().parchear(monkeypatch)
    ambos = Credenciales(cuenta="AC123", token="s", remitente_sms="+15550001111",
                         remitente_whatsapp="", servicio_mensajeria="MG111")

    asyncio.run(enviar_codigo("+593991234567", "123456", SMS, cred=ambos))

    assert twilio.pedidos[0]["data"]["MessagingServiceSid"] == "MG111"
