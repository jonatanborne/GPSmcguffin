#!/usr/bin/env python3
"""
Backup-script för PostgreSQL-databas.

Användning:
    python backend/scripts/backup_database.py

Detta script:
- Exporterar all data från databasen till JSON-filer
- Skapar timestampade backups
- Sparar i backend/backups/ mapp
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

# Lägg till backend-mappen i path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Ladda .env-fil om den finns
try:
    from dotenv import load_dotenv

    env_path = backend_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

import psycopg2
from psycopg2.extras import RealDictCursor


def get_database_url():
    """Hämta DATABASE_URL från environment variables"""
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )

    if database_url:
        database_url = database_url.strip()

    return database_url


def backup_table(conn, table_name, backup_dir):
    """Backup en tabell till JSON-fil"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # Hämta all data från tabellen
        cursor.execute(f"SELECT * FROM {table_name} ORDER BY id")
        rows = cursor.fetchall()

        # Konvertera till lista av dictionaries
        data = [dict(row) for row in rows]

        # Spara till JSON-fil
        backup_file = backup_dir / f"{table_name}.json"
        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)

        print(f"  ✓ {table_name}: {len(data)} rader → {backup_file.name}")
        return len(data)

    except Exception as e:
        print(f"  ✗ {table_name}: Fel - {e}")
        return 0
    finally:
        cursor.close()


def main():
    """Huvudfunktion"""
    print("=" * 60)
    print("DATABAS BACKUP")
    print("=" * 60)

    # Hämta DATABASE_URL
    database_url = get_database_url()

    if not database_url:
        print("\n✗ Ingen DATABASE_URL hittades!")
        print("\nTips:")
        print("  1. Skapa .env fil i backend/ mappen")
        print("  2. Lägg till: DATABASE_PUBLIC_URL=postgresql://...")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades")

    # Skapa backup-mapp
    backup_dir = backend_dir / "backups"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_subdir = backup_dir / f"backup_{timestamp}"
    backup_subdir.mkdir(parents=True, exist_ok=True)

    print(f"✓ Backup-mapp skapad: {backup_subdir}")

    # Anslut till databasen
    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        print("✓ Ansluten till PostgreSQL")
    except Exception as e:
        print(f"\n✗ Kunde inte ansluta till databasen: {e}")
        sys.exit(1)

    # Lista över tabeller att backa upp
    tables = ["tracks", "track_positions", "geofences", "hiding_spots"]

    print(f"\nBackar upp {len(tables)} tabeller...")
    print("-" * 60)

    total_rows = 0
    results = {}

    for table in tables:
        rows = backup_table(conn, table, backup_subdir)
        total_rows += rows
        results[table] = rows

    conn.close()

    # Skapa metadata-fil
    metadata = {
        "backup_timestamp": timestamp,
        "backup_date": datetime.now().isoformat(),
        "tables": results,
        "total_rows": total_rows,
        "database_url_masked": database_url.split("@")[-1]
        if "@" in database_url
        else "hidden",
    }

    metadata_file = backup_subdir / "metadata.json"
    with open(metadata_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print("-" * 60)
    print(f"\n✓ Backup klar!")
    print(f"  Totalt: {total_rows} rader")
    print(f"  Plats: {backup_subdir}")
    print(f"  Metadata: {metadata_file.name}")
    print("\n" + "=" * 60)

    return backup_subdir


if __name__ == "__main__":
    try:
        backup_dir = main()
        print(f"\n✓ Backup sparad i: {backup_dir}")
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n✗ Backup avbruten av användaren")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Oväntat fel: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
