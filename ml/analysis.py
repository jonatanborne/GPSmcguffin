"""
ML Analysis for GPS-korrigering

Detta script analyserar annoterad GPS-data for att forsta monster i GPS-fel
och forbereda data for ML-traning.

Steg-for-steg:
1. Ladda JSON-data
2. Inspektera grundlaggande statistik
3. Analysera GPS-felmonster
4. Berakna features for ML
5. Visualisera data
"""

import json
import math
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Tuple, Optional

# Matplotlib for grafer
import matplotlib.pyplot as plt
import seaborn as sns

# Scikit-learn for ML
from sklearn.model_selection import (
    train_test_split,
    cross_val_score,
    GridSearchCV,
    RandomizedSearchCV,
    KFold,
)
from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    ExtraTreesRegressor,
)
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler, RobustScaler

# XGBoost for advanced ML
try:
    import xgboost as xgb

    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    print("Warning: XGBoost not available. Install with: pip install xgboost")

# Konfigurera seaborn for snyggare grafer
sns.set_style("whitegrid")
plt.rcParams["figure.figsize"] = (12, 8)


def load_annotations(filename: Optional[str] = None) -> List[Dict]:
    """
    STEG 1: Ladda annoterad data fran JSON-fil(er)

    Om filename anges: Ladda den specifika filen
    Om filename är None: Ladda ALLA JSON-filer i ml/data/ och kombinera dem

    Args:
        filename: Namnet pa JSON-filen i ml/data/ (eller None for alla)

    Returns:
        Lista med alla annoterade positioner
    """
    data_dir = Path(__file__).parent / "data"

    if filename:
        # Ladda specifik fil
        data_path = data_dir / filename
        print(f"Laddar data fran: {data_path}")

        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        print(f"Laddade {len(data)} annoterade positioner")
        return data
    else:
        # Ladda ALLA JSON-filer
        json_files = list(data_dir.glob("*.json"))

        if not json_files:
            raise FileNotFoundError(f"Inga JSON-filer hittades i {data_dir}")

        print(f"Hittade {len(json_files)} JSON-fil(er) i ml/data/:")
        all_data = []

        for json_file in sorted(json_files):
            print(f"  - {json_file.name}")
            with open(json_file, "r", encoding="utf-8") as f:
                file_data = json.load(f)
            print(f"    Laddade {len(file_data)} positioner")
            all_data.extend(file_data)

        print(
            f"\nTOTALT: {len(all_data)} annoterade positioner fran {len(json_files)} fil(er)"
        )
        return all_data


def basic_statistics(data: List[Dict]) -> Dict:
    """
    STEG 2: Berakna grundlaggande statistik

    Vad vi vill veta:
    - Hur manga positioner har vi?
    - Hur ar de fordelade mellan manniskor och hundar?
    - Hur stora ar GPS-felen (correction_distance)?
    - Vad ar genomsnittet, min, max?

    Args:
        data: Lista med annotationer

    Returns:
        Dictionary med statistik
    """
    print("\n" + "=" * 60)
    print("GRUNDLAGGANDE STATISTIK")
    print("=" * 60)

    # Totalt antal positioner
    total = len(data)
    print(f"\nTotalt antal positioner: {total}")

    # Fordelning mellan manniskor och hundar
    human_count = sum(1 for d in data if d["track_type"] == "human")
    dog_count = sum(1 for d in data if d["track_type"] == "dog")
    print(f"   Manniskospar: {human_count} ({human_count / total * 100:.1f}%)")
    print(f"   Hundspar: {dog_count} ({dog_count / total * 100:.1f}%)")

    # Korrigeringsavstand (hur stora ar GPS-felen?)
    corrections = [d["correction_distance_meters"] for d in data]

    print(f"\nKorrigeringsavstand (GPS-fel):")
    print(f"   Genomsnitt: {np.mean(corrections):.2f} meter")
    print(f"   Median: {np.median(corrections):.2f} meter")
    print(f"   Min: {np.min(corrections):.2f} meter")
    print(f"   Max: {np.max(corrections):.2f} meter")
    print(f"   Standardavvikelse: {np.std(corrections):.2f} meter")

    # GPS accuracy
    accuracies = [d["accuracy"] for d in data if d["accuracy"] is not None]
    if accuracies:
        print(f"\nGPS Accuracy (rapporterad fran enheten):")
        print(f"   Genomsnitt: {np.mean(accuracies):.2f} meter")
        print(f"   Median: {np.median(accuracies):.2f} meter")
        print(f"   Min: {np.min(accuracies):.2f} meter")
        print(f"   Max: {np.max(accuracies):.2f} meter")

    # Verified status
    correct = sum(1 for d in data if d["verified_status"] == "correct")
    incorrect = sum(1 for d in data if d["verified_status"] == "incorrect")
    print(f"\nVerified Status:")
    print(f"   Correct: {correct} ({correct / total * 100:.1f}%)")
    print(f"   Incorrect: {incorrect} ({incorrect / total * 100:.1f}%)")

    return {
        "total": total,
        "human_count": human_count,
        "dog_count": dog_count,
        "avg_correction": np.mean(corrections),
        "median_correction": np.median(corrections),
        "max_correction": np.max(corrections),
        "corrections": corrections,
        "accuracies": accuracies,
    }


