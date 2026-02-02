from fastapi import FastAPI
from pydantic import BaseModel
import httpx
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from energy_forecaster3 import predict_next_power       # use Person-3's model
from rules import evaluate_rules


# -------- CONFIG --------

SIM_BASE_URL = "https://smart-home-simulator-7f9m.onrender.com/api"  # simulator base URL
POLL_INTERVAL_SECONDS = 30
HISTORY_LIMIT = 200

app = FastAPI()

# -------- TYPES --------

Device = Dict[str, Any]
Sensor = Dict[str, Any]
HistoryRow = Dict[str, Any]

# Agent config controlled by /api/command
current_mode: str = "normal"
max_power_limit_kw: Optional[float] = None   # user-configured limit
schedules: List[Dict[str, Any]] = []


class IntentCommand(BaseModel):
    intent: str
    mode: Optional[str] = None
    start_time: Optional[str] = None      # "HH:MM" or null
    end_time: Optional[str] = None
    max_power_kw: Optional[float] = None
    device_id: Optional[str] = None
    state: Optional[Dict[str, Any]] = None


# -------- HEALTH --------

@app.get("/health")
def health():
    return {"status": "ok"}


# -------- FETCH HELPERS --------

async def fetch_devices(client: httpx.AsyncClient) -> List[Device]:
    resp = await client.get(f"{SIM_BASE_URL}/sim/devices", timeout=5.0)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError("Expected /sim/devices to return a list")
    return data


async def fetch_sensors(client: httpx.AsyncClient) -> List[Sensor]:
    resp = await client.get(f"{SIM_BASE_URL}/sim/sensors", timeout=5.0)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError("Expected /sim/sensors to return a list")
    return data


async def fetch_history(
    client: httpx.AsyncClient,
    limit: int = HISTORY_LIMIT,
) -> List[HistoryRow]:
    resp = await client.get(
        f"{SIM_BASE_URL}/sim/history",
        params={"limit": limit},
        timeout=5.0,
    )
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        raise ValueError("Expected /sim/history to return a list")
    return data


# -------- AGENT LOOP --------

