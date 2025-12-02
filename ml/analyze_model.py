"""
Avancerad analys av tränad ML-modell

Detta script analyserar en tränad modell för att:
1. Identifiera var modellen har stora fel
2. Analysera feature importance i detalj
3. Analysera residuals och felmönster
4. Jämföra prestanda per track
5. Identifiera förbättringsområden
"""

import json
import pickle
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from typing import Dict, List, Tuple
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import RobustScaler

# Konfigurera plotting
sns.set_style("whitegrid")
plt.rcParams["figure.figsize"] = (14, 8)


def load_model_and_data():
    """Ladda tränad modell, scaler, features och data"""
    ml_dir = Path(__file__).parent
    output_dir = ml_dir / "output"
    data_dir = ml_dir / "data"

    # Ladda modellinfo
    model_info_path = output_dir / "gps_correction_model_info.json"
    with open(model_info_path, "r", encoding="utf-8") as f:
        model_info = json.load(f)

    # Ladda modell
    model_path = output_dir / "gps_correction_model_best.pkl"
    with open(model_path, "rb") as f:
        model = pickle.load(f)

    # Ladda scaler
    scaler_path = output_dir / "gps_correction_scaler.pkl"
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    # Ladda feature names
    feature_names_path = output_dir / "gps_correction_feature_names.pkl"
    with open(feature_names_path, "rb") as f:
        feature_names = pickle.load(f)

    # Ladda data
    json_files = list(data_dir.glob("*.json"))
    all_data = []
    for json_file in json_files:
        with open(json_file, "r", encoding="utf-8") as f:
            all_data.extend(json.load(f))

    return model, scaler, feature_names, model_info, all_data


def prepare_features_for_analysis(data: List[Dict], feature_names: List[str]):
    """Förbered features från data (samma som i analysis.py)"""
    import sys
    from pathlib import Path

    # Lägg till ml-mappen i path
    ml_dir = Path(__file__).parent
    if str(ml_dir) not in sys.path:
        sys.path.insert(0, str(ml_dir))

    from analysis import prepare_features_advanced

    X, y, _ = prepare_features_advanced(data)
    return X, y


def analyze_feature_importance(model, feature_names: List[str], top_n: int = 15):
    """Analysera feature importance i detalj"""
    print("\n" + "=" * 60)
    print("FEATURE IMPORTANCE ANALYS")
    print("=" * 60)

    if not hasattr(model, "feature_importances_"):
        print("Modellen har inte feature_importances_")
        return

    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]

    print(f"\nTop {top_n} viktigaste features:")
    print("-" * 60)
    for i, idx in enumerate(indices[:top_n], 1):
        print(
            f"{i:2d}. {feature_names[idx]:30s} {importances[idx]:.6f} ({importances[idx] * 100:.2f}%)"
        )

    # Visualisera
    fig, ax = plt.subplots(figsize=(12, 8))
    top_indices = indices[:top_n]
    top_names = [feature_names[i] for i in top_indices]
    top_importances = importances[top_indices]

    ax.barh(range(len(top_names)), top_importances, color="steelblue")
    ax.set_yticks(range(len(top_names)))
    ax.set_yticklabels(top_names)
    ax.set_xlabel("Feature Importance")
    ax.set_title(f"Top {top_n} Features by Importance")
    ax.invert_yaxis()
    plt.tight_layout()

    output_dir = Path(__file__).parent / "output"
    output_path = output_dir / "feature_importance_detailed.png"
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"\nGraf sparad till: {output_path}")
    plt.close()

    return dict(zip([feature_names[i] for i in indices], importances[indices]))


