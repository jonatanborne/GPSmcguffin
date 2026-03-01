#!/usr/bin/env python3
"""
Initialisera ny tom databas med grundtabeller.

Kör detta FÖRST på en ny tom Postgres innan migrations och restore.

Användning:
    export DATABASE_URL="postgresql://..." (ny tom databas)
    python backend/scripts/init_database.py
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
from psycopg2.extras import RealDictCursor


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
    print("INITIALISERA NY DATABAS")
    print("=" * 60)
    print("\nSkapar grundtabeller för Dogtracks Geofence Kit")

    database_url = get_database_url()
    if not database_url:
        print("\n✗ DATABASE_URL är inte satt!")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades")

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = False
        cursor = conn.cursor()
        print("✓ Ansluten till PostgreSQL")
    except Exception as e:
        print(f"\n✗ Kunde inte ansluta: {e}")
        sys.exit(1)

    try:
        print("\nSkapar tabeller...")
        print("-" * 60)

        # 1. Tracks tabell
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tracks (
                id SERIAL PRIMARY KEY,
                name TEXT,
                track_type TEXT DEFAULT 'human',
                human_track_id INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                track_source TEXT DEFAULT 'own'
            )
        """)
        print("  ✓ tracks")

        # 2. Track positions tabell
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS track_positions (
                id SERIAL PRIMARY KEY,
                track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                position_lat DOUBLE PRECISION NOT NULL,
                position_lng DOUBLE PRECISION NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                accuracy DOUBLE PRECISION,
                verified_status TEXT DEFAULT 'pending',
                corrected_lat DOUBLE PRECISION,
                corrected_lng DOUBLE PRECISION,
                annotation_notes TEXT,
                environment TEXT
            )
        """)
        print("  ✓ track_positions")

        # 3. Geofences tabell
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS geofences (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                coordinates JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        print("  ✓ geofences")

        # 4. Hiding spots tabell
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hiding_spots (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                coordinates JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        print("  ✓ hiding_spots")

        # Index för bättre performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_track_positions_track_id ON track_positions(track_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_track_positions_timestamp ON track_positions(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tracks_track_type ON tracks(track_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tracks_track_source ON tracks(track_source)")
        print("  ✓ Index skapade")

        conn.commit()
        print("-" * 60)
        print("\n✓ Grundtabeller skapade!")
        print("\nNästa steg:")
        print("  1. Kör migrations: python backend/scripts/migrate_fas1.py")
        print("  2. Kör migrations: python backend/scripts/migrate_ml_experiments.py")
        print("  3. Återställ data: python backend/scripts/restore_database.py backend/backups/backup_YYYYMMDD_HHMMSS")

    except Exception as e:
        conn.rollback()
        print(f"\n✗ Fel: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n✗ Avbrutet")
        sys.exit(1)
