import asyncio
import logging
import os

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


async def run_poller(application, wait_for_shutdown):
    """Run one poller and clean up every initialized resource on any exit."""
    try:
        await application.initialize()
        await application.updater.start_polling(drop_pending_updates=True)
        await application.start()
        await wait_for_shutdown()
    finally:
        if application.updater.running:
            await application.updater.stop()
        if application.running:
            await application.stop()
        await application.shutdown()


async def main():
    from config import get_staging_settings, poller_settings

    poller = poller_settings(os.environ)
    if not poller.enabled:
        log.info("Polling disabled; worker exits without starting Telegram client")
        return

    settings = get_staging_settings()
    from telegram.ext import Application
    from admin_handlers import register_admin_handlers
    from bot_handlers import register_bot_handlers
    from casino_twa import register_casino_twa_handlers
    from db import get_pool

    pool = None
    try:
        log.info("Connecting poller worker %s to PostgreSQL", poller.worker_id)
        pool = await get_pool()
        app = Application.builder().token(settings.telegram.token).build()
        app.bot_data["db_pool"] = pool
        app.bot_data["worker_id"] = poller.worker_id
        app.bot_data["telegram_identity"] = settings.telegram
        register_bot_handlers(app)
        register_admin_handlers(app)
        register_casino_twa_handlers(app)
        await run_poller(app, asyncio.Event().wait)
    finally:
        if pool is not None:
            await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
