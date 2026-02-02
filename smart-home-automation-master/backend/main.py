from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
import jwt
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager
import time
import random
import json
import os
import threading
import asyncio
import requests
import smtplib
from email.message import EmailMessage
import re
import datetime
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash

from dotenv import load_dotenv
from openai import OpenAI
import uvicorn

# ---------- ENV + LLM CLIENT ----------
load_dotenv()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

# ---------- BOTH URLs ----------
SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8000/api")  # GET data / POST actions
AGENT_URL = os.getenv("AGENT_URL", "https://smart-home-agent-42ua.onrender.com")              # POST /api/command

# ---------- GLOBAL STATE ----------
devices: Dict[str, dict] = {}
sensors: Dict[str, Any] = {}
history: List[dict] = []
global_mode: str = "normal"
energy_schedule: Dict[str, Any] = {}

# ---------- AUTH STATE & CONFIG ----------
# Using Cloud MongoDB (Atlas)
# Note: Password 'MTK@12b28' is URL-encoded to 'MTK%4012b28' to handle the '@' symbol correctly.
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://tarunraina691_db_user:MTK%4012b28@cluster0.cb8qdvh.mongodb.net/?appName=Cluster0")
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["smart_home_db"]
users_collection = db["users"]
otp_collection = db["otp_verifications"]

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "tharunmanikandan2005@gmail.com")
# Google App passwords often come with spaces; strip them to be safe
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "yroq wfxu copm pjgd").replace(" ", "")

# ---------- JWT CONFIG ----------
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_jwt_key_should_be_in_env")
ALGORITHM = "HS256"
security = HTTPBearer()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.now() + datetime.timedelta(days=7) # 7 days validity
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------- MODELS ----------
class UserCommand(BaseModel):
    text: str

class DeviceState(BaseModel):
    on: Optional[bool] = None
    brightness: Optional[int] = None
    temp: Optional[float] = None

class RegisterRequest(BaseModel):
    username: str
    email: str
    phone: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ParsedCommand(BaseModel):
    status: str
    parsed_intent: Optional[dict] = None
    message: str

# ---------- PROMPT ----------
COMMAND_SYSTEM_PROMPT = """
You are a smart home command interpreter.

Task: Convert user command to JSON object. Output ONLY JSON.

{
  "intent": "string",
  "mode": "string|null",
  "start_time": "string|null",
  "end_time": "string|null",
  "max_power_kw": number|null,
  "device_id": "string|null",
  "state": {
    "on": boolean|null,
    "brightness": number|null,
    "temp_setpoint_c": number|null
  }
}

intent MUST be: "enable_energy_saving_mode", "disable_energy_saving_mode", or "set_device_state"

Examples:
"Turn on living room light" → {"intent": "set_device_state", "device_id": "light_living", "state": {"on": true, "brightness": null, "temp_setpoint_c": null}}
"""

# ---------- INTENT NORMALIZATION ----------
def build_full_intent(raw_intent: dict) -> dict:
    full = {
        "intent": raw_intent.get("intent"),
        "mode": raw_intent.get("mode", None),
        "start_time": raw_intent.get("start_time", None),
        "end_time": raw_intent.get("end_time", None),
        "max_power_kw": raw_intent.get("max_power_kw", None),
        "device_id": raw_intent.get("device_id", None),
        "state": raw_intent.get("state", None),
    }
    
    if full["intent"] == "enable_energy_saving_mode":
        if full["mode"] is None: full["mode"] = "energy_saving"
        if full["start_time"] is None: full["start_time"] = "19:00"
        if full["end_time"] is None: full["end_time"] = "23:00"
        if full["max_power_kw"] is None: full["max_power_kw"] = 1.5
        full["device_id"] = None
        full["state"] = None
    
    if full["intent"] == "disable_energy_saving_mode":
        full["mode"] = "normal"
        full["start_time"] = None
        full["end_time"] = None
        full["max_power_kw"] = None
        full["device_id"] = None
        full["state"] = None
    
    if full["intent"] in ("set_device_state", "set_device"):
        full["intent"] = "set_device_state"
        full["mode"] = None
        full["start_time"] = None
        full["end_time"] = None
        full["max_power_kw"] = None
        st = full["state"] or {}
        full["state"] = {
            "on": st.get("on", None),
            "brightness": st.get("brightness", None),
            "temp_setpoint_c": st.get("temp_setpoint_c", None),
        }
    
    return full

# ---------- SIMULATION ----------
def init_devices_and_sensors() -> None:
    global devices, sensors
    devices = {
        "light_living": {"id": "light_living", "type": "light", "room": "living", "state": {"on": False, "brightness": 0}, "power_kw": 0.10, "critical": False},
        "light_bedroom": {"id": "light_bedroom", "type": "light", "room": "bedroom", "state": {"on": False, "brightness": 0}, "power_kw": 0.08, "critical": False},
        "ac_bedroom": {"id": "ac_bedroom", "type": "ac", "room": "bedroom", "state": {"on": True, "temp": 24.0}, "power_kw": 1.20, "critical": False},
        "fridge": {"id": "fridge", "type": "appliance", "room": "kitchen", "state": {"on": True}, "power_kw": 0.15, "critical": True},
    }
    sensors = {"power_total_kw": 0.0, "temp_outdoor_c": 28.0, "mode": "normal"}

def simulation_loop() -> None:
    global sensors, history, global_mode
    while True:
        total_power = sum(dev["power_kw"] for dev in devices.values() if dev["state"].get("on"))
        sensors["power_total_kw"] = total_power
        sensors["temp_outdoor_c"] += random.uniform(-0.3, 0.3)
        sensors["mode"] = global_mode
        history.append({
            "timestamp": time.time(),
            "power_total_kw": total_power,
            "avg_temp_c": sensors["temp_outdoor_c"],
            "mode": global_mode,
        })
        if len(history) > 300: history.pop(0)
        time.sleep(3)

async def agent_loop() -> None:
    global global_mode
    while True:
        recent = history[-10:] if len(history) > 10 else history[:]
        forecast = 0.5 if not recent else recent[-1]["power_total_kw"] + random.uniform(-0.2, 0.2)
        if global_mode == "energy_saving" and forecast > 1.5:
            for dev in devices.values():
                if dev["type"] == "light" and dev["state"].get("on"):
                    dev["state"]["on"] = False
                    dev["state"]["brightness"] = 0
        await asyncio.sleep(5)

# ---------- APP ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_devices_and_sensors()
    threading.Thread(target=simulation_loop, daemon=True).start()
    asyncio.create_task(agent_loop())
    yield

app = FastAPI(title="Smart Home LLM Backend", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def enforce_origin_middleware(request: Request, call_next):
    # Allow CORS preflight requests
    if request.method == "OPTIONS":
        return await call_next(request)

    # 1. Origin Check (Browser Security)
    ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}
    origin = request.headers.get("origin")
    
    # 2. Custom Token Check (Client Security)
    # This ensures that even tools like Postman need this specific header
    client_token = request.headers.get("x-app-token")
    REQUIRED_TOKEN = "smart-home-client-v1"

    if (not origin or origin not in ALLOWED_ORIGINS) or (client_token != REQUIRED_TOKEN):
        return JSONResponse(
            status_code=403, 
            content={"detail": "Access forbidden: Unauthorized client."}
        )

    return await call_next(request)

# ---------- ROUTES ----------
@app.get("/")
def api_root(): return {"message": "Smart Home LLM Backend", "version": "1.0"}

@app.get("/devices")
def api_get_devices(user_data: dict = Depends(verify_user_token)): 
    return list(devices.values())

@app.get("/sensors")
def api_get_sensors(user_data: dict = Depends(verify_user_token)): 
    return sensors

@app.get("/history")
def api_get_history(limit: int = 50, user_data: dict = Depends(verify_user_token)): 
    return history[-limit:]

@app.post("/devices/{device_id}/state")
def api_update_device_state(device_id: str, state: DeviceState, user_data: dict = Depends(verify_user_token)) -> dict:
    if device_id not in devices: return {"error": "device_not_found"}
    update = state.dict(exclude_none=True)
    devices[device_id]["state"].update(update)
    return {"ok": True}

# ---------- AUTH ENDPOINTS ----------
def validate_email(email: str) -> bool:
    return bool(re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email))

def validate_phone(phone: str) -> bool:
    return bool(re.match(r"^[6-9]\d{9}$", phone))

