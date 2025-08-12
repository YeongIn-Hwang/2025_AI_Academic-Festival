# main.py
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

# 라우터 한 번에 임포트 (중복 제거)
from routes import user, prefs, places, prepare, travel_log

# ===== SBERT 모델명 =====
SBERT_NAME = os.getenv("SBERT_NAME", "snunlp/KR-SBERT-V40K-klueNLI-augSTS")

def load_sbert():
    model = SentenceTransformer(SBERT_NAME)
    model.eval()
    _ = model.encode(["워밍업"], convert_to_numpy=True)
    return model

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.sbert = load_sbert()
    yield

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

# ===== 라우터 등록 =====
app.include_router(user.router, prefix="")           # /user_param_init
app.include_router(prefs.router, prefix="")          # /user_keywords_embed
app.include_router(places.router, prefix="")         # 장소 저장/조회

# 경로 생성 전용 (prepare.py): /routes/prepare_basic, /routes/prepare_dqn 등
app.include_router(prepare.router, prefix="")

# 여행 기록 저장/조회 전용 (travel_log.py): /save_travel_log, /trips/{uid}/{title}/timeline
app.include_router(travel_log.router, prefix="")

# ===== 실행 =====
# uvicorn main:app --reload --host 0.0.0.0 --port 8000
