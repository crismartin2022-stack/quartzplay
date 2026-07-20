import os, asyncio, logging
import uvicorn
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger(__name__)

async def main():
    from db import get_pool
    from telegram.ext import Application
    from bot_handlers   import register_bot_handlers
    from admin_handlers import register_admin_handlers
    from casino_twa     import register_casino_twa_handlers
    import casino_api

    # DB
    log.info("Conectando a PostgreSQL...")
    pool = await get_pool()
    log.info("Base de datos lista")

    # Bot
    TOKEN = os.environ["TELEGRAM_TOKEN"]
    bot_app = Application.builder().token(TOKEN).build()
    bot_app.bot_data["db_pool"] = pool
    register_bot_handlers(bot_app)
    register_admin_handlers(bot_app)
    register_casino_twa_handlers(bot_app)

    # Inyectar pool en casino_api
    casino_api._db_pool = pool

    # Uvicorn
    port = int(os.environ.get("PORT", 8000))
    config = uvicorn.Config(
        casino_api.app,
        host="0.0.0.0",
        port=port,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    # Evitar que uvicorn instale signal handlers
    server.install_signal_handlers = lambda: None

    log.info(f"Iniciando API en puerto {port}")
    log.info("Iniciando bot de Telegram")

    async with bot_app:
        await bot_app.start()
        await bot_app.updater.start_polling(drop_pending_updates=True)
        await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
