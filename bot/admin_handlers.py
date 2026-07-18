import os, logging, hashlib
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler

log = logging.getLogger(__name__)
ADMIN_IDS = [int(x) for x in os.environ.get("ADMIN_IDS","0").split(",")]

def ars(n): return f"${round(n or 0):,.0f}".replace(",",".")
def is_admin(uid): return uid in ADMIN_IDS
def hash_password(p): return hashlib.sha256(p.encode()).hexdigest()

async def cmd_ggr(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    dias = int(ctx.args[0]) if ctx.args else 30
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        sports = await conn.fetchrow("""
            SELECT COALESCE(SUM(stake),0) as apostado,
                   COALESCE(SUM(actual_win),0) as pagado,
                   COALESCE(SUM(stake)-SUM(actual_win),0) as netwin,
                   COUNT(*) as count
            FROM sports_bets
            WHERE created_at > NOW() - ($1 || ' days')::interval
              AND status IN ('won','lost')
        """, str(dias))
    await u.message.reply_text(
        f"GGR Sports - {dias} dias\n\n"
        f"Apostado: {ars(sports['apostado'])}\n"
        f"Pagado: {ars(sports['pagado'])}\n"
        f"Net Win: {ars(sports['netwin'])}\n"
        f"Apuestas: {sports['count']}"
    )

async def cmd_depositos(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT wt.id, u.username, wt.amount, wt.method
            FROM wallet_transactions wt
            JOIN users u ON u.id=wt.user_id
            WHERE wt.type='deposit' AND wt.status='pending'
            ORDER BY wt.created_at DESC LIMIT 10
        """)
    if not rows:
        await u.message.reply_text("No hay depositos pendientes")
        return
    text = f"Depositos pendientes ({len(rows)})\n\n"
    for r in rows:
        text += (f"ID {r['id']} - @{r['username']}\n"
                 f"  {ars(r['amount'])} - {r['method']}\n"
                 f"  /confirmar_dep {r['id']}\n\n")
    await u.message.reply_text(text)

async def cmd_confirmar_dep(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if not ctx.args:
        await u.message.reply_text("Uso: /confirmar_dep [id]")
        return
    tx_id = int(ctx.args[0])
    pool  = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        async with conn.transaction():
            tx = await conn.fetchrow(
                "SELECT * FROM wallet_transactions WHERE id=$1 AND status='pending'", tx_id)
            if not tx:
                await u.message.reply_text("No encontrada o ya procesada")
                return
            await conn.execute(
                "UPDATE wallet_transactions SET status='confirmed' WHERE id=$1", tx_id)
            await conn.execute(
                "UPDATE users SET balance=balance+$1 WHERE id=$2",
                tx["amount"], tx["user_id"])
    await u.message.reply_text(f"Deposito #{tx_id} confirmado - {ars(tx['amount'])} ARS")

async def cmd_acreditar(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if len(ctx.args) < 2:
        await u.message.reply_text("Uso: /acreditar @usuario monto")
        return
    username = ctx.args[0].replace("@","")
    amount   = int(ctx.args[1]) * 100
    pool     = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        uid = await conn.fetchval(
            "SELECT id FROM users WHERE username=$1", username)
        if not uid:
            await u.message.reply_text(f"@{username} no encontrado")
            return
        await conn.execute(
            "UPDATE users SET balance=balance+$1 WHERE id=$2", amount, uid)
    await u.message.reply_text(f"{ars(amount)} acreditados a @{username}")

async def cmd_retiros(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT wt.id, u.username, wt.amount, wt.method
            FROM wallet_transactions wt
            JOIN users u ON u.id=wt.user_id
            WHERE wt.type='withdraw' AND wt.status='pending'
            ORDER BY wt.created_at DESC LIMIT 10
        """)
    if not rows:
        await u.message.reply_text("No hay retiros pendientes")
        return
    text = f"Retiros pendientes ({len(rows)})\n\n"
    for r in rows:
        text += (f"ID {r['id']} - @{r['username']}\n"
                 f"  {ars(r['amount'])} - {r['method']}\n\n")
    await u.message.reply_text(text)

async def cmd_broadcast(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if not ctx.args:
        await u.message.reply_text("Uso: /broadcast mensaje")
        return
    msg  = " ".join(ctx.args)
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        users = await conn.fetch(
            "SELECT telegram_id FROM users WHERE last_seen > NOW() - INTERVAL '30 days'")
    sent = 0
    for row in users:
        try:
            await ctx.bot.send_message(row["telegram_id"], msg)
            sent += 1
        except: pass
    await u.message.reply_text(f"Broadcast enviado a {sent} usuarios")

async def cmd_topggr(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    n    = int(ctx.args[0]) if ctx.args else 10
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT u.username,
                   COALESCE(SUM(sb.stake)-SUM(sb.actual_win),0) as ggr
            FROM users u
            LEFT JOIN sports_bets sb ON sb.user_id=u.id
              AND sb.status IN ('won','lost')
            GROUP BY u.id, u.username
            ORDER BY ggr DESC LIMIT $1
        """, n)
    text = f"Top {n} por GGR\n\n"
    for i, r in enumerate(rows, 1):
        text += f"{i}. @{r['username']} - {ars(r['ggr'])}\n"
    await u.message.reply_text(text)

async def cmd_influencers(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                influencer_code,
                COUNT(*) FILTER (WHERE event='click') as clics,
                COUNT(*) FILTER (WHERE event='registro') as registros,
                COUNT(*) FILTER (WHERE event='apuesta') as apuestas,
                COALESCE(SUM(amount) FILTER (WHERE event='apuesta'),0) as volumen
            FROM influencer_events
            GROUP BY influencer_code
            ORDER BY volumen DESC
        """)
    if not rows:
        await u.message.reply_text("No hay datos de influencers todavia.")
        return
    text = "Influencers - Stats\n\n"
    for r in rows:
        text += (
            f"{r['influencer_code']}\n"
            f"  Clics: {r['clics']} - Registros: {r['registros']}\n"
            f"  Apuestas: {r['apuestas']} - Volumen: {ars(r['volumen'])}\n\n"
        )
    await u.message.reply_text(text)

async def cmd_link(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if not ctx.args:
        await u.message.reply_text("Uso: /link nombre_influencer")
        return
    code = ctx.args[0].lower().replace(" ","_")
    link = f"https://t.me/QuartzPlayBot?start=combo_{code}"
    await u.message.reply_text(f"Link para {code}\n\n{link}\n\nCompartilo con el influencer.")

async def cmd_nueva_agencia(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if len(ctx.args) < 3:
        await u.message.reply_text(
            "Uso: /nueva_agencia nombre usuario clave\n"
            "Ejemplo: /nueva_agencia AgenciaSur agencia3 clave123")
        return
    name     = ctx.args[0].replace("_"," ")
    username = ctx.args[1].lower()
    password = ctx.args[2]
    pool     = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM agencias")
        code  = f"AGE{str(count+1).zfill(3)}"
        try:
            await conn.execute("""
                INSERT INTO agencias (code, name, username, password_hash)
                VALUES ($1,$2,$3,$4)
            """, code, name, username, hash_password(password))
        except Exception:
            await u.message.reply_text(f"Error: usuario '{username}' ya existe")
            return
    await u.message.reply_text(
        f"Agencia creada\n\n"
        f"Nombre: {name}\n"
        f"Codigo: {code}\n"
        f"Usuario: {username}\n"
        f"Clave: {password}\n\n"
        f"URL: https://valiant-gentleness-production-a779.up.railway.app/agencia"
    )

async def cmd_agencias(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT a.code, a.name, a.username, a.status,
                   COUNT(at.id) as tickets,
                   COALESCE(SUM(at.stake),0) as cobrado
            FROM agencias a
            LEFT JOIN agencia_tickets at ON at.agencia_code=a.code
            GROUP BY a.id, a.code, a.name, a.username, a.status
            ORDER BY a.created_at DESC
        """)
    if not rows:
        await u.message.reply_text("No hay agencias registradas. Usa /nueva_agencia")
        return
    text = f"Agencias ({len(rows)})\n\n"
    for r in rows:
        estado = "ACTIVA" if r["status"]=="active" else "SUSPENDIDA"
        text += (
            f"{r['code']} - {r['name']}\n"
            f"  Usuario: {r['username']} - {estado}\n"
            f"  Tickets: {r['tickets']} - Cobrado: {ars(r['cobrado'])}\n\n"
        )
    await u.message.reply_text(text)

async def cmd_suspender_agencia(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if not ctx.args:
        await u.message.reply_text("Uso: /suspender_agencia AGE001")
        return
    code = ctx.args[0].upper()
    pool = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM agencias WHERE code=$1", code)
        if not row:
            await u.message.reply_text(f"Agencia {code} no encontrada")
            return
        new_status = "suspended" if row["status"]=="active" else "active"
        await conn.execute(
            "UPDATE agencias SET status=$2 WHERE code=$1", code, new_status)
    estado = "SUSPENDIDA" if new_status=="suspended" else "REACTIVADA"
    await u.message.reply_text(f"Agencia {code} {estado}")

async def cmd_cambiar_clave_agencia(u: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_admin(u.effective_user.id): return
    if len(ctx.args) < 2:
        await u.message.reply_text("Uso: /clave_agencia AGE001 nueva_clave")
        return
    code     = ctx.args[0].upper()
    password = ctx.args[1]
    pool     = ctx.bot_data["db_pool"]
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE agencias SET password_hash=$2 WHERE code=$1",
            code, hash_password(password))
    if result == "UPDATE 0":
        await u.message.reply_text(f"Agencia {code} no encontrada")
    else:
        await u.message.reply_text(f"Clave de {code} actualizada")

def register_admin_handlers(app):
    app.add_handler(CommandHandler("ggr",                cmd_ggr))
    app.add_handler(CommandHandler("depositos",          cmd_depositos))
    app.add_handler(CommandHandler("confirmar_dep",      cmd_confirmar_dep))
    app.add_handler(CommandHandler("acreditar",          cmd_acreditar))
    app.add_handler(CommandHandler("retiros",            cmd_retiros))
    app.add_handler(CommandHandler("broadcast",          cmd_broadcast))
    app.add_handler(CommandHandler("topggr",             cmd_topggr))
    app.add_handler(CommandHandler("influencers",        cmd_influencers))
    app.add_handler(CommandHandler("link",               cmd_link))
    app.add_handler(CommandHandler("nueva_agencia",      cmd_nueva_agencia))
    app.add_handler(CommandHandler("agencias",           cmd_agencias))
    app.add_handler(CommandHandler("suspender_agencia",  cmd_suspender_agencia))
    app.add_handler(CommandHandler("clave_agencia",      cmd_cambiar_clave_agencia))
    log.info("Admin handlers registrados")
