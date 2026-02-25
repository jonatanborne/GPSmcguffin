#!/usr/bin/env python3
"""
Importera kundspår från Dogtracks-CSV till vår tracks/track_positions-struktur.

Indata:
- Header:  Dogtracks_20251119_Tracks_Header.csv
    Kolumner: Id, Name, PersonTrack, DogTrack
- Person:   Dogtracks_20251119_Tracks_Person.csv
    Kolumner: TrackId, Latitude, Longitude, TimeStamp
- Dog:      Dogtracks_20251119_Tracks_Dog.csv
    Samma struktur som Person.

Strategi:
- För varje rad i Header skapar vi:
  - Ett människaspår (track_type='human', track_source='imported')
  - Ett hundspår (track_type='dog', human_track_id = människaspåret, track_source='imported')
- Person/Dog-CSV kopplas in via TrackId -> respektive nyskapat track.id.
"""

import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import Dict

from main import (
    get_db,
    get_cursor,
    execute_query,
    get_last_insert_id,
)


def _parse_latlng(value: str) -> float:
    """
    Konvertera sträng som \"56,7652753822022\" till float 56.7652753822022.
    """
    if value is None:
        raise ValueError("Tom koordinat")
    s = value.strip().strip('"')
    s = s.replace(",", ".")
    return float(s)


def import_header_tracks(header_csv: Path) -> Dict[str, Dict[int, int]]:
    """
    Skapa tracks för alla rader i header-filen.

    Returnerar två mappingar:
    - 'person': CSV TrackId -> track.id (human)
    - 'dog':    CSV TrackId -> track.id (dog)
    """
    conn = get_db()
    cursor = get_cursor(conn)
    now = datetime.now().isoformat()

    person_map: Dict[int, int] = {}
    dog_map: Dict[int, int] = {}

    with header_csv.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            case_id = row.get("Id")
            name = (row.get("Name") or "").strip() or f"Case {case_id}"

            try:
                person_track_csv = int(row["PersonTrack"])
                dog_track_csv = int(row["DogTrack"])
            except (KeyError, ValueError) as e:
                print(f"Hoppar över rad i header (ogiltiga TrackId): {row} ({e})")
                continue

            # Skapa människaspår
            execute_query(
                cursor,
                """
                INSERT INTO tracks (name, track_type, created_at, human_track_id, track_source)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"{name} [Person {case_id}]", "human", now, None, "imported"),
            )
            human_track_id = get_last_insert_id(cursor)

            # Skapa hundspår, kopplat till människaspåret
            execute_query(
                cursor,
                """
                INSERT INTO tracks (name, track_type, created_at, human_track_id, track_source)
                VALUES (?, ?, ?, ?, ?)
                """,
                (f"{name} [Dog {case_id}]", "dog", now, human_track_id, "imported"),
            )
            dog_track_id = get_last_insert_id(cursor)

            person_map[person_track_csv] = human_track_id
            dog_map[dog_track_csv] = dog_track_id

    conn.commit()
    conn.close()

    return {"person": person_map, "dog": dog_map}


def import_positions(positions_csv: Path, id_map: Dict[int, int], label: str) -> int:
    """
    Importera positioner från en person- eller hund-CSV till track_positions.

    id_map: CSV TrackId -> track.id i databasen.
    label:  'person' eller 'dog' (används endast för loggning).

    Returnerar antal importerade positioner.
    """
    conn = get_db()
    cursor = get_cursor(conn)

    imported_count = 0

    with positions_csv.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue

            try:
                track_id_csv = int(row["TrackId"])
            except (KeyError, ValueError):
                continue

            track_id_db = id_map.get(track_id_csv)
            if not track_id_db:
                # Track finns inte i header-mappen (t.ex. extra spår) – hoppa över.
                continue

            try:
                lat = _parse_latlng(row["Latitude"])
                lng = _parse_latlng(row["Longitude"])
            except Exception as e:
                print(f"Ogiltig koordinat i {label}-CSV (TrackId={track_id_csv}): {e}")
                continue

            timestamp = row.get("TimeStamp") or ""

            execute_query(
                cursor,
                """
                INSERT INTO track_positions (
                    track_id, position_lat, position_lng, timestamp,
                    accuracy, verified_status, corrected_lat, corrected_lng,
                    corrected_at, annotation_notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    track_id_db,
                    lat,
                    lng,
                    timestamp,
                    None,
                    "pending",
                    None,
                    None,
                    None,
                    None,
                ),
            )
            imported_count += 1

    conn.commit()
    conn.close()

    return imported_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Importera Dogtracks CSV-filer till tracks/track_positions."
    )
    parser.add_argument("header_csv", type=Path, help="Sökväg till *Tracks_Header.csv")
    parser.add_argument("person_csv", type=Path, help="Sökväg till *Tracks_Person.csv")
    parser.add_argument("dog_csv", type=Path, help="Sökväg till *Tracks_Dog.csv")

    args = parser.parse_args()

    if not args.header_csv.exists():
        raise SystemExit(f"Header-fil hittas inte: {args.header_csv}")
    if not args.person_csv.exists():
        raise SystemExit(f"Person-fil hittas inte: {args.person_csv}")
    if not args.dog_csv.exists():
        raise SystemExit(f"Dog-fil hittas inte: {args.dog_csv}")

    print("Importerar header (tracks)...")
    maps = import_header_tracks(args.header_csv)
    person_map = maps["person"]
    dog_map = maps["dog"]
    print(f"Skapade {len(person_map)} människaspår och {len(dog_map)} hundspår (track_source='imported').")

    print("Importerar personpositioner...")
    person_positions = import_positions(args.person_csv, person_map, "person")
    print(f"Importerade {person_positions} person-positioner.")

    print("Importerar hundpositioner...")
    dog_positions = import_positions(args.dog_csv, dog_map, "dog")
    print(f"Importerade {dog_positions} hund-positioner.")

    print("Klar.")


if __name__ == "__main__":
    main()

