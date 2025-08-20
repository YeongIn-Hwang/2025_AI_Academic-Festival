# main.py
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

# firebase_admin 초기화 (이미 다른 곳에서 한다면 중복 방지)
import firebase_admin
from firebase_admin import credentials

# 이미 초기화돼있지 않다면 서비스키/기본버킷과 함께 초기화
if not firebase_admin._apps:
    # service_account.json 경로/이름은 환경에 맞게 변경
    cred = credentials.Certificate("service_account.json")
    # storageBucket은 Firebase Storage 버킷 주소
    firebase_admin.initialize_app(cred, {"storageBucket": os.getenv("FIREBASE_BUCKET")})

# 라우터 임포트
from routes import user, prefs, places, prepare, travel_log, geocode, update_user_params, lightgcn

# ===== SBERT 모델명 =====
SBERT_NAME = os.getenv("SBERT_NAME", "snunlp/KR-SBERT-V40K-klueNLI-augSTS")

def load_sbert():
    model = SentenceTransformer(SBERT_NAME)
    model.eval()
    _ = model.encode(["워밍업"], convert_to_numpy=True)
    return model

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1) SBERT 로드
    app.state.sbert = load_sbert()

    # 2) 서버 기동 직후 LightGCN warm-start (학습 데이터 있으면 학습/업로드)
    async def _warm():
        # 너무 무거우면 환경변수로 스킵 가능
        if os.getenv("LIGHTGCN_WARM", "1") != "1":
            print("[LightGCN] warm_start skipped by env LIGHTGCN_WARM")
            return
        try:
            # routes/lightgcn.py의 동기 함수 호출을 스레드로 넘겨 비동기화
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lightgcn.warm_start)
            print("[LightGCN] warm_start done.")
        except Exception as e:
            print("[LightGCN] warm_start failed:", e)

    asyncio.create_task(_warm())

    yield
    # 종료 시 정리 필요하면 여기서

app = FastAPI(lifespan=lifespan)

# ===== CORS =====
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if not origins:
    origins = ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
     allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_sbert(request: Request):
    m = getattr(request.app.state, "sbert", None)
    if m is None:
        request.app.state.sbert = load_sbert()
        m = request.app.state.sbert
    return m

@app.get("/test_sbert")
def test_sbert(request: Request):
    model = get_sbert(request)
    dim = model.get_sentence_embedding_dimension()
    return {"ready": True, "model": SBERT_NAME, "dim": dim}

# ===== 라우터 등록 (중복 없이!) =====
app.include_router(user.router, prefix="")
app.include_router(prefs.router, prefix="")
app.include_router(places.router, prefix="")
app.include_router(prepare.router, prefix="")
app.include_router(travel_log.router, prefix="")
app.include_router(geocode.router, prefix="/api")
app.include_router(update_user_params.router, prefix="")
app.include_router(lightgcn.router, prefix="")

# 실행: uvicorn main:app --host 0.0.0.0 --port 8000