def analyze_error_patterns(data: List[Dict]) -> Dict:
    """
    STEG 3: Analysera GPS-felmonster

    Vi letar efter:
    1. OFFSET - Ar GPS konsekvent forskjutet at ett hall?
    2. DRIFT - Okar felet over tid?
    3. NOISE - Slumpmassiga hopp?

    Args:
        data: Lista med annotationer

    Returns:
        Dictionary med felmonster
    """
    print("\n" + "=" * 60)
    print("ANALYS AV GPS-FELMONSTER")
    print("=" * 60)

    # Berakna offset i nord/syd och ost/vast riktning
    lat_offsets = []  # Nord/Syd (positiv = norr, negativ = soder)
    lng_offsets = []  # Ost/Vast (positiv = oster, negativ = vaster)

    for d in data:
        # Skippa positioner utan corrected_position
        if d.get("corrected_position") is None:
            continue

        lat_offset = d["corrected_position"]["lat"] - d["original_position"]["lat"]
        lng_offset = d["corrected_position"]["lng"] - d["original_position"]["lng"]

        lat_offsets.append(lat_offset)
        lng_offsets.append(lng_offset)

    print(f"\nGPS Offset (riktning av fel):")
    print(
        f"   Genomsnittlig Nord/Syd-offset: {np.mean(lat_offsets):.6f} grader ({np.mean(lat_offsets) * 111000:.2f} meter)"
    )
    print(
        f"   Genomsnittlig Ost/Vast-offset: {np.mean(lng_offsets):.6f} grader ({np.mean(lng_offsets) * 111000 * np.cos(np.radians(59.37)):.2f} meter)"
    )

    if abs(np.mean(lat_offsets)) > 0.0001 or abs(np.mean(lng_offsets)) > 0.0001:
        print("   GPS har ett konsekvent offset - modellen kan lara sig detta!")
    else:
        print("   Inget tydligt offset - felen ar mer slumpmassiga")

    # Korrelation mellan GPS accuracy och korrigeringsavstand
    # Hypotes: Samre accuracy -> storre korrigering behovs?
    accuracies = [d["accuracy"] for d in data if d["accuracy"] is not None]
    corrections_with_acc = [
        d["correction_distance_meters"] for d in data if d["accuracy"] is not None
    ]

    if len(accuracies) > 0:
        correlation = np.corrcoef(accuracies, corrections_with_acc)[0, 1]
        print(f"\nKorrelation mellan GPS accuracy och faktiskt fel:")
        print(f"   Korrelationskoefficient: {correlation:.3f}")

        if correlation > 0.5:
            print("   Stark positiv korrelation - GPS accuracy ar en bra feature!")
        elif correlation > 0.3:
            print("   Mattlig korrelation - GPS accuracy hjalper nagot")
        else:
            print("   Svag korrelation - GPS accuracy kanske inte ar tillforlitlig")

    return {
        "lat_offsets": lat_offsets,
        "lng_offsets": lng_offsets,
        "avg_lat_offset": np.mean(lat_offsets),
        "avg_lng_offset": np.mean(lng_offsets),
        "correlation_accuracy_correction": correlation if len(accuracies) > 0 else None,
    }


