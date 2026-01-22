#!/usr/bin/env python3
"""
Verifieringsscript för PostgreSQL-anslutning.

Användning:
    python backend/scripts/verify_postgres.py

Detta script testar:
- PostgreSQL-anslutning
- Att tabeller finns
- Grundläggande CRUD-operationer
"""

import os
import sys
from pathlib import Path

# Lägg till backend-mappen i path så vi kan importera
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Ladda .env-fil om den finns
try:
    from dotenv import load_dotenv

    env_path = backend_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ Laddade .env från {env_path}")
    else:
        print(f"⚠️  Ingen .env fil hittades i {backend_dir}")
except ImportError:
    print("⚠️  python-dotenv inte installerat, hoppar över .env-laddning")

import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime


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


def test_connection(database_url):
    """Testa PostgreSQL-anslutning"""
    print("\n" + "=" * 60)
    print("1. TESTAR POSTGRESQL-ANSLUTNING")
    print("=" * 60)

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        print("✓ Anslutning till PostgreSQL lyckades!")

        # Testa en enkel query
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()[0]
        print(f"✓ PostgreSQL version: {version.split(',')[0]}")

        cursor.close()
        conn.close()
        return True

    except psycopg2.OperationalError as e:
        print(f"✗ Anslutning misslyckades: {e}")
        print("\nTips:")
        print("  - Kontrollera att DATABASE_PUBLIC_URL är korrekt i .env")
        print("  - Kontrollera att Railway's Postgres-tjänst är igång")
        print("  - Kontrollera internetanslutning")
        return False
    except Exception as e:
        print(f"✗ Oväntat fel: {e}")
        return False


def test_tables(database_url):
    """Testa att tabeller finns"""
    print("\n" + "=" * 60)
    print("2. TESTAR TABELLER")
    print("=" * 60)

    required_tables = ["tracks", "track_positions", "geofences", "hiding_spots"]

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        cursor = conn.cursor()

        # Hämta alla tabeller
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        existing_tables = [row[0] for row in cursor.fetchall()]

        print(f"✓ Hittade {len(existing_tables)} tabeller i databasen")

        # Kontrollera att alla nödvändiga tabeller finns
        missing_tables = []
        for table in required_tables:
            if table in existing_tables:
                print(f"  ✓ {table} finns")
            else:
                print(f"  ✗ {table} saknas")
                missing_tables.append(table)

        cursor.close()
        conn.close()

        if missing_tables:
            print(f"\n⚠️  {len(missing_tables)} tabeller saknas!")
            print("   Kör: python backend/init_postgres.py <postgres_url>")
            return False
        else:
            print("\n✓ Alla nödvändiga tabeller finns!")
            return True

    except Exception as e:
        print(f"✗ Fel vid kontroll av tabeller: {e}")
        return False


def test_crud_operations(database_url):
    """Testa grundläggande CRUD-operationer"""
    print("\n" + "=" * 60)
    print("3. TESTAR CRUD-OPERATIONER")
    print("=" * 60)

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # CREATE: Skapa ett test-track
        test_name = f"test_verify_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        cursor.execute(
            """
            INSERT INTO tracks (name, track_type, created_at)
            VALUES (%s, %s, %s)
            RETURNING id;
        """,
            (test_name, "human", datetime.now().isoformat()),
        )

        track_id = cursor.fetchone()["id"]
        print(f"✓ CREATE: Skapade test-track med id={track_id}")

        # READ: Läsa track
        cursor.execute("SELECT * FROM tracks WHERE id = %s", (track_id,))
        track = cursor.fetchone()
        if track and track["name"] == test_name:
            print(f"✓ READ: Läste track korrekt (name={track['name']})")
        else:
            print("✗ READ: Kunde inte läsa track korrekt")
            conn.rollback()
            conn.close()
            return False

        # UPDATE: Uppdatera track
        new_name = f"{test_name}_updated"
        cursor.execute(
            """
            UPDATE tracks 
            SET name = %s 
            WHERE id = %s
        """,
            (new_name, track_id),
        )

        cursor.execute("SELECT name FROM tracks WHERE id = %s", (track_id,))
        updated_track = cursor.fetchone()
        if updated_track and updated_track["name"] == new_name:
            print(f"✓ UPDATE: Uppdaterade track korrekt (name={updated_track['name']})")
        else:
            print("✗ UPDATE: Kunde inte uppdatera track korrekt")
            conn.rollback()
            conn.close()
            return False

        # DELETE: Ta bort test-track
        cursor.execute("DELETE FROM tracks WHERE id = %s", (track_id,))
        cursor.execute("SELECT * FROM tracks WHERE id = %s", (track_id,))
        deleted_track = cursor.fetchone()
        if deleted_track is None:
            print(f"✓ DELETE: Tog bort track korrekt")
        else:
            print("✗ DELETE: Kunde inte ta bort track")
            conn.rollback()
            conn.close()
            return False

        conn.commit()
        cursor.close()
        conn.close()

        print("\n✓ Alla CRUD-operationer fungerar!")
        return True

    except Exception as e:
        print(f"✗ Fel vid CRUD-test: {e}")
        import traceback

        traceback.print_exc()
        try:
            conn.rollback()
            conn.close()
        except:
            pass
        return False


