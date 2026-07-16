import logging
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler, CallbackQueryHandler

log = logging.getLogger(__name__)

async def cmd_casino(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await u.message.reply_text(
        "🎰 *Casino QuartzPlay*\n\n"
        "Próximamente — integración con 44neoluck en curso 🚀",
        parse_mode="Markdown",
    )

async def cb_casino(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer("Próximamente 🚀", show_alert=True)

def register_casino_twa_handlers(app):
    app.add_handler(CommandHandler("casino", cmd_casino))
    app.add_handler(CallbackQueryHandler(cb_casino, pattern="^menu_casino$"))
    log.info("✅ Casino TWA handlers registrados")
