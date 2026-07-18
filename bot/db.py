import os, logging
import asyncpg

log = logging.getLogger(__name__)
_pool = None

async def get_pool():
    global _pool
    if not _pool:
        _pool = await asyncpg.create_pool(
            os.environ["DATABASE_URL"], min_size=2, max_size=10
        )
        await _create_schema(_pool)
    return _pool

async def _create_schema(pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                username TEXT,
                first_name TEXT,
                balance BIGINT DEFAULT 0,
                plan TEXT DEFAULT 'free',
                xp INT DEFAULT 0,
                level INT DEFAULT 1,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_seen TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS sports_bets (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT REFERENCES users(id),
                picks TEXT NOT NULL,
                stake BIGINT NOT NULL,
                odd_total NUMERIC(8,3) NOT NULL,
                potential_win BIGINT NOT NULL,
                actual_win BIGINT DEFAULT 0,
                status TEXT DEFAULT 'active',
                mode TEXT DEFAULT 'prematch',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT REFERENCES users(id),
                type TEXT NOT NULL,
                amount BIGINT NOT NULL,
                method TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS casino_rounds (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT REFERENCES users(id),
                game TEXT,
                provider TEXT,
                stake BIGINT DEFAULT 0,
                win BIGINT DEFAULT 0,
                ggr BIGINT DEFAULT 0,
                external_tx TEXT UNIQUE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS influencers (
                id BIGSERIAL PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS influencer_events (
                id BIGSERIAL PRIMARY KEY,
                influencer_code TEXT NOT NULL,
                user_id BIGINT REFERENCES users(id),
                event TEXT NOT NULL,
                amount BIGINT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_tg ON users(telegram_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_bets_user ON sports_bets(user_id)"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_inf_events ON influencer_events(influencer_code)"
        )
        log.info("Schema listo")
