#!/usr/bin/env python3
"""
Migration för ML Experiments - Reinforcement Learning från kundspår

Skapar ml_experiments tabell för att spara:
- Original kundspår
- Modellens korrigerade version
- Användarens betyg (1-10)
- Feedback-notes

Användning:
    export DATABASE_URL="postgresql://..."
    python backend/scripts/migrate_ml_experiments.py
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
    """Hämta DATABASE_URL från environment"""
    database_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )
    if database_url:
        database_url = database_url.strip()
    return database_url


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


def create_ml_experiments_table(cursor):
    """Skapa ml_experiments tabell"""
    print("\n" + "=" * 60)
    print("SKAPAR ml_experiments TABELL")
    print("=" * 60)

    if table_exists(cursor, "ml_experiments"):
        print("  - ml_experiments tabell finns redan")
        return False

    cursor.execute("""
        CREATE TABLE ml_experiments (
            id SERIAL PRIMARY KEY,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            original_track_json JSONB NOT NULL,
            corrected_track_json JSONB NOT NULL,
            model_version TEXT,
            rating INTEGER CHECK (rating >= 1 AND rating <= 10),
            feedback_notes TEXT,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'rated', 'skipped')),
            created_at TIMESTAMP DEFAULT NOW(),
            rated_at TIMESTAMP
        )
    """)

    # Index för snabbare queries
    cursor.execute("CREATE INDEX idx_ml_experiments_track_id ON ml_experiments(track_id)")
    cursor.execute("CREATE INDEX idx_ml_experiments_status ON ml_experiments(status)")
    cursor.execute("CREATE INDEX idx_ml_experiments_rating ON ml_experiments(rating)")
    cursor.execute("CREATE INDEX idx_ml_experiments_created_at ON ml_experiments(created_at)")

    print("  ✓ ml_experiments tabell skapad")
    print("  ✓ Index skapade")
    return True


def main():
    """Huvudfunktion"""
    print("=" * 60)
    print("ML EXPERIMENTS MIGRATION")
    print("=" * 60)
    print("\nSkapar tabell för Reinforcement Learning från kundspår")

    database_url = get_database_url()

    if not database_url:
        print("\n✗ DATABASE_URL är inte satt!")
        print("  export DATABASE_URL='postgresql://...'")
        sys.exit(1)

    print(f"\n✓ DATABASE_URL hittades")

    try:
        conn = psycopg2.connect(database_url, connect_timeout=10)
        conn.autocommit = False
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print("✓ Ansluten till PostgreSQL")
    except Exception as e:
        print(f"\n✗ Kunde inte ansluta: {e}")
        sys.exit(1)

    try:
        # Skapa tabell
        created = create_ml_experiments_table(cursor)

        # Commit
        conn.commit()
        
        print("\n" + "=" * 60)
        print("✓ MIGRATION KLAR!")
        print("=" * 60)
        
        if created:
            print("\nTabell ml_experiments skapad och redo att användas.")
        else:
            print("\nTabell ml_experiments fanns redan.")

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
        print("\n\n✗ Migration avbruten")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Oväntat fel: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
