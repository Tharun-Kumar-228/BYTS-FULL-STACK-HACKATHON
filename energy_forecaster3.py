import os
import json
from datetime import datetime

import joblib
import numpy as np

# Paths (relative to this file)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "energy_forecast3.pkl")
CONFIG_PATH = os.path.join(BASE_DIR, "config", "forecast_config3.json")

# Global variables for model and config (lazy-loaded)
_MODEL = None
_CONFIG = None


def _load_artifacts() -> None:
    """Lazy-load model and config into module-level globals."""
    global _MODEL, _CONFIG

    if _MODEL is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Model file not found at {MODEL_PATH}. Run training first."
            )
        _MODEL = joblib.load(MODEL_PATH)

    if _CONFIG is None:
        if not os.path.exists(CONFIG_PATH):
            # Fallback defaults if config missing (e.g. during early dev)
            _CONFIG = {"n_lags": 6}
        else:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                _CONFIG = json.load(f)


def predict_next_power(
    recent_power_values,
    current_time: datetime,
    avg_temp_c: float | None = None,
    mode: str | None = None,
) -> float:
    """
    Predict total power consumption for the next time interval (in kW).

    Args:
        recent_power_values (list[float]): Recent power readings; last element is most recent.
        current_time (datetime): Current timestamp.
        avg_temp_c (float, optional): Current average outdoor temperature.
        mode (str, optional): Current system mode (unused, kept for API compatibility).

    Returns:
        float: Predicted power in kW (never negative).
    """
    _load_artifacts()

    n_lags = int(_CONFIG.get("n_lags", 6))

    # 1. Prepare lag features
    if not recent_power_values:
        lags_values = [0.0] * n_lags
    else:
        available_lags = list(recent_power_values[-n_lags:])
        needed = n_lags - len(available_lags)

        if needed > 0:
            last_val = available_lags[-1]
            padded = [last_val] * needed + available_lags
            lags_values = padded
        else:
            lags_values = available_lags

    # We expect:
    #   power_lag_1 = most recent value
    #   power_lag_n = oldest in the window
    reversed_lags = list(reversed(lags_values))

    # 2. Time features
    hour = current_time.hour
    day_of_week = current_time.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0

    # 3. Temperature feature (ensure not None)
    if avg_temp_c is None:
        avg_temp_c = 25.0  # neutral default

    # 4. Build feature vector in the order defined in config:
    # [hour, day_of_week, is_weekend, outdoor_temp_c, power_lag_1..power_lag_n]
    features = [hour, day_of_week, is_weekend, float(avg_temp_c)]
    features.extend(float(v) for v in reversed_lags)

    X = np.array(features, dtype=float).reshape(1, -1)

    # 5. Predict
    prediction = float(_MODEL.predict(X)[0])

    # Guard against tiny negative values from the model
    return max(0.0, prediction)


if __name__ == "__main__":
    # Simple manual test, not used by the agent
    print("Testing energy_forecaster3...")
    try:
        now = datetime.now()
        dummy_history = [0.2, 0.5, 0.3, 0.6, 0.4, 0.5]
        pred = predict_next_power(dummy_history, now, avg_temp_c=25.0)
        print(f"Prediction for history {dummy_history}: {pred:.4f} kW")
    except Exception as e:
        print(f"Test failed (expected if model not trained yet): {e}")
