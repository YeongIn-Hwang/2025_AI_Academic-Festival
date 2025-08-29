# routes/prefs.py
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import numpy as np
from firebase_admin import firestore as admin_fs
from core.firebase import db
from services.emb_utils import clean_keyword

router = APIRouter()

class KeywordsIn(BaseModel):
    uid: str
    hope: Optional[List[str]] = []
    nonhope: Optional[List[str]] = []

def mean_embed(model, texts: List[str]) -> np.ndarray:
    # 전처리
    cleaned = [clean_keyword(t) for t in texts or []]
    cleaned = [t for t in cleaned if t]  # None 제거
    dim = model.get_sentence_embedding_dimension()
    if not cleaned:
      return np.zeros(dim, dtype=np.float32)
    # 배치 임베딩 (속도↑)
    vecs = model.encode(cleaned, convert_to_numpy=True)
    return vecs.mean(axis=0).astype(np.float32)

@router.post("/user_keywords_embed")
@router.post("/user_keywords_embed/")
def user_keywords_embed(payload: KeywordsIn, request: Request):
    uid = (payload.uid or "").strip()
    if not uid:
        raise HTTPException(400, "uid가 비어있습니다.")
    # SBERT 확보
    model = getattr(request.app.state, "sbert", None)
    if model is None:
        raise HTTPException(500, "SBERT 모델이 초기화되지 않았습니다.")

    # 임베딩
    hope_vec = mean_embed(model, payload.hope)
    nonhope_vec = mean_embed(model, payload.nonhope)

    # Firestore 저장 (키워드 원문은 저장 안 함)
    doc_ref = db.collection("user_params").document(uid)
    doc_ref.set({
        "hope_vec": hope_vec.tolist(),
        "nonhope_vec": nonhope_vec.tolist(),
        "updatedAt": admin_fs.SERVER_TIMESTAMP,
    }, merge=True)

    return {
        "ok": True,
        "dims": int(model.get_sentence_embedding_dimension()),
        "hope_nonzero": bool(hope_vec.any()),
        "nonhope_nonzero": bool(nonhope_vec.any()),
    }
