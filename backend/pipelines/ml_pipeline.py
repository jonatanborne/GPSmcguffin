"""
ML pipeline: korrigering av GPS-positioner med ML + confidence.

Tänkt flöde: positioner → features → modell → förutsägelse (korrigeringsavstånd, confidence)
→ korrigerade positioner (T2, ml_confidence, correction_source=ml).

För närvarande ligger den faktiska logiken (feature-building, _predict_with_confidence,
apply_ml_correction, predict endpoints) kvar i main.py. När den flyttas hit ska denna
modul exponera t.ex. run_apply_correction(positions, model_path, ...) som returnerar
lista med {position_id, corrected_lat, corrected_lng, ml_confidence} så att main.py
bara hämtar data, anropar pipelines.ml_pipeline, och skriver tillbaka till DB.
"""

# Stub – full implementation kan flyttas hit i en senare refaktorering.
