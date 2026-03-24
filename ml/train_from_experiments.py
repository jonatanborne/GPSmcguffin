#!/usr/bin/env python3
"""
Träna ML-modell från experiment-feedback (Reinforcement Learning).

Detta script:
1. Hämtar alla rated experiments från databasen
2. Konverterar betyg till tränings-JSON under ml/data/
3. Själva träningen: kör sedan python ml/train_only.py eller ml/analysis.py

Strategi:
- Betyg >= 7: positiva exempel (original → modellens korrigerade punkt)
- Betyg <= 3: negativa (original → original, "ingen korr bättre")
- Betyg 4–6: används inte i exporten

Kör:
    export DATABASE_URL="postgresql://..."
    python ml/train_from_experiments.py
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("psycopg2 krävs: pip install psycopg2-binary")
    sys.exit(1)

def _as_dict(val):
    """JSONB kan komma som dict eller str beroende på drivrutin."""
    if val is None:
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return {}
    return {}


def main():
    print("=" * 60, flush=True)
    print("train_from_experiments.py – export av bedömda experiment → ml/data/", flush=True)
    print("=" * 60, flush=True)

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("\nDATABASE_URL är inte satt.", flush=True)
        print("  Git Bash / Mac/Linux:", flush=True)
        print('    export DATABASE_URL="postgresql://user:pass@host:5432/dbname"', flush=True)
        print("  Windows CMD:", flush=True)
        print("    set DATABASE_URL=postgresql://user:pass@host:5432/dbname", flush=True)
        print("  Sedan från projektroten: python ml/train_from_experiments.py\n", flush=True)
        sys.exit(1)

    print("\nAnsluter till databas…", flush=True)
    conn = psycopg2.connect(database_url, connect_timeout=10)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Normaliserat status (samma idé som purge/next i backend)
    cur.execute(
        """
        SELECT id, track_id, original_track_json, corrected_track_json,
               rating, feedback_notes, model_version, status
        FROM ml_experiments
        WHERE LOWER(TRIM(COALESCE(status, ''))) = 'rated'
          AND rating IS NOT NULL
        ORDER BY id
        """
    )
    experiments = cur.fetchall()
    conn.close()
    print("  OK, fråga körd.\n", flush=True)

    if not experiments:
        print(
            "Inga rated experiments hittades (status=rated + rating satt).\n"
            "  • Kontrollera att du använder samma databas som appen.\n"
            "  • I SQL: SELECT status, COUNT(*) FROM ml_experiments GROUP BY 1;\n",
            flush=True,
        )
        sys.exit(0)

    print(f"Hittade {len(experiments)} rated experiments", flush=True)
    print(f"  Betyg: min={min(e['rating'] for e in experiments)}, max={max(e['rating'] for e in experiments)}, snitt={sum(e['rating'] for e in experiments)/len(experiments):.1f}")

    # Konvertera experiment till träningsdata
    # Strategi: Använd experiment med höga betyg (>= 7) som träningsdata
    # För låga betyg (< 4): Invertera korrigeringen (lär modellen att INTE göra så)
    
    training_data = []
    high_rating_count = 0
    low_rating_count = 0
    # Samma id för hela filen – spårbarhet och “ny batch” vs äldre exporter
    export_batch_id = datetime.now().strftime("%Y%m%dT%H%M%S")

    for exp in experiments:
        rating = exp["rating"]
        track_id = exp["track_id"]
        original = _as_dict(exp["original_track_json"])
        corrected = _as_dict(exp["corrected_track_json"])
        track_name = original.get("track_name", f"Track_{track_id}")

        # Ny struktur: original/corrected har .dog och .human med .positions
        dog_orig = (original.get("dog") or {}).get("positions", [])
        dog_corr = (corrected.get("dog") or {}).get("positions", [])
        human_orig = (original.get("human") or {}).get("positions", [])
        human_corr = (corrected.get("human") or {}).get("positions", [])

        def add_dog_training(orig_pos, corr_pos, source, notes, lineage_meta):
            row = {
                "track_id": track_id,
                "track_name": track_name,
                "track_type": "dog",
                "timestamp": orig_pos.get("timestamp"),
                "verified_status": "correct",
                "original_position": {"lat": orig_pos["lat"], "lng": orig_pos["lng"]},
                "corrected_position": {"lat": corr_pos["lat"], "lng": corr_pos["lng"]},
                "correction_distance_meters": corr_pos.get("predicted_correction_distance", 0.0),
                "accuracy": orig_pos.get("accuracy"),
                "annotation_notes": notes,
                "environment": None,
                "source": source,
            }
            row.update(lineage_meta)
            training_data.append(row)

        def add_human_training(orig_pos, corr_pos, source, notes, lineage_meta):
            row = {
                "track_id": track_id,
                "track_name": track_name,
                "track_type": "human",
                "timestamp": orig_pos.get("timestamp"),
                "verified_status": "correct",
                "original_position": {"lat": orig_pos["lat"], "lng": orig_pos["lng"]},
                "corrected_position": {"lat": corr_pos["lat"], "lng": corr_pos["lng"]},
                "correction_distance_meters": corr_pos.get("predicted_correction_distance", 0.0),
                "accuracy": orig_pos.get("accuracy"),
                "annotation_notes": notes,
                "environment": None,
                "source": source,
            }
            row.update(lineage_meta)
            training_data.append(row)

        if rating >= 7:
            high_rating_count += 1
            lineage = {
                "data_lineage": "human_rated_experiment",
                "experiment_id": exp["id"],
                "producer_model_version": exp.get("model_version"),
                "experiment_rating": rating,
                "export_batch_id": export_batch_id,
                "label_type": "accept_ml_correction",
                # Förslag: lägre än ren manuell TestLab-data; justera i analysis.py via sample_weight
                "training_weight_suggested": 0.75,
            }
            for i, orig_pos in enumerate(dog_orig):
                if i < len(dog_corr):
                    add_dog_training(
                        orig_pos,
                        dog_corr[i],
                        "experiment_high_rating",
                        f"Experiment rating: {rating}",
                        lineage,
                    )
            for i, orig_pos in enumerate(human_orig):
                if i < len(human_corr):
                    add_human_training(
                        orig_pos,
                        human_corr[i],
                        "experiment_high_rating",
                        f"Experiment rating: {rating}",
                        lineage,
                    )

        elif rating <= 3:
            low_rating_count += 1
            lineage = {
                "data_lineage": "human_rated_experiment",
                "experiment_id": exp["id"],
                "producer_model_version": exp.get("model_version"),
                "experiment_rating": rating,
                "export_batch_id": export_batch_id,
                "label_type": "reject_ml_correction",
                "training_weight_suggested": 0.55,
            }
            for orig_pos in dog_orig:
                add_dog_training(
                    orig_pos,
                    orig_pos,
                    "experiment_low_rating",
                    f"Experiment rating: {rating} (low - no correction better)",
                    lineage,
                )
            for orig_pos in human_orig:
                add_human_training(
                    orig_pos,
                    orig_pos,
                    "experiment_low_rating",
                    f"Experiment rating: {rating} (low - no correction better)",
                    lineage,
                )

    mid_count = len(experiments) - high_rating_count - low_rating_count

    print(f"\nKonverterade till träningsdata:", flush=True)
    print(
        f"  Höga betyg (>= 7): {high_rating_count} experiment → {sum(1 for d in training_data if d['source'] == 'experiment_high_rating')} positioner",
        flush=True,
    )
    print(
        f"  Låga betyg (<= 3): {low_rating_count} experiment → {sum(1 for d in training_data if d['source'] == 'experiment_low_rating')} positioner",
        flush=True,
    )
    print(f"  Mellan (4–6): {mid_count} experiment → används INTE i exporten (ännu)", flush=True)
    print(f"  Totalt: {len(training_data)} nya träningspunkter", flush=True)

    if not training_data and experiments:
        print(
            "\n*** VARNING: 0 träningspunkter ***\n"
            "Alla dina bedömningar ligger troligen i mellanintervallet 4–6, eller så saknas\n"
            "dog/human-positioner i JSON. Scriptet använder bara betyg >= 7 och <= 3.\n",
            flush=True,
        )

    # Spara som JSON
    script_dir = Path(__file__).resolve().parent
    data_dir = script_dir / "data"
    data_dir.mkdir(exist_ok=True)
    
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = data_dir / f"experiment_feedback_{timestamp_str}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(training_data, f, ensure_ascii=False, indent=2)

    print(f"\nSparat till: {out_path.resolve()}", flush=True)
    print(f"\nNästa steg:", flush=True)
    print(f"  1. Kör träning (från projektroten): python ml/train_only.py", flush=True)
    print(f"     eller full analys: python ml/analysis.py", flush=True)
    print(f"  2. Alla *.json i ml/data/ laddas in automatiskt.", flush=True)
    print(f"  3. Starta om backend så den nya modellen i ml/output/ laddas.\n", flush=True)


if __name__ == "__main__":
    main()
