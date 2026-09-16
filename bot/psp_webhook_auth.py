"""HMAC authentication for PSP callback URLs.

Pure, no I/O: callers own the secret lookup, network calls, and database
access. A callback URL carries a purpose-scoped HMAC-SHA256 signature over a
fixed-order set of parameters so a forged callback cannot move money.
"""

import hashlib
import hmac
import secrets
from typing import Mapping


def _message(purpose: str, params: Mapping[str, str]) -> str:
    encoded = "&".join(f"{key}={params[key]}" for key in params)
    return f"{purpose}:{encoded}"


def sign(secret: str, purpose: str, params: Mapping[str, str]) -> str:
    """Hex HMAC-SHA256 digest over the purpose-scoped, fixed-order message."""
    message = _message(purpose, params)
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def verify(secret: str | None, purpose: str, params: Mapping[str, str], signature: str | None) -> str:
    """Verify a callback signature.

    Returns "unconfigured" when no secret is configured, "invalid" when the
    signature is missing or does not match, "ok" otherwise. The secret
    presence is checked before the signature so an unconfigured deployment
    always fails closed the same way regardless of what the caller sent.
    """
    if not secret:
        return "unconfigured"
    if not signature:
        return "invalid"
    expected = sign(secret, purpose, params)
    if not hmac.compare_digest(expected, signature):
        return "invalid"
    return "ok"


def cashin_callback_query(secret: str, user_id) -> dict:
    """Build the signed query params for a cash-in callback URL."""
    params = {"uid": str(user_id), "n": secrets.token_urlsafe(18)}
    params["sig"] = sign(secret, "cashin", params)
    return params


def payout_callback_query(secret: str, retiro_id) -> dict:
    """Build the signed query params for a payout callback URL."""
    params = {"rid": str(retiro_id)}
    params["sig"] = sign(secret, "payout", params)
    return params
