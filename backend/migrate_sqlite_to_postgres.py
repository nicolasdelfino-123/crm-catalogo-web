"""Copia todos los datos del SQLite local a la base PostgreSQL del VPS."""

import os
import sys
from pathlib import Path

from sqlalchemy import MetaData, create_engine, func, select, text


TABLES = [
    "action_template",
    "client",
    "client_action",
    "payment",
    "client_metric",
    "client_note",
]


def main():
    sqlite_path = Path(sys.argv[1] if len(sys.argv) > 1 else "instance/crm.db").resolve()
    postgres_url = os.getenv("SQLALCHEMY_DATABASE_URI")

    if not sqlite_path.is_file():
        raise SystemExit(f"No existe el SQLite: {sqlite_path}")
    if not postgres_url or not postgres_url.startswith(("postgresql://", "postgresql+psycopg2://")):
        raise SystemExit("Definí SQLALCHEMY_DATABASE_URI con la URL de PostgreSQL.")

    source = create_engine(f"sqlite:///{sqlite_path}")
    target = create_engine(postgres_url)
    source_meta = MetaData()
    target_meta = MetaData()
    source_meta.reflect(bind=source)
    target_meta.reflect(bind=target)

    missing = [name for name in TABLES if name not in source_meta.tables or name not in target_meta.tables]
    if missing:
        raise SystemExit("Faltan tablas; primero ejecutá el deploy: " + ", ".join(missing))

    with target.connect() as connection:
        occupied = [
            name for name in TABLES
            if connection.scalar(select(func.count()).select_from(target_meta.tables[name]))
        ]
    if occupied:
        raise SystemExit("PostgreSQL ya tiene datos. No se copió nada: " + ", ".join(occupied))

    totals = {}
    with source.connect() as source_connection, target.begin() as target_connection:
        for name in TABLES:
            source_table = source_meta.tables[name]
            target_table = target_meta.tables[name]
            rows = [dict(row) for row in source_connection.execute(select(source_table)).mappings()]
            if rows:
                target_connection.execute(target_table.insert(), rows)
            totals[name] = len(rows)

        for name in TABLES:
            table = target_meta.tables[name]
            if "id" in table.c:
                target_connection.execute(
                    text(
                        "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), "
                        "COALESCE((SELECT MAX(id) FROM \"" + name + "\"), 1), "
                        "EXISTS (SELECT 1 FROM \"" + name + "\"))"
                    ),
                    {"table_name": name},
                )

    print("Datos copiados correctamente:")
    for name, count in totals.items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
