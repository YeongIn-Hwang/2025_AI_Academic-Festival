# main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# ===== 라우터 =====
from routes import user          # 기존: /user_param_init
from routes import prefs         # 추가: /user_keywords_embed

# ===== SBERT 로드 =====
from sentence_transformers import SentenceTransformer

from routes import user, prefs, places  # ← places 추가

SBERT_NAME = os.getenv("SBERT_NAME", "snunlp/KR-SBERT-V40K-klueNLI-augSTS")

def load_sbert():
    model = SentenceTransformer(SBERT_NAME)
    model.eval()
    # 워밍업 (첫 요청 지연 방지)
    _ = model.encode(["워밍업"], convert_to_numpy=True)
    return model

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 서버 시작 시 1회 로드
    app.state.sbert = load_sbert()
    yield
    # 종료 시 별도 정리 없음

app = FastAPI(lifespan=lifespan)

# ===== CORS =====
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if not origins:
    origins = ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 라우터 등록 =====
app.include_router(user.router, prefix="")   # /user_param_init
app.include_router(prefs.router, prefix="")  # /user_keywords_embed

# ===== SBERT 접근 함수 =====
def get_sbert(request: Request):
    m = getattr(request.app.state, "sbert", None)
    if m is None:
        # lifespan 전에 접근하는 경우 방지용
        request.app.state.sbert = load_sbert()
        m = request.app.state.sbert
    return m

# (선택) 헬스체크: 모델 벡터 차원 확인용
@app.get("/test_sbert")
def test_sbert(request: Request):
    model = get_sbert(request)
    dim = model.get_sentence_embedding_dimension()
    return {"ready": True, "model": SBERT_NAME, "dim": dim}

# 실행: uvicorn main:app --reload

app.include_router(places.router, prefix="")  # ← 이 줄 추가