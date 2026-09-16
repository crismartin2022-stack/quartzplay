BEGIN;

DO $$
BEGIN
    IF to_regnamespace('extensions') IS NULL THEN
        RAISE EXCEPTION 'required Supabase-managed extensions schema is unavailable';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_available_extension_versions
        WHERE name = 'pgcrypto' AND version = '1.3'
    ) THEN
        RAISE EXCEPTION 'required extension pgcrypto version 1.3 is unavailable';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_available_extension_versions
        WHERE name = 'uuid-ossp' AND version = '1.1'
    ) THEN
        RAISE EXCEPTION 'required extension uuid-ossp version 1.1 is unavailable';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pgcrypto'
          AND (extversion <> '1.3' OR extnamespace <> to_regnamespace('extensions'))
    ) THEN
        RAISE EXCEPTION 'installed extension pgcrypto does not match required schema or version';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'uuid-ossp'
          AND (extversion <> '1.1' OR extnamespace <> to_regnamespace('extensions'))
    ) THEN
        RAISE EXCEPTION 'installed extension uuid-ossp does not match required schema or version';
    END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions VERSION '1.3';
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION '1.1';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'pgcrypto'
          AND extversion = '1.3'
          AND extnamespace = to_regnamespace('extensions')
    ) THEN
        RAISE EXCEPTION 'extension pgcrypto was not installed with required schema and version';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'uuid-ossp'
          AND extversion = '1.1'
          AND extnamespace = to_regnamespace('extensions')
    ) THEN
        RAISE EXCEPTION 'extension uuid-ossp was not installed with required schema and version';
    END IF;
END
$$;

COMMIT;
