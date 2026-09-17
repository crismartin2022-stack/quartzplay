"""Keep request URLs out of the logs.

HTTP client libraries log the full request URL at INFO level. Every call to
Telegram carries the bot token in its path, so those lines publish the token to
anyone who can read the deployment logs.
"""

import logging

# Loggers that emit one line per request, including the full URL.
REQUEST_URL_LOGGERS = ("httpx", "httpcore", "telegram.request", "urllib3")


def silence_request_urls(level=logging.WARNING):
    """Raise request-level loggers so their URL lines are never emitted."""
    for name in REQUEST_URL_LOGGERS:
        logging.getLogger(name).setLevel(level)
