import os, asyncio, logging, subprocess, sys, signal
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger(__name__)

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
    port = os.environ.get("PORT", "8000")

    # Iniciar API en proceso separado
    api_proc = subprocess.Popen([
        sys.executable, "-m", "uvicorn",
        "casino_api:app",
        "--host", "0.0.0.0",
        "--port", port,
        "--log-level", "warning",
    ])
    log.info(f"API iniciada en puerto {port} (PID {api_proc.pid})")

    def cleanup(sig, frame):
        api_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    signal.signal(signal.SIGINT, cleanup)

    # Iniciar bot en proceso principal
    asyncio.run(run_bot())