def analyze_per_track(data: List[Dict]) -> Dict:
    """
    Analysera varje spår individuellt

    Grupperar data per track_name och analyserar varje spår separat.
    Detta hjälper oss förstå:
    - Vilka spår har störst GPS-fel?
    - Är det skillnad mellan olika spår?
    - Vilka spår är mest problematiska?

    Args:
        data: Lista med alla annotationer

    Returns:
        Dictionary med statistik per spår
    """
    print("\n" + "=" * 60)
    print("ANALYS PER SPAR")
    print("=" * 60)

    # Gruppera data per track_name eller track_id
    tracks_dict = {}
    for d in data:
        # Försök använda track_name först, sedan track_id, sedan "Unknown"
        track_name = d.get("track_name")
        if not track_name:
            track_id = d.get("track_id")
            if track_id:
                track_name = f"Track_{track_id}"
            else:
                track_name = "Unknown_Track"

        if track_name not in tracks_dict:
            tracks_dict[track_name] = []
        tracks_dict[track_name].append(d)

    print(f"\nHittade {len(tracks_dict)} unika spar:")

    track_stats = {}

    for track_name, track_data in sorted(tracks_dict.items()):
        print(f"\n{'=' * 60}")
        print(f"SPAR: {track_name}")
        print(f"{'=' * 60}")

        # Grundstatistik för detta spår
        corrections = [d["correction_distance_meters"] for d in track_data]
        human_count = sum(1 for d in track_data if d["track_type"] == "human")
        dog_count = sum(1 for d in track_data if d["track_type"] == "dog")

        print(f"  Positioner: {len(track_data)}")
        print(f"    - Manniskospar: {human_count}")
        print(f"    - Hundspar: {dog_count}")
        print(f"  GPS-fel:")
        print(f"    - Genomsnitt: {np.mean(corrections):.2f} meter")
        print(f"    - Median: {np.median(corrections):.2f} meter")
        print(f"    - Min: {np.min(corrections):.2f} meter")
        print(f"    - Max: {np.max(corrections):.2f} meter")

        # GPS accuracy för detta spår
        accuracies = [d["accuracy"] for d in track_data if d["accuracy"] is not None]
        if accuracies:
            print(f"  GPS Accuracy:")
            print(f"    - Genomsnitt: {np.mean(accuracies):.2f} meter")
            print(f"    - Median: {np.median(accuracies):.2f} meter")

        # Spara statistik
        track_stats[track_name] = {
            "count": len(track_data),
            "human_count": human_count,
            "dog_count": dog_count,
            "avg_correction": np.mean(corrections),
            "median_correction": np.median(corrections),
            "max_correction": np.max(corrections),
            "avg_accuracy": np.mean(accuracies) if accuracies else None,
        }

    return track_stats