def analyze_residuals(y_true: np.ndarray, y_pred: np.ndarray):
    """Analysera residuals (fel) i detalj"""
    print("\n" + "=" * 60)
    print("RESIDUAL ANALYS")
    print("=" * 60)

    residuals = y_true - y_pred

    print(f"\nResidual statistik:")
    print(f"  Mean: {np.mean(residuals):.4f} meter")
    print(f"  Median: {np.median(residuals):.4f} meter")
    print(f"  Std: {np.std(residuals):.4f} meter")
    print(f"  Min: {np.min(residuals):.4f} meter")
    print(f"  Max: {np.max(residuals):.4f} meter")

    # Percentiler
    percentiles = [5, 25, 50, 75, 95]
    print(f"\nPercentiler:")
    for p in percentiles:
        val = np.percentile(residuals, p)
        print(f"  {p:2d}%: {val:.4f} meter")

    # Analysera systematiska fel
    print(f"\nSystematiska fel:")
    if abs(np.mean(residuals)) > 0.1:
        print(f"  WARNING: Modellen har ett bias: {np.mean(residuals):.4f} meter")
        print(
            f"     (Modellen forutsager i genomsnitt {abs(np.mean(residuals)):.4f}m for hogt/lagt)"
        )
    else:
        print(f"  OK: Ingen tydlig bias (mean residual ~ 0)")

    # Visualisera residuals
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle("Residual Analysis", fontsize=16, fontweight="bold")

    # 1. Residual histogram
    ax1 = axes[0, 0]
    ax1.hist(residuals, bins=50, edgecolor="black", alpha=0.7, color="skyblue")
    ax1.axvline(0, color="red", linestyle="--", linewidth=2, label="Zero error")
    ax1.axvline(
        np.mean(residuals),
        color="green",
        linestyle="--",
        linewidth=2,
        label=f"Mean: {np.mean(residuals):.3f}m",
    )
    ax1.set_xlabel("Residual (meter)")
    ax1.set_ylabel("Frequency")
    ax1.set_title("Residual Distribution")
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # 2. Residual vs Predicted
    ax2 = axes[0, 1]
    ax2.scatter(y_pred, residuals, alpha=0.5, s=20, color="coral")
    ax2.axhline(0, color="red", linestyle="--", linewidth=2)
    ax2.set_xlabel("Predicted correction distance (meter)")
    ax2.set_ylabel("Residual (meter)")
    ax2.set_title("Residual vs Predicted")
    ax2.grid(True, alpha=0.3)

    # 3. Q-Q plot (för att se om residuals är normalfördelade)
    ax3 = axes[1, 0]
    from scipy import stats

    stats.probplot(residuals, dist="norm", plot=ax3)
    ax3.set_title("Q-Q Plot (Normal Distribution Check)")
    ax3.grid(True, alpha=0.3)

    # 4. Residual vs True
    ax4 = axes[1, 1]
    ax4.scatter(y_true, residuals, alpha=0.5, s=20, color="steelblue")
    ax4.axhline(0, color="red", linestyle="--", linewidth=2)
    ax4.set_xlabel("True correction distance (meter)")
    ax4.set_ylabel("Residual (meter)")
    ax4.set_title("Residual vs True")
    ax4.grid(True, alpha=0.3)

    plt.tight_layout()

    output_dir = Path(__file__).parent / "output"
    output_path = output_dir / "residual_analysis.png"
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"\nGraf sparad till: {output_path}")
    plt.close()


