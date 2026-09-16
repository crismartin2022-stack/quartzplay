import asyncio
import importlib
import urllib.parse
from dataclasses import replace

import httpx
import pytest

from psp_webhook_auth import cashin_callback_query, payout_callback_query, sign, verify
from test_runtime_config import settings


SECRET = "a" * 32
OTHER_SECRET = "b" * 32


# ── Pure sign/verify unit tests ─────────────────────────────────

def test_sign_is_a_deterministic_hex_digest():
    digest = sign(SECRET, "cashin", {"uid": "1", "n": "abc"})

    assert digest == sign(SECRET, "cashin", {"uid": "1", "n": "abc"})
    assert len(digest) == 64
    int(digest, 16)  # hex


def test_sign_changes_with_purpose():
    assert sign(SECRET, "cashin", {"rid": "1"}) != sign(SECRET, "payout", {"rid": "1"})


def test_verify_returns_ok_for_a_valid_signature():
    params = {"uid": "1", "n": "abc"}
    sig = sign(SECRET, "cashin", params)

    assert verify(SECRET, "cashin", params, sig) == "ok"


def test_verify_returns_invalid_for_a_tampered_parameter():
    params = {"uid": "1", "n": "abc"}
    sig = sign(SECRET, "cashin", params)

    assert verify(SECRET, "cashin", {"uid": "2", "n": "abc"}, sig) == "invalid"


def test_verify_returns_invalid_for_the_wrong_purpose():
    params = {"rid": "7"}
    sig = sign(SECRET, "payout", params)

    assert verify(SECRET, "cashin", params, sig) == "invalid"


def test_verify_returns_invalid_for_a_missing_signature():
    assert verify(SECRET, "cashin", {"uid": "1", "n": "abc"}, None) == "invalid"


def test_verify_returns_invalid_for_a_wrong_secret():
    params = {"uid": "1", "n": "abc"}
    sig = sign(SECRET, "cashin", params)

    assert verify(OTHER_SECRET, "cashin", params, sig) == "invalid"


def test_verify_returns_unconfigured_when_no_secret_is_set():
    assert verify(None, "cashin", {"uid": "1", "n": "abc"}, "whatever") == "unconfigured"
    assert verify("", "cashin", {"uid": "1", "n": "abc"}, "whatever") == "unconfigured"


def test_verify_returns_unconfigured_before_checking_the_signature():
    # Even a missing signature must report "unconfigured", not "invalid",
    # when there is no secret: callers use this to answer 503 vs 401.
    assert verify(None, "cashin", {"uid": "1", "n": "abc"}, None) == "unconfigured"


def test_verify_uses_constant_time_comparison(monkeypatch):
    import psp_webhook_auth

    calls = []
    real_compare = psp_webhook_auth.hmac.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real_compare(a, b)

    monkeypatch.setattr(psp_webhook_auth.hmac, "compare_digest", spy)

    params = {"uid": "1", "n": "abc"}
    sig = sign(SECRET, "cashin", params)
    verify(SECRET, "cashin", params, sig)

    assert len(calls) == 1


def test_cashin_callback_query_carries_uid_nonce_and_a_verifiable_signature():
    query = cashin_callback_query(SECRET, 42)

    assert query["uid"] == "42"
    assert query["n"]
    assert verify(SECRET, "cashin", {"uid": query["uid"], "n": query["n"]}, query["sig"]) == "ok"


def test_cashin_callback_query_nonce_is_random_per_call():
    first = cashin_callback_query(SECRET, 42)
    second = cashin_callback_query(SECRET, 42)

    assert first["n"] != second["n"]
    assert first["sig"] != second["sig"]


def test_payout_callback_query_carries_rid_and_a_verifiable_signature():
    query = payout_callback_query(SECRET, 7)

    assert query["rid"] == "7"
    assert verify(SECRET, "payout", {"rid": query["rid"]}, query["sig"]) == "ok"


# ── Route + fixtures shared with the rest of the bot test suite ──

