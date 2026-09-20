import hashlib

import pytest

import auth


# Fake passwords only — never a real credential.
PASSWORD = "correct-horse-battery-Stapl3!"
WRONG_PASSWORD = "incorrect-donkey-battery-staple"

# bcrypt reads only the first 72 bytes, and auth._bytes72 cuts there before
# hashing AND before verifying. These values make that cut observable: the
# first three share their first 72 bytes and differ only past the boundary,
# so they are interchangeable against each other's hashes. The last one
# differs inside the first 72 bytes and therefore must not match.
LONG_PASSWORD = "x" * 72 + "-tail-A"
LONG_PASSWORD_SAME_FIRST_72 = "x" * 72 + "-tail-B"
EXACTLY_72_BYTES = "x" * 72
LONG_PASSWORD_DIFFERENT_PREFIX = "y" + "x" * 71 + "-tail-A"


@pytest.fixture(scope="module")
def stored_hash():
    return auth.hash_password(PASSWORD)


@pytest.fixture(scope="module")
def long_password_hash():
    return auth.hash_password(LONG_PASSWORD)


def test_hashed_password_verifies_against_itself(stored_hash):
    assert auth.verify_password(PASSWORD, stored_hash) is True


def test_wrong_password_does_not_verify(stored_hash):
    assert auth.verify_password(WRONG_PASSWORD, stored_hash) is False


def test_produced_hash_has_the_bcrypt_prefix(stored_hash):
    assert stored_hash.startswith("$2")


def test_password_longer_than_72_bytes_round_trips(long_password_hash):
    assert auth.verify_password(LONG_PASSWORD, long_password_hash) is True


def test_only_the_first_72_bytes_decide_the_match(long_password_hash):
    # The security-relevant consequence of the truncation: a stored hash is
    # only as strong as the first 72 bytes of the password that produced it.
    assert auth.verify_password(EXACTLY_72_BYTES, long_password_hash) is True
    assert auth.verify_password(LONG_PASSWORD_SAME_FIRST_72, long_password_hash) is True


def test_a_difference_inside_the_first_72_bytes_still_fails(long_password_hash):
    assert auth.verify_password(LONG_PASSWORD_DIFFERENT_PREFIX, long_password_hash) is False


def test_legacy_sha256_stored_form_still_verifies():
    # Rows predating the bcrypt migration still hold a bare sha256 hexdigest.
    # verify_password must keep accepting them so those players can log in;
    # casino_api rehashes the row to bcrypt on that first successful login.
    legacy_stored = hashlib.sha256(PASSWORD.encode()).hexdigest()

    assert auth.verify_password(PASSWORD, legacy_stored) is True


def test_wrong_password_does_not_verify_against_the_legacy_form():
    # The direction that actually guards the legacy branch: a stored value
    # that merely looks like a hexdigest must not accept any password.
    legacy_stored = hashlib.sha256(PASSWORD.encode()).hexdigest()

    assert auth.verify_password(WRONG_PASSWORD, legacy_stored) is False


def test_a_stored_value_in_neither_form_does_not_verify():
    assert auth.verify_password(PASSWORD, "not-a-bcrypt-or-sha256-hash") is False
