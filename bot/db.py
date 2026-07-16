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
            id            BIGSERIAL PRIMARY KEY,
            telegram_id   BIGINT UNIQUE NOT NULL,
            username      TEXT,
            first_name    TEXT,
            balance       BIGINT DEFAULT 0,
            bonus_balance BIGINT DEFAULT 0,
            plan          TEXT DEFAULT 'free',
            xp            INT DEFAULT 0,
            level         INT DEFAULT 1,
            created_at    TIMESTAMPTZ DEFAULT NOW(),
            last_seen     TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS wallet_transactions (
            id          BIGSERIAL PRIMARY KEY,
            user_id     BIGINT REFERENCES users(id),
            type        TEXT NOT NULL,
            amount      BIGINT NOT NULL,
            method      TEXT,
            status      TEXT DEFAULT 'pending',
            external_id TEXT,
            note        TEXT,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS sports_bets (
            id            BIGSERIAL PRIMARY KEY,
            user_id       BIGINT REFERENCES users(id),
            picks         TEXT NOT NULL,
            stake         BIGINT NOT NULL,
            odd_total     NUMERIC(8,3) NOT NULL,
            potential_win BIGINT NOT NULL,
            actual_win    BIGINT DEFAULT 0,
            status        TEXT DEFAULT 'active',
            mode          TEXT DEFAULT 'prematch',
            created_at    TIMESTAMPTZ DEFAULT NOW(),
            settled_at    TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS pools (
            id          BIGSERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            picks       TEXT NOT NULL,
            odd_total   NUMERIC(8,3),
            pot         BIGINT DEFAULT 0,
            commission  NUMERIC(4,2) DEFAULT 8.0,
            status      TEXT DEFAULT 'open',
            closes_at   TIMESTAMPTZ,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS pool_entries (
            id        BIGSERIAL PRIMARY KEY,
            pool_id   BIGINT REFERENCES pools(id),
            user_id   BIGINT REFERENCES users(id),
            stake     BIGINT NOT NULL,
            win       BIGINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS p2p_offers (
            id          BIGSERIAL PRIMARY KEY,
            creator_id  BIGINT REFERENCES users(id),
            matcher_id  BIGINT REFERENCES users(id),
            pick        TEXT NOT NULL,
            odd         NUMERIC(6,3),
            stake       BIGINT NOT NULL,
            lay         BIGINT NOT NULL,
            status      TEXT DEFAULT 'open',
            result      TEXT,
            expires_at  TIMESTAMPTZ,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS casino_rounds (
            id          BIGSERIAL PRIMARY KEY,
            user_id     BIGINT REFERENCES users(id),
            game        TEXT,
            provider    TEXT,
            stake       BIGINT DEFAULT 0,
            win         BIGINT DEFAULT 0,
            ggr         BIGINT DEFAULT 0,
            external_tx TEXT UNIQUE,
            sid_ext     TEXT,
            result_data JSONB,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS admin_actions (
            id         BIGSERIAL PRIMARY KEY,
            admin_id   BIGINT,
            action     TEXT,
            target_id  BIGINT,
            amount     BIGINT,
            note       TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
        CREATE INDEX IF NOT EXISTS idx_bets_user ON sports_b
