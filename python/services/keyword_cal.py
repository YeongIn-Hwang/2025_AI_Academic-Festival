from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
from services.review_embedding import get_sbert_embedding, _zeros

# ---------- 키워드 → 평균벡터 ----------
def compute_mean_vector_from_keywords(keywords: List[str],
                                      model: SentenceTransformer,
                                      dim: int):
    texts = [k for k in (keywords or []) if isinstance(k, str) and k.strip()]
    if not texts:
        return _zeros(dim)
    # 배치 인코딩
    embs = model.encode(texts, convert_to_numpy=True)
    if embs.size == 0:
        return _zeros(dim)
    return embs.mean(axis=0)

def update_user_hope_vector(user_id: str, keyword_hope: List[str],
                            user_params: Dict[str, Any], model: SentenceTransformer):
    dim = model.get_sentence_embedding_dimension()
    hope_vector = compute_mean_vector_from_keywords(keyword_hope, model, dim)
    user_params[user_id]["hope_vector"] = hope_vector.tolist()
    return user_params

def update_user_nonhope_vector(user_id: str, keyword_nonhope: List[str],
                               user_params: Dict[str, Any], model: SentenceTransformer):
    dim = model.get_sentence_embedding_dimension()
    nonhope_vector = compute_mean_vector_from_keywords(keyword_nonhope, model, dim)
    user_params[user_id]["nonhope_vector"] = nonhope_vector.tolist()
    return user_params

# ---------- 유사도 계산 ----------
def _cos(u: np.ndarray, v: np.ndarray) -> float:
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu == 0 or nv == 0:
        return 0.0
    # sklearn 사용 버전
    return float(cosine_similarity([u], [v])[0][0])

def compute_hope_score(review_vector: np.ndarray,
                       name_vector: np.ndarray,
                       hope_vector: np.ndarray,
                       alpha: float = 0.2) -> float:
    s_r = _cos(review_vector, hope_vector)
    s_n = _cos(name_vector,   hope_vector)
    return round((1 - alpha) * s_r + alpha * s_n, 4)

# ---------- 점수 부여 ----------
def add_hope_scores_to_places(all_places: List[Dict[str, Any]],
                              user_params: Dict[str, Any],
                              user_id: str,
                              model: SentenceTransformer,
                              alpha: float = 0.2):
    hope_vector = np.array(user_params[user_id].get("hope_vector"))
    if hope_vector is None or np.linalg.norm(hope_vector) == 0:
        print(f"[keyword_cal] 사용자 '{user_id}' hope_vector 없음/영벡터")
        return all_places

    dim = model.get_sentence_embedding_dimension()
    for p in all_places:
        review_vec = p.get("review_vector", _zeros(dim))
        # 이름 벡터 캐시 활용
        name_vec = p.get("name_vector")
        if name_vec is None:
            name_vec = get_sbert_embedding(p.get("name", ""), model)
        p["hope_score"] = compute_hope_score(review_vec, name_vec, hope_vector, alpha=alpha)
    return all_places

def add_nonhope_scores_to_places(all_places: List[Dict[str, Any]],
                                 user_params: Dict[str, Any],
                                 user_id: str,
                                 model: SentenceTransformer,
                                 review_weight: float = 1.0,
                                 name_weight: float = 1.0):
    """
    A 방식: 리뷰·이름 각각의 유사도 → 가중 평균
    """
    nonhope_vector = np.array(user_params[user_id].get("nonhope_vector"))
    if nonhope_vector is None or np.linalg.norm(nonhope_vector) == 0:
        print(f"[keyword_cal] 사용자 '{user_id}' nonhope_vector 없음/영벡터")
        return all_places

    dim = model.get_sentence_embedding_dimension()
    tot = max(1e-8, review_weight + name_weight)

    for p in all_places:
        review_vec = p.get("review_vector", _zeros(dim))
        name_vec = p.get("name_vector")
        if name_vec is None:
            name_vec = get_sbert_embedding(p.get("name", ""), model)

        s_r = _cos(review_vec, nonhope_vector)
        s_n = _cos(name_vec,   nonhope_vector)
        p["nonhope_score"] = round((review_weight * s_r + name_weight * s_n) / tot, 4)
    return all_places