def test_data_count(database_url):
    """Räkna befintlig data"""
    print("\n" + "=" * 60)
    print("4. RÄKNAR BEFINTLIG DATA")
    print("=" * 60)

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Räkna tracks
        cursor.execute("SELECT COUNT(*) as count FROM tracks")
        tracks_count = cursor.fetchone()["count"]
        print(f"  Tracks: {tracks_count}")

        # Räkna positions
        cursor.execute("SELECT COUNT(*) as count FROM track_positions")
        positions_count = cursor.fetchone()["count"]
        print(f"  Positions: {positions_count}")

        # Räkna geofences
        cursor.execute("SELECT COUNT(*) as count FROM geofences")
        geofences_count = cursor.fetchone()["count"]
        print(f"  Geofences: {geofences_count}")

        # Räkna hiding spots
        cursor.execute("SELECT COUNT(*) as count FROM hiding_spots")
        hiding_spots_count = cursor.fetchone()["count"]
        print(f"  Hiding spots: {hiding_spots_count}")

        total = tracks_count + positions_count + geofences_count + hiding_spots_count
        print(f"\n✓ Totalt: {total} rader i databasen")

        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"✗ Fel vid räkning av data: {e}")
        return False


def main():
    """Huvudfunktion"""
    print("=" * 60)
    print("POSTGRESQL VERIFIERING")
    print("=" * 60)

    # Hämta DATABASE_URL
    database_url = get_database_url()

    if not database_url:
        print("\n✗ Ingen DATABASE_URL hittades!")
        print("\nTips:")
        print("  1. Skapa .env fil i backend/ mappen")
        print("  2. Lägg till: DATABASE_PUBLIC_URL=postgresql://...")
        print("  3. Hämta DATABASE_PUBLIC_URL från Railway Dashboard")
        print("\nSe: backend/LOCAL_DATABASE_SETUP.md för instruktioner")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades")
    # Visa inte hela URL:en (kan innehålla lösenord)
    url_parts = database_url.split("@")
    if len(url_parts) > 1:
        print(f"  Ansluter till: ...@{url_parts[1]}")
    else:
        print(f"  Ansluter till: {database_url[:50]}...")

    # Kör alla tester
    results = []

    results.append(("Anslutning", test_connection(database_url)))
    if not results[-1][1]:
        print("\n✗ Anslutning misslyckades - stoppar tester")
        sys.exit(1)

    results.append(("Tabeller", test_tables(database_url)))
    results.append(("CRUD-operationer", test_crud_operations(database_url)))
    results.append(("Data-räkning", test_data_count(database_url)))

    # Sammanfattning
    print("\n" + "=" * 60)
    print("SAMMANFATTNING")
    print("=" * 60)

    all_passed = True
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {test_name}")
        if not passed:
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("✓ ALLA TESTER PASSADE!")
        print("\nPostgreSQL är redo att användas.")
        print("Du kan nu fortsätta med FAS 1-implementeringen.")
    else:
        print("✗ NÅGRA TESTER MISSLYCKADES")
        print("\nFixa problemen innan du fortsätter.")
    print("=" * 60)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
