import os, asyncio, logging, threading
import uvicorn
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger(__name__)

def run_api():
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "casino_api:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
    )

async def run_bot():
    from telegram.ext import Application
    from bot_handlers   import register_bot_handlers
    from admin_handlers import register_admin_handlers
    from casino_twa     import register_casino_twa_handlers
    from db             import get_pool

    TOKEN = os.environ["TELEGRAM_TOKEN"]
    log.info("Conectando a PostgreSQL...")
    pool = await get_pool()
    log.info("Base de datos lista")

    app = Application.builder().token(TOKEN).build()
    app.bot_data["db_pool"] = pool

    register_bot_handlers(app)
    register_admin_handlers(app)
    register_casino_twa_handlers(app)

    log.info("QuartzPlay Bot iniciado")
    async with app:
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        await asyncio.Event().wait()

if __name__ == "__main__":
    api_thread = threading.Thread(target=run_api, daemon=True)
    api_thread.start()
    log.info(f"API en puerto {os.environ.get('PORT',8000)}")
    asyncio.run(run_bot())