@pytest.fixture
def api(monkeypatch):
    for key, value in settings(PSP_WEBHOOK_SECRET=SECRET).items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def unconfigured_secret(api, monkeypatch):
    monkeypatch.setattr(api, "SETTINGS", replace(api.SETTINGS, psp_webhook_secret=None))


def forbid_db(api, monkeypatch):
    async def forbidden():
        raise AssertionError("dependency called")
    monkeypatch.setattr(api, "get_db", forbidden)


async def _post(app, path, query=None, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(path, params=query or {}, json=json_body or {})


def post(app, path, query=None, json_body=None):
    return asyncio.run(_post(app, path, query=query, json_body=json_body))


# ── Webhook authentication (fail closed, before any DB access) ──

def test_cashin_webhook_rejects_a_missing_signature_without_db(api, monkeypatch):
    forbid_db(api, monkeypatch)
    query = cashin_callback_query(SECRET, 1)
    del query["sig"]

    response = post(api.app, "/api/psp/webhook/cashin", query=query,
                     json_body={"event": "MATCHED", "requestId": "r1"})

    assert response.status_code == 401


def test_cashin_webhook_rejects_an_invalid_signature_without_db(api, monkeypatch):
    forbid_db(api, monkeypatch)
    query = cashin_callback_query(SECRET, 1)
    query["sig"] = "0" * 64

    response = post(api.app, "/api/psp/webhook/cashin", query=query,
                     json_body={"event": "MATCHED", "requestId": "r1"})

    assert response.status_code == 401


def test_cashin_webhook_answers_503_when_unconfigured_without_db(api, monkeypatch):
    unconfigured_secret(api, monkeypatch)
    forbid_db(api, monkeypatch)

    response = post(api.app, "/api/psp/webhook/cashin",
                     query={"uid": "1", "n": "x", "sig": "whatever"},
                     json_body={"event": "MATCHED", "requestId": "r1"})

    assert response.status_code == 503


def test_payout_webhook_rejects_a_missing_signature_without_db(api, monkeypatch):
    forbid_db(api, monkeypatch)
    query = payout_callback_query(SECRET, 7)
    del query["sig"]

    response = post(api.app, "/api/psp/webhook/payout", query=query,
                     json_body={"id": "po-7", "status": "COMPLETED"})

    assert response.status_code == 401


def test_payout_webhook_rejects_an_invalid_signature_without_db(api, monkeypatch):
    forbid_db(api, monkeypatch)
    query = payout_callback_query(SECRET, 7)
    query["sig"] = "0" * 64

    response = post(api.app, "/api/psp/webhook/payout", query=query,
                     json_body={"id": "po-7", "status": "COMPLETED"})

    assert response.status_code == 401


def test_payout_webhook_answers_503_when_unconfigured_without_db(api, monkeypatch):
    unconfigured_secret(api, monkeypatch)
    forbid_db(api, monkeypatch)

    response = post(api.app, "/api/psp/webhook/payout",
                     query={"rid": "7", "sig": "whatever"},
                     json_body={"id": "po-7", "status": "COMPLETED"})

    assert response.status_code == 503


def test_a_cashin_signature_is_rejected_on_the_payout_endpoint(api, monkeypatch):
    forbid_db(api, monkeypatch)
    cashin_query = cashin_callback_query(SECRET, 1)

    response = post(api.app, "/api/psp/webhook/payout",
                     query={"rid": "1", "sig": cashin_query["sig"]},
                     json_body={"id": "po-1", "status": "COMPLETED"})

    assert response.status_code == 401


# ── In-memory fake pool/connection for settlement tests ──────────

def _normalize(query):
    return " ".join(query.split())


class _Txn:
    async def __aenter__(self):
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return False


class RecordingConnection:
    def __init__(self, cargas=None, retiros=None, user=None):
        self.cargas = [dict(row) for row in (cargas or [])]
        self.retiros = [dict(row) for row in (retiros or [])]
        self.user = user
        self.calls = []

    def transaction(self):
        return _Txn()

    def _carga_by_id(self, carga_id):
        return next(row for row in self.cargas if row["id"] == carga_id)

    def _retiro_by_id(self, retiro_id):
        return next(row for row in self.retiros if row["id"] == retiro_id)

    async def fetchrow(self, query, *args):
        q = _normalize(query)
        self.calls.append(("fetchrow", q, args))
        if q.startswith("SELECT id, user_id, monto, estado, agencia_code FROM psp_cargas"):
            return next((dict(row) for row in self.cargas if row["request_id"] == args[0]), None)
        if q.startswith("SELECT id, user_id, monto, estado FROM psp_retiros"):
            return next((dict(row) for row in self.retiros if row["payout_id"] == args[0]), None)
        if q.startswith("SELECT id, destino, monto FROM psp_retiros"):
            return next((dict(row) for row in self.retiros if row["id"] == args[0]), None)
        if q.startswith("SELECT id, creado_por FROM users"):
            return dict(self.user) if self.user else None
        raise AssertionError(f"unexpected fetchrow: {q}")

    async def fetchval(self, query, *args):
        q = _normalize(query)
        self.calls.append(("fetchval", q, args))
        if q.startswith("SELECT creado_por FROM users"):
            return "admin"
        raise AssertionError(f"unexpected fetchval: {q}")

    async def execute(self, query, *args):
        q = _normalize(query)
        self.calls.append(("execute", q, args))
        if q == "UPDATE psp_cargas SET estado='vencido' WHERE id=$1":
            self._carga_by_id(args[0])["estado"] = "vencido"
        elif q.startswith("UPDATE psp_cargas SET estado='acreditado'"):
            row = self._carga_by_id(args[0])
            row["estado"] = "acreditado"
            row["monto"] = args[1]
        elif q.startswith("UPDATE users SET balance"):
            pass
        elif q.startswith("INSERT INTO wallet_transactions"):
            pass
        elif q.startswith("INSERT INTO agencia_movimientos"):
            pass
        elif q.startswith("UPDATE psp_retiros SET estado='completado'"):
            self._retiro_by_id(args[0])["estado"] = "completado"
        elif q.startswith("UPDATE psp_retiros SET estado='fallido'"):
            self._retiro_by_id(args[0])["estado"] = "fallido"
        elif q.startswith("UPDATE psp_retiros SET payout_id=$2"):
            row = self._retiro_by_id(args[0])
            row["payout_id"] = args[1]
            row["estado"] = "procesando"
        elif q.startswith("INSERT INTO psp_cargas"):
            pass
        else:
            raise AssertionError(f"unexpected execute: {q}")

    def calls_matching(self, prefix):
        return [c for c in self.calls if c[0] == "execute" and c[1].startswith(prefix)]


class _Acquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *args):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return _Acquire(self.conn)


