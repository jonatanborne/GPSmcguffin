#!/usr/bin/env python3
"""
Rensa alla data från grundtabellerna (behövs före restore om databasen har gammal data).

Användning:
    export DATABASE_URL="postgresql://..."
    python backend/scripts/truncate_tables.py
"""

import os
import sys
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


def get_database_url():
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )
    if database_url:
        database_url = database_url.strip()
    return database_url


def main():
    print("=" * 60)
    print("RENSA TABELLER")
    print("=" * 60)
    print("\nDetta tar bort ALL data från tracks, track_positions, geofences, hiding_spots.")
    print("Använd innan restore om databasen har gammal/partiell data.\n")

    database_url = get_database_url()
    if not database_url:
        print("✗ DATABASE_URL är inte satt!")
        sys.exit(1)

    response = input("Fortsätt? (ja/nej): ").strip().lower()
    if response != "ja":
        print("Avbrutet.")
        sys.exit(0)

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = True
        cursor = conn.cursor()
        cursor.execute("""
            TRUNCATE track_positions, tracks, geofences, hiding_spots 
            RESTART IDENTITY CASCADE
        """)
        cursor.close()
        conn.close()
        print("\n✓ Tabellerna är rensade.")
    except Exception as e:
        print(f"\n✗ Fel: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
