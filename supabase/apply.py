"""Apply supabase/migrations/*.sql to the hosted project (no Docker, no Supabase CLI needed).

    cd services/voice && uv run --with "psycopg[binary]" python ../../supabase/apply.py

Uses DIRECT_URL from the root .env. Applied versions are recorded in supabase_migrations.schema_migrations, the same table
the Supabase CLI uses, so `supabase db push` later sees them as already applied. Each file runs in its own transaction.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def main() -> int:
    url = (os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL", "")).split("?")[0]
    if not url:
        print("Set DIRECT_URL in .env", file=sys.stderr)
        return 2
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    with psycopg.connect(url, connect_timeout=20, autocommit=True) as conn:
        conn.execute("create schema if not exists supabase_migrations")
        conn.execute(
            "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)"
        )
        done = {r[0] for r in conn.execute("select version from supabase_migrations.schema_migrations")}
        for f in files:
            version, _, name = f.stem.partition("_")
            if version in done:
                print(f"skip   {f.name} (already applied)")
                continue
            sql = f.read_text(encoding="utf-8")
            with conn.transaction():
                conn.execute(sql)
                conn.execute(
                    "insert into supabase_migrations.schema_migrations (version, statements, name) values (%s, %s, %s)",
                    (version, [sql], name),
                )
            print(f"applied {f.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