def visualize_data(data: List[Dict], track_stats: Dict):
    """
    Visualisera GPS-data med grafer

    Skapar flera grafer för att förstå mönster i GPS-fel:
    1. Histogram över GPS-fel
    2. Scatter plot: GPS accuracy vs faktiskt fel
    3. Box plot per spår
    4. Korrigeringsavstånd över tid
    """
    print("\nSkapar visualiseringar...")

    # Förbered data
    corrections = [d["correction_distance_meters"] for d in data]
    accuracies = [d["accuracy"] for d in data if d["accuracy"] is not None]
    corrections_with_acc = [
        d["correction_distance_meters"] for d in data if d["accuracy"] is not None
    ]
    accuracies_filtered = [d["accuracy"] for d in data if d["accuracy"] is not None]

    # Skapa figuren med subplots
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle("GPS-korrigering: Dataanalys", fontsize=16, fontweight="bold")

    # 1. Histogram över GPS-fel
    ax1 = axes[0, 0]
    ax1.hist(corrections, bins=50, edgecolor="black", alpha=0.7, color="skyblue")
    ax1.set_xlabel("GPS-fel (meter)")
    ax1.set_ylabel("Antal positioner")
    ax1.set_title("Fördelning av GPS-fel")
    ax1.axvline(
        np.mean(corrections),
        color="red",
        linestyle="--",
        label=f"Medel: {np.mean(corrections):.2f}m",
    )
    ax1.axvline(
        np.median(corrections),
        color="green",
        linestyle="--",
        label=f"Median: {np.median(corrections):.2f}m",
    )
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # 2. Scatter plot: GPS accuracy vs faktiskt fel
    ax2 = axes[0, 1]
    ax2.scatter(
        accuracies_filtered, corrections_with_acc, alpha=0.5, s=20, color="coral"
    )
    ax2.set_xlabel("GPS Accuracy (rapporterad, meter)")
    ax2.set_ylabel("Faktiskt GPS-fel (meter)")
    ax2.set_title("GPS Accuracy vs Faktiskt Fel")

    # Lägg till trendlinje
    if len(accuracies_filtered) > 1:
        z = np.polyfit(accuracies_filtered, corrections_with_acc, 1)
        p = np.poly1d(z)
        ax2.plot(
            accuracies_filtered,
            p(accuracies_filtered),
            "r--",
            alpha=0.8,
            label="Trendlinje",
        )
        ax2.legend()
    ax2.grid(True, alpha=0.3)

    # 3. Box plot per spår (top 6 spår)
    ax3 = axes[1, 0]
    sorted_tracks = sorted(
        track_stats.items(), key=lambda x: x[1]["count"], reverse=True
    )[:6]  # Top 6 spår

    track_names = [name for name, _ in sorted_tracks]
    track_corrections = []
    for track_name, _ in sorted_tracks:
        track_data = [d for d in data if d.get("track_name") == track_name]
        track_corrections.append([d["correction_distance_meters"] for d in track_data])

    if track_corrections:
        bp = ax3.boxplot(track_corrections, tick_labels=track_names, patch_artist=True)
        for patch in bp["boxes"]:
            patch.set_facecolor("lightblue")
            patch.set_alpha(0.7)
        ax3.set_ylabel("GPS-fel (meter)")
        ax3.set_title("GPS-fel per spår (Top 6)")
        ax3.tick_params(axis="x", rotation=45)
        ax3.grid(True, alpha=0.3)

    # 4. Korrigeringsavstånd över tid (för första spåret med många positioner)
    ax4 = axes[1, 1]
    if data:
        # Hitta spår med flest positioner
        track_counts = {}
        for d in data:
            track_name = d.get("track_name", "Unknown")
            if track_name not in track_counts:
                track_counts[track_name] = []
            track_counts[track_name].append(d)

        if track_counts:
            largest_track = max(track_counts.items(), key=lambda x: len(x[1]))
            track_name, track_data = largest_track

            # Sortera efter timestamp
            track_data_sorted = sorted(track_data, key=lambda x: x.get("timestamp", ""))

            timestamps = [i for i in range(len(track_data_sorted))]
            corrections_timeline = [
                d["correction_distance_meters"] for d in track_data_sorted
            ]

            ax4.plot(
                timestamps, corrections_timeline, alpha=0.6, linewidth=1, color="purple"
            )
            ax4.set_xlabel("Position index (sorterat efter tid)")
            ax4.set_ylabel("GPS-fel (meter)")
            ax4.set_title(f"GPS-fel över tid: {track_name}")
            ax4.grid(True, alpha=0.3)

    plt.tight_layout()

    # Spara figuren
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "gps_analysis.png"
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Graf sparad till: {output_path}")

    # Visa figuren (kommentera bort om du kör headless)
    # plt.show()
    plt.close()


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Beräkna avstånd mellan två GPS-punkter i meter (Haversine formula)
    """
    R = 6371000  # Jordens radie i meter
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def prepare_features_advanced(
    data: List[Dict],
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Förbättrad feature engineering för kommersiell ML-modell

    Features:
    - GPS accuracy (rapporterad) + accuracy^2 (non-linear)
    - Original position (lat, lng) + normaliserad position
    - Track type (human/dog)
    - Timestamp features (hour, day_of_week, sin/cos encoding)
    - Hastighet (m/s) baserat på tidigare positioner
    - Acceleration (m/s²)
    - Avstånd till tidigare positioner (1, 2, 3 steg bakåt)
    - Riktning (bearing) i grader
    - Rolling statistics (medelvärde och std dev för senaste 3 positioner)
    - Interaktioner: accuracy * speed, accuracy * distance

    Target:
    - Korrigeringsavstånd (correction_distance_meters)
    """
    # Sortera data per spår och timestamp för att kunna beräkna hastighet
    tracks = {}
    for d in data:
        track_id = d.get("track_id") or d.get("track_name", "unknown")
        if track_id not in tracks:
            tracks[track_id] = []
        tracks[track_id].append(d)

    # Sortera varje spår efter timestamp
    for track_id in tracks:
        tracks[track_id].sort(key=lambda x: x.get("timestamp", ""), reverse=False)

    features = []
    targets = []
    feature_names = []

    for track_id, track_data in tracks.items():
        for i, d in enumerate(track_data):
            if d.get("corrected_position") is None:
                continue

            feature_row = []

            # GPS accuracy (baseline feature)
            accuracy = d.get("accuracy", 0.0) or 0.0
            feature_row.append(accuracy)
            if not feature_names:
                feature_names.append("gps_accuracy")

            # GPS accuracy squared (non-linear relationship)
            feature_row.append(accuracy**2)
            if len(feature_names) == 1:
                feature_names.append("gps_accuracy_squared")

            # Original position
            orig_lat = d["original_position"]["lat"]
            orig_lng = d["original_position"]["lng"]
            feature_row.extend([orig_lat, orig_lng])
            if len(feature_names) == 2:
                feature_names.extend(["latitude", "longitude"])

            # Normaliserad position (centrerat kring medelvärdet för spåret)
            if len(track_data) > 1:
                mean_lat = np.mean([p["original_position"]["lat"] for p in track_data])
                mean_lng = np.mean([p["original_position"]["lng"] for p in track_data])
                feature_row.extend([orig_lat - mean_lat, orig_lng - mean_lng])
                if len(feature_names) == 4:
                    feature_names.extend(["lat_normalized", "lng_normalized"])
            else:
                feature_row.extend([0.0, 0.0])
                if len(feature_names) == 4:
                    feature_names.extend(["lat_normalized", "lng_normalized"])

            # Track type (human=1, dog=0)
            track_type = 1 if d.get("track_type") == "human" else 0
            feature_row.append(track_type)
            if len(feature_names) == 6:
                feature_names.append("track_type_human")

            # Timestamp features med sin/cos encoding (cyklisk data)
            try:
                timestamp = d.get("timestamp", "")
                if timestamp:
                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    hour = dt.hour
                    weekday = dt.weekday()

                    # Sin/cos encoding för cyklisk data
                    feature_row.append(math.sin(2 * math.pi * hour / 24))
                    feature_row.append(math.cos(2 * math.pi * hour / 24))
                    feature_row.append(math.sin(2 * math.pi * weekday / 7))
                    feature_row.append(math.cos(2 * math.pi * weekday / 7))
                    if len(feature_names) == 7:
                        feature_names.extend(
                            ["hour_sin", "hour_cos", "weekday_sin", "weekday_cos"]
                        )
                else:
                    feature_row.extend([0.0, 1.0, 0.0, 1.0])
                    if len(feature_names) == 7:
                        feature_names.extend(
                            ["hour_sin", "hour_cos", "weekday_sin", "weekday_cos"]
                        )
            except Exception:
                feature_row.extend([0.0, 1.0, 0.0, 1.0])
                if len(feature_names) == 7:
                    feature_names.extend(
                        ["hour_sin", "hour_cos", "weekday_sin", "weekday_cos"]
                    )

            # Hastighet och acceleration (baserat på tidigare positioner)
            speed = 0.0
            acceleration = 0.0
            distance_prev_1 = 0.0
            distance_prev_2 = 0.0
            distance_prev_3 = 0.0
            bearing = 0.0

            if i > 0:
                prev_d = track_data[i - 1]
                prev_lat = prev_d["original_position"]["lat"]
                prev_lng = prev_d["original_position"]["lng"]

                # Avstånd till tidigare position
                distance_prev_1 = haversine_distance(
                    orig_lat, orig_lng, prev_lat, prev_lng
                )

                # Beräkna hastighet (m/s)
                try:
                    curr_time = datetime.fromisoformat(
                        d.get("timestamp", "").replace("Z", "+00:00")
                    )
                    prev_time = datetime.fromisoformat(
                        prev_d.get("timestamp", "").replace("Z", "+00:00")
                    )
                    time_diff = (curr_time - prev_time).total_seconds()
                    if time_diff > 0:
                        speed = distance_prev_1 / time_diff
                except Exception:
                    pass

                # Riktning (bearing) i grader
                try:
                    lat1_rad = math.radians(prev_lat)
                    lat2_rad = math.radians(orig_lat)
                    delta_lng = math.radians(orig_lng - prev_lng)

                    y = math.sin(delta_lng) * math.cos(lat2_rad)
                    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(
                        lat1_rad
                    ) * math.cos(lat2_rad) * math.cos(delta_lng)
                    bearing = math.degrees(math.atan2(y, x))
                    if bearing < 0:
                        bearing += 360
                except Exception:
                    pass

                # Acceleration (om vi har minst 2 tidigare positioner)
                if i > 1:
                    prev2_d = track_data[i - 2]
                    prev2_lat = prev2_d["original_position"]["lat"]
                    prev2_lng = prev2_d["original_position"]["lng"]
                    distance_prev_2 = haversine_distance(
                        prev_lat, prev_lng, prev2_lat, prev2_lng
                    )

                    try:
                        prev2_time = datetime.fromisoformat(
                            prev2_d.get("timestamp", "").replace("Z", "+00:00")
                        )
                        prev_time = datetime.fromisoformat(
                            prev_d.get("timestamp", "").replace("Z", "+00:00")
                        )
                        time_diff_prev = (prev_time - prev2_time).total_seconds()
                        if time_diff_prev > 0:
                            prev_speed = distance_prev_2 / time_diff_prev
                            if time_diff > 0:
                                acceleration = (speed - prev_speed) / time_diff
                    except Exception:
                        pass

                    # Avstånd 3 steg bakåt
                    if i > 2:
                        prev3_d = track_data[i - 3]
                        prev3_lat = prev3_d["original_position"]["lat"]
                        prev3_lng = prev3_d["original_position"]["lng"]
                        distance_prev_3 = haversine_distance(
                            prev2_lat, prev2_lng, prev3_lat, prev3_lng
                        )

            feature_row.append(speed)
            feature_row.append(acceleration)
            feature_row.append(distance_prev_1)
            feature_row.append(distance_prev_2)
            feature_row.append(distance_prev_3)
            feature_row.append(bearing)
            if len(feature_names) == 11:
                feature_names.extend(
                    [
                        "speed_ms",
                        "acceleration_ms2",
                        "distance_prev_1",
                        "distance_prev_2",
                        "distance_prev_3",
                        "bearing_degrees",
                    ]
                )

            # Rolling statistics (medelvärde och std dev för senaste 3 positioner)
            if i >= 2:
                recent_corrections = [
                    track_data[j]["correction_distance_meters"]
                    for j in range(max(0, i - 2), i)
                ]
                recent_mean = np.mean(recent_corrections)
                recent_std = (
                    np.std(recent_corrections) if len(recent_corrections) > 1 else 0.0
                )
            else:
                recent_mean = 0.0
                recent_std = 0.0

            feature_row.append(recent_mean)
            feature_row.append(recent_std)
            if len(feature_names) == 17:
                feature_names.extend(
                    ["rolling_mean_correction", "rolling_std_correction"]
                )

            # Interaktioner (viktiga för non-linear relationships)
            feature_row.append(accuracy * speed)
            feature_row.append(accuracy * distance_prev_1)
            feature_row.append(speed * distance_prev_1)
            if len(feature_names) == 19:
                feature_names.extend(
                    ["accuracy_x_speed", "accuracy_x_distance", "speed_x_distance"]
                )

            features.append(feature_row)
            targets.append(d["correction_distance_meters"])

    return np.array(features), np.array(targets), feature_names


