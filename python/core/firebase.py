# firebase.py
import os
from dotenv import load_dotenv
from firebase_admin import credentials, initialize_app, firestore as admin_fs, auth
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
FIRESTORE_PROJECT_ID = os.getenv("FIRESTORE_PROJECT_ID")

if not GOOGLE_APPLICATION_CREDENTIALS or not os.path.exists(GOOGLE_APPLICATION_CREDENTIALS):
    raise RuntimeError("서비스 계정 경로가 유효하지 않습니다.")

try:
    cred = credentials.Certificate(GOOGLE_APPLICATION_CREDENTIALS)
    initialize_app(cred, {"projectId": FIRESTORE_PROJECT_ID})
except ValueError:
    pass  # 이미 초기화됨

db = admin_fs.client()  # Firestore
# 필요 시: auth.verify_id_token(id_token) 으로 토큰 검증

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")