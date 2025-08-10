# routes/places.py (중복 제목 자동 분기 + 후보 상한 + 디버그 로그)
import os
import time
import logging
from typing import List, Tuple
import numpy as np
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

# ① 장소 수집 단계
from services.get_place import fetch_trusted_places

# ② 임베딩/점수 단계
from services.review_embedding import (
    clean_reviews_in_places,
    add_review_vectors_to_places,
    add_name_vectors,          # 이름 임베딩 캐싱 (필요 시 services.review_embedding에 구현)
)
from services.keyword_cal import (
    add_hope_scores_to_places,
    add_nonhope_scores_to_places,
)

# ③ 저장 단계 (Firestore) - 최종 제목 반환 버전 사용
from services.save_embedding_place import save_places_to_firestore

# 유저 벡터 로드용
from core.firebase import db

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

PLACE_TYPES: List[str] = [
    "tourist_attraction",
    "cafe",
    "bar",
    "bakery",
    "restaurant",
    "shopping_mall",
]

# 수집 후 전체 후보 상한 (속도/용량 보호)
MAX_TOTAL_PLACES = 120

class BuildIn(BaseModel):
    uid: str
    title: str = Field(..., description="여행 제목")
    query: str = Field(..., description="기점(예: 신도림역)")
    method: int = Field(2, description="1:도보, 2:대중교통, 3:운전")

class FetchOnlyIn(BaseModel):
    query: str
    method: int = 2

def _require_model_and_key(request: Request) -> Tuple[SentenceTransformer, str]:
    model: SentenceTransformer = getattr(request.app.state, "sbert", None)
    if model is None:
        raise HTTPException(500, "SBERT 모델이 초기화되지 않았습니다.")
    gmaps_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not gmaps_key:
        raise HTTPException(500, "GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.")
    return model, gmaps_key

def _load_user_vecs(uid: str, model: SentenceTransformer) -> Tuple[np.ndarray, np.ndarray]:
    dim = model.get_sentence_embedding_dimension()
    hope = np.zeros(dim, dtype=np.float32)
    non  = np.zeros(dim, dtype=np.float32)

    snap = db.collection("user_params").document(uid).get()
    if snap.exists:
        d = snap.to_dict() or {}
        hv = d.get("hope_vec") or d.get("hope_vector")
        nv = d.get("nonhope_vec") or d.get("nonhope_vector")
        if isinstance(hv, list) and len(hv) == dim:
            hope = np.array(hv, dtype=np.float32)
        if isinstance(nv, list) and len(nv) == dim:
            non = np.array(nv, dtype=np.float32)
    return hope, non

def _t() -> float:
    return time.perf_counter()

def _log_step(tag: str, start_ts: float, **extra):
    elapsed = (time.perf_counter() - start_ts) * 1000.0
    if extra:
        logger.info(f"[places] {tag} - {elapsed:.1f} ms | {extra}")
    else:
        logger.info(f"[places] {tag} - {elapsed:.1f} ms")

@router.post("/places_fetch_only")
def places_fetch_only(payload: FetchOnlyIn, request: Request):
    _, gmaps_key = _require_model_and_key(request)

    q = (payload.query or "").strip()
    m = int(payload.method or 2)
    if not q:
        raise HTTPException(400, "query는 필수입니다.")

    ts = _t()
    places = fetch_trusted_places(q, m, gmaps_key, PLACE_TYPES)
    _log_step("fetch_only:fetch_trusted_places", ts, count=len(places), query=q, method=m)

    # 상한 적용(옵션)
    if len(places) > MAX_TOTAL_PLACES:
        places.sort(key=lambda p: p.get("trust_score", 0), reverse=True)
        places = places[:MAX_TOTAL_PLACES]

    return {"ok": True, "count": len(places), "sample": places[:5]}

@router.post("/places_build_save")
def places_build_save(payload: BuildIn, request: Request):
    model, gmaps_key = _require_model_and_key(request)

    uid = (payload.uid or "").strip()
    title = (payload.title or "").strip()
    query = (payload.query or "").strip()
    method = int(payload.method or 2)

    if not uid or not title or not query:
        raise HTTPException(400, "uid/title/query는 필수입니다.")
    if method not in (1, 2, 3):
        raise HTTPException(400, "method는 1/2/3 중 하나여야 합니다.")

    logger.info(f"[places] build_start uid={uid} title={title} query={query} method={method}")

    # 1) 장소 수집
    ts = _t()
    all_places = fetch_trusted_places(query, method, gmaps_key, PLACE_TYPES)
    _log_step("fetch_trusted_places", ts, fetched=len(all_places))

    if not all_places:
        logger.warning("[places] no_places_fetched; abort")
        raise HTTPException(404, "해당 조건으로 수집된 장소가 없습니다.")

    # 전체 상한 적용(속도/용량 보호)
    if len(all_places) > MAX_TOTAL_PLACES:
        all_places.sort(key=lambda p: p.get("trust_score", 0), reverse=True)
        all_places = all_places[:MAX_TOTAL_PLACES]
        logger.info(f"[places] cap_total -> {len(all_places)} (MAX_TOTAL_PLACES={MAX_TOTAL_PLACES})")

    # 2) 리뷰 전처리
    ts = _t()
    all_places = clean_reviews_in_places(all_places)
    total_reviews = sum(len(p.get("reviews", []) or []) for p in all_places)
    _log_step("clean_reviews_in_places", ts, total_reviews=total_reviews)

    # 3) 이름 임베딩 캐싱
    ts = _t()
    all_places = add_name_vectors(all_places, model)
    _log_step("add_name_vectors", ts, places=len(all_places))

    # 4) 리뷰 임베딩(이름가중치 0)
    ts = _t()
    all_places = add_review_vectors_to_places(all_places, model, review_weight=1.0, name_weight=0.0)
    emb_count = sum(1 for p in all_places if p.get("review_vector") is not None)
    _log_step("add_review_vectors_to_places", ts, embedded=emb_count)

    # 5) 유저 벡터 로드
    ts = _t()
    hope_vec, non_vec = _load_user_vecs(uid, model)
    _log_step("load_user_vecs", ts,
              hope_norm=float(np.linalg.norm(hope_vec)),
              non_norm=float(np.linalg.norm(non_vec)))

    user_params = {uid: {"hope_vector": hope_vec.tolist(), "nonhope_vector": non_vec.tolist()}}

    # 6) 희망 점수
    ts = _t()
    all_places = add_hope_scores_to_places(all_places, user_params, uid, model, alpha=0.2)
    hope_scored = sum(1 for p in all_places if "hope_score" in p)
    _log_step("add_hope_scores_to_places", ts, scored=hope_scored)

    # 7) 비희망 점수
    ts = _t()
    all_places = add_nonhope_scores_to_places(
        all_places, user_params, uid, model, review_weight=1.0, name_weight=1.0
    )
    non_scored = sum(1 for p in all_places if "nonhope_score" in p)
    _log_step("add_nonhope_scores_to_places", ts, scored=non_scored)

    # 8) Firestore 저장 (중복 제목이면 '제목 (2)' 등 자동 분기)
    ts = _t()
    final_title = save_places_to_firestore(all_places, uid, title, query, method)
    _log_step("save_places_to_firestore", ts, saved_places=len(all_places), final_title=final_title)

    logger.info(f"[places] build_done uid={uid} title={final_title}")
    return {
        "ok": True,
        "saved": {
            "uid": uid,
            "title": final_title,  # 실제 저장된 최종 제목
            "query": query,
            "method": method
        }
    }
