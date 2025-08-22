import html
import re
import numpy as np
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer

# ---------- 텍스트 전처리 ----------
def clean_review(text: str):
    if not isinstance(text, str):
        return None
    text = html.unescape(text).strip()
    if len(text) < 3:
        return None
    # 한글 포함 리뷰만 사용
    if not re.search("[가-힣]", text):
        return None
    # 반복 문자 축소, 특수문자/이모지 제거, 길이 제한
    text = re.sub(r"(.)\1{2,}", r"\1\1", text)
    text = re.sub(r"[^\w\s가-힣.,!?]", "", text)
    text = text[:300]
    return text or None

def clean_reviews_in_places(all_places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for place in all_places:
        original = place.get("reviews", []) or []
        cleaned = [clean_review(r) for r in original]
        place["reviews"] = [r for r in cleaned if r]
    return all_places

# ---------- 임베딩 유틸 ----------
def _zeros(dim: int):
    return np.zeros(dim, dtype=np.float32)

def get_sbert_embedding(text: str, model: SentenceTransformer):
    dim = model.get_sentence_embedding_dimension()
    if not isinstance(text, str) or not text.strip():
        return _zeros(dim)
    return model.encode(text, convert_to_numpy=True, show_progress_bar=False)

def get_sbert_review_vector(reviews: List[str], model: SentenceTransformer):
    """
    배치 인코딩으로 성능 개선.
    """
    dim = model.get_sentence_embedding_dimension()
    if not reviews:
        return _zeros(dim)
    # 유효 텍스트만
    texts = [r for r in reviews if isinstance(r, str) and r.strip()]
    if not texts:
        return _zeros(dim)
    embs = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)  # (n, dim)
    if embs.size == 0:
        return _zeros(dim)
    return embs.mean(axis=0)

def get_place_vector_with_name(place: Dict[str, Any],
                               review_weight: float = 1.0,
                               name_weight: float = 0.0,
                               model: SentenceTransformer = None):
    dim = model.get_sentence_embedding_dimension()
    reviews = place.get("reviews", []) or []
    name = place.get("name", "") or ""

    review_vec = get_sbert_review_vector(reviews, model)
    # name_vector 캐시가 있으면 활용
    name_vec = place.get("name_vector")
    if name_vec is None:
        name_vec = get_sbert_embedding(name, model)

    total = review_weight + name_weight
    if total <= 0:
        return _zeros(dim)
    return (review_weight * review_vec + name_weight * name_vec) / total

def add_name_vectors(all_places: List[Dict[str, Any]],
                     model: SentenceTransformer) -> List[Dict[str, Any]]:
    """
    이름 임베딩을 사전 계산해 place['name_vector']에 저장 (재사용).
    """
    names = []
    idx_map = []
    for i, p in enumerate(all_places):
        name = p.get("name", "") or ""
        names.append(name)
        idx_map.append(i)
    if not names:
        return all_places

    embs = model.encode(names, convert_to_numpy=True, show_progress_bar=False)  # (n, dim)
    for i, emb in zip(idx_map, embs):
        all_places[i]["name_vector"] = emb
    return all_places

def add_review_vectors_to_places(all_places: List[Dict[str, Any]],
                                 model: SentenceTransformer,
                                 review_weight: float = 1.0,
                                 name_weight: float = 0.0):
    """
    - 리뷰 전처리(clean_reviews_in_places) 이후 호출 가정
    - 이름 벡터는 add_name_vectors로 캐싱해두면 여기서 자동 활용
    """
    for place in all_places:
        if "name" in place:
            place["review_vector"] = get_place_vector_with_name(
                place,
                review_weight=review_weight,
                name_weight=name_weight,
                model=model
            )
    return all_places
