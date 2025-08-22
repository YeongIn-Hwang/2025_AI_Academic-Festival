import html, re, hashlib
import numpy as np
from typing import List, Dict, Any, Iterable
from sentence_transformers import SentenceTransformer

# ----------------- 텍스트 전처리 -----------------
def clean_review(text: str):
    if not isinstance(text, str):
        return None
    text = html.unescape(text).strip()
    if len(text) < 3:
        return None
    if not re.search("[가-힣]", text):
        return None
    text = re.sub(r"(.)\1{2,}", r"\1\1", text)
    text = re.sub(r"[^\w\s가-힣.,!?]", "", text)
    # 너무 긴 문장은 잘라서 토큰 낭비 방지
    return text[:300] or None

def clean_reviews_in_places(all_places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for place in all_places:
        original = place.get("reviews", []) or []
        cleaned = [clean_review(r) for r in original]
        # 유니크화(중복 리뷰 제거)
        seen = set()
        uniq = []
        for r in cleaned:
            if r and r not in seen:
                seen.add(r)
                uniq.append(r)
        place["reviews"] = uniq
    return all_places

# ----------------- 캐시 + 배치 인코더 -----------------
class TextEmbeddingCache:
    """문장 -> embedding 캐시. 동일 텍스트 중복 인코딩 방지."""
    def __init__(self, model: SentenceTransformer, dtype=np.float32):
        self.model = model
        self.cache: Dict[str, np.ndarray] = {}
        self.dtype = dtype

    @staticmethod
    def _key(text: str) -> str:
        # 짧은 키보다 충돌 적은 해시 키 사용
        return hashlib.sha1(text.encode("utf-8")).hexdigest()

    def encode_texts(self, texts: Iterable[str], batch_size: int = 64, normalize: bool = False) -> Dict[str, np.ndarray]:
        texts = [t for t in texts if isinstance(t, str) and t.strip()]
        if not texts:
            return {}

        # 미스만 모아서 한 번에 추론
        keys = [self._key(t) for t in texts]
        miss_idx = [i for i, k in enumerate(keys) if k not in self.cache]
        if miss_idx:
            batch = [texts[i] for i in miss_idx]
            embs = self.model.encode(
                batch,
                convert_to_numpy=True,
                normalize_embeddings=normalize,
                batch_size=batch_size,
                show_progress_bar=False,
            ).astype(self.dtype, copy=False)
            for i, emb in zip(miss_idx, embs):
                self.cache[keys[i]] = emb

        # 결과 사전으로 반환
        out = {}
        for t, k in zip(texts, keys):
            out[t] = self.cache[k]
        return out

# ----------------- 빠른 벡터 생성 -----------------
def add_vectors_fast(
    all_places: List[Dict[str, Any]],
    model: SentenceTransformer,
    max_reviews_per_place: int = 12,
    batch_size: int = 64,
    normalize: bool = False,  # 코사인 유사도 쓸 거면 True 권장
):
    """
    한 번의 대형 배치로 '이름 + 리뷰' 임베딩을 계산하고,
    이름 벡터(name_vector), 리뷰 평균 벡터(review_vector)를 place에 바로 채워 넣는다.
    """
    if not all_places:
        return all_places

    cache = TextEmbeddingCache(model)

    # 1) 전체 유니크 텍스트 수집 (이름 + 샘플링된 리뷰)
    name_texts: List[str] = []
    review_texts: List[str] = []

    # 각 place가 어떤 텍스트를 참조하는지 인덱스용
    place_name: List[str] = []
    place_reviews: List[List[str]] = []

    for p in all_places:
        name = (p.get("name") or "").strip()
        place_name.append(name)
        if name:
            name_texts.append(name)

        # 리뷰 샘플링: 긴 리스트 전부 encode하지 않게 상한 설정
        rv = (p.get("reviews") or [])
        if rv:
            # 간단 샘플링: 상위 N개 (길이, 유니크는 clean에서 처리됨)
            chosen = rv[:max_reviews_per_place]
            place_reviews.append(chosen)
            review_texts.extend(chosen)
        else:
            place_reviews.append([])

    # 유니크화
    name_texts = list(dict.fromkeys(name_texts))
    review_texts = list(dict.fromkeys(review_texts))

    # 2) 한 번에 인코딩
    name_emb_map = cache.encode_texts(name_texts, batch_size=batch_size, normalize=normalize)
    review_emb_map = cache.encode_texts(review_texts, batch_size=batch_size, normalize=normalize)

    dim = model.get_sentence_embedding_dimension()
    zeros = np.zeros(dim, dtype=np.float32)

    # 3) 결과 채우기
    for i, p in enumerate(all_places):
        # name_vector: 있으면 재사용, 없으면 이번 배치에서 채움
        if p.get("name"):
            p["name_vector"] = name_emb_map.get(p["name"], zeros)

        # review_vector: 평균
        rvs = place_reviews[i]
        if rvs:
            mats = [review_emb_map.get(t) for t in rvs if t in review_emb_map]
            if mats:
                # float32 유지, normalize=False인 경우 평균 후 나중에 정규화해도 OK
                p["review_vector"] = np.mean(np.stack(mats, axis=0), axis=0).astype(np.float32, copy=False)
            else:
                p["review_vector"] = zeros
        else:
            p["review_vector"] = zeros

    return all_places

# --------------- 기존 API 대체용 래퍼 ---------------
def add_name_vectors(all_places: List[Dict[str, Any]], model: SentenceTransformer) -> List[Dict[str, Any]]:
    # 호환성을 위해 남겨두되 내부적으로 fast 경로 사용
    return add_vectors_fast(all_places, model)

def add_review_vectors_to_places(
    all_places: List[Dict[str, Any]],
    model: SentenceTransformer,
    review_weight: float = 1.0,  # 유지: 호출부 호환
    name_weight: float = 0.0,    # 유지: 호출부 호환
):
    # 이미 add_vectors_fast가 name_vector / review_vector를 채웠으니 여기선 가중합만 계산이 필요하면 추가
    # (필요 없으면 이 함수 자체를 더 이상 호출하지 않아도 됨)
    dim = model.get_sentence_embedding_dimension()
    zeros = np.zeros(dim, dtype=np.float32)
    total = (review_weight or 0.0) + (name_weight or 0.0)
    for p in all_places:
        if total <= 0:
            p["review_vector"] = zeros
            continue
        rv = p.get("review_vector")
        nv = p.get("name_vector")
        if rv is None: rv = zeros
        if nv is None: nv = zeros
        p["review_vector"] = ((review_weight * rv) + (name_weight * nv)) / total
    return all_places
