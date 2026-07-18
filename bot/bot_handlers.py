import os, logging, random, string
from datetime import datetime, timedelta, timezone
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, CommandHandler, CallbackQueryHandler
from db import get_pool
from odds_api import get_all_odds_cached

log = logging.getLogger(__name__)

def ars(n): return f"${round(n or 0):,.0f}".replace(",",".")

def gen_code():
    """Genera código único QP-XXXXX"""
    return "QP-" + "".join(random.choices(string.digits, k=5))

async def track(pool, code, uid, event, amount=0):
    try:
        async with pool.acquire() as conn:
            user_id = await conn.fetchval(
                "SELECT id FROM users WHERE telegram_id=$1", uid)
            if user_id:
                await conn.execute("""
                    INSERT INTO influencer_events
                        (influencer_code, user_id, event, amount)
                    VALUES ($1, $2, $3, $4)
                """, code, user_id, event, amount)
    except Exception as e:
        log.error(f"Error tracking {code}: {e}")

async def save_betslip(pool, uid, picks, stake, odd_total, inf_code=None):
    """Guarda el betslip en DB y devuelve el código QP-XXXXX"""
    code = gen_code()
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    pot_win = round(stake * odd_total)
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO betslips
                (code, user_id, picks, stake, odd_total,
                 potential_win, status, inf_code, expires_at)
            SELECT $1, id, $2, $3, $4, $5, 'pending', $6, $7
            FROM users WHERE telegram_id=$8
        """,
            code,
            str([{"home":p["home"],"away":p["away"],
                  "sel":p["label"],"odd":p["odd"],"sport":"Sports"} for p in picks]),
            stake, odd_total, pot_win, inf_code, expires, uid
        )
    return code, pot_win

async def cmd_start(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid  = u.effective_user.id
    name = u.effective_user.first_name or "jugador"
    pool = ctx.bot_data["db_pool"]

    async with pool.acquire() as conn:
        is_new = not await conn.fetchval(
            "SELECT 1 FROM users WHERE telegram_id=$1", uid)
        await conn.execute("""
            INSERT INTO users (telegram_id, username, first_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (telegram_id) DO UPDATE SET last_seen=NOW()
        """, uid, u.effective_user.username or str(uid), name)
        row = await conn.fetchrow(
            "SELECT balance FROM users WHERE telegram_id=$1", uid)
        balance = row["balance"] if row else 0

    args = ctx.args
    if args and args[0].startswith("combo"):
        parts = args[0].split("_", 1)
        inf_code = parts[1] if len(parts) > 1 else "directo"
        ctx.user_data["inf_code"] = inf_code
        await track(pool, inf_code, uid, "click")
        if is_new:
            await track(pool, inf_code, uid, "registro")
        await cb_combo_deeplink(u, ctx, name, balance, inf_code)
        return

    await u.message.reply_text(
        f"Bienvenido a QuartzPlay\n\n"
        f"Hola {name}\n\n"
        f"Saldo: {ars(balance)} ARS\n\n"
        f"Elegi una opcion:",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("Deportes",  callback_data="menu_sports"),
             InlineKeyboardButton("AI Combo",  callback_data="sports_combo")],
            [InlineKeyboardButton("Pool",      callback_data="sports_pool"),
             InlineKeyboardButton("P2P",       callback_data="sports_p2p")],
            [InlineKeyboardButton("Wallet",    callback_data="menu_wallet"),
             InlineKeyboardButton("Mis stats", callback_data="menu_stats")],
        ]),
    )

async def cb_combo_deeplink(u, ctx, name, balance, inf_code=None):
    try:
        all_odds = await get_all_odds_cached()
    except Exception:
        await u.message.reply_text("Error cargando cuotas. Intenta de nuevo.")
        return

    picks = []
    for sport_key, data in all_odds.items():
        for ev in data["events"]:
            o = ev["odds"]
            if o["L"] and 1.20 <= o["L"] <= 2.50:
                picks.append({
                    "ev_id": ev["id"],
                    "label": f"{ev['home']} gana",
                    "odd":   o["L"],
                    "home":  ev["home"],
                    "away":  ev["away"],
                })
        if len(picks) >= 4:
            break

    if len(picks) < 2:
        await u.message.reply_text("No hay eventos disponibles ahora.")
        return

    picks = picks[:4]
    tot = 1
    for p in picks:
        tot *= p["odd"]
    ctx.user_data["ticket"] = picks
    if inf_code:
        ctx.user_data["inf_code"] = inf_code

    text = f"QuartzPlay - Hola {name}\n\nAI COMBO del dia\n\n"
    for p in picks:
        text += f"- {p['home']} vs {p['away']} - {p['label']} @ {p['odd']}\n"
    text += (
        f"\nCuota total: {tot:.2f}x\n"
        f"Tu saldo: {ars(balance)} ARS\n\n"
        f"Elegi como apostar:"
    )

    await u.message.reply_text(
        text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(
                f"Apostar $5K online - ret ${round(5000*tot):,}",
                callback_data="confirm_bet_500000")],
            [InlineKeyboardButton(
                f"Apostar $10K online - ret ${round(10000*tot):,}",
                callback_data="confirm_bet_1000000")],
            [InlineKeyboardButton(
                f"Apostar $20K online - ret ${round(20000*tot):,}",
                callback_data="confirm_bet_2000000")],
            [InlineKeyboardButton(
                "Generar codigo para local",
                callback_data="gen_code_local")],
            [InlineKeyboardButton("Ver mas eventos", callback_data="menu_sports")],
        ]),
    )

async def cb_gen_code_local(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Genera código QP-XXXXX para ir a pagar en el local"""
    q = u.callback_query
    await q.answer()
    uid    = u.effective_user.id
    pool   = ctx.bot_data["db_pool"]
    ticket = ctx.user_data.get("ticket", [])
    inf_code = ctx.user_data.get("inf_code")

    if not ticket:
        await q.answer("No hay picks seleccionados", show_alert=True)
        return

    tot = 1
    for p in ticket:
        tot *= p["odd"]

    # Guardar en DB con stake=0 (se define en el local)
    code, _ = await save_betslip(pool, uid, ticket, 0, tot, inf_code)

    text = (
        f"Tu codigo de apuesta\n\n"
        f"*{code}*\n\n"
        f"Lleva este codigo al local fisico.\n"
        f"El agente ingresa el codigo, vos elegis el monto y te dan el ticket.\n\n"
        f"Valido 24 horas.\n\n"
        f"Tu combinada:\n"
    )
    for p in ticket:
        text += f"- {p['home']} vs {p['away']} @ {p['odd']}\n"
    text += f"\nCuota total: {tot:.2f}x"

    await q.edit_message_text(
        text, parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("Ver mis apuestas", callback_data="menu_stats"),
            InlineKeyboardButton("Menu", callback_data="back_main"),
        ]]),
    )