def analyze_per_track_performance(
    data: List[Dict], model, scaler, feature_names: List[str]
):
    """Analysera modellens prestanda per track"""
    print("\n" + "=" * 60)
    print("PER-TRACK PERFORMANCE ANALYS")
    print("=" * 60)

    import sys
    from pathlib import Path

    # Lägg till ml-mappen i path
    ml_dir = Path(__file__).parent
    if str(ml_dir) not in sys.path:
        sys.path.insert(0, str(ml_dir))

    from analysis import prepare_features_advanced

    # Gruppera data per track
    tracks_dict = {}
    for d in data:
        track_name = d.get("track_name") or f"Track_{d.get('track_id', 'unknown')}"
        if track_name not in tracks_dict:
            tracks_dict[track_name] = []
        tracks_dict[track_name].append(d)

    track_performance = []

    for track_name, track_data in sorted(tracks_dict.items()):
        # Förbered features för detta spår
        X, y, _ = prepare_features_advanced(track_data)

        if len(X) == 0:
            continue

        # Skala features
        X_scaled = scaler.transform(X)

        # Förutsäg
        y_pred = model.predict(X_scaled)

        # Beräkna metrics
        mae = mean_absolute_error(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))
        r2 = r2_score(y, y_pred)

        track_performance.append(
            {
                "track_name": track_name,
                "n_samples": len(X),
                "mae": mae,
                "rmse": rmse,
                "r2": r2,
                "avg_correction": np.mean(y),
                "max_correction": np.max(y),
            }
        )

    # Sortera efter MAE (sämst först)
    track_performance.sort(key=lambda x: x["mae"], reverse=True)

    print(f"\nPrestanda per track (sorterat efter MAE, sämst först):")
    print("-" * 80)
    print(f"{'Track':<30} {'N':>5} {'MAE':>8} {'RMSE':>8} {'R²':>8} {'Avg Corr':>10}")
    print("-" * 80)
    for perf in track_performance:
        print(
            f"{perf['track_name']:<30} {perf['n_samples']:>5} {perf['mae']:>8.3f} {perf['rmse']:>8.3f} {perf['r2']:>8.3f} {perf['avg_correction']:>10.2f}"
        )

    # Identifiera problematiska spår
    problematic_tracks = [p for p in track_performance if p["mae"] > 0.5]
    if problematic_tracks:
        print(f"\nWARNING: Problematiska spar (MAE > 0.5m):")
        for perf in problematic_tracks:
            print(f"  - {perf['track_name']}: MAE = {perf['mae']:.3f}m")

    return track_performance


def analyze_error_cases(
    y_true: np.ndarray, y_pred: np.ndarray, data: List[Dict], top_n: int = 20
):
    """Identifiera positioner där modellen har störst fel"""
    print("\n" + "=" * 60)
    print("ERROR CASE ANALYS")
    print("=" * 60)

    errors = np.abs(y_true - y_pred)
    worst_indices = np.argsort(errors)[-top_n:][::-1]

    print(f"\nTop {top_n} positioner med störst fel:")
    print("-" * 100)
    print(f"{'Track':<25} {'True':>8} {'Pred':>8} {'Error':>8} {'Accuracy':>10}")
    print("-" * 100)

    worst_cases = []
    for idx in worst_indices:
        d = data[idx]
        track_name = d.get("track_name", "Unknown")
        true_val = y_true[idx]
        pred_val = y_pred[idx]
        error = errors[idx]
        accuracy = d.get("accuracy", 0)

        print(
            f"{track_name:<25} {true_val:>8.3f} {pred_val:>8.3f} {error:>8.3f} {accuracy:>10.2f}"
        )

        worst_cases.append(
            {
                "track_name": track_name,
                "true": true_val,
                "predicted": pred_val,
                "error": error,
                "accuracy": accuracy,
                "data": d,
            }
        )

    # Analysera gemensamma egenskaper hos fel
    print(f"\nGemensamma egenskaper hos positioner med stora fel:")
    worst_accuracies = [c["accuracy"] for c in worst_cases]
    worst_corrections = [c["true"] for c in worst_cases]

    print(f"  Genomsnittlig accuracy: {np.mean(worst_accuracies):.2f}m")
    print(f"  Genomsnittlig correction: {np.mean(worst_corrections):.2f}m")
    print(f"  Max correction: {np.max(worst_corrections):.2f}m")

    return worst_cases


def generate_improvement_suggestions(
    model_info: Dict,
    feature_importance: Dict,
    track_performance: List[Dict],
    worst_cases: List[Dict],
):
    """Generera förslag på förbättringar baserat på analys"""
    print("\n" + "=" * 60)
    print("FÖRBÄTTRINGSFÖRSLAG")
    print("=" * 60)

    suggestions = []

    # 1. Dataförbättringar
    total_samples = sum(p["n_samples"] for p in track_performance)
    if total_samples < 1000:
        suggestions.append(
            {
                "category": "Data",
                "priority": "HIGH",
                "suggestion": f"Samla mer data. Nuvarande: {total_samples} positioner. Rekommenderat: > 1000",
                "impact": "Stor förbättring av modellens prestanda",
            }
        )

    # 2. Feature-förbättringar
    low_importance_features = [
        name for name, imp in feature_importance.items() if imp < 0.01
    ]
    if low_importance_features:
        suggestions.append(
            {
                "category": "Features",
                "priority": "MEDIUM",
                "suggestion": f"Överväg att ta bort features med låg importance: {', '.join(low_importance_features[:5])}",
                "impact": "Förenklar modellen, kan förbättra generalisering",
            }
        )

    # 3. Problematiska spår
    problematic_tracks = [p for p in track_performance if p["mae"] > 0.5]
    if problematic_tracks:
        suggestions.append(
            {
                "category": "Data Quality",
                "priority": "HIGH",
                "suggestion": f"Förbättra data för problematiska spår: {', '.join([p['track_name'] for p in problematic_tracks[:3]])}",
                "impact": "Förbättrar modellens prestanda på dessa spår",
            }
        )

    # 4. Outliers
    if worst_cases:
        max_error = max(c["error"] for c in worst_cases)
        if max_error > 5.0:
            suggestions.append(
                {
                    "category": "Data Quality",
                    "priority": "MEDIUM",
                    "suggestion": f"Identifiera och hantera outliers. Största fel: {max_error:.2f}m",
                    "impact": "Förbättrar modellens stabilitet",
                }
            )

    # 5. Hyperparameter tuning
    if model_info.get("test_r2", 0) < 0.9:
        suggestions.append(
            {
                "category": "Model",
                "priority": "MEDIUM",
                "suggestion": "Överväg mer omfattande hyperparameter tuning",
                "impact": "Kan förbättra R² score",
            }
        )

    # Skriv ut förslag
    for i, sug in enumerate(suggestions, 1):
        print(f"\n{i}. [{sug['category']}] {sug['priority']} priority")
        print(f"   Förslag: {sug['suggestion']}")
        print(f"   Påverkan: {sug['impact']}")

    return suggestions


def main():
    """Huvudfunktion"""
    print("\n" + "=" * 60)
    print("AVANCERAD MODELLANALYS")
    print("=" * 60)

    # Ladda modell och data
    print("\nLaddar modell och data...")
    model, scaler, feature_names, model_info, data = load_model_and_data()

    print(f"Modell: {model_info['best_model']}")
    print(f"Test MAE: {model_info['test_mae']:.4f}m")
    print(f"Test R²: {model_info['test_r2']:.4f}")
    print(f"Antal positioner: {len(data)}")

    # Förbered features
    print("\nFörbereder features...")
    X, y = prepare_features_for_analysis(data, feature_names)
    X_scaled = scaler.transform(X)

    # Förutsäg
    y_pred = model.predict(X_scaled)

    # Analysera
    feature_importance = analyze_feature_importance(model, feature_names)
    analyze_residuals(y, y_pred)
    track_performance = analyze_per_track_performance(
        data, model, scaler, feature_names
    )
    worst_cases = analyze_error_cases(y, y_pred, data)

    # Generera förbättringsförslag
    suggestions = generate_improvement_suggestions(
        model_info, feature_importance, track_performance, worst_cases
    )

    print("\n" + "=" * 60)
    print("ANALYS KLAR!")
    print("=" * 60)
    print(f"\nAlla grafer sparade i ml/output/")


if __name__ == "__main__":
    main()
