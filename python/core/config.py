import os
from dotenv import load_dotenv

load_dotenv()

FIRESTORE_PROJECT_ID = os.getenv("FIRESTORE_PROJECT_ID")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

# CORS 허용 도메인 목록
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if not CORS_ORIGINS:
    CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]