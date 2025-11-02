Nomi: A multi-sensor network system to make sure that elderly are safe, healthy, and promptly assisted.

# 🧠 NOMI: Agentic AI Elder Care System  

![Dashboard Preview](docs/dashboard.png)

**NOMI** is an AI-powered companion system that helps ensure elderly individuals remain safe, healthy, and cared for.  
It combines **real-time IoT sensing**, **cloud analytics**, and **NVIDIA-powered reasoning AI** to detect events, analyze context, and notify caregivers instantly.

---

## 🏆 Built For  
**NVIDIA × AWS Generative AI Hackathon 2025**  
> *Category: Agentic AI Systems with Real-World Impact*  

---

## 🧩 Table of Contents
1. [Overview](#overview)  
2. [Core Features](#core-features)  
3. [Architecture Diagram](#architecture-diagram)  
4. [Technology Stack](#technology-stack)  
5. [Project Structure](#project-structure)  
6. [Backend Setup (FastAPI)](#backend-setup-fastapi)  
7. [Frontend Setup (React)](#frontend-setup-react)  
8. [AWS + NIM Integration](#aws--nim-integration)  
9. [SageMaker Deployment Notes](#sagemaker-deployment-notes)  
10. [Local Testing](#local-testing)  
11. [Future Enhancements](#future-enhancements)  
12. [Contributors](#contributors)

---

## 🧭 Overview

NOMI acts as an intelligent home health assistant. It collects sensor data — from heart rate and oxygen levels to motion and posture — and interprets it using NVIDIA’s **Nemotron-based NIM LLM**, surfacing insights and alerts for caregivers.

### 🔍 What It Detects
- Vital signs (heart rate, oxygen saturation)
- Temperature and humidity  
- Posture (standing, sleeping, fallen)  
- Eating and medication activity  
- Fall or inactivity incidents  

---

## 💡 Core Features

✅ Real-time data ingestion via ESP32 → AWS DynamoDB  
✅ AI-powered reasoning summaries via **NVIDIA NIM (Llama-3.1-Nemotron-8B)**  
✅ Email alerts for fall detection and abnormal vitals  
✅ Responsive caregiver dashboard (React + TailwindCSS)  
✅ Serverless AWS backend (Lambda + API Gateway + DynamoDB)  
✅ Extensible modular architecture  

---

## 🧱 Architecture Diagram

[ Sensors ]
↓
[ ESP32 + NodeRED ]
↓
[ AWS DynamoDB ]
↓
[ AWS Lambda / API Gateway ]
↓
[ FastAPI Backend (NOMI Core) ]
↓
[ NVIDIA NIM (Llama-3.1-Nemotron) ]
↓
[ Reasoned Summary + Insights ]
↓
[ React Frontend Dashboard ]
↓
[ Email/SMS Alerts via AWS SNS ]


---

## ⚙️ Technology Stack

### 🧠 AI & Reasoning
- **NVIDIA NIM (Llama-3.1-Nemotron-8B)** — reasoning model  
- **NVIDIA NGC API** — secure inference endpoint  
- **OpenAI-compatible JSON interface**

### ☁️ Cloud Infrastructure
- **AWS DynamoDB** — sensor data storage  
- **AWS Lambda + API Gateway** — public data endpoint  
- **AWS SNS / Gmail SMTP** — caregiver notifications  

### 💻 Backend
- **FastAPI (Python 3.9+)** — main logic layer  
- **boto3** — AWS SDK  
- **dotenv / Pydantic** — configuration and validation  

### 🌐 Frontend
- **React + TailwindCSS** — caregiver dashboard  
- **Recharts** — live data visualization  
- **Fetch API** — connects to FastAPI routes  

### 🔧 Hardware
- **ESP32 Dev Board** — sensor hub  
- **Pulse & Pressure Sensors** — heart rate, eating/meds  
- **OpenCV + MediaPipe** — local fall detection (optional)  

---

## 📁 Project Structure
nomi/
├── backend/
│ ├── app.py # FastAPI backend
│ ├── requirements.txt
│ ├── .env
│ └── email_alerts.py
│
├── frontend/
│ ├── src/
│ │ ├── components/
│ │ │ ├── Dashboard.js
│ │ │ └── Charts.js
│ │ └── App.js
│ ├── package.json
│ └── README.md
│
└── docs/
├── dashboard.png
├── architecture.png
└── demo_video.mp4



---

## 🚀 Backend Setup (FastAPI)

### 1️⃣ Create and Activate Virtual Environment
```bash
cd backend
python3 -m venv venv
source venv/bin/activate



2️⃣ Install Dependencies
pip install -r requirements.txt

3️⃣ Add Environment Variables

Create a .env file:

NGC_API_KEY=your_nvidia_ngc_api_key
NIM_ENDPOINT=https://integrate.api.nvidia.com/v1/chat/completions
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
EMAIL_SENDER=your_email@gmail.com
EMAIL_RECIPIENT=caregiver_email@gmail.com
EMAIL_PASSWORD=your_app_password
DYNAMO_API_URL=https://<your-api>.execute-api.us-east-1.amazonaws.com/default/nomiData


4️⃣ Run the Server
uvicorn app:app --reload


💻 Frontend Setup (React)
1️⃣ Install and Start
cd frontend
npm install
npm start

2️⃣ Set Backend URL

In src/config.js:

export const API_BASE = "http://127.0.0.1:8000";


🤖 AWS + NIM Integration

Each reasoning request is handled by the FastAPI route /analyze:

import requests, os

headers = {
  "Authorization": f"Bearer {os.getenv('NGC_API_KEY')}",
  "Content-Type": "application/json"
}

payload = {
  "model": "meta/llama-3.1-nemotron-8b",
  "messages": [{"role": "user", "content": "Summarize recent health readings"}],
  "max_tokens": 200
}

r = requests.post(os.getenv("NIM_ENDPOINT"), headers=headers, json=payload)


Responses are streamed to the React dashboard and used for caregiver updates.

🧬 SageMaker Deployment Notes

Due to Service Control Policies (SCPs) in the AWS Vocareum sandbox,
SageMaker endpoint creation (CreateEndpoint, CreateModel, etc.) is explicitly blocked.

In production, NOMI would deploy via SageMaker using the NVIDIA NIM model ARN:

import boto3
sm = boto3.client("sagemaker")

model_arn = "arn:aws:sagemaker:us-east-1:865070037744:model-package/llama3-1-nemotron-nano-8b-v1-n-710c29bc58f0303aac54c77c70fc229a"

sm.create_model(
    ModelName="nomi-nim-model",
    PrimaryContainer={"ModelPackageName": model_arn},
    ExecutionRoleArn="arn:aws:iam::<your-account-id>:role/SageMakerExecutionRole"
)


🟢 For this project, reasoning runs via NVIDIA’s hosted NIM endpoint, achieving the same functionality.

🧪 Local Testing
Step	Description
1️⃣	Run uvicorn app:app --reload in backend
2️⃣	Run npm start in frontend
3️⃣	Open http://localhost:3000
4️⃣	View live sensor readings from DynamoDB
5️⃣	Trigger reasoning summary and fall alerts
📧 Example Alert Email

Subject: ⚠️ NOMI Alert: Fall Detected for Edna
Body:

Dear Caregiver,

NOMI detected a fall event for Edna at 2:14 PM.
Vital stats before fall:
- Heart Rate: 110 bpm
- Oxygen: 92%
- Temperature: 24.8°C / 47%

Immediate assistance is advised.
– NOMI Safety System

🔮 Future Enhancements

Real ESP32 streaming (MQTT)

Alexa voice integration

Full SageMaker deployment

Wearable & EHR integration

Advanced anomaly detection via RAG models

👩‍💻 Contributors
Name	Role
Ria Saheta	System Architect, AI Reasoning, Backend Integration
Crystal [Last Name]	Frontend Developer, UI/UX, AWS Infrastructure
🏁 Submission Checklist

✅ Clear README (this file)
✅ Public GitHub repository
✅ 3-minute demo video (linked in docs)
✅ Working backend + frontend
✅ NVIDIA NIM + AWS integration

GitHub Repository: https://github.com/yourusername/nomi

Demo Video: Watch Demo