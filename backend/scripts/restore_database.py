#!/usr/bin/env python3
"""
Restore-script för att återställa backup till ny databas.

Användning:
    export DATABASE_URL="postgresql://..." (ny databas)
    python backend/scripts/restore_database.py backend/backups/backup_YYYYMMDD_HHMMSS
"""

import os
import sys
import json
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    env_path = backend_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass

import psycopg2
from psycopg2.extras import execute_values


def get_database_url():
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )
    if database_url:
        database_url = database_url.strip()
    return database_url


def restore_table(conn, table_name, backup_file, preserve_id=False):
    """Återställ en tabell från JSON-backup.
    
    preserve_id: Om True behåller vi original-id (behövs för tracks så att track_positions FK fungerar)
    """
    cursor = conn.cursor()

    try:
        with open(backup_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not data:
            print(f"  - {table_name}: Tom backup, skippar")
            return 0

        # Hämta kolumnnamn från första raden
        columns = list(data[0].keys())
        
        # Skippa 'id' bara om vi inte ska bevara den (för tracks behåller vi id för FK-mapping)
        if 'id' in columns and not preserve_id:
            columns.remove('id')

        # Bygg INSERT-query (execute_values använder %s för value-placeholder)
        cols_str = ", ".join(columns)
        query = f"INSERT INTO {table_name} ({cols_str}) VALUES %s"

        # Infoga i batchar (mycket snabbare än rad för rad)
        values_list = [tuple(row.get(col) for col in columns) for row in data]
        execute_values(cursor, query, values_list, page_size=1000)

        # Om vi behöll id, uppdatera sekvensen så nästa auto-id blir rätt
        if preserve_id and 'id' in columns:
            cursor.execute(
                f"SELECT setval(pg_get_serial_sequence(%s, 'id'), COALESCE((SELECT MAX(id) FROM {table_name}), 1))",
                (table_name,)
            )

        print(f"  ✓ {table_name}: {len(data)} rader återställda")
        return len(data)

    except Exception as e:
        print(f"  ✗ {table_name}: Fel - {e}")
        return 0
    finally:
        cursor.close()


def main():
    if len(sys.argv) < 2:
        print("Användning: python restore_database.py <backup_dir>")
        print("Exempel: python restore_database.py backend/backups/backup_20260211_210000")
        sys.exit(1)

    backup_path = Path(sys.argv[1])
    if not backup_path.exists():
        print(f"✗ Backup-mapp finns inte: {backup_path}")
        sys.exit(1)

    print("=" * 60)
    print("ÅTERSTÄLL DATABAS FRÅN BACKUP")
    print("=" * 60)
    print(f"\nBackup: {backup_path}")

    # Läs metadata
    metadata_file = backup_path / "metadata.json"
    if metadata_file.exists():
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        print(f"Backup-datum: {metadata.get('backup_date')}")
        print(f"Totalt rader: {metadata.get('total_rows')}")

    database_url = get_database_url()
    if not database_url:
        print("\n✗ DATABASE_URL är inte satt!")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades (ny databas)")
    print("\n⚠️  VARNING: Detta kommer att infoga data i den nya databasen.")
    print("   Säkerställ att migrations är körda först!")
    
    response = input("\nFortsätt? (ja/nej): ").strip().lower()
    if response != "ja":
        print("Avbrutet.")
        sys.exit(0)

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = False
        print("✓ Ansluten till PostgreSQL")
    except Exception as e:
        print(f"\n✗ Kunde inte ansluta: {e}")
        sys.exit(1)

    try:
        # Återställ tabeller i rätt ordning (foreign keys)
        tables = ["tracks", "track_positions", "geofences", "hiding_spots"]
        
        print(f"\nÅterställer {len(tables)} tabeller...")
        print("-" * 60)

        total_rows = 0
        for table in tables:
            backup_file = backup_path / f"{table}.json"
            if backup_file.exists():
                # tracks behåller original-id så att track_positions FK (track_id) matchar
                preserve_id = table == "tracks"
                rows = restore_table(conn, table, backup_file, preserve_id=preserve_id)
                total_rows += rows
            else:
                print(f"  - {table}: Ingen backup hittades")

        conn.commit()
        print("-" * 60)
        print(f"\n✓ Återställning klar!")
        print(f"  Totalt: {total_rows} rader återställda")

    except Exception as e:
        conn.rollback()
        print(f"\n✗ Fel vid återställning: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n✗ Avbrutet")
        sys.exit(1)
