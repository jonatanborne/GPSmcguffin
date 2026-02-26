#!/usr/bin/env python3
"""
Bygg träningsdataset från importerade kundspår (track_source='imported').

För varje hundposition beräknas:
- Människaposition vid SAMMA TID (eller interpolerad mellan två punkter)
- correction_distance_meters = avståndet till den tidsmatchade människapunkten
- corrected_position = där människan var när hunden var där

Kombinerar tid + rum så facit blir mer exakt.

Sparar ml/data/imported_tracks_training.json.

Kör:
  export DATABASE_URL="postgresql://..."
  python ml/build_dataset_from_imported_tracks.py
  # Valfritt: export MAX_DISTANCE_M=200  för att filtrera bort punkter > 200m
"""

import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None


def _parse_ts(ts) -> float:
    """Konvertera timestamp till sekunder sedan epoch."""
    if ts is None:
        return 0.0
    if hasattr(ts, "timestamp"):
        return ts.timestamp()
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0
    return float(ts) if ts else 0.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Avstånd i meter mellan två koordinater."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def human_position_at_time(
    t_dog: float, human_positions: list
) -> tuple:
    """
    Returnerar (lat, lng) där människan var vid tid t_dog.
    Interpolerar mellan två människapunkter om t_dog ligger mellan dem.
    Annars använder närmaste i tid.
    """
    if not human_positions:
        return (None, None)

    hp_sorted = sorted(
        [(h["lat"], h["lng"], _parse_ts(h.get("timestamp"))) for h in human_positions],
        key=lambda x: x[2],
    )

    t_before = [(lat, lng, t) for lat, lng, t in hp_sorted if t <= t_dog]
    t_after = [(lat, lng, t) for lat, lng, t in hp_sorted if t > t_dog]

    if t_before and t_after:
        lat1, lng1, t1 = t_before[-1]
        lat2, lng2, t2 = t_after[0]
        if t2 > t1:
            alpha = (t_dog - t1) / (t2 - t1)
            lat = lat1 + alpha * (lat2 - lat1)
            lng = lng1 + alpha * (lng2 - lng1)
            return (lat, lng)
        return (lat1, lng1)
    if t_before:
        return (t_before[-1][0], t_before[-1][1])
    if t_after:
        return (t_after[0][0], t_after[0][1])
    return (hp_sorted[0][0], hp_sorted[0][1])


def main():
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL är inte satt. Sätt den till din Postgres-URL.")
        sys.exit(1)

    if not psycopg2:
        print("psycopg2 krävs: pip install psycopg2-binary")
        sys.exit(1)

    script_dir = Path(__file__).resolve().parent
    data_dir = script_dir / "data"
    data_dir.mkdir(exist_ok=True)
    out_path = data_dir / "imported_tracks_training.json"

    conn = psycopg2.connect(database_url, connect_timeout=10)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        SELECT id, name, human_track_id
        FROM tracks
        WHERE track_source = 'imported' AND track_type = 'dog' AND human_track_id IS NOT NULL
        ORDER BY id
        """
    )
    dog_tracks = cur.fetchall()
    if not dog_tracks:
        print("Inga importerade hundspår med kopplat människaspår hittades.")
        conn.close()
        sys.exit(0)

    max_dist = os.environ.get("MAX_DISTANCE_M", "")
    max_dist_m = float(max_dist) if max_dist else None

    print(f"Hittade {len(dog_tracks)} importerade hundspår. Bygger träningsdata...")
    if max_dist_m:
        print(f"  Filter: endast punkter där avstånd < {max_dist_m} m")

    training = []
    skipped_far = 0

    for row in dog_tracks:
        dog_track_id = row["id"]
        dog_name = row["name"]
        human_track_id = row["human_track_id"]

        cur.execute(
            """
            SELECT position_lat AS lat, position_lng AS lng, timestamp, accuracy
            FROM track_positions
            WHERE track_id = %s
            ORDER BY timestamp
            """,
            (dog_track_id,),
        )
        dog_positions = cur.fetchall()

        cur.execute(
            """
            SELECT position_lat AS lat, position_lng AS lng, timestamp
            FROM track_positions
            WHERE track_id = %s
            ORDER BY timestamp
            """,
            (human_track_id,),
        )
        human_positions = cur.fetchall()

        if not human_positions:
            continue

        for dp in dog_positions:
            t_dog = _parse_ts(dp.get("timestamp"))
            lat_h, lng_h = human_position_at_time(t_dog, human_positions)
            if lat_h is None or lng_h is None:
                continue
            dist_m = haversine_m(dp["lat"], dp["lng"], lat_h, lng_h)
            if max_dist_m is not None and dist_m > max_dist_m:
                skipped_far += 1
                continue
            ts = dp["timestamp"]
            ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
            training.append({
                "track_id": dog_track_id,
                "track_name": dog_name,
                "track_type": "dog",
                "timestamp": ts_str,
                "verified_status": "correct",
                "original_position": {"lat": float(dp["lat"]), "lng": float(dp["lng"])},
                "corrected_position": {"lat": float(lat_h), "lng": float(lng_h)},
                "correction_distance_meters": round(dist_m, 4),
                "accuracy": float(dp["accuracy"]) if dp["accuracy"] is not None else None,
                "annotation_notes": "",
                "environment": None,
                "source": "imported_tracks",
            })

    conn.close()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(training, f, ensure_ascii=False, indent=2)

    print(f"Sparat {len(training)} positioner till {out_path}")
    if skipped_far > 0:
        print(f"  Hoppade över {skipped_far} punkter med avstånd > {max_dist_m} m")
    if training:
        dists = [d["correction_distance_meters"] for d in training]
        print(f"  correction_distance: snitt {sum(dists)/len(dists):.1f} m, max {max(dists):.1f} m")
    print("Klar. Träna sedan: python ml/analysis.py")


if __name__ == "__main__":
    main()
