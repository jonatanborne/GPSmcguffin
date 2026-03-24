#!/usr/bin/env python3
"""Kör endast ML-träning (snabbare än full analysis)"""
import sys
from pathlib import Path

# Samma som analysis.py main men bara träning
sys.path.insert(0, str(Path(__file__).parent))
from analysis import load_annotations, train_ml_model

if __name__ == "__main__":
    print("Laddar data...")
    data = load_annotations()
    print(f"Tränar med {len(data)} positioner...")
    train_ml_model(data)
    print("Klar!")