def train_ml_model(data: List[Dict]):
    """
    Träna och optimera flera ML-modeller för kommersiell GPS-korrigering

    Steg:
    1. Förbättrad feature engineering (22 features)
    2. Träna flera modeller (Random Forest, Gradient Boosting, Extra Trees, XGBoost)
    3. Hyperparameter tuning med RandomizedSearchCV
    4. Cross-validation för robust utvärdering
    5. Välj bästa modellen baserat på test performance
    """
    print("\nForbereder avancerade features...")
    X, y, feature_names = prepare_features_advanced(data)

    if len(X) == 0:
        print("  Ingen data att trana pa!")
        return

    print(f"  {len(X)} positioner med {len(feature_names)} features")
    print(
        f"  Features: {', '.join(feature_names[:5])}... (+ {len(feature_names) - 5} fler)"
    )

    # Ta bort outliers (positioner med extremt stora korrigeringar)
    # Behöll 99% av datan (ta bort top 1% outliers)
    outlier_threshold = np.percentile(y, 99)
    mask = y <= outlier_threshold
    X = X[mask]
    y = y[mask]
    print(
        f"  Efter outlier removal: {len(X)} positioner (removed {np.sum(~mask)} outliers)"
    )

    # Dela upp i train/test (stratified per track om möjligt)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    print(f"\nTrain set: {len(X_train)} positioner")
    print(f"Test set: {len(X_test)} positioner")

    # Feature scaling (RobustScaler är bättre för outliers)
    scaler = RobustScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Definiera modeller att testa
    models = {}

    # 1. Random Forest
    print("\n" + "=" * 60)
    print("1. RANDOM FOREST")
    print("=" * 60)
    rf_param_grid = {
        "n_estimators": [100, 200, 300],
        "max_depth": [10, 15, 20, None],
        "min_samples_split": [2, 5, 10],
        "min_samples_leaf": [1, 2, 4],
    }
    rf_base = RandomForestRegressor(random_state=42, n_jobs=-1)
    rf_search = RandomizedSearchCV(
        rf_base,
        rf_param_grid,
        n_iter=20,
        cv=5,
        scoring="neg_mean_absolute_error",
        random_state=42,
        n_jobs=-1,
        verbose=1,
    )
    rf_search.fit(X_train_scaled, y_train)
    models["Random Forest"] = {
        "model": rf_search.best_estimator_,
        "best_params": rf_search.best_params_,
        "cv_score": -rf_search.best_score_,
    }

    # 2. Gradient Boosting
    print("\n" + "=" * 60)
    print("2. GRADIENT BOOSTING")
    print("=" * 60)
    gb_param_grid = {
        "n_estimators": [100, 200, 300],
        "max_depth": [3, 5, 7],
        "learning_rate": [0.01, 0.05, 0.1],
        "min_samples_split": [2, 5, 10],
    }
    gb_base = GradientBoostingRegressor(random_state=42)
    gb_search = RandomizedSearchCV(
        gb_base,
        gb_param_grid,
        n_iter=20,
        cv=5,
        scoring="neg_mean_absolute_error",
        random_state=42,
        n_jobs=-1,
        verbose=1,
    )
    gb_search.fit(X_train_scaled, y_train)
    models["Gradient Boosting"] = {
        "model": gb_search.best_estimator_,
        "best_params": gb_search.best_params_,
        "cv_score": -gb_search.best_score_,
    }

    # 3. Extra Trees
    print("\n" + "=" * 60)
    print("3. EXTRA TREES")
    print("=" * 60)
    et_param_grid = {
        "n_estimators": [100, 200, 300],
        "max_depth": [10, 15, 20, None],
        "min_samples_split": [2, 5, 10],
    }
    et_base = ExtraTreesRegressor(random_state=42, n_jobs=-1)
    et_search = RandomizedSearchCV(
        et_base,
        et_param_grid,
        n_iter=20,
        cv=5,
        scoring="neg_mean_absolute_error",
        random_state=42,
        n_jobs=-1,
        verbose=1,
    )
    et_search.fit(X_train_scaled, y_train)
    models["Extra Trees"] = {
        "model": et_search.best_estimator_,
        "best_params": et_search.best_params_,
        "cv_score": -et_search.best_score_,
    }

    # 4. XGBoost (om tillgängligt)
    if XGBOOST_AVAILABLE:
        print("\n" + "=" * 60)
        print("4. XGBOOST")
        print("=" * 60)
        xgb_param_grid = {
            "n_estimators": [100, 200, 300],
            "max_depth": [3, 5, 7],
            "learning_rate": [0.01, 0.05, 0.1],
            "subsample": [0.8, 0.9, 1.0],
            "colsample_bytree": [0.8, 0.9, 1.0],
        }
        xgb_base = xgb.XGBRegressor(random_state=42, n_jobs=-1)
        xgb_search = RandomizedSearchCV(
            xgb_base,
            xgb_param_grid,
            n_iter=20,
            cv=5,
            scoring="neg_mean_absolute_error",
            random_state=42,
            n_jobs=-1,
            verbose=1,
        )
        xgb_search.fit(X_train_scaled, y_train)
        models["XGBoost"] = {
            "model": xgb_search.best_estimator_,
            "best_params": xgb_search.best_params_,
            "cv_score": -xgb_search.best_score_,
        }

    # Utvärdera alla modeller på test set
    print("\n" + "=" * 60)
    print("JAMFORELSE AV MODELLER")
    print("=" * 60)

    results = []
    for name, model_info in models.items():
        model = model_info["model"]
        y_pred_test = model.predict(X_test_scaled)

        test_mae = mean_absolute_error(y_test, y_pred_test)
        test_rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
        test_r2 = r2_score(y_test, y_pred_test)

        results.append(
            {
                "name": name,
                "model": model,
                "cv_mae": model_info["cv_score"],
                "test_mae": test_mae,
                "test_rmse": test_rmse,
                "test_r2": test_r2,
                "params": model_info["best_params"],
            }
        )

        print(f"\n{name}:")
        print(f"  CV MAE: {model_info['cv_score']:.4f} meter")
        print(f"  Test MAE: {test_mae:.4f} meter")
        print(f"  Test RMSE: {test_rmse:.4f} meter")
        print(f"  Test R²: {test_r2:.4f}")

    # Välj bästa modellen (lägst test MAE)
    best_model_info = min(results, key=lambda x: x["test_mae"])
    best_model = best_model_info["model"]
    best_name = best_model_info["name"]

    print("\n" + "=" * 60)
    print(f"BESTA MODELL: {best_name}")
    print("=" * 60)
    print(f"  Test MAE: {best_model_info['test_mae']:.4f} meter")
    print(f"  Test RMSE: {best_model_info['test_rmse']:.4f} meter")
    print(f"  Test R²: {best_model_info['test_r2']:.4f}")
    print(f"\n  Hyperparameters:")
    for param, value in best_model_info["params"].items():
        print(f"    {param}: {value}")

    # Feature importance för bästa modellen
    if hasattr(best_model, "feature_importances_"):
        print(f"\n  Top 10 Viktigaste Features:")
        importances = best_model.feature_importances_
        top_indices = np.argsort(importances)[-10:][::-1]
        for idx in top_indices:
            print(f"    {feature_names[idx]}: {importances[idx]:.4f}")

    # Visualisera förutsägelser för bästa modellen
    y_pred_test_best = best_model.predict(X_test_scaled)
    visualize_predictions(y_test, y_pred_test_best, best_model_info["test_mae"])

    # Spara bästa modellen och scaler
    import pickle

    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)

    # Spara modell
    model_path = output_dir / "gps_correction_model_best.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(best_model, f)
    print(f"\n  Modell sparad till: {model_path}")

    # Spara scaler
    scaler_path = output_dir / "gps_correction_scaler.pkl"
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)
    print(f"  Scaler sparad till: {scaler_path}")

    # Spara feature names
    feature_names_path = output_dir / "gps_correction_feature_names.pkl"
    with open(feature_names_path, "wb") as f:
        pickle.dump(feature_names, f)
    print(f"  Feature names sparad till: {feature_names_path}")

    # Spara modellinfo
    model_info_path = output_dir / "gps_correction_model_info.json"
    model_info = {
        "best_model": best_name,
        "test_mae": float(best_model_info["test_mae"]),
        "test_rmse": float(best_model_info["test_rmse"]),
        "test_r2": float(best_model_info["test_r2"]),
        "hyperparameters": best_model_info["params"],
        "feature_names": feature_names,
    }
    with open(model_info_path, "w", encoding="utf-8") as f:
        json.dump(model_info, f, indent=2, ensure_ascii=False)
    print(f"  Modellinfo sparad till: {model_info_path}")


