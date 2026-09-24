"""El envío del código por correo, probado sin salir a internet.

Hermana de `test_mensajeria.py`: lo que importa acá es lo mismo. Que falle
cerrado sin credenciales, que el código nunca aparezca en el registro, y
que el escape de staging (modo consola) esté apagado a menos que alguien
lo prenda a propósito.
"""

import asyncio
import logging

import httpx
import pytest

import correo
from correo import (
    Credenciales,
    CorreoNoConfigurado,
    EnvioFallido,
    credenciales_del_entorno,
    enviar_codigo,
    hay_proveedor,
    texto_del_codigo,
)

LISTAS = Credenciales(api_key="re_123", desde="iaqp <codigo@iaqp.bet>")
VACIAS = Credenciales(api_key="", desde="")
CONSOLA = Credenciales(api_key="", desde="", modo="consola")


class ResendFalso:
    """Se queda con lo que se le manda, en vez de mandarlo."""

    def __init__(self, status=200, cuerpo=None):
        self.status = status
        self.cuerpo = cuerpo if cuerpo is not None else {"id": "em_999"}
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

        monkeypatch.setattr(correo.httpx, "AsyncClient", ClienteFalso)
        return self


# ── Sin credenciales, falla cerrado ──────────────────────────────

def test_sin_credenciales_no_se_manda_nada():
    """Mejor no crear la cuenta que dejarla esperando un correo que nunca
    va a salir."""
    with pytest.raises(CorreoNoConfigurado):
        asyncio.run(enviar_codigo("juan@gmail.com", "123456", cred=VACIAS))


def test_hay_proveedor_depende_de_lo_configurado():
    assert hay_proveedor(LISTAS) is True
    assert hay_proveedor(VACIAS) is False
    assert hay_proveedor(CONSOLA) is True


# ── El modo consola, apagado por default ─────────────────────────

def test_el_modo_consola_esta_apagado_a_menos_que_se_pida_a_proposito():
    assert Credenciales(api_key="", desde="").modo_consola is False
    assert Credenciales(api_key="", desde="", modo="").modo_consola is False
    assert Credenciales(api_key="", desde="", modo="algo-random").modo_consola is False
    assert Credenciales(api_key="", desde="", modo="consola").modo_consola is True


def test_el_entorno_sin_correo_modo_no_activa_la_consola(monkeypatch):
    monkeypatch.delenv("CORREO_MODO", raising=False)
    assert credenciales_del_entorno().modo_consola is False


def test_en_modo_consola_no_hace_falta_proveedor_configurado():
    """El escape existe para probar el flujo antes de pagarle a Resend."""
    sid = asyncio.run(enviar_codigo("juan@gmail.com", "123456", cred=CONSOLA))

    assert sid == "consola"


def test_el_modo_consola_avisa_fuerte_que_no_se_manda_de_verdad(caplog):
    with caplog.at_level(logging.WARNING):
        asyncio.run(enviar_codigo("juan@gmail.com", "123456", cred=CONSOLA))

    aviso = caplog.text.lower()
    assert "consola" in aviso
    assert "no" in aviso


# ── El envío ─────────────────────────────────────────────────────

def test_un_correo_va_por_resend_con_el_remitente_configurado(monkeypatch):
    resend = ResendFalso().parchear(monkeypatch)

    sid = asyncio.run(enviar_codigo("juan@gmail.com", "123456", cred=LISTAS))

    assert sid == "em_999"
    enviado = resend.pedidos[0]["json"]
    assert enviado["to"] == ["juan@gmail.com"]
    assert enviado["from"] == LISTAS.desde
    assert "123456" in enviado["text"]
    assert resend.pedidos[0]["headers"]["Authorization"] == f"Bearer {LISTAS.api_key}"


def test_si_el_proveedor_rechaza_se_avisa_sin_detalles(monkeypatch):
    ResendFalso(status=422, cuerpo={"message": "invalid from"}).parchear(monkeypatch)

    with pytest.raises(EnvioFallido):
        asyncio.run(enviar_codigo("juan@gmail.com", "123456", cred=LISTAS))


def test_el_codigo_nunca_queda_en_el_registro(monkeypatch, caplog):
    """El registro lo lee mucha más gente que la base. Un código ahí es una
    cuenta ajena servida."""
    ResendFalso(status=500, cuerpo={"message": "boom"}).parchear(monkeypatch)

    with caplog.at_level(logging.ERROR):
        with pytest.raises(EnvioFallido):
            asyncio.run(enviar_codigo("juan@gmail.com", "987654", cred=LISTAS))

    assert "987654" not in caplog.text
    assert "juan@gmail.com" in caplog.text   # el correo sí, para investigar


# ── El texto ─────────────────────────────────────────────────────

def test_el_mensaje_dice_el_codigo_el_plazo_y_que_no_se_comparte():
    texto = texto_del_codigo("123456", 15)

    assert "123456" in texto
    assert "15" in texto
    assert "compartas" in texto.lower()


def test_el_mensaje_no_lleva_enlaces():
    """Un correo con enlace entra derecho a spam y parece phishing, que es
    justo lo que un código de verificación no se puede permitir parecer."""
    texto = texto_del_codigo("123456", 15)

    assert "http" not in texto.lower()
