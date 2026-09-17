"""Registration on /start must match the partial unique index, and logs must not carry the bot token."""

import importlib
import logging
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN_URL = re.compile(r"api\.telegram\.org/bot[^/\s\"']+")
CONFLICT = re.compile(r"ON CONFLICT \(telegram_id\)(?P<tail>[^\n]*)", re.IGNORECASE)


def source(name):
    return (ROOT / name).read_text()


class StartRegistrationTests(unittest.TestCase):
    def test_start_upsert_matches_the_partial_unique_index(self):
        conflict = CONFLICT.search(source("bot_handlers.py"))
        self.assertIsNotNone(conflict, "the /start upsert must target telegram_id")
        self.assertIn(
            "WHERE TELEGRAM_ID IS NOT NULL",
            conflict.group("tail").upper(),
            "the unique index on telegram_id is partial, so inference needs its predicate",
        )

    def test_every_telegram_id_upsert_declares_the_predicate(self):
        for name in ("bot_handlers.py", "casino_api.py", "admin_handlers.py"):
            for tail in CONFLICT.findall(source(name)):
                self.assertIn("WHERE TELEGRAM_ID IS NOT NULL", tail.upper(), name)


class LogHygieneTests(unittest.TestCase):
    def test_http_client_loggers_are_quiet_enough_to_hide_request_urls(self):
        import log_hygiene

        importlib.reload(log_hygiene)
        log_hygiene.silence_request_urls()
        for name in ("httpx", "httpcore", "telegram.request"):
            self.assertGreaterEqual(
                logging.getLogger(name).level,
                logging.WARNING,
                f"{name} logs full request URLs, which include the bot token",
            )

    def test_entry_points_silence_request_urls(self):
        for name in ("server.py", "casino_api.py"):
            self.assertIn("silence_request_urls", source(name), name)

    def test_no_logging_statement_prints_a_token_bearing_url(self):
        for path in ROOT.glob("*.py"):
            for line in path.read_text().splitlines():
                if "log." in line or "print(" in line:
                    self.assertIsNone(TOKEN_URL.search(line), f"{path.name}: {line.strip()[:80]}")


if __name__ == "__main__":
    unittest.main()
