from datetime import datetime, time
from typing import Any, Dict, List, Optional

Device = Dict[str, Any]
Sensor = Dict[str, Any]


def evaluate_rules(
    devices: List[Device],
    sensors: List[Sensor],
    predicted_power_kw: float,
    current_mode: str,
    max_power_kw: Optional[float],        # user-configured limit (can be None)
    auto_max_power_kw: Optional[float],   # always-on safety limit (not used heavily now)
) -> List[Dict[str, Any]]:
    """
    Evaluate rules and return a list of actions.
    Each action:
      {
        "device_id": str,
        "new_state": {...},
        "reason": str
      }
    """
    actions: List[Dict[str, Any]] = []

    now = datetime.utcnow()

    # --- Helper lookups ---

    motion_by_room: Dict[str, Sensor] = {}
    temp_by_room: Dict[str, Sensor] = {}

    for s in sensors:
        stype = s.get("type")
        room = s.get("room")
        if not room:
            continue
        if stype == "motion":
            motion_by_room[room] = s
        elif stype == "temperature":
            temp_by_room[room] = s

    def is_night(dt: datetime) -> bool:
        h = dt.hour
        return (h >= 19) or (h < 6)

    def room_is_inactive(room: Optional[str]) -> bool:
        """Return True if room has had no motion for a while."""
        if not room:
            return False
        motion_sensor = motion_by_room.get(room)
        if not motion_sensor:
            return False
        last_motion_iso = motion_sensor.get("last_motion_iso")
        if not last_motion_iso:
            return False
        try:
            last_motion_dt = datetime.fromisoformat(
                last_motion_iso.replace("Z", "+00:00")
            )
        except Exception:
            return False
        minutes_since_motion = (now - last_motion_dt).total_seconds() / 60.0
        # Consider "inactive" after 10 minutes with no motion
        return minutes_since_motion > 10

    # -------------------------------------------------
    # RULE 1: Idle lights off (no motion for X minutes)
    # -------------------------------------------------
    for d in devices:
        if d.get("type") != "light":
            continue

        state = d.get("state", {})
        if not state.get("on"):
            continue  # already off

        room = d.get("room")
        if not room:
            continue

        motion_sensor = motion_by_room.get(room)
        if not motion_sensor:
            continue

        last_motion_iso = motion_sensor.get("last_motion_iso")
        if not last_motion_iso:
            continue

        try:
            last_motion_dt = datetime.fromisoformat(
                last_motion_iso.replace("Z", "+00:00")
            )
        except Exception:
            continue

        minutes_since_motion = (now - last_motion_dt).total_seconds() / 60.0
        timeout_min = d.get("metadata", {}).get("auto_off_timeout_min", 20)

        if minutes_since_motion > timeout_min:
            actions.append({
                "device_id": d["id"],
                "new_state": {"on": False},
                "reason": (
                    f"No motion in {room} for {int(minutes_since_motion)} min; "
                    f"turning light off"
                ),
            })

    # -----------------------------------------------------------------
    # RULE 2: Forecast-based safety (hysteresis on prediction)
    #
    # With the new model, predicted_power_kw should be roughly real kW for
    # whole-home consumption (e.g. 0.5–5 kW most of the time).
    #
    # Example thresholds:
    #   - Above ~3.0 kW -> start shedding non-critical load.
    #   - Below ~2.5 kW -> restore comfort.
    # -----------------------------------------------------------------
    cut_threshold = 1.5
    restore_threshold = 1.3

    # Prefer user limit for "reason" text if present, but logic is based on model scale
    if max_power_kw is not None:
        reason_prefix = "User energy-saving: "
    elif auto_max_power_kw is not None:
        reason_prefix = "Auto safety: "
    else:
        reason_prefix = "Auto safety: "

    # A) High forecast -> dim / turn off lights and raise AC setpoints
    if predicted_power_kw > cut_threshold:
        # 1) Dim or turn off non-critical lights that are ON
        for d in devices:
            if d.get("type") != "light":
                continue
            if d.get("metadata", {}).get("is_critical", False):
                continue

            state = d.get("state", {})
            if not state.get("on"):
                continue

            room = d.get("room")
            inactive = room_is_inactive(room)
            current_brightness = state.get("brightness", 100)

            # More aggressive dimming in inactive rooms
            dim_step = 40 if inactive else 20
            new_brightness = max(20, current_brightness - dim_step)

            if new_brightness <= 25:
                # Already quite dim -> turn off
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": False},
                    "reason": (
                        f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                        f"> cut {cut_threshold:.2f}; "
                        f"room {'inactive' if inactive else 'active'}; "
                        f"turning off {d['id']}"
                    ),
                })
            else:
                # Dim but keep on
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": True, "brightness": new_brightness},
                    "reason": (
                        f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                        f"> cut {cut_threshold:.2f}; "
                        f"room {'inactive' if inactive else 'active'}; "
                        f"dimming {d['id']} to {new_brightness}%"
                    ),
                })

        # 2) Raise AC setpoints to reduce consumption
        for d in devices:
            if d.get("type") != "ac":
                continue
            if d.get("metadata", {}).get("is_critical", False):
                continue

            state = d.get("state", {})
            if not state.get("on"):
                continue

            room = d.get("room")
            inactive = room_is_inactive(room)
            current_temp = state.get("temp", 24.0)

            # More aggressive in inactive rooms
            delta = 1.5 if inactive else 0.5
            new_temp = min(current_temp + delta, 28.0)

            if new_temp > current_temp:
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": True, "temp": new_temp},
                    "reason": (
                        f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                        f"> cut {cut_threshold:.2f}; "
                        f"room {'inactive' if inactive else 'active'}; "
                        f"raising AC setpoint for {d['id']} to {new_temp:.1f}°C"
                    ),
                })

    # B) Low forecast -> gently restore lights and AC comfort
    elif predicted_power_kw < restore_threshold:
        # 1) Restore lights in active rooms
        for d in devices:
            if d.get("type") != "light":
                continue
            if d.get("metadata", {}).get("is_critical", False):
                continue

            room = d.get("room")
            inactive = room_is_inactive(room)
            state = d.get("state", {})

            # Only restore in active rooms
            if inactive:
                continue

            # If light is off, turn it back on at a moderate brightness
            if not state.get("on"):
                new_brightness = d.get("metadata", {}).get("default_brightness", 80)
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": True, "brightness": new_brightness},
                    "reason": (
                        f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                        f"< restore {restore_threshold:.2f}; "
                        f"room active; restoring {d['id']} on at {new_brightness}%"
                    ),
                })
            else:
                current_brightness = state.get("brightness", 60)
                target_brightness = d.get("metadata", {}).get("default_brightness", 80)
                step = 15
                if current_brightness < target_brightness:
                    new_brightness = min(target_brightness, current_brightness + step)
                    actions.append({
                        "device_id": d["id"],
                        "new_state": {"on": True, "brightness": new_brightness},
                        "reason": (
                            f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                            f"< restore {restore_threshold:.2f}; "
                            f"room active; increasing {d['id']} brightness "
                            f"to {new_brightness}%"
                        ),
                    })

        # 2) Restore AC setpoints in active rooms toward preferred temp
        for d in devices:
            if d.get("type") != "ac":
                continue
            if d.get("metadata", {}).get("is_critical", False):
                continue

            state = d.get("state", {})
            if not state.get("on"):
                continue

            room = d.get("room")
            inactive = room_is_inactive(room)
            if inactive:
                continue

            current_temp = state.get("temp", 24.0)
            preferred_temp = d.get("metadata", {}).get("preferred_temp_c", 24.0)

            if current_temp > preferred_temp:
                step = 0.5
                new_temp = max(preferred_temp, current_temp - step)
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": True, "temp": new_temp},
                    "reason": (
                        f"{reason_prefix}forecast {predicted_power_kw:.2f} "
                        f"< restore {restore_threshold:.2f}; "
                        f"room active; lowering AC setpoint for {d['id']} "
                        f"to {new_temp:.1f}°C"
                    ),
                })

    # --------------------------------------------------------
    # RULE 3: Comfort rule – auto-on lights on motion at night
    # --------------------------------------------------------
    if is_night(now):
        for d in devices:
            if d.get("type") != "light":
                continue

            state = d.get("state", {})
            if state.get("on"):
                continue  # already on

            room = d.get("room")
            if not room:
                continue

            motion_sensor = motion_by_room.get(room)
            if not motion_sensor:
                continue

            if motion_sensor.get("value") is True:
                desired_brightness = d.get("metadata", {}).get(
                    "default_night_brightness", 60
                )
                actions.append({
                    "device_id": d["id"],
                    "new_state": {"on": True, "brightness": desired_brightness},
                    "reason": f"Motion detected in {room} at night; turning light on",
                })

    # -------------------------------------------------
    # RULE 4: Night mode baseline – lights off late night
    # -------------------------------------------------
    if now.time() >= time(23, 0):  # 23:00 onwards+
        for d in devices:
            if d.get("type") != "light":
                continue
            if d.get("metadata", {}).get("is_critical", False):
                continue
            state = d.get("state", {})
            if not state.get("on"):
                continue

            room = d.get("room")
            actions.append({
                "device_id": d["id"],
                "new_state": {"on": False},
                "reason": f"Night mode: after 23:00; turning off light in {room}",
            })

    return actions
