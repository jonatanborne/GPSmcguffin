#!/usr/bin/env python3
"""
Migration-script för FAS 1 - Truth Levels, Confidence Scores, etc.

Användning:
    python backend/scripts/migrate_fas1.py

Detta script:
- Lägger till nya kolumner i track_positions
- Skapar nya tabeller (audit_log, model_versions, competitions)
- Tilldelar truth levels till befintlig data
- Säkerställer att allt fungerar korrekt

VIKTIGT: Kör backup först!
    python backend/scripts/backup_database.py
"""

import os
import sys
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


def column_exists(cursor, table_name, column_name):
    """Kontrollera om en kolumn finns"""
    cursor.execute(
        """
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = %s AND column_name = %s
    """,
        (table_name, column_name),
    )
    return cursor.fetchone() is not None


def table_exists(cursor, table_name):
    """Kontrollera om en tabell finns"""
    cursor.execute(
        """
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = %s
    """,
        (table_name,),
    )
    return cursor.fetchone() is not None


def migrate_track_positions(cursor):
    """Lägg till nya kolumner i track_positions"""
    print("\n" + "=" * 60)
    print("MIGRERAR track_positions")
    print("=" * 60)

    changes = []

    # Truth level
    if not column_exists(cursor, "track_positions", "truth_level"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN truth_level TEXT DEFAULT 'T3'
        """)
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD CONSTRAINT check_truth_level 
            CHECK (truth_level IN ('T0', 'T1', 'T2', 'T3'))
        """)
        changes.append("truth_level")
        print("  ✓ Lagt till truth_level kolumn")
    else:
        print("  - truth_level kolumn finns redan")

    # Correction source
    if not column_exists(cursor, "track_positions", "correction_source"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN correction_source TEXT DEFAULT 'none'
        """)
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD CONSTRAINT check_correction_source 
            CHECK (correction_source IN ('manual', 'ml', 'none'))
        """)
        changes.append("correction_source")
        print("  ✓ Lagt till correction_source kolumn")
    else:
        print("  - correction_source kolumn finns redan")

    # ML confidence
    if not column_exists(cursor, "track_positions", "ml_confidence"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN ml_confidence DOUBLE PRECISION
        """)
        changes.append("ml_confidence")
        print("  ✓ Lagt till ml_confidence kolumn")
    else:
        print("  - ml_confidence kolumn finns redan")

    # ML model version
    if not column_exists(cursor, "track_positions", "ml_model_version"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN ml_model_version TEXT
        """)
        changes.append("ml_model_version")
        print("  ✓ Lagt till ml_model_version kolumn")
    else:
        print("  - ml_model_version kolumn finns redan")

    # Usable for scoring
    if not column_exists(cursor, "track_positions", "usable_for_scoring"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN usable_for_scoring BOOLEAN DEFAULT FALSE
        """)
        changes.append("usable_for_scoring")
        print("  ✓ Lagt till usable_for_scoring kolumn")
    else:
        print("  - usable_for_scoring kolumn finns redan")

    # Corrected by (valfritt)
    if not column_exists(cursor, "track_positions", "corrected_by"):
        cursor.execute("""
            ALTER TABLE track_positions 
            ADD COLUMN corrected_by TEXT
        """)
        changes.append("corrected_by")
        print("  ✓ Lagt till corrected_by kolumn")
    else:
        print("  - corrected_by kolumn finns redan")

    return changes


def migrate_tracks(cursor):
    """Lägg till nya kolumner i tracks"""
    print("\n" + "=" * 60)
    print("MIGRERAR tracks")
    print("=" * 60)

    changes = []

    # Competition ID
    if not column_exists(cursor, "tracks", "competition_id"):
        cursor.execute("""
            ALTER TABLE tracks 
            ADD COLUMN competition_id INTEGER
        """)
        changes.append("competition_id")
        print("  ✓ Lagt till competition_id kolumn")
    else:
        print("  - competition_id kolumn finns redan")

    return changes


def create_audit_log_table(cursor):
    """Skapa audit_log tabell"""
    print("\n" + "=" * 60)
    print("SKAPAR audit_log TABELL")
    print("=" * 60)

    if table_exists(cursor, "audit_log"):
        print("  - audit_log tabell finns redan")
        return False

    cursor.execute("""
        CREATE TABLE audit_log (
            id SERIAL PRIMARY KEY,
            position_id INTEGER,
            track_id INTEGER,
            action TEXT NOT NULL,
            old_value JSONB,
            new_value JSONB,
            user_id TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (position_id) REFERENCES track_positions(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)

    # Skapa index för snabbare queries
    cursor.execute("CREATE INDEX idx_audit_log_position_id ON audit_log(position_id)")
    cursor.execute("CREATE INDEX idx_audit_log_track_id ON audit_log(track_id)")
    cursor.execute("CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp)")

    print("  ✓ audit_log tabell skapad")
    return True


def create_model_versions_table(cursor):
    """Skapa model_versions tabell"""
    print("\n" + "=" * 60)
    print("SKAPAR model_versions TABELL")
    print("=" * 60)

    if table_exists(cursor, "model_versions"):
        print("  - model_versions tabell finns redan")
        return False

    cursor.execute("""
        CREATE TABLE model_versions (
            id SERIAL PRIMARY KEY,
            version TEXT UNIQUE NOT NULL,
            model_path TEXT NOT NULL,
            trained_at TEXT NOT NULL,
            features JSONB,
            performance_metrics JSONB,
            is_active BOOLEAN DEFAULT FALSE,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("CREATE INDEX idx_model_versions_version ON model_versions(version)")
    cursor.execute(
        "CREATE INDEX idx_model_versions_is_active ON model_versions(is_active)"
    )

    print("  ✓ model_versions tabell skapad")
    return True


def create_competitions_table(cursor):
    """Skapa competitions tabell"""
    print("\n" + "=" * 60)
    print("SKAPAR competitions TABELL")
    print("=" * 60)

    if table_exists(cursor, "competitions"):
        print("  - competitions tabell finns redan")
        return False

    cursor.execute("""
        CREATE TABLE competitions (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT,
            locked_model_version TEXT,
            is_active BOOLEAN DEFAULT FALSE,
            created_at TEXT NOT NULL,
            FOREIGN KEY (locked_model_version) REFERENCES model_versions(version)
        )
    """)

    cursor.execute("CREATE INDEX idx_competitions_is_active ON competitions(is_active)")

    print("  ✓ competitions tabell skapad")
    return True


def haversine_distance_sql(lat1_col, lon1_col, lat2_col, lon2_col):
    """Returnera SQL för att beräkna Haversine-avstånd i meter"""
    return f"""
        6371000 * 2 * ATAN2(
            SQRT(
                POW(SIN(RADIANS({lat2_col} - {lat1_col}) / 2), 2) +
                COS(RADIANS({lat1_col})) * COS(RADIANS({lat2_col})) *
                POW(SIN(RADIANS({lon2_col} - {lon1_col}) / 2), 2)
            ),
            SQRT(1 - (
                POW(SIN(RADIANS({lat2_col} - {lat1_col}) / 2), 2) +
                COS(RADIANS({lat1_col})) * COS(RADIANS({lat2_col})) *
                POW(SIN(RADIANS({lon2_col} - {lon1_col}) / 2), 2)
            ))
        )
    """


def assign_truth_levels(cursor):
    """Tilldela truth levels till befintlig data"""
    print("\n" + "=" * 60)
    print("TILLDELAR TRUTH LEVELS TILL BEFINTLIG DATA")
    print("=" * 60)

    # T0: Manuella korrigeringar där positionen faktiskt flyttats (> 1 meter)
    # Om corrected_lat/lng finns OCH avståndet är > 1 meter → T0 (manuellt flyttad)
    # Om avståndet är < 1 meter → Det var korrekt från början, inte T0
    distance_sql = haversine_distance_sql(
        "position_lat", "position_lng", "corrected_lat", "corrected_lng"
    )

    # T0: Manuella korrigeringar där positionen faktiskt flyttats (> 1 meter)
    # Ta bort villkoret truth_level = 'T3' så vi kan uppdatera även om truth_level redan är satt
    cursor.execute(f"""
        UPDATE track_positions
        SET truth_level = 'T0',
            correction_source = 'manual'
        WHERE corrected_lat IS NOT NULL 
          AND corrected_lng IS NOT NULL
          AND ({distance_sql}) > 1.0
          AND (correction_source IS NULL OR correction_source = 'none' OR correction_source != 'ml')
          AND truth_level != 'T0'  -- Uppdatera bara om den inte redan är T0
    """)
    t0_updated = cursor.rowcount

    # Räkna totalt antal T0 efter uppdatering
    cursor.execute(
        "SELECT COUNT(*) as count FROM track_positions WHERE truth_level = 'T0'"
    )
    result = cursor.fetchone()
    t0_total = result["count"] if result else 0

    print(
        f"  ✓ T0 (manuellt flyttade positioner > 1m): {t0_updated} uppdaterade, {t0_total} totalt"
    )

    # T2: ML-korrigeringar (om correction_source = 'ml' finns)
    # För befintlig data: Om correction_source redan är 'ml', sätt T2
    cursor.execute("""
        UPDATE track_positions
        SET truth_level = 'T2'
        WHERE correction_source = 'ml'
          AND truth_level != 'T2'
    """)
    t2_updated = cursor.rowcount

    # Räkna totalt antal T2 efter uppdatering
    cursor.execute(
        "SELECT COUNT(*) as count FROM track_positions WHERE truth_level = 'T2'"
    )
    result = cursor.fetchone()
    t2_total = result["count"] if result else 0

    print(f"  ✓ T2 (ML-korrigerade): {t2_updated} uppdaterade, {t2_total} totalt")

    # T1: Verifierade tracks (human OCH dog) som var korrekta från början
    # 1. Tracks som är verifierade OCH inte har korrigeringar
    # 2. ELLER har korrigeringar men avståndet är < 1 meter (var korrekt från början)
    # OBS: Bara human tracks ska normalt få T1, men vi inkluderar dog tracks också om de är verifierade
    distance_sql = haversine_distance_sql(
        "tp.position_lat", "tp.position_lng", "tp.corrected_lat", "tp.corrected_lng"
    )

    # VIKTIGT: Kör EFTER T0 så vi inte sätter T1 på positioner som borde vara T0
    # T1 ska bara sättas för positioner som INTE har korrigeringar > 1 meter
    cursor.execute(f"""
        UPDATE track_positions tp
        SET truth_level = 'T1'
        FROM tracks t
        WHERE tp.track_id = t.id
          AND tp.verified_status = 'correct'
          AND (
            -- Inga korrigeringar alls
            (tp.corrected_lat IS NULL AND tp.corrected_lng IS NULL)
            OR
            -- Korrigeringar finns men avståndet är <= 1 meter (var korrekt från början)
            (tp.corrected_lat IS NOT NULL AND tp.corrected_lng IS NOT NULL 
             AND ({distance_sql}) <= 1.0)
          )
          AND (tp.correction_source IS NULL OR tp.correction_source = 'none' OR tp.correction_source != 'ml')
          AND tp.truth_level != 'T0'  -- Uppdatera bara om den inte redan är T0 (eller borde vara T0)
          AND tp.truth_level != 'T1'  -- Uppdatera bara om den inte redan är T1
    """)
    t1_updated = cursor.rowcount

    # Räkna totalt antal T1 efter uppdatering
    cursor.execute(
        "SELECT COUNT(*) as count FROM track_positions WHERE truth_level = 'T1'"
    )
    result = cursor.fetchone()
    t1_total = result["count"] if result else 0

    print(
        f"  ✓ T1 (verifierade tracks, korrekta från början): {t1_updated} uppdaterade, {t1_total} totalt"
    )

    # T3: Allt annat (default - redan satt)
    cursor.execute(
        "SELECT COUNT(*) as count FROM track_positions WHERE truth_level = 'T3'"
    )
    result = cursor.fetchone()
    t3_total = result["count"] if result else 0
    print(f"  ✓ T3 (rå GPS): {t3_total} totalt")

    # Räkna totalt antal positioner
    cursor.execute("SELECT COUNT(*) as count FROM track_positions")
    result = cursor.fetchone()
    total = result["count"] if result else 0
    print(f"\n  Totalt: {total} positioner med truth levels")

    return {"T0": t0_total, "T1": t1_total, "T2": t2_total, "T3": t3_total}


def set_correction_source(cursor):
    """Sätt correction_source för befintlig data"""
    print("\n" + "=" * 60)
    print("SÄTTER correction_source FÖR BEFINTLIG DATA")
    print("=" * 60)

    # För befintlig data: Om corrected_lat/lng finns men correction_source är 'none',
    # kan vi inte veta om det är manuell eller ML-korrigering
    # Så vi låter det vara 'none' och låter systemet sätta rätt värde för nya korrigeringar

    cursor.execute("""
        SELECT COUNT(*) as count
        FROM track_positions 
        WHERE (corrected_lat IS NOT NULL OR corrected_lng IS NOT NULL)
          AND correction_source = 'none'
    """)
    result = cursor.fetchone()
    unknown_count = result["count"] if result else 0

    if unknown_count > 0:
        print(f"  ⚠️  {unknown_count} positioner har korrigeringar men okänd källa")
        print(
            f"     (correction_source = 'none' - kommer uppdateras när systemet används)"
        )

    # Räkna olika correction_source värden
    cursor.execute("""
        SELECT correction_source, COUNT(*) as count
        FROM track_positions
        GROUP BY correction_source
    """)
    results = cursor.fetchall()

    print("\n  Correction source fördelning:")
    for row in results:
        source = row["correction_source"] or "NULL"
        count = row["count"]
        print(f"    {source}: {count} positioner")


def main():
    """Huvudfunktion"""
    print("=" * 60)
    print("FAS 1 MIGRATION")
    print("=" * 60)
    print("\nVIKTIGT: Kör backup först!")
    print("  python backend/scripts/backup_database.py\n")

    response = input("Har du kört backup? (ja/nej): ").strip().lower()
    if response != "ja":
        print("\n✗ Kör backup först innan du fortsätter!")
        print("  python backend/scripts/backup_database.py")
        sys.exit(1)

    # Hämta DATABASE_URL
    database_url = get_database_url()

    if not database_url:
        print("\n✗ Ingen DATABASE_URL hittades!")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades")

    # Anslut till databasen
    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = False  # Använd transactions
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print("✓ Ansluten till PostgreSQL")
    except Exception as e:
        print(f"\n✗ Kunde inte ansluta till databasen: {e}")
        sys.exit(1)

    try:
        # Migrera track_positions
        migrate_track_positions(cursor)

        # Migrera tracks
        migrate_tracks(cursor)

        # Skapa nya tabeller
        create_audit_log_table(cursor)
        create_model_versions_table(cursor)
        create_competitions_table(cursor)

        # Tilldela truth levels
        truth_levels = assign_truth_levels(cursor)

        # Sätt correction_source
        set_correction_source(cursor)

        # Commit allt
        conn.commit()
        print("\n" + "=" * 60)
        print("✓ MIGRATION KLAR!")
        print("=" * 60)
        print("\nTruth levels tilldelade:")
        for level, count in truth_levels.items():
            print(f"  {level}: {count} positioner")
        print("\n✓ Alla ändringar sparade i databasen")

    except Exception as e:
        conn.rollback()
        print(f"\n✗ Fel vid migration: {e}")
        import traceback

        traceback.print_exc()
        print("\n✗ Alla ändringar har rollbackats")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n✗ Migration avbruten av användaren")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Oväntat fel: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
