import sys
import os

# Force unbuffered output so prints show immediately
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

from unittest.mock import MagicMock

# Mock the entire pyiceberg library
sys.modules["pyiceberg"] = MagicMock()
sys.modules["pyiceberg.catalog"] = MagicMock()
sys.modules["pyiceberg.catalog.rest"] = MagicMock()

from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
from typing import Optional

# --- GOOGLE GENAI SDK IMPORTS ---
from google import genai
from google.genai import types

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://sapa-shield-pi.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

print(f"Supabase URL: {url}", flush=True)
print(f"Supabase Key exists: {key is not None}", flush=True)

if not url or not key:
    print("⚠️ WARNING: Supabase credentials missing!", flush=True)
    supabase = None
else:
    try:
        supabase: Client = create_client(url, key)
        print("✅ Supabase client created successfully!", flush=True)
    except Exception as e:
        print(f"❌ Failed to create Supabase client: {e}", flush=True)
        supabase = None

# --- INITIALIZE GEMINI AI CLIENT ---
gemini_key = os.environ.get("GEMINI_API_KEY")
if not gemini_key:
    print("⚠️ WARNING: GEMINI_API_KEY missing from environment variables! AI feature will be offline.", flush=True)
    ai_client = None
else:
    try:
        ai_client = genai.Client(api_key=gemini_key)
        print("\n✅ Gemini AI client initialized successfully!\n", flush=True)
    except Exception as e:
        print(f"❌ Failed to initialize Gemini client: {e}", flush=True)
        ai_client = None


@app.get("/predict")
async def predict_sapa(
    balance: float = Query(..., description="Account balance in NGN"),
    daily_spend: float = Query(..., description="Daily spending amount in NGN"),
    user_id: str = Query(..., description="User ID from Supabase Auth"),
    user_email: str = Query(..., description="User email"),
    authorization: Optional[str] = Header(None)
):
    print(f"\n🔵 PREDICTION REQUEST RECEIVED", flush=True)
    print(f"   User: {user_email} (ID: {user_id})", flush=True)
    print(f"   Balance: {balance}, Daily Spend: {daily_spend}", flush=True)
    
    if not authorization:
        print("   ❌ No authorization token provided", flush=True)
        raise HTTPException(status_code=401, detail="Authorization token required")
    
    if supabase:
        try:
            token = authorization.replace("Bearer ", "")
            user = supabase.auth.get_user(token)
            if not user or user.user.id != user_id:
                print(f"   ❌ Authentication failed: User ID mismatch", flush=True)
                raise HTTPException(status_code=401, detail="Invalid authentication")
            print(f"   ✅ User authenticated: {user.user.email}", flush=True)
        except Exception as e:
            print(f"   ❌ Authentication failed: {e}", flush=True)
            raise HTTPException(status_code=401, detail="Authentication failed")
    else:
        print("   ⚠️ Supabase not available, skipping authentication", flush=True)
    
    if balance < 0:
        raise HTTPException(status_code=400, detail="Balance cannot be negative.")
    if daily_spend <= 0:
        raise HTTPException(status_code=400, detail="Daily spend must be greater than zero.")
    
    if balance == 0:
        days_left = 0
        status = "Danger"
        recommendation = "Emergency! Zero balance detected. Find income sources immediately."
    else:
        days_left = int(balance / daily_spend)
        if days_left < 5:
            status = "Danger"
            recommendation = "🚨 EMERGENCY: You're running low on funds! Cancel subscriptions! 🚨"
        elif days_left < 14:
            status = "Warning"
            recommendation = "⚠️ WARNING: Sapa is approaching. Start budgeting NOW! ⚠️"
        else:
            status = "Safe"
            recommendation = "✅ You're safe. Keep tracking your spending! ✅"
    
    print("📝 Attempting to save to database...", flush=True)
    if supabase:
        try:
            data = {
                "balance": balance,
                "daily_spend": daily_spend,
                "days_left": days_left,
                "status": status,
                "user_id": user_id,
                "user_email": user_email
            }
            result = supabase.table("survival_logs").insert(data).execute()
            print(f"✅ DATABASE SUCCESS! Saved prediction for {user_email}", flush=True)
        except Exception as e:
            print(f"❌ DATABASE ERROR: {e}", flush=True)
    
    return {
        "days_left": days_left,
        "status": status,
        "recommendation": recommendation
    }


@app.get("/history/{user_id}")
async def get_user_history(
    user_id: str,
    limit: int = 10,
    authorization: Optional[str] = Header(None)
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not connected")
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization token required")
    
    try:
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        if not user or user.user.id != user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        result = supabase.table("survival_logs")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/coach/{user_id}")
async def get_ai_coaching(
    user_id: str,
    authorization: Optional[str] = Header(None)
):
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI Service offline or key missing")
    if not supabase:
        raise HTTPException(status_code=503, detail="Database disconnected")
        
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization token required")
    try:
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        if not user or user.user.id != user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication profile")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Authentication failed")

    try:
        result = supabase.table("survival_logs")\
            .select("balance", "daily_spend", "days_left", "status", "created_at")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(3)\
            .execute()
        logs = result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve history logs for AI context extraction")

    if not logs:
        user_context = "The user has no recorded entries yet. They are initializing Sapa-Shield fresh today."
    else:
        latest = logs[0]
        user_context = (
            f"Active Financial Snapshot:\n"
            f"- Account Balance: NGN {latest['balance']:,}\n"
            f"- Current Daily Spend Rate: NGN {latest['daily_spend']:,}\n"
            f"- Current Survival Days Runway remaining: {latest['days_left']} days\n"
            f"- System Alert Flag: {latest['status']}\n\n"
            f"Recent Stored Runway Log History (Newest to Oldest):\n"
        )
        for i, log in enumerate(logs):
            user_context += f"Entry {i+1}: Balance=NGN {log['balance']:,}, Daily Spend=NGN {log['daily_spend']:,}, Days Left={log['days_left']}\n"

    system_instruction = (
        "You are Sapa-Shield AI, an intelligent financial coach built "
        "specifically for Nigerian university students battling budget issues. Your tone must be "
        "professional, conversational, highly relatable, solution-based, helpful, and highly accurate. "
        "Keep your final response short, snappy, and give good advice."
    )

    try:
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Analyze my history trend parameters and create tailored coaching instructions:\n\n{user_context}",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.8,
                max_output_tokens=450
            )
        )
        return {"coaching_advice": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail="The AI Coach hit a temporary network issue.")


# --- MODIFIED HEALTH ENDPOINT FOR DIRECT VERIFICATION ---
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "supabase_connected": supabase is not None,
        "gemini_ai_connected": ai_client is not None  # <-- Explicit verification
    }


@app.get("/test-db")
async def test_database():
    if not supabase: return {"error": "Supabase not connected"}
    try:
        result = supabase.table("survival_logs").select("*").limit(1).execute()
        return {"success": True, "data": result.data, "message": "Database is working!"}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)