# main.py
import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

# =========================
# Firebase Admin 초기화
# =========================
import firebase_admin
from firebase_admin import credentials

logging.basicConfig(level=logging.INFO)

def _init_firebase_app():
    """
    service_account.json에서 project_id를 읽어 기본 Storage 버킷을 자동 설정.
    - 환경변수 FIREBASE_BUCKET 이 있으면 그 값을 우선 사용.
    - 없으면 <project_id>.firebasestorage.app 으로 추론.
    """
    if firebase_admin._apps:
        app = firebase_admin.get_app()
        try:
            bucket = (app.options or {}).get("storageBucket")
        except Exception:
            bucket = None
        logging.info(f"[FB] already initialized. bucket={bucket}")
        return app

    # Render Secret Files 등을 고려: 절대경로나 파일명 모두 허용
    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "service_account.json")
    cred = credentials.Certificate(sa_path)

    bucket = os.getenv("FIREBASE_BUCKET")
    if not bucket:
        try:
            with open(sa_path, "r", encoding="utf-8") as f:
                project_id = json.load(f).get("project_id")
            if project_id:
                bucket = f"{project_id}.firebasestorage.app"
        except Exception as e:
            logging.warning(f"[FB] failed to infer bucket from {sa_path}: {e}")
            bucket = None

    options = {"storageBucket": bucket} if bucket else {}
    app = firebase_admin.initialize_app(cred, options)
    logging.info(f"[FB] initialized. bucket={bucket}")
    return app

# 실제 초기화 수행
_init_firebase_app()

# =========================
# 라우터 임포트 (Firebase 이후)
# =========================
from routes import user, prefs, places, prepare, travel_log, geocode, update_user_params, lightgcn

# =========================
# SBERT 로딩 (가벼운 기본값으로 변경)
# =========================
SBERT_NAME = os.getenv(
    "SBERT_NAME",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

def load_sbert():
    model = SentenceTransformer(SBERT_NAME)
    model.eval()
    _ = model.encode(["워밍업"], convert_to_numpy=True)
    return model

# =========================
# Lifespan (워밍업 + LightGCN warm_start)
# =========================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1) SBERT 로드
    app.state.sbert = load_sbert()
    logging.info(f"[SBERT] loaded: {SBERT_NAME}")

    # 2) 서버 기동 직후 LightGCN warm-start
    async def _warm():
        if os.getenv("LIGHTGCN_WARM", "1") != "1":
            logging.info("[LightGCN] warm_start skipped by env LIGHTGCN_WARM")
            return
        try:
            logging.info("[LightGCN] warm_start: begin")
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(None, lightgcn.warm_start)
            logging.info(f"[LightGCN] warm_start: done -> {res}")
        except Exception:
            logging.exception("[LightGCN] warm_start failed")

    asyncio.create_task(_warm())
    yield
    # (종료 시 정리 필요하면 여기서)

app = FastAPI(lifespan=lifespan)

# =========================
# CORS
# - 환경변수 CORS_ORIGINS: 콤마(,)로 여러 개
# - 자동 추론: RENDER/VERCEL/프론트 개발용 로컬
# - 정규식: *.vercel.app, *.onrender.com 허용
# =========================
def build_allowed_origins():
    env_list = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

    # Render가 제공하는 서비스 URL (예: https://voyage-xxxx.onrender.com) — 프런트에서 API 직접 칠 수 있으면 필요
    render_url = os.getenv("RENDER_EXTERNAL_URL")
    if render_url:
        env_list.append(render_url)

    # 사용자가 별도로 지정할 수도 있는 프론트 URL
    frontend_url = os.getenv("FRONTEND_URL") or os.getenv("VERCEL_FRONTEND_URL")
    if frontend_url:
        env_list.append(frontend_url)

    # 로컬 개발 기본값
    defaults = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    # 중복 제거
    out = []
    for x in env_list + defaults:
        if x and x not in out:
            out.append(x)
    return out

origins = build_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Vercel/Render의 프리뷰/프로덕션 도메인 전체 허용 (https 전용)
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*(vercel\.app|onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.info(f"[CORS] allow_origins={origins}")

# =========================
# 유틸 & 헬스체크
# =========================
def get_sbert(request: Request):
    m = getattr(request.app.state, "sbert", None)
    if m is None:
        request.app.state.sbert = load_sbert()
        m = request.app.state.sbert
    return m

@app.get("/")
def root():
    return {"ok": True, "service": "voyage-api"}

@app.get("/healthz")
def healthz():
    return {"status": "ok", "sbert": SBERT_NAME}

@app.get("/test_sbert")
def test_sbert(request: Request):
    model = get_sbert(request)
    dim = model.get_sentence_embedding_dimension()
    return {"ready": True, "model": SBERT_NAME, "dim": dim}

# =========================
# 라우터 등록
# =========================
app.include_router(user.router, prefix="")
app.include_router(prefs.router, prefix="")
app.include_router(places.router, prefix="")
app.include_router(prepare.router, prefix="")
app.include_router(travel_log.router, prefix="")
app.include_router(geocode.router, prefix="/api")
app.include_router(update_user_params.router, prefix="")
app.include_router(lightgcn.router, prefix="")

# 실행 예) uvicorn main:app --host 0.0.0.0 --port 8000