def visualize_predictions(y_true: np.ndarray, y_pred: np.ndarray, mae: float):
    """
    Visualisera ML-modellens förutsägelser
    """
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle(
        f"ML-modell: Förutsägelser (MAE: {mae:.3f}m)", fontsize=14, fontweight="bold"
    )

    # Scatter plot: True vs Predicted
    ax1 = axes[0]
    ax1.scatter(y_true, y_pred, alpha=0.5, s=20, color="steelblue")
    ax1.plot(
        [y_true.min(), y_true.max()],
        [y_true.min(), y_true.max()],
        "r--",
        lw=2,
        label="Perfekt förutsägelse",
    )
    ax1.set_xlabel("Faktiskt GPS-fel (meter)")
    ax1.set_ylabel("Förutsagt GPS-fel (meter)")
    ax1.set_title("True vs Predicted")
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Residual plot
    ax2 = axes[1]
    residuals = y_true - y_pred
    ax2.scatter(y_pred, residuals, alpha=0.5, s=20, color="coral")
    ax2.axhline(y=0, color="r", linestyle="--", lw=2)
    ax2.set_xlabel("Förutsagt GPS-fel (meter)")
    ax2.set_ylabel("Residual (Faktiskt - Förutsagt)")
    ax2.set_title("Residual Plot")
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()

    # Spara
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "ml_predictions.png"
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Förutsägelsegraf sparad till: {output_path}")

    plt.close()