async def agent_loop():
    """
    Core loop:
    - Every POLL_INTERVAL_SECONDS:
      - Fetch devices, sensors, and history from simulator
      - Build model input from history
      - Call ML function to get predicted next-step total power
      - Evaluate rules to decide actions
      - Apply actions back to simulator
    """
    global current_mode, max_power_limit_kw

    async with httpx.AsyncClient() as client:
        while True:
            try:
                # 1) Fetch data from simulator
                devices = await fetch_devices(client)
                sensors = await fetch_sensors(client)
                history = await fetch_history(client, limit=HISTORY_LIMIT)

                # 2) Basic debug info
                print(
                    f"[AGENT LOOP] devices={len(devices)}, "
                    f"sensors={len(sensors)}, history_points={len(history)}"
                )

                # Extract some key sensor values for debug (power_total uses field `value`)
                power_sensor: Optional[Sensor] = next(
                    (s for s in sensors if s.get("type") == "power_total"), None
                )
                if power_sensor is not None:
                    current_power_kw = power_sensor.get("value")
                    print(f"[AGENT LOOP] current_power_kw={current_power_kw}")

                # Extract last history row for debug
                if history:
                    last: HistoryRow = history[-1]
                    ts = last.get("timestamp_iso")
                    last_power = last.get("power_total_kw")
                    last_temp = last.get("avg_temp_c")
                    last_mode = last.get("mode")
                    print(
                        f"[AGENT LOOP] last_history: ts={ts}, "
                        f"power={last_power}, temp={last_temp}, mode={last_mode}"
                    )
                else:
                    print("[AGENT LOOP] history is empty")

                # 3) Build model input from history
                if history:
                    # Take last few entries, oldest -> newest
                    recent_rows = history[-20:]   # size doesn't matter; model will pad/crop
                    recent_power_values = [
                        row.get("power_total_kw", 0.0) for row in recent_rows
                    ]
                    latest = history[-1]
                    current_time_iso = latest.get("timestamp_iso")
                    avg_temp_c = latest.get("avg_temp_c")
                    mode = latest.get("mode")
                else:
                    recent_power_values = []
                    current_time_iso = datetime.utcnow().isoformat()
                    avg_temp_c = None
                    mode = None

                model_input_json = {
                    "recent_power_values": recent_power_values,
                    "current_time_iso": current_time_iso,
                    "avg_temp_c": avg_temp_c,
                    "mode": mode,
                }

                print(f"[AGENT LOOP] model_input_json={model_input_json}")

                # 4) Call ML function (real model)
                if current_time_iso:
                    if "Z" in current_time_iso:
                        current_time_dt = datetime.fromisoformat(
                            current_time_iso.replace("Z", "+00:00")
                        )
                    else:
                        current_time_dt = datetime.fromisoformat(current_time_iso)
                else:
                    current_time_dt = datetime.utcnow()

                predicted_power_kw_for_next_step = predict_next_power(
                    recent_power_values=recent_power_values,
                    current_time=current_time_dt,
                    avg_temp_c=avg_temp_c,
                    mode=mode,
                )

                print(
                    "[AGENT LOOP] predicted_power_kw_for_next_step="
                    f"{predicted_power_kw_for_next_step}"
                )

                # 5) Evaluate rules using current global config
                max_power_kw = max_power_limit_kw          # user-configured (can be None)
                auto_max_power_kw = 4.0                    # mostly for labeling

                actions = evaluate_rules(
                    devices=devices,
                    sensors=sensors,
                    predicted_power_kw=predicted_power_kw_for_next_step,
                    current_mode=current_mode,
                    max_power_kw=max_power_kw,
                    auto_max_power_kw=auto_max_power_kw,
                )

                print(f"[AGENT LOOP] actions_to_take={actions}")

                # 6) Apply actions to simulator
                for act in actions:
                    device_id = act["device_id"]
                    new_state = act["new_state"]
                    reason = act.get("reason")

                    try:
                        # Person-1's Express route is POST /api/sim/devices/:device_id
                        # and treats req.body as the state updates
                        resp = await client.post(
                            f"{SIM_BASE_URL}/sim/devices/{device_id}",
                            json=new_state,  # send only state fields
                            timeout=5.0,
                        )
                        resp.raise_for_status()
                        print(
                            f"[AGENT LOOP] Applied action to {device_id}: "
                            f"{new_state} (reason: {reason})"
                        )
                    except Exception as e:
                        print(f"[AGENT LOOP] Failed to apply action to {device_id}: {e}")

            except Exception as e:
                # Do not crash the loop; just log and retry
                print(f"[AGENT LOOP] Error talking to simulator or model: {e}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)


@app.on_event("startup")
async def on_startup():
    asyncio.create_task(agent_loop())


# -------- /api/command (from Person-2) --------

@app.post("/api/command")
async def api_command(cmd: IntentCommand):
    """
    Takes parsed intent JSON (from Person-2's LLM service) and:
    - Updates mode/schedules for energy saving, or
    - Immediately sends a device state change to the simulator.
    """
    global current_mode, max_power_limit_kw, schedules

    # 1) Enable energy saving mode
    if cmd.intent == "enable_energy_saving_mode":
        # Update global mode and power limit
        current_mode = cmd.mode or "energy_saving"
        max_power_limit_kw = cmd.max_power_kw or 1.5

        # Store schedule if times are provided
        schedule = {
            "start_time": cmd.start_time,   # "19:00" or None
            "end_time": cmd.end_time,       # "23:00" or None
            "mode": current_mode,
            "max_power_kw": max_power_limit_kw,
        }
        schedules.append(schedule)

        msg = (
            f"Energy saving mode enabled"
            + (f" from {cmd.start_time} to {cmd.end_time}"
               if cmd.start_time and cmd.end_time else "")
            + f" with max {max_power_limit_kw} kW"
        )

        return {
            "status": "ok",
            "parsed_intent": cmd.dict(),
            "message": msg,
        }

    # 2) Disable energy saving mode
    if cmd.intent == "disable_energy_saving_mode":
        current_mode = "normal"
        max_power_limit_kw = None
        schedules = []

        return {
            "status": "ok",
            "parsed_intent": cmd.dict(),
            "message": "Energy saving mode disabled",
        }

    # 3) Set device state immediately
    if cmd.intent == "set_device_state":
        if not cmd.device_id:
            return {
                "status": "error",
                "parsed_intent": cmd.dict(),
                "message": "device_id is missing for set_device_state",
            }

        state_obj = cmd.state or {}
        new_state: Dict[str, Any] = {}

        # Map the generic state into fields simulator understands
        if "on" in state_obj and state_obj["on"] is not None:
            new_state["on"] = state_obj["on"]
        if "brightness" in state_obj and state_obj["brightness"] is not None:
            new_state["brightness"] = state_obj["brightness"]
        if "temp_setpoint_c" in state_obj and state_obj["temp_setpoint_c"] is not None:
            # simulator uses "temp" for AC
            new_state["temp"] = state_obj["temp_setpoint_c"]

        if not new_state:
            return {
                "status": "error",
                "parsed_intent": cmd.dict(),
                "message": "No valid state fields to update",
            }

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{SIM_BASE_URL}/sim/devices/{cmd.device_id}",
                    json=new_state,
                    timeout=5.0,
                )
                resp.raise_for_status()
            except Exception as e:
                return {
                    "status": "error",
                    "parsed_intent": cmd.dict(),
                    "message": f"Failed to update device {cmd.device_id}: {e}",
                }

        return {
            "status": "ok",
            "parsed_intent": cmd.dict(),
            "message": f"Updated {cmd.device_id} with {new_state}",
        }

    # Unknown intent
    return {
        "status": "ignored",
        "parsed_intent": cmd.dict(),
        "message": "Unknown intent type",
    }
