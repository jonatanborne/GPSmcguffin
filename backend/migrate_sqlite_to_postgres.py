#!/usr/bin/env python3
"""
Migreringsskript för att flytta data från SQLite till Postgres.
Användning:
    python migrate_sqlite_to_postgres.py <sqlite_db_path> <postgres_url>
"""

import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import sys
import os


def migrate(sqlite_path, postgres_url):
    """Migrera data från SQLite till Postgres"""

    # Anslut till SQLite
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()

    # Anslut till Postgres
    postgres_conn = psycopg2.connect(postgres_url)
    postgres_cursor = postgres_conn.cursor()

    print("Migrerar tracks...")
    # Migrera tracks
    sqlite_cursor.execute("SELECT * FROM tracks ORDER BY id")
    tracks = sqlite_cursor.fetchall()

    for track in tracks:
        postgres_cursor.execute(
            """
            INSERT INTO tracks (id, name, track_type, created_at, human_track_id, track_source)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                track["id"],
                track["name"],
                track["track_type"],
                track["created_at"],
                track.get("human_track_id"),
                "own",
            ),
        )

    print(f"Migrerade {len(tracks)} tracks")

    print("Migrerar track_positions...")
    # Migrera track_positions
    sqlite_cursor.execute("SELECT * FROM track_positions ORDER BY id")
    positions = sqlite_cursor.fetchall()

    for pos in positions:
        postgres_cursor.execute(
            """
            INSERT INTO track_positions (
                id, track_id, position_lat, position_lng, timestamp, accuracy,
                verified_status, corrected_lat, corrected_lng, corrected_at, annotation_notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                pos["id"],
                pos["track_id"],
                pos["position_lat"],
                pos["position_lng"],
                pos["timestamp"],
                pos.get("accuracy"),
                pos.get("verified_status", "pending"),
                pos.get("corrected_lat"),
                pos.get("corrected_lng"),
                pos.get("corrected_at"),
                pos.get("annotation_notes"),
            ),
        )

    print(f"Migrerade {len(positions)} positions")

    print("Migrerar geofences...")
    # Migrera geofences
    sqlite_cursor.execute("SELECT * FROM geofences ORDER BY id")
    geofences = sqlite_cursor.fetchall()

    for geofence in geofences:
        postgres_cursor.execute(
            """
            INSERT INTO geofences (
                id, name, type, center_lat, center_lng, radius_m, vertices_json, created_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                geofence["id"],
                geofence.get("name"),
                geofence["type"],
                geofence.get("center_lat"),
                geofence.get("center_lng"),
                geofence.get("radius_m"),
                geofence.get("vertices_json"),
                geofence["created_at"],
            ),
        )

    print(f"Migrerade {len(geofences)} geofences")

    print("Migrerar hiding_spots...")
    # Migrera hiding_spots
    sqlite_cursor.execute("SELECT * FROM hiding_spots ORDER BY id")
    spots = sqlite_cursor.fetchall()

    for spot in spots:
        postgres_cursor.execute(
            """
            INSERT INTO hiding_spots (
                id, track_id, position_lat, position_lng, name, description, created_at, found, found_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                spot["id"],
                spot["track_id"],
                spot["position_lat"],
                spot["position_lng"],
                spot.get("name"),
                spot.get("description"),
                spot["created_at"],
                spot.get("found"),
                spot.get("found_at"),
            ),
        )

    print(f"Migrerade {len(spots)} hiding spots")

    # Commit och stäng
    postgres_conn.commit()
    postgres_cursor.close()
    postgres_conn.close()

    sqlite_cursor.close()
    sqlite_conn.close()

    print("Migration klar!")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Användning: python migrate_sqlite_to_postgres.py <sqlite_db_path> <postgres_url>"
        )
        sys.exit(1)

    sqlite_path = sys.argv[1]
    postgres_url = sys.argv[2]

    if not os.path.exists(sqlite_path):
        print(f"Fel: SQLite-databasen {sqlite_path} finns inte")
        sys.exit(1)

    migrate(sqlite_path, postgres_url)