def main():
    """
    Huvudfunktion - kor all analys

    Steg:
    1. Ladda alla data
    2. Analysera varje spår individuellt
    3. Analysera all data kombinerat
    """
    print("\n" + "=" * 60)
    print("ML-ANALYS: GPS-korrigering")
    print("=" * 60)

    # Steg 1: Ladda data (alla JSON-filer automatiskt)
    print("\nLaddar alla JSON-filer fran ml/data/...")
    data = load_annotations()  # None = ladda alla filer

    # Steg 2: Analysera varje spår individuellt
    track_stats = analyze_per_track(data)

    # Steg 3: Grundlaggande statistik (TOTALT - alla spår kombinerat)
    print("\n" + "=" * 60)
    print("KOMBINERAD ANALYS (ALLA SPAR)")
    print("=" * 60)
    stats = basic_statistics(data)

    # Steg 4: Analysera felmonster (TOTALT)
    patterns = analyze_error_patterns(data)

    # Steg 5: Jämför spår
    print("\n" + "=" * 60)
    print("JAMFORELSE MELLAN SPAR")
    print("=" * 60)

    # Sortera spår efter genomsnittligt GPS-fel
    sorted_tracks = sorted(
        track_stats.items(), key=lambda x: x[1]["avg_correction"], reverse=True
    )

    print("\nSpar sorterade efter genomsnittligt GPS-fel (storst forst):")
    for i, (track_name, stats) in enumerate(sorted_tracks, 1):
        print(
            f"  {i}. {track_name}: {stats['avg_correction']:.2f}m (n={stats['count']})"
        )

    print("\n" + "=" * 60)
    print("ANALYS KLAR!")
    print("=" * 60)
    print(f"\nSammanfattning (ALLA SPAR KOMBINERAT):")
    print(f"  - Totalt antal positioner: {len(data)}")
    print(f"  - Antal unika spar: {len(track_stats)}")
    print(f"  - Genomsnittligt GPS-fel: {stats['avg_correction']:.2f} meter")
    print(f"  - Max GPS-fel: {stats['max_correction']:.2f} meter")
    if patterns["correlation_accuracy_correction"]:
        print(
            f"  - Korrelation accuracy/fel: {patterns['correlation_accuracy_correction']:.3f}"
        )
    # Steg 6: Visualisera data
    print("\n" + "=" * 60)
    print("VISUALISERING")
    print("=" * 60)
    visualize_data(data, track_stats)

    # Steg 7: Beräkna features och träna ML-modell
    print("\n" + "=" * 60)
    print("ML-MODELL TRÄNING")
    print("=" * 60)
    train_ml_model(data)

    print("\n" + "=" * 60)
    print("ALLT KLART!")
    print("=" * 60)


if __name__ == "__main__":
    main()