def use_fake_pool(api, monkeypatch, conn):
    async def fake_get_db():
        return FakePool(conn)
    monkeypatch.setattr(api, "get_db", fake_get_db)


def stub_side_effects(api, monkeypatch):
    async def no_bono(*args, **kwargs):
        return False

    async def no_aviso(*args, **kwargs):
        return None
    monkeypatch.setattr(api, "_intentar_otorgar_bono_auto", no_bono)
    monkeypatch.setattr(api, "avisar_cliente", no_aviso)


# ── Idempotent, locked settlement ─────────────────────────────────

def test_replayed_cashin_credit_applies_the_balance_once(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(cargas=[
        {"id": 1, "request_id": "req-1", "user_id": 42, "monto": 1000,
         "estado": "pendiente", "agencia_code": "ag1"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = cashin_callback_query(SECRET, 42)
    body = {"event": "MATCHED", "requestId": "req-1", "amount": 1000}

    first = post(api.app, "/api/psp/webhook/cashin", query=query, json_body=body)
    second = post(api.app, "/api/psp/webhook/cashin", query=query, json_body=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert conn._carga_by_id(1)["estado"] == "acreditado"
    assert len(conn.calls_matching("UPDATE users SET balance")) == 1
    assert len(conn.calls_matching("INSERT INTO agencia_movimientos")) == 1


def test_cashin_matched_after_expiry_still_credits_received_money_once(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(cargas=[
        {"id": 1, "request_id": "req-1", "user_id": 42, "monto": 1000,
         "estado": "vencido", "agencia_code": "ag1"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = cashin_callback_query(SECRET, 42)
    body = {"event": "MATCHED", "requestId": "req-1", "amount": 1000}

    post(api.app, "/api/psp/webhook/cashin", query=query, json_body=body)
    post(api.app, "/api/psp/webhook/cashin", query=query, json_body=body)

    assert conn._carga_by_id(1)["estado"] == "acreditado"
    assert len(conn.calls_matching("UPDATE users SET balance")) == 1


def test_cashin_signed_for_one_user_does_not_credit_another_users_record(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(cargas=[
        {"id": 1, "request_id": "req-1", "user_id": 99, "monto": 1000,
         "estado": "pendiente", "agencia_code": "ag1"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = cashin_callback_query(SECRET, 42)  # signed for user 42, record belongs to 99

    response = post(api.app, "/api/psp/webhook/cashin", query=query,
                     json_body={"event": "MATCHED", "requestId": "req-1", "amount": 1000})

    assert response.status_code == 200
    assert conn._carga_by_id(1)["estado"] == "pendiente"
    assert conn.calls_matching("UPDATE users SET balance") == []


def test_cashin_expired_marks_vencido_when_pending_and_bound(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(cargas=[
        {"id": 1, "request_id": "req-1", "user_id": 42, "monto": 1000,
         "estado": "pendiente", "agencia_code": "ag1"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = cashin_callback_query(SECRET, 42)

    response = post(api.app, "/api/psp/webhook/cashin", query=query,
                     json_body={"event": "EXPIRED", "requestId": "req-1"})

    assert response.status_code == 200
    assert conn._carga_by_id(1)["estado"] == "vencido"


def test_cashin_expired_does_not_touch_another_users_record(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(cargas=[
        {"id": 1, "request_id": "req-1", "user_id": 99, "monto": 1000,
         "estado": "pendiente", "agencia_code": "ag1"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = cashin_callback_query(SECRET, 42)

    response = post(api.app, "/api/psp/webhook/cashin", query=query,
                     json_body={"event": "EXPIRED", "requestId": "req-1"})

    assert response.status_code == 200
    assert conn._carga_by_id(1)["estado"] == "pendiente"


def test_replayed_payout_completed_is_applied_once(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(retiros=[
        {"id": 7, "payout_id": "po-7", "user_id": 42, "monto": 500, "estado": "procesando"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = payout_callback_query(SECRET, 7)
    body = {"id": "po-7", "status": "COMPLETED"}

    first = post(api.app, "/api/psp/webhook/payout", query=query, json_body=body)
    second = post(api.app, "/api/psp/webhook/payout", query=query, json_body=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert conn._retiro_by_id(7)["estado"] == "completado"
    assert len(conn.calls_matching("INSERT INTO agencia_movimientos")) == 1


def test_replayed_payout_failed_refunds_once(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(retiros=[
        {"id": 7, "payout_id": "po-7", "user_id": 42, "monto": 500, "estado": "procesando"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = payout_callback_query(SECRET, 7)
    body = {"id": "po-7", "status": "FAILED"}

    first = post(api.app, "/api/psp/webhook/payout", query=query, json_body=body)
    second = post(api.app, "/api/psp/webhook/payout", query=query, json_body=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert conn._retiro_by_id(7)["estado"] == "fallido"
    assert len(conn.calls_matching("UPDATE users SET balance")) == 1


def test_payout_completed_after_already_failed_is_not_reapplied(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(retiros=[
        {"id": 7, "payout_id": "po-7", "user_id": 42, "monto": 500, "estado": "fallido"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = payout_callback_query(SECRET, 7)

    response = post(api.app, "/api/psp/webhook/payout", query=query,
                     json_body={"id": "po-7", "status": "COMPLETED"})

    assert response.status_code == 200
    assert conn._retiro_by_id(7)["estado"] == "fallido"
    assert conn.calls_matching("UPDATE psp_retiros SET estado='completado'") == []


def test_payout_signed_for_one_withdrawal_does_not_settle_another(api, monkeypatch):
    stub_side_effects(api, monkeypatch)
    conn = RecordingConnection(retiros=[
        {"id": 8, "payout_id": "po-7", "user_id": 42, "monto": 500, "estado": "procesando"},
    ])
    use_fake_pool(api, monkeypatch, conn)
    query = payout_callback_query(SECRET, 7)  # signed for id 7, stored record has id 8

    response = post(api.app, "/api/psp/webhook/payout", query=query,
                     json_body={"id": "po-7", "status": "COMPLETED"})

    assert response.status_code == 200
    assert conn._retiro_by_id(8)["estado"] == "procesando"


# ── Request creation fails closed without the secret ──────────────

def test_me_psp_cargar_refuses_with_503_when_secret_missing_without_db(api, monkeypatch):
    unconfigured_secret(api, monkeypatch)
    forbid_db(api, monkeypatch)

    def fake_user(_init_data):
        return {"id": 42}
    monkeypatch.setattr(api, "validar_init_data", fake_user)

    response = post(api.app, "/api/me/psp/cargar",
                     json_body={"init_data": "x", "monto": 100, "cuit": "12345678901"})

    assert response.status_code == 503


def test_me_psp_cargar_registers_a_verifiable_signed_callback_url(api, monkeypatch):
    def fake_user(_init_data):
        return {"id": 42}
    monkeypatch.setattr(api, "validar_init_data", fake_user)

    async def fake_activa(_conn, _agencia):
        return True
    monkeypatch.setattr(api, "_psp_activa_para", fake_activa)

    async def fake_psp_get(_path):
        return {"cvu": "cvu-1", "alias": "alias-1", "nombre": "nombre-1"}
    monkeypatch.setattr(api, "_psp_get", fake_psp_get)

    captured = {}

    async def fake_psp_post(_path, body):
        captured["body"] = body
        return {"id": "req-123"}
    monkeypatch.setattr(api, "_psp_post", fake_psp_post)

    conn = RecordingConnection(user={"id": 42, "creado_por": "ag1"})
    use_fake_pool(api, monkeypatch, conn)

    response = post(api.app, "/api/me/psp/cargar",
                     json_body={"init_data": "x", "monto": 100, "cuit": "12345678901"})

    assert response.status_code == 200
    callback_url = captured["body"]["clientCallbackUrl"]
    base, _, query_string = callback_url.partition("?")
    assert base.endswith("/api/psp/webhook/cashin")
    params = dict(urllib.parse.parse_qsl(query_string))
    assert params["uid"] == "42"
    assert params["n"]
    assert verify(SECRET, "cashin", {"uid": params["uid"], "n": params["n"]}, params["sig"]) == "ok"


def test_ejecutar_payout_refuses_with_503_when_secret_missing_without_conn_access(api, monkeypatch):
    unconfigured_secret(api, monkeypatch)

    class ForbiddenConnection:
        async def fetchrow(self, *args, **kwargs):
            raise AssertionError("connection used")

        async def execute(self, *args, **kwargs):
            raise AssertionError("connection used")

    async def run():
        with pytest.raises(api.HTTPException) as exc_info:
            await api._ejecutar_payout(ForbiddenConnection(), 7)
        return exc_info.value

    error = asyncio.run(run())

    assert error.status_code == 503


def test_ejecutar_payout_registers_a_verifiable_signed_callback_url(api, monkeypatch):
    captured = {}

    async def fake_psp_post(_path, body):
        captured["body"] = body
        return {"id": "po-7"}
    monkeypatch.setattr(api, "_psp_post", fake_psp_post)

    conn = RecordingConnection(retiros=[
        {"id": 7, "destino": "CVU123", "monto": 500, "estado": "aprobado"},
    ])

    payout_id = asyncio.run(api._ejecutar_payout(conn, 7))

    assert payout_id == "po-7"
    callback_url = captured["body"]["callbackUrl"]
    base, _, query_string = callback_url.partition("?")
    assert base.endswith("/api/psp/webhook/payout")
    params = dict(urllib.parse.parse_qsl(query_string))
    assert params["rid"] == "7"
    assert verify(SECRET, "payout", {"rid": params["rid"]}, params["sig"]) == "ok"
