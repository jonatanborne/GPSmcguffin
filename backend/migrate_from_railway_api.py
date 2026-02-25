#!/usr/bin/env python3
"""
Migreringsskript för att flytta data från Railway API till Postgres.
Användning:
    python migrate_from_railway_api.py <railway_backend_url> <postgres_url>
"""

import requests
import psycopg2
import sys
import json
from datetime import datetime


def migrate_from_api(railway_url, postgres_url):
    """Migrera data från Railway API till Postgres"""

    # Ta bort trailing slash från Railway URL
    railway_url = railway_url.rstrip("/")

    print(f"Hämtar data från Railway: {railway_url}")

    # Hämta tracks från Railway
    try:
        response = requests.get(f"{railway_url}/tracks", timeout=30)
        response.raise_for_status()
        tracks = response.json()
        print(f"Hittade {len(tracks)} tracks på Railway")
    except Exception as e:
        print(f"Fel vid hämtning av tracks: {e}")
        return

    # Anslut till Postgres
    try:
        postgres_conn = psycopg2.connect(postgres_url)
        postgres_cursor = postgres_conn.cursor()
        print("Ansluten till Postgres")
    except Exception as e:
        print(f"Fel vid anslutning till Postgres: {e}")
        return

    # Migrera tracks
    migrated_tracks = 0
    migrated_positions = 0

    for track in tracks:
        track_id = track.get("id")
        name = track.get("name")
        track_type = track.get("track_type")
        created_at = track.get("created_at")
        human_track_id = track.get("human_track_id")
        positions = track.get("positions", [])

        # Lägg till track
        try:
            postgres_cursor.execute(
                """
                INSERT INTO tracks (id, name, track_type, created_at, human_track_id, track_source)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    track_type = EXCLUDED.track_type,
                    created_at = EXCLUDED.created_at,
                    human_track_id = EXCLUDED.human_track_id
                """,
                (track_id, name, track_type, created_at, human_track_id, "own"),
            )
            migrated_tracks += 1
        except Exception as e:
            print(f"Fel vid migrering av track {track_id}: {e}")
            continue

        # Lägg till positions
        for pos in positions:
            pos_id = pos.get("id")
            position = pos.get("position", {})
            lat = position.get("lat")
            lng = position.get("lng")
            timestamp = pos.get("timestamp")
            accuracy = pos.get("accuracy")
            verified_status = pos.get("verified_status", "pending")
            corrected_position = pos.get("corrected_position")
            corrected_lat = (
                corrected_position.get("lat") if corrected_position else None
            )
            corrected_lng = (
                corrected_position.get("lng") if corrected_position else None
            )
            corrected_at = pos.get("corrected_at")
            annotation_notes = pos.get("annotation_notes")

            try:
                postgres_cursor.execute(
                    """
                    INSERT INTO track_positions (
                        id, track_id, position_lat, position_lng, timestamp, accuracy,
                        verified_status, corrected_lat, corrected_lng, corrected_at, annotation_notes
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        track_id = EXCLUDED.track_id,
                        position_lat = EXCLUDED.position_lat,
                        position_lng = EXCLUDED.position_lng,
                        timestamp = EXCLUDED.timestamp,
                        accuracy = EXCLUDED.accuracy,
                        verified_status = EXCLUDED.verified_status,
                        corrected_lat = EXCLUDED.corrected_lat,
                        corrected_lng = EXCLUDED.corrected_lng,
                        corrected_at = EXCLUDED.corrected_at,
                        annotation_notes = EXCLUDED.annotation_notes
                    """,
                    (
                        pos_id,
                        track_id,
                        lat,
                        lng,
                        timestamp,
                        accuracy,
                        verified_status,
                        corrected_lat,
                        corrected_lng,
                        corrected_at,
                        annotation_notes,
                    ),
                )
                migrated_positions += 1
            except Exception as e:
                print(f"Fel vid migrering av position {pos_id}: {e}")
                continue

    # Hämta geofences
    try:
        response = requests.get(f"{railway_url}/geofences", timeout=30)
        response.raise_for_status()
        geofences = response.json()
        print(f"Hittade {len(geofences)} geofences på Railway")
    except Exception as e:
        print(f"Fel vid hämtning av geofences: {e}")
        geofences = []

    migrated_geofences = 0
    for geofence in geofences:
        geofence_id = geofence.get("id")
        name = geofence.get("name")
        geofence_type = geofence.get("geofence", {}).get("type")
        created_at = geofence.get("created_at")

        if geofence_type == "circle":
            center = geofence.get("geofence", {}).get("center", {})
            center_lat = center.get("lat")
            center_lng = center.get("lng")
            radius_m = geofence.get("geofence", {}).get("radius_m")
            vertices_json = None
        else:
            vertices = geofence.get("geofence", {}).get("vertices", [])
            vertices_json = json.dumps(
                [{"lat": v.get("lat"), "lng": v.get("lng")} for v in vertices]
            )
            center_lat = None
            center_lng = None
            radius_m = None

        try:
            postgres_cursor.execute(
                """
                INSERT INTO geofences (
                    id, name, type, center_lat, center_lng, radius_m, vertices_json, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    type = EXCLUDED.type,
                    center_lat = EXCLUDED.center_lat,
                    center_lng = EXCLUDED.center_lng,
                    radius_m = EXCLUDED.radius_m,
                    vertices_json = EXCLUDED.vertices_json,
                    created_at = EXCLUDED.created_at
                """,
                (
                    geofence_id,
                    name,
                    geofence_type,
                    center_lat,
                    center_lng,
                    radius_m,
                    vertices_json,
                    created_at,
                ),
            )
            migrated_geofences += 1
        except Exception as e:
            print(f"Fel vid migrering av geofence {geofence_id}: {e}")
            continue

    # Commit och stäng
    postgres_conn.commit()
    postgres_cursor.close()
    postgres_conn.close()

    print(f"\nMigration klar!")
    print(f"Migrerade {migrated_tracks} tracks")
    print(f"Migrerade {migrated_positions} positions")
    print(f"Migrerade {migrated_geofences} geofences")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Användning: python migrate_from_railway_api.py <railway_backend_url> <postgres_url>"
        )
        print(
            "Exempel: python migrate_from_railway_api.py https://web-production-0198c.up.railway.app postgresql://..."
        )
        sys.exit(1)

    railway_url = sys.argv[1]
    postgres_url = sys.argv[2]

    migrate_from_api(railway_url, postgres_url)
