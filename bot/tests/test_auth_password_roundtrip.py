import hashlib

import pytest

import auth


# Fake passwords only — never a real credential.
PASSWORD = "correct-horse-battery-Stapl3!"
WRONG_PASSWORD = "incorrect-donkey-battery-staple"

# 73 ASCII bytes: one past bcrypt's 72-byte limit, so this exercises the
# _bytes72 truncation path on both hash and verify.
LONG_PASSWORD = "x" * 73


@pytest.fixture(scope="module")
def stored_hash():
    return auth.hash_password(PASSWORD)


@pytest.fixture(scope="module")
def stored_hash_for_long_password():
    return auth.hash_password(LONG_PASSWORD)


def test_hashed_password_verifies_against_itself(stored_hash):
    assert auth.verify_password(PASSWORD, stored_hash) is True


def test_wrong_password_does_not_verify(stored_hash):
    assert auth.verify_password(WRONG_PASSWORD, stored_hash) is False


def test_produced_hash_has_the_bcrypt_prefix(stored_hash):
    assert stored_hash.startswith("$2")


def test_password_longer_than_72_bytes_still_round_trips(stored_hash_for_long_password):
    assert auth.verify_password(LONG_PASSWORD, stored_hash_for_long_password) is True


def test_legacy_sha256_stored_form_still_verifies():
    legacy_stored = hashlib.sha256(PASSWORD.encode()).hexdigest()

    assert auth.verify_password(PASSWORD, legacy_stored) is True


def test_a_stored_value_in_neither_form_does_not_verify():
    assert auth.verify_password(PASSWORD, "not-a-bcrypt-or-sha256-hash") is False
