from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import json
import requests
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
import re
# RAG imports
from typing import List, Optional
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings




# 🔹 Load environment variables
load_dotenv()

app = FastAPI()

NGC_API_KEY = os.getenv("NGC_API_KEY")
NIM_ENDPOINT = os.getenv("NIM_ENDPOINT")

# 🔹 Your DynamoDB API Gateway endpoint
DYNAMO_API_URL = "https://hyntpqmh6h.execute-api.us-east-1.amazonaws.com/default/nomi-dynamodb"

# --- RAG globals ---
NIM_EMBED_ENDPOINT = os.getenv("NIM_EMBED_ENDPOINT")  # nv-embedqa-e5-v5 NIM
_vectorstore: Optional[FAISS] = None
_embeddings: Optional[NVIDIAEmbeddings] = None

_text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=120, separators=["\n\n", "\n", " ", ""]
)



# Initialize SNS
sns_client = boto3.client(
    "sns",
    region_name="us-east-1",  # or whatever region you used
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

# -------------------------------
# 🔹 Prompt Builder
# -------------------------------
def build_nomiprompt(sensor_data, posture=None, pill_status=None, retrieved: List[str] = None):
    readable = json.dumps(sensor_data, indent=2)
    sensor_types = [d.get("sensor_type", "") for d in sensor_data] if isinstance(sensor_data, list) else []
    context_block = "\n".join(f"- {c}" for c in (retrieved or [])) or "None"

    if any(s in sensor_types for s in ["eating", "sleep", "fall_detector", "meds"]):
        # 💤 Daily summary mode
        prompt = f"""
        You are NOMI, an AI elder-care assistant summarizing daily activity logs.

        CONTEXT (retrieved top-k from historical):
        {context_block}

        These are the recorded events (current request):
        {readable}

        Generate:
        1. A short wellbeing summary for the day.
        2. A direct, friendly recommendation for the caregiver (addressed as “you”).
        3. A one-sentence reasoning behind your conclusion.

        Return output in strict JSON format:
        {{
        "summary": "",
        "recommendation": "",
        "reasoning": ""
        }}
        """
    else:
        # 💓 Real-time vitals mode
        prompt = f"""
        You are NOMI, an AI elder-care assistant.

        CONTEXT (retrieved top-k from historical):
        {context_block}

        Given these sensor readings:
        {readable}

        Current posture: {posture}
        Pill-bottle status: {pill_status}

        Generate:
        1. A one-sentence wellbeing summary describing the elderly person’s current condition utilizing the data records available to you. 
        2. A one-sentence recommendation addressed directly to the caregiver about the elderly person (e.g. “You should…” or “You can…”). 
        3. A one-sentence reasoning behind your conclusion. Be concise and heartwarming.

        Return output in strict JSON format:
        {{
        "summary": "",
        "recommendation": "",
        "reasoning": ""
        }}
        """
    return prompt


def _get_embeddings() -> NVIDIAEmbeddings:
    global _embeddings
    if _embeddings is None:
        if not NGC_API_KEY:
            raise RuntimeError("Missing NGC_API_KEY")
        _embeddings = NVIDIAEmbeddings(
            model="nvidia/nv-embedqa-e5-v5",
            api_key=NGC_API_KEY,
            base_url="https://integrate.api.nvidia.com/v1",  # ✅ not /embeddings
        )
    return _embeddings




def _normalize_row(row: dict) -> str:
    """Turn a Dynamo record into a compact line of text for embedding."""
    piece = []
    for key in ("timestamp", "patient_id", "sensor_type", "value", "vitals", "notes", "status"):
        if key in row:
            piece.append(f"{key}: {row[key]}")
    return " | ".join(piece) if piece else json.dumps(row)


def _fetch_historical() -> List[str]:
    """Pull historical data (same source you already use) and stringify."""
    url = os.getenv("DYNAMO_API_URL", DYNAMO_API_URL)
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload if isinstance(payload, list) else [payload]
    return [_normalize_row(r) for r in rows]


def build_or_refresh_vectorstore(force: bool = False) -> FAISS:
    """Create an in-memory FAISS index from historical data."""
    global _vectorstore
    if _vectorstore is not None and not force:
        return _vectorstore

    docs_raw = _fetch_historical()
    big_blob = "\n".join(docs_raw) if docs_raw else "No historical data."
    chunks = _text_splitter.split_text(big_blob) or ["No historical data."]
    embeddings = _get_embeddings()
    _vectorstore = FAISS.from_texts(chunks, embedding=embeddings)
    return _vectorstore


def retrieve_context(query: str, k: int = 2) -> List[str]:
    """Top-k semantic search over the FAISS index."""
    vs = build_or_refresh_vectorstore()
    docs = vs.similarity_search(query, k=k)
    return [d.page_content for d in docs]


def send_sns_alert(message, subject="NOMI Alert"):
    """Send an SMS alert via Amazon SNS"""
    try:
        response = sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=message,
            Subject=subject,
        )
        print("✅ SNS message sent:", response["MessageId"])
    except ClientError as e:
        print("❌ SNS Error:", e)


def safe_parse_json(llm_output: str):
    try:
        match = re.search(r"\{.*\}", llm_output, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    except Exception:
        pass
    return {"summary": llm_output.strip(), "recommendation": "", "reasoning": ""}


# -------------------------------
# 🔹 Routes
# -------------------------------
@app.get("/")
def root():
    return {"message": "NOMI backend is live!"}


# ---- 🔹 New Route: Fetch live data from DynamoDB ---- #
@app.get("/data")
def get_dynamo_data():
    """
    Fetches sensor data directly from your DynamoDB API Gateway endpoint.
    """
    try:
        response = requests.get(DYNAMO_API_URL)
        response.raise_for_status()
        data = response.json()
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Dynamo data: {e}")


# ---- 🔹 Basic LLM Chat ---- #
class MessageInput(BaseModel):
    message: str


@app.post("/generate")
def generate_response(input_data: MessageInput):
    headers = {
        "Authorization": f"Bearer {NGC_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "messages": [{"role": "user", "content": input_data.message}],
        "temperature": 0.7,
        "max_tokens": 100
    }

    try:
        response = requests.post(NIM_ENDPOINT, headers=headers, json=data)
        response.raise_for_status()
        output = response.json()
        return {"reply": output["choices"][0]["message"]["content"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---- 🔹 Smart Sensor Analysis ---- #
from typing import Optional  # make sure this import is at the top

class SensorBundle(BaseModel):
    posture: str = "normal"
    pill_status: str = "closed"
    sensor_data: list = []
    query: Optional[str] = None   # ✅ works in Python 3.9



import requests

@app.get("/data")
def get_sensor_data():
    """Fetch raw sensor data directly from your DynamoDB API Gateway endpoint."""
    try:
        response = requests.get("https://hyntpqmh6h.execute-api.us-east-1.amazonaws.com/default/nomi-dynamodb")
        response.raise_for_status()
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching Dynamo data: {e}")
    
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email_alert(subject, message):
    sender = os.getenv("EMAIL_SENDER")
    recipient = os.getenv("EMAIL_RECIPIENT")
    password = os.getenv("EMAIL_PASSWORD")

    if not all([sender, recipient, password]):
        print("⚠️ Email config missing in .env")
        return

    try:
        msg = MIMEMultipart()
        msg["From"] = sender
        msg["To"] = recipient
        msg["Subject"] = subject

        msg.attach(MIMEText(message, "plain"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.send_message(msg)
        print("✅ Email alert sent successfully!")
    except Exception as e:
        print(f"❌ Email send failed: {e}")


@app.post("/analyze")
def analyze(bundle: SensorBundle):
    """
    Analyze sensor data from request or DynamoDB.
    Uses NVIDIA NIM for reasoning and triggers SMS alerts via SNS when needed.
    """
    try:
        # ---- 1️⃣ Get data source ----
        if not bundle.sensor_data:
            DYNAMO_API_URL = os.getenv("DYNAMO_API_URL", "https://hyntpqmh6h.execute-api.us-east-1.amazonaws.com/default/nomi-dynamodb")
            dynamo_response = requests.get(DYNAMO_API_URL)
            dynamo_response.raise_for_status()
            bundle.sensor_data = dynamo_response.json()
        
        # ---- 2A) Build a retrieval query and get top-2 chunks ----
        retrieval_query = bundle.query
        if not retrieval_query:
            # fallbacks: use sensor types, notes, or generic
            if isinstance(bundle.sensor_data, list) and bundle.sensor_data:
                # try to build a simple text query from the latest few records
                tail = bundle.sensor_data[-5:]
                retrieval_query = " ".join(
                    str(x.get("sensor_type", "")) + " " + str(x.get("notes", ""))
                    for x in tail
                ).strip() or "recent patient trends"
            else:
                retrieval_query = "recent patient trends"

        retrieved_chunks = retrieve_context(retrieval_query, k=2)


        # ---- 2️⃣ Build prompt for NIM ----
        prompt = build_nomiprompt(
        sensor_data=bundle.sensor_data,
        posture=bundle.posture,
        pill_status=bundle.pill_status,
        retrieved=retrieved_chunks,       # <-- NEW
        )
        if retrieved_chunks:
            context_block = "\n".join(retrieved_chunks)
            prompt += f"\n\nRelevant historical context:\n{context_block}"


        # ---- 3️⃣ Prepare and send to NVIDIA NIM ----
        headers = {
            "Authorization": f"Bearer {NGC_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.5,
            "max_tokens": 150
        }

        NIM_REASON_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {NGC_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "nvidia/llama-3.1-nemotron-nano-8b-v1",
            "messages": [
                {"role": "system", "content": "You are NOMI, an elder-care analysis assistant."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 400
        }

        response = requests.post(NIM_REASON_URL, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()
        summary_text = result["choices"][0]["message"]["content"]


        # ---- 5️⃣ Optional: Try to parse JSON block from the LLM output ----
        parsed_output = {}
        try:
            start = summary_text.find("{")
            end = summary_text.rfind("}") + 1
            if start != -1 and end != -1:
                parsed_output = json.loads(summary_text[start:end])
        except Exception:
            parsed_output = {"summary": summary_text, "recommendation": "", "reasoning": ""}

        # ---- 6️⃣ Trigger alerts if concerning content detected ----
        keywords = ["fall", "unconscious", "critical", "abnormal", "emergency", "not breathing", "low oxygen"]
        if any(k in summary_text.lower() for k in keywords):
            alert_msg = f"🚨 NOMI Alert:\n{parsed_output.get('summary', summary_text)}\n\nRecommendation: {parsed_output.get('recommendation', '')}"
            send_email_alert("🚨 Emergency Detected by NOMI", alert_msg)

        # ---- 7️⃣ Return structured result ----
        return {
            "summary": parsed_output.get("summary", summary_text),
            "recommendation": parsed_output.get("recommendation", ""),
            "reasoning": parsed_output.get("reasoning", ""),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze data: {e}")
