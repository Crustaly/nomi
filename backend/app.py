from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import json
import requests
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
import os



# 🔹 Load environment variables
load_dotenv()

app = FastAPI()

NGC_API_KEY = os.getenv("NGC_API_KEY")
NIM_ENDPOINT = os.getenv("NIM_ENDPOINT")

# 🔹 Your DynamoDB API Gateway endpoint
DYNAMO_API_URL = "https://hyntpqmh6h.execute-api.us-east-1.amazonaws.com/default/nomi-dynamodb"



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
def build_nomiprompt(sensor_data, posture=None, pill_status=None):
    readable = json.dumps(sensor_data, indent=2)
    sensor_types = [d.get("sensor_type", "") for d in sensor_data]

    if any(s in sensor_types for s in ["eating", "sleep", "fall_detector", "meds"]):
        # 💤 Daily summary mode
        prompt = f"""
You are NOMI, an AI elder-care assistant summarizing daily activity logs.

These are the recorded events:
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
class SensorBundle(BaseModel):
    posture: str = "normal"
    pill_status: str = "closed"
    sensor_data: list = []

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

        # ---- 2️⃣ Build prompt for NIM ----
        prompt = build_nomiprompt(
            sensor_data=bundle.sensor_data,
            posture=bundle.posture,
            pill_status=bundle.pill_status
        )

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

        response = requests.post(NIM_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        result = response.json()

        # ---- 4️⃣ Extract model text ----
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
