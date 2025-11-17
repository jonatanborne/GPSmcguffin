#!/usr/bin/env python3
"""
Initiera Postgres-databas med tabeller.
Användning:
    python init_postgres.py <postgres_url>
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import sys


def init_postgres(postgres_url):
    """Initiera Postgres-databas med tabeller"""

    conn = psycopg2.connect(postgres_url)
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    print("Skapar tabeller i Postgres...")

    # Geofences tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS geofences (
            id SERIAL PRIMARY KEY,
            name TEXT,
            type TEXT NOT NULL,
            center_lat DOUBLE PRECISION,
            center_lng DOUBLE PRECISION,
            radius_m DOUBLE PRECISION,
            vertices_json TEXT,
            created_at TEXT NOT NULL
        )
    """)
    print("✓ geofences tabell skapad")

    # Tracks tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            track_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            human_track_id INTEGER,
            FOREIGN KEY (human_track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)
    print("✓ tracks tabell skapad")

    # Track positions tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS track_positions (
            id SERIAL PRIMARY KEY,
            track_id INTEGER NOT NULL,
            position_lat DOUBLE PRECISION NOT NULL,
            position_lng DOUBLE PRECISION NOT NULL,
            timestamp TEXT NOT NULL,
            accuracy DOUBLE PRECISION,
            verified_status TEXT DEFAULT 'pending',
            corrected_lat DOUBLE PRECISION,
            corrected_lng DOUBLE PRECISION,
            corrected_at TEXT,
            annotation_notes TEXT,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)
    print("✓ track_positions tabell skapad")

    # Hiding spots tabell
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hiding_spots (
            id SERIAL PRIMARY KEY,
            track_id INTEGER NOT NULL,
            position_lat DOUBLE PRECISION NOT NULL,
            position_lng DOUBLE PRECISION NOT NULL,
            name TEXT,
            description TEXT,
            created_at TEXT NOT NULL,
            found INTEGER,
            found_at TEXT,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )
    """)
    print("✓ hiding_spots tabell skapad")

    conn.commit()
    cursor.close()
    conn.close()

    print("\nAlla tabeller skapade!")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Användning: python init_postgres.py <postgres_url>")
        sys.exit(1)

    postgres_url = sys.argv[1]
    init_postgres(postgres_url)
