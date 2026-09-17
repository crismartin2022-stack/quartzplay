"""Guards against hardcoded production frontend links leaking into bot sources."""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_LITERALS = (
    "valiant-gentleness-production-a779.up.railway.app",
    "t.me/QuartzPlayBot",
)


def _bot_sources():
    return sorted(path for path in ROOT.glob("*.py") if path.name != "config.py")


@pytest.mark.parametrize("literal", FORBIDDEN_LITERALS)
def test_bot_sources_do_not_hardcode_production_frontend_links(literal):
    offenders = [path.name for path in _bot_sources() if literal in path.read_text()]

    assert offenders == []


def test_bot_sources_do_not_hardcode_the_production_app_domain_outside_config():
    offenders = [
        path.name for path in _bot_sources()
        if "juego.iaqp.lat" in path.read_text()
    ]

    assert offenders == []