def send_otp_email(to_email: str, otp: str) -> bool:
    """Sends OTP via SMTP. Returns True if successful, False otherwise."""
    # Ensure spaces are gone just in case
    password = SMTP_PASSWORD.replace(" ", "")
    
    if not SMTP_EMAIL or not password or "your_" in SMTP_EMAIL:
        # Mock behavior for development if credentials aren't set
        print(f"[MOCK EMAIL] To: {to_email} | OTP: {otp}")
        return True
    
    try:
        msg = EmailMessage()
        msg.set_content(f"Your Smart Home Verification OTP is: {otp}\n\nThis OTP is valid for 5 minutes.")
        msg["Subject"] = "Smart Home Use Verification OTP"
        msg["From"] = SMTP_EMAIL
        msg["To"] = to_email
        
        # Connect to Gmail SMTP (SSL)
        # Using 465 for SSL. If this fails, sometimes 587 (TLS) is needed.
        print(f"Attempting to connect to SMTP for {to_email}...")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, password)
            server.send_message(msg)
        print("Email sent successfully!")
        return True
    except Exception as e:
        print(f"Failed to send email: {str(e)}")
        # If SSL fails, sometimes we might want to try STARTTLS logic here,
        # but 465 is standard for Google App Passwords.
        return False

@app.post("/register")
async def register(req: RegisterRequest):
    # 1. Input Validation
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    
    if not validate_email(req.email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    if not validate_phone(req.phone):
        raise HTTPException(status_code=400, detail="Invalid Indian phone number. Must start with 6-9 and be 10 digits.")
    
    # 2. Check for Duplicates
    if users_collection.find_one({"email": req.email}):
        raise HTTPException(status_code=409, detail="Email already registered")
        
    if users_collection.find_one({"phone": req.phone}):
        raise HTTPException(status_code=409, detail="Phone number already registered")
    
    # 3. Hash Password & Create User
    hashed_pw = generate_password_hash(req.password)
    
    user_doc = {
        "username": req.username,
        "email": req.email,
        "phone": req.phone,
        "password": hashed_pw,
        "is_verified": False,
        "simulation_enabled": False,
        "created_at": datetime.datetime.now()
    }
    
    try:
        result = users_collection.insert_one(user_doc)
        
        # 3.5 Call Simulator to Create Assets
        try:
            requests.post(
                f"{SIMULATOR_URL}/signup",
                json={"userId": str(result.inserted_id), "name": req.username, "email": req.email},
                timeout=5
            )
        except Exception as e:
            print(f"⚠️ Warning: Failed to init simulator assets: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    # 4. Generate & Send OTP
    otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
    expires_at = datetime.datetime.now() + datetime.timedelta(minutes=5)
    
    otp_doc = {
        "email": req.email,
        "otp": otp,
        "expires_at": expires_at
    }
    
    # Upsert OTP (replace existing if any)
    otp_collection.update_one(
        {"email": req.email},
        {"$set": otp_doc},
        upsert=True
    )
    
    email_sent = send_otp_email(req.email, otp)
    
    if email_sent:
        return {"success": True, "message": "User registered successfully. details sent to email."}
    else:
        # Note: In a real app, you might rollback user creation or have a resend-otp endpoint
        return {"success": True, "message": "User registered, but failed to send OTP email. Please retry verification."}

@app.post("/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    # Find OTP record
    record = otp_collection.find_one({"email": req.email})
    
    if not record:
        raise HTTPException(status_code=400, detail="OTP not found or expired request")
        
    # Check expiry
    if datetime.datetime.now() > record["expires_at"]:
        otp_collection.delete_one({"email": req.email}) # Cleanup expired
        raise HTTPException(status_code=400, detail="OTP has expired")
    
    # Check OTP match
    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    # Verify User
    result = users_collection.update_one(
        {"email": req.email},
        {"$set": {"is_verified": True}}
    )
    
    if result.modified_count == 0:
        # Check if user actually exists
        if not users_collection.find_one({"email": req.email}):
             raise HTTPException(status_code=404, detail="User not found")
        # Else, maybe already verified?
    
    # Cleanup OTP
    otp_collection.delete_one({"email": req.email})
    
    return {"success": True, "message": "Email verified successfully"}

@app.post("/login")
async def login(req: LoginRequest):
    user = users_collection.find_one({"email": req.email})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not check_password_hash(user["password"], req.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not user.get("is_verified", False):
        raise HTTPException(status_code=401, detail="Account not verified. Please verify your email.")

    # Enable simulation on login
    users_collection.update_one({"email": req.email}, {"$set": {"simulation_enabled": True}})
        
    token = create_access_token({"sub": user["email"], "username": user["username"]})

    return {
        "success": True, 
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "email": user["email"],
        "userId": str(user["_id"])
    }

@app.post("/logout")
async def logout(user_data: dict = Depends(verify_user_token)):
    email = user_data.get("sub")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token data")
        
    result = users_collection.update_one(
        {"email": email},
        {"$set": {"simulation_enabled": False}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {"success": True, "message": "Logged out successfully and simulation disabled"}

# ---------- CORE ENDPOINTS ----------
@app.post("/api/llm/parse")
async def api_llm_parse(cmd: UserCommand, user_data: dict = Depends(verify_user_token)) -> dict:
    """Text → JSON Intent"""
    try:
        completion = client.chat.completions.create(
            model="openai/gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": COMMAND_SYSTEM_PROMPT},
                {"role": "user", "content": cmd.text},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        
        raw = completion.choices[0].message.content.strip()
        print(f"🔍 LLM RAW: {raw}")  # Debug
        
        if not raw:
            return {"success": False, "error": "Empty LLM response"}
        
        intent = json.loads(raw)
        normalized = build_full_intent(intent)
        
        return {
            "success": True,
            "intent": normalized,
            "message": f"Parsed: {normalized.get('intent', 'unknown')}"
        }
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON error: {str(e)}", "raw": raw if 'raw' in locals() else None}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/command", response_model=ParsedCommand)
async def api_forward_to_agent(intent_data: dict, user_data: dict = Depends(verify_user_token)) -> ParsedCommand:
    """JSON Intent → Action (Local Simulator)"""
    # Just handle the intent here instead of forwarding to a remote agent
    # extract user info
    email = user_data.get("sub")
    user_doc = users_collection.find_one({"email": email})
    user_id = str(user_doc["_id"]) if user_doc else None

    # The frontend likely sends { "intent": { "intent": "set_device_state", ... } }
    # So we need to unwrap it once.
    real_intent = intent_data.get("intent", {})
    
    # If for some reason it's flat, fallback (safety check)
    if isinstance(real_intent, str): 
         # Edge case: if intent_data IS the intent object itself, e.g. { "intent": "set_device_state" }
         # But the previous code suggests nesting. Let's assume nesting first.
         # Actually, better logic:
         pass
    
    # Robust unwrapping:
    if "intent" in intent_data and isinstance(intent_data["intent"], dict):
        real_intent = intent_data["intent"]
    else:
        # Check if intent_data is already the object
        real_intent = intent_data

    intent_name = real_intent.get("intent")
    
    try:
        if intent_name == "set_device_state":
            device_id = real_intent.get("device_id")
            state = real_intent.get("state", {})
            if not device_id:
                return ParsedCommand(status="error", parsed_intent=real_intent, message="Missing device_id")
            
            # Call Simulator
            # We pass userId so the simulator finds the right device doc
            payload = {**state, "userId": user_id}
            
            sim_res = requests.post(f"{SIMULATOR_URL}/sim/devices/{device_id}", json=payload, timeout=5)
            
            if sim_res.status_code == 200:
                print(f"✅ Command executed: {device_id} -> {state}")
                return ParsedCommand(status="ok", parsed_intent=real_intent, message=f"Executed: Set {device_id} state.")
            else:
                return ParsedCommand(status="error", parsed_intent=real_intent, message=f"Simulator Error: {sim_res.text}")

        # You can add logic for 'enable_energy_saving_mode' here later
        
        return ParsedCommand(
            status="ok",
            parsed_intent=real_intent,
            message=f"Intent '{intent_name}' processed (simulated)."
        )

    except Exception as e:
        print(f"❌ Command execution failed: {e}")
        return ParsedCommand(
            status="error",
            parsed_intent=real_intent,
            message=f"Execution failed: {str(e)}"
        )

# ---------- MAIN ----------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
