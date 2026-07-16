import os, logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes, CommandHandler, CallbackQueryHandler
)
from db       import get_pool
from odds_api import get_all_odds_cached

log = logging.getLogger(__name__)

def ars(n): return f"${round(n or 0):,.0f}".replace(",",".")

async def cmd_start(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid  = u.effective_user.id
    name = u.effective_user.first_name or "jugador"
    pool = ctx.bot_data["db_pool"]

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO users (telegram_id, username, first_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (telegram_id) DO UPDATE SET last_seen=NOW()
        """, uid, u.effective_user.username or str(uid), name)
        row     = await conn.fetchrow(
            "SELECT balance FROM users WHERE telegram_id=$1", uid)
        balance = row["balance"] if row else 0

    await u.message.reply_text(
        f"⬡ *QuartzPlay* — Sports Premium\n\n"
        f"Hola *{name}* 👋\n\n"
        f"💰 Saldo: *{ars(balance)} ARS*\n\n"
        f"Elegí una opción:",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("⚽ Sports",     callback_data="menu_sports"),
             InlineKeyboardButton("⚡ AI Combo",   callback_data="sports_combo")],
            [InlineKeyboardButton("🎯 Pool",       callback_data="sports_pool"),
             InlineKeyboardButton("🤝 P2P",        callback_data="sports_p2p")],
            [InlineKeyboardButton("💰 Wallet",     callback_data="menu_wallet"),
             InlineKeyboardButton("📊 Mis stats",  callback_data="menu_stats")],
        ]),
    )

async def cb_sports(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer("⏳ Cargando eventos...")

    try:
        all_odds = await get_all_odds_cached()
    except Exception as e:
        await q.edit_message_text(f"❌ Error: {e}")
        return

    ctx.user_data["events"] = {}
    text = "📋 *Prematch — Cuotas reales*\n\n"
    kb   = []

    for sport_key, data in list(all_odds.items())[:5]:
        meta   = data["meta"]
        events = data["events"]
        if not events: continue
        text += f"{meta['icon']} *{meta['name']}*\n"
        for ev in events[:3]:
            o = ev["odds"]
            if not o["L"]: continue
            ctx.user_data["events"][ev["id"]] = ev
            draw = f" · X {o['E']}" if o.get("E") else ""
            text += f"  {ev['home']} vs {ev['away']} · {ev['time']}\n"
            text += f"  L {o['L']}{draw} · V {o['V']}\n"
            row = [
                InlineKeyboardButton(
                    f"{ev['home']} {o['L']}",
                    callback_data=f"bet_{ev['id']}_L_{o['L']}"),
                InlineKeyboardButton(
                    f"{ev['away']} {o['V']}",
                    callback_data=f"bet_{ev['id']}_V_{o['V']}"),
            ]
            if o.get("E"):
                row.insert(1, InlineKeyboardButton(
                    f"X {o['E']}",
                    callback_data=f"bet_{ev['id']}_E_{o['E']}"))
            kb.append(row)
        text += "\n"

    kb.append([
        InlineKeyboardButton("🔄 Actualizar", callback_data="menu_sports"),
