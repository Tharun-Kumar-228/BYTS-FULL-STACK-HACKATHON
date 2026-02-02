import os
import joblib
import json
import numpy as np
import pandas as pd
from datetime import datetime

# Paths (relative to this file)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "energy_forecast3.pkl")
CONFIG_PATH = os.path.join(BASE_DIR, "config", "forecast_config3.json")

# Global variables for model and config
_MODEL = None
_CONFIG = None


def _load_artifacts():
    global _MODEL, _CONFIG
    if _MODEL is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Run training first.")
        _MODEL = joblib.load(MODEL_PATH)
    
    if _CONFIG is None:
        if not os.path.exists(CONFIG_PATH):
            # Fallback defaults if config missing (e.g. during early dev)
            _CONFIG = {"n_lags": 6}
        else:
            with open(CONFIG_PATH, "r") as f:
                _CONFIG = json.load(f)


def predict_next_power(recent_power_values, current_time, avg_temp_c=None, mode=None):
    """
    Predicts the total power consumption for the next time interval.
    
    Args:
        recent_power_values (list[float]): List of recent power readings. 
                                           The last element is the most recent.
        current_time (datetime): Current timestamp.
        avg_temp_c (float, optional): Current average temperature (unused in current model, kept for API compat).
        mode (str, optional): Current system mode (unused).
        
    Returns:
        float: Predicted power in kW.
    """
    _load_artifacts()
    
    n_lags = _CONFIG.get("n_lags", 6)
    
    # 1. Prepare Lag Features
    # We need exactly n_lags values. 
    # If provided less, pad with the last known value (naive extension) or 0 if empty.
    if not recent_power_values:
        lags_values = [0.0] * n_lags
    else:
        # Take the last n_lags
        available_lags = recent_power_values[-n_lags:]
        needed = n_lags - len(available_lags)
        if needed > 0:
            last_val = available_lags[-1]
            padded = [last_val] * needed + available_lags
            lags_values = padded
        else:
            lags_values = available_lags
            
    # Our model expects features:
    # [hour, day_of_week, is_weekend, avg_temp_c, power_lag_1, ..., power_lag_N]
    # power_lag_1 is the MOST RECENT value (p_t), power_lag_N is the OLDEST.
    # recent_power_values is [..., p_{t-2}, p_{t-1}, p_t],
    # so we reverse to align lag_1 with the last element.
    reversed_lags = list(reversed(lags_values))
    
    # 2. Time Features
    hour = current_time.hour
    day_of_week = current_time.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0
    
    # 3. Build Feature Vector
    if avg_temp_c is None:
        avg_temp_c = 25.0  # default if not provided
        
    features = [hour, day_of_week, is_weekend, avg_temp_c]
    features.extend(reversed_lags)
    
    # Reshape for prediction
    X = np.array(features).reshape(1, -1)
    
    # 4. Predict
    prediction = _MODEL.predict(X)[0]
    
    return max(0.0, float(prediction))


if __name__ == "__main__":
    # fast test
    print("Testing energy_forecaster...")
    try:
        now = datetime.now()
        dummy_history = [1.2, 1.5, 1.3, 1.6, 1.4, 1.5]
        pred = predict_next_power(dummy_history, now)
        print(f"Prediction for history {dummy_history}: {pred:.4f} kW")
    except Exception as e:
        print(f"Test failed (expected if model not trained yet): {e}")
