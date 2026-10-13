"""Apply pending SQL migrations from db/migrations/ in file-name order.

Run with: python -m pipeline.migrate

Each file runs once, in its own transaction, and is recorded in schema_migrations.
Migrations are forward-only: to change the schema, add a new numbered file.
"""

import sys
from pathlib import Path

from pipeline import config
from pipeline.db import connect

MIGRATIONS_DIR = config.ROOT / "db" / "migrations"


def pending(applied: set[str], directory: Path) -> list[Path]:
    return [path for path in sorted(directory.glob("*.sql")) if path.name not in applied]


def migrate(connection, directory: Path = MIGRATIONS_DIR) -> list[str]:
    with connection.transaction():
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
    applied = {row[0] for row in connection.execute("SELECT filename FROM schema_migrations")}
    done = []
    for path in pending(applied, directory):
        with connection.transaction():
            connection.execute(path.read_text(encoding="utf-8"))
            connection.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", [path.name])
        done.append(path.name)
    return done


def main() -> int:
    with connect() as connection:
        done = migrate(connection)
    print("\n".join(f"applied  {name}" for name in done) if done else "Nothing to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