async def cb_sports(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer("Cargando eventos...")
    try:
        all_odds = await get_all_odds_cached()
    except Exception as e:
        await q.edit_message_text(f"Error: {e}")
        return
    ctx.user_data["events"] = {}
    text = "Prematch - Cuotas reales\n\n"
    kb = []
    for sport_key, data in list(all_odds.items())[:5]:
        meta = data["meta"]
        events = data["events"]
        if not events:
            continue
        text += f"{meta['icon']} {meta['name']}\n"
        for ev in events[:3]:
            o = ev["odds"]
            if not o["L"]:
                continue
            ctx.user_data["events"][ev["id"]] = ev
            draw = f" X {o['E']}" if o.get("E") else ""
            text += f"  {ev['home']} vs {ev['away']} {ev['time']}\n"
            text += f"  L {o['L']}{draw} V {o['V']}\n"
            row = []
            row.append(InlineKeyboardButton(
                f"{ev['home']} {o['L']}",
                callback_data=f"bet_{ev['id']}_L_{o['L']}"))
            if o.get("E"):
                row.append(InlineKeyboardButton(
                    f"X {o['E']}",
                    callback_data=f"bet_{ev['id']}_E_{o['E']}"))
            row.append(InlineKeyboardButton(
                f"{ev['away']} {o['V']}",
                callback_data=f"bet_{ev['id']}_V_{o['V']}"))
            kb.append(row)
        text += "\n"
    kb.append([
        InlineKeyboardButton("Actualizar", callback_data="menu_sports"),
        InlineKeyboardButton("Menu",       callback_data="back_main"),
    ])
    await q.edit_message_text(
        text[:4000],
        reply_markup=InlineKeyboardMarkup(kb),
    )

async def cb_bet(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    parts = q.data.split("_")
    ev_id = parts[1]
    side  = parts[2]
    odd   = float(parts[3])
    ev    = ctx.user_data.get("events", {}).get(ev_id)
    if not ev:
        await q.answer("Evento no encontrado", show_alert=True)
        return
    side_name = {"L": ev["home"], "E": "Empate", "V": ev["away"]}[side]
    ticket   = ctx.user_data.get("ticket", [])
    existing = [b for b in ticket if b["ev_id"] != ev_id]
    already  = len(existing) < len(ticket)
    if already:
        ctx.user_data["ticket"] = existing
        await q.answer("Pick removido")
        return
    ctx.user_data["ticket"] = existing + [{
        "ev_id": ev_id, "side": side, "odd": odd,
        "label": f"{ev['home']} gana",
        "home": ev["home"], "away": ev["away"],
    }]
    ticket = ctx.user_data["ticket"]
    tot = 1
    for b in ticket:
        tot *= b["odd"]
    text = f"Boleto ({len(ticket)} picks)\n\n"
    for b in ticket:
        text += f"- {b['home']} vs {b['away']} @ {b['odd']}\n"
    text += f"\nCuota: {tot:.2f}x"
    await q.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(
                f"Apostar $5K - ret ${round(5000*tot):,}",
                callback_data="confirm_bet_500000")],
            [InlineKeyboardButton(
                f"Apostar $10K - ret ${round(10000*tot):,}",
                callback_data="confirm_bet_1000000")],
            [InlineKeyboardButton(
                f"Apostar $20K - ret ${round(20000*tot):,}",
                callback_data="confirm_bet_2000000")],
            [InlineKeyboardButton(
                "Generar codigo para local",
                callback_data="gen_code_local")],
            [InlineKeyboardButton("Limpiar", callback_data="clear_ticket"),
             InlineKeyboardButton("Volver",  callback_data="menu_sports")],
        ]),
    )

async def cb_confirm_bet(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    stake  = int(q.data.split("_")[-1])
    ticket = ctx.user_data.get("ticket", [])
    if not ticket:
        await q.answer("Boleto vacio", show_alert=True)
        return
    uid  = u.effective_user.id
    pool = ctx.bot_data["db_pool"]
    tot  = 1
    for b in ticket:
        tot *= b["odd"]
    ret = round(stake * tot)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT balance FROM users WHERE telegram_id=$1", uid)
        if not row or row["balance"] < stake:
            await q.answer("Saldo insuficiente", show_alert=True)
            return
        await conn.execute(
            "UPDATE users SET balance=balance-$2 WHERE telegram_id=$1",
            uid, stake)
        bet_id = await conn.fetchval("""
            INSERT INTO sports_bets
                (user_id, picks, stake, odd_total, potential_win, status, mode)
            SELECT id, $2, $3, $4, $5, 'active', 'prematch'
            FROM users WHERE telegram_id=$1
            RETURNING id
        """, uid, str([b["label"] for b in ticket]), stake, tot, ret)

    # Generar codigo QP para el comprobante
    code, _ = await save_betslip(
        pool, uid, ticket, stake, tot,
        ctx.user_data.get("inf_code"))

    inf_code = ctx.user_data.get("inf_code")
    if inf_code:
        await track(pool, inf_code, uid, "apuesta", stake)

    ctx.user_data["ticket"] = []
    text = (
        f"Apuesta registrada\n\n"
        f"Codigo: {code}\n\n"
    )
    for b in ticket:
        text += f"- {b['home']} vs {b['away']} @ {b['odd']}\n"
    text += (
        f"\nApostado: {ars(stake)} ARS\n"
        f"Cuota: {tot:.2f}x\n"
        f"Retorno pot: {ars(ret)} ARS\n\n"
        f"Podes cobrar en cualquier agencia con el codigo {code}"
    )
    await q.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("Mas eventos", callback_data="menu_sports"),
            InlineKeyboardButton("Mis stats",   callback_data="menu_stats"),
        ]]),
    )

async def cb_stats(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q    = u.callback_query
    await q.answer()
    uid  = u.effective_user.id
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT balance FROM users WHERE telegram_id=$1", uid)
        bets = await conn.fetch("""
            SELECT status, stake FROM sports_bets
            WHERE user_id=(SELECT id FROM users WHERE telegram_id=$1)
        """, uid)
    balance  = user["balance"] if user else 0
    activas  = sum(1 for b in bets if b["status"] == "active")
    ganadas  = sum(1 for b in bets if b["status"] == "won")
    perdidas = sum(1 for b in bets if b["status"] == "lost")
    apostado = sum(b["stake"] for b in bets)
    await q.edit_message_text(
        f"Mis estadisticas\n\n"
        f"Saldo: {ars(balance)} ARS\n"
        f"Activas: {activas}\n"
        f"Ganadas: {ganadas}\n"
        f"Perdidas: {perdidas}\n"
        f"Total apostado: {ars(apostado)} ARS",
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton("Menu", callback_data="back_main"),
        ]]),
    )

async def cb_back(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer()
    class F:
        message = q.message
        effective_user = q.from_user
    await cmd_start(F(), ctx)

async def cb_clear(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer("Boleto limpiado")
    ctx.user_data["ticket"] = []
    await cb_sports(u, ctx)

async def cb_soon(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = u.callback_query
    await q.answer("Proximamente", show_alert=True)

def register_bot_handlers(app):
    app.add_handler(CommandHandler("start",       cmd_start))
    app.add_handler(CallbackQueryHandler(cb_sports,        pattern="^menu_sports$"))
    app.add_handler(CallbackQueryHandler(cb_bet,           pattern="^bet_"))
    app.add_handler(CallbackQueryHandler(cb_confirm_bet,   pattern="^confirm_bet_"))
    app.add_handler(CallbackQueryHandler(cb_gen_code_local,pattern="^gen_code_local$"))
    app.add_handler(CallbackQueryHandler(cb_stats,         pattern="^menu_stats$"))
    app.add_handler(CallbackQueryHandler(cb_back,          pattern="^back_main$"))
    app.add_handler(CallbackQueryHandler(cb_clear,         pattern="^clear_ticket$"))
    app.add_handler(CallbackQueryHandler(cb_soon,
        pattern="^(sports_pool|sports_p2p|sports_combo|menu_wallet)$"))
    log.info("Handlers registrados")
