import os
import html
import re
import hashlib
import sqlite3
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from sentence_transformers import SentenceTransformer

# =========================
# 튜닝 파라미터 (CPU 전용)
# =========================
K_PER_PLACE = int(os.getenv("EMB_K_PER_PLACE", 5))        # 장소당 사용할 상위 리뷰 개수
MAX_REVIEW_CHARS = int(os.getenv("EMB_MAX_REVIEW_CHARS", 200))  # 리뷰 길이 제한
BATCH_SIZE = int(os.getenv("EMB_BATCH_SIZE", 64))         # CPU 배치 크기(32~96 권장)
N_WORKERS = int(os.getenv("EMB_N_WORKERS", max(1, (os.cpu_count() or 4) // 2)))
CACHE_PATH = os.getenv("EMB_CACHE_PATH", "emb_cache.sqlite")     # 디스크 캐시 경로
NORMALIZE = True  # encode 시 normalize_embeddings

# =========================
# SBERT 초기화 (CPU)
# =========================
def init_sbert_cpu(model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                   max_seq_len: int = 128,
                   num_threads: Optional[int] = None) -> SentenceTransformer:
    """
    서버 부팅 시 1회 호출해서 모델을 준비하세요.
    """
    import torch
    if num_threads:
        torch.set_num_threads(num_threads)
        os.environ["OMP_NUM_THREADS"] = str(num_threads)
        os.environ["MKL_NUM_THREADS"] = str(num_threads)
    model = SentenceTransformer(model_name, device="cpu")
    model.max_seq_length = max_seq_len  # 128~256 권장
    return model

# =========================
# 텍스트 전처리
# =========================
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
    text = text[:MAX_REVIEW_CHARS]  # CPU 속도 위해 200자 기본
    return text or None

def clean_reviews_in_places(all_places: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for place in all_places:
        original = place.get("reviews", []) or []
        cleaned = [clean_review(r) for r in original]
        place["reviews"] = [r for r in cleaned if r]
    return all_places

# =========================
# 임베딩 유틸/캐시
# =========================
def _zeros(dim: int):
    return np.zeros(dim, dtype=np.float32)

def _hash_txt(t: str) -> str:
    return hashlib.sha1(t.encode("utf-8")).hexdigest()

class EmbCache:
    """
    매우 단순한 SQLite 기반 캐시: key(str) -> np.ndarray(float32) BLOB
    재빌드 시 같은 리뷰는 즉시 로드되어 대폭 가속됩니다.
    """
    def __init__(self, path=CACHE_PATH):
        self.conn = sqlite3.connect(path)
        self.conn.execute("CREATE TABLE IF NOT EXISTS emb (k TEXT PRIMARY KEY, v BLOB)")
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA synchronous=NORMAL;")

    def get_many(self, keys: List[str]) -> Dict[str, np.ndarray]:
        if not keys:
            return {}
        q = ",".join("?" for _ in keys)
        cur = self.conn.execute(f"SELECT k,v FROM emb WHERE k IN ({q})", keys)
        return {k: np.frombuffer(v, dtype=np.float32) for k, v in cur.fetchall()}

    def put_many(self, items: Dict[str, np.ndarray]):
        if not items:
            return
        self.conn.executemany("REPLACE INTO emb(k,v) VALUES(?,?)",
                              [(k, v.astype(np.float32).tobytes()) for k, v in items.items()])
        self.conn.commit()

# =========================
# 배치 인코딩 (CPU 멀티프로세스)
# =========================
def _encode_texts_cpu(model: SentenceTransformer, texts: List[str], batch_size: int, n_workers: int):
    if not texts:
        return np.zeros((0, model.get_sentence_embedding_dimension()), dtype=np.float32)
    # 멀티프로세스 풀: CPU 워커 n_workers
    pool = model.start_multi_process_pool(target_devices=["cpu"] * n_workers)
    try:
        embs = SentenceTransformer.encode_multi_process(
            texts, pool, batch_size=batch_size, normalize_embeddings=NORMALIZE
        )
    finally:
        model.stop_multi_process_pool(pool)
    return embs

# =========================
# 단일 텍스트 임베딩 (호환용)
# =========================
def get_sbert_embedding(text: str, model: SentenceTransformer):
    dim = model.get_sentence_embedding_dimension()
    if not isinstance(text, str) or not text.strip():
        return _zeros(dim)
    emb = model.encode(text, convert_to_numpy=True, show_progress_bar=False,
                       normalize_embeddings=NORMALIZE)
    return emb.astype(np.float32)

# =========================
# 리뷰 벡터 (이전 API 유지, 내부 가속)
# =========================
def get_sbert_review_vector(reviews: List[str], model: SentenceTransformer):
    """
    이전 시그니처 유지용.
    단건 호출 시에도 배치 경로를 활용하지만, 실제로는 아래 add_review_vectors_to_places()에서
    모든 리뷰를 평탄화하여 한꺼번에 인코딩합니다.
    """
    dim = model.get_sentence_embedding_dimension()
    if not reviews:
        return _zeros(dim)
    texts = [r for r in reviews if isinstance(r, str) and r.strip()]
    if not texts:
        return _zeros(dim)
    embs = model.encode(texts, convert_to_numpy=True, show_progress_bar=False,
                        normalize_embeddings=NORMALIZE, batch_size=BATCH_SIZE)
    if embs.size == 0:
        return _zeros(dim)
    return embs.mean(axis=0).astype(np.float32)

# =========================
# 이름 + 리뷰 가중합 (API 유지)
# =========================
def get_place_vector_with_name(place: Dict[str, Any],
                               review_weight: float = 1.0,
                               name_weight: float = 0.0,
                               model: SentenceTransformer = None):
    dim = model.get_sentence_embedding_dimension()
    reviews = place.get("reviews", []) or []
    name = place.get("name", "") or ""

    # 실제 경로에선 add_review_vectors_to_places()가 리뷰 평균을 계산합니다.
    review_vec = get_sbert_review_vector(reviews, model)

    # name_vector 캐시가 있으면 활용
    name_vec = place.get("name_vector")
    if name_vec is None:
        name_vec = get_sbert_embedding(name, model)

    total = review_weight + name_weight
    if total <= 0:
        return _zeros(dim)
    return ((review_weight * review_vec) + (name_weight * name_vec)) / total

# =========================
# 이름 벡터: 이미 배치 처리 OK
# =========================
def add_name_vectors(all_places: List[Dict[str, Any]],
                     model: SentenceTransformer) -> List[Dict[str, Any]]:
    names, idx_map = [], []
    for i, p in enumerate(all_places):
        name = (p.get("name") or "").strip()
        names.append(name)
        idx_map.append(i)
    if not names:
        return all_places

    embs = model.encode(
        names, convert_to_numpy=True, show_progress_bar=False,
        normalize_embeddings=NORMALIZE, batch_size=max(128, BATCH_SIZE)
    )  # 이름은 상대적으로 짧아 크게 배치해도 무난
    for i, emb in zip(idx_map, embs):
        all_places[i]["name_vector"] = emb.astype(np.float32)
    return all_places

# =========================
# 리뷰 벡터: 평탄화 + 중복제거 + 캐시 + 멀티프로세스
# =========================
def _select_topk_reviews(revs: List[str], k: int = K_PER_PLACE) -> List[str]:
    # 1) 최소 길이 필터
    revs = [r for r in revs if isinstance(r, str) and len(r) >= 10]
    if not revs:
        return []
    # 2) 200자 제한이 clean_review에서 이미 적용되므로 여기선 중복 제거만
    seen = set(); dedup = []
    for r in revs:
        key = r  # 이미 200자로 컷됨
        if key not in seen:
            seen.add(key)
            dedup.append(r)
    # 3) 길이 내림차순 상위 k (간단/빠름)
    dedup.sort(key=len, reverse=True)
    return dedup[:k]

def _build_flat_corpus(all_places: List[Dict[str, Any]],
                       k_per_place: int = K_PER_PLACE) -> Tuple[List[str], List[str], List[Tuple[int, str]]]:
    """
    반환:
      uniq_keys: 고유 해시 리스트
      uniq_texts: uniq_keys와 동일 순서의 텍스트
      backrefs: [(place_idx, review_hash), ...]
    """
    flat_keys, flat_texts, backrefs = [], [], []

    for i, p in enumerate(all_places):
        sel = _select_topk_reviews(p.get("reviews", []) or [], k=k_per_place)
        for t in sel:
            h = _hash_txt(t)
            flat_keys.append(h)
            flat_texts.append(t)
            backrefs.append((i, h))

    # 중복 제거 (첫 등장 순서 유지)
    uniq_map = {}
    uniq_keys, uniq_texts = [], []
    for k, t in zip(flat_keys, flat_texts):
        if k not in uniq_map:
            uniq_map[k] = True
            uniq_keys.append(k)
            uniq_texts.append(t)

    return uniq_keys, uniq_texts, backrefs

def add_review_vectors_to_places(all_places: List[Dict[str, Any]],
                                 model: SentenceTransformer,
                                 review_weight: float = 1.0,
                                 name_weight: float = 0.0):
    """
    기존 API 유지. 내부에서:
      - 모든 장소 리뷰를 한 번에 평탄화
      - 중복 제거
      - 디스크 캐시 조회
      - 캐시 미스만 멀티프로세스 배치 인코딩(CPU)
      - 장소별 평균 후 이름 벡터와 가중합
    """
    dim = model.get_sentence_embedding_dimension()
    zeros = np.zeros(dim, dtype=np.float32)

    # 1) 리뷰 코퍼스 구성
    uniq_keys, uniq_texts, backrefs = _build_flat_corpus(all_places, k_per_place=K_PER_PLACE)

    # 2) 캐시 조회
    cache = EmbCache(CACHE_PATH)
    hits = cache.get_many(uniq_keys)
    miss_keys = [k for k in uniq_keys if k not in hits]
    miss_texts = [uniq_texts[uniq_keys.index(k)] for k in miss_keys]

    # 3) 캐시 미스만 인코딩
    new = {}
    if miss_texts:
        embs = _encode_texts_cpu(model, miss_texts, batch_size=BATCH_SIZE, n_workers=N_WORKERS)
        for k, e in zip(miss_keys, embs):
            new[k] = e.astype(np.float32)
        cache.put_many(new)

    # 4) 전체 임베딩 맵
    emb_map = {**hits, **new}

    # 5) 장소별 리뷰 평균
    #    backrefs: (place_idx, review_hash)
    place_acc = [np.zeros(dim, dtype=np.float32) for _ in all_places]
    place_cnt = [0 for _ in all_places]
    for place_idx, h in backrefs:
        vec = emb_map.get(h)
        if vec is not None:
            place_acc[place_idx] += vec
            place_cnt[place_idx] += 1

    # 6) 최종 가중합(리뷰 ⊕ 이름)
    total_w = review_weight + name_weight
    for i, p in enumerate(all_places):
        review_vec = (place_acc[i] / place_cnt[i]) if place_cnt[i] > 0 else zeros
        name_vec = p.get("name_vector")
        if name_vec is None:
            nm = (p.get("name") or "").strip()
            if nm:
                name_vec = model.encode(nm, convert_to_numpy=True, show_progress_bar=False,
                                        normalize_embeddings=NORMALIZE, batch_size=1).astype(np.float32)
            else:
                name_vec = zeros

        if total_w <= 0:
            p["review_vector"] = zeros
        else:
            p["review_vector"] = ((review_weight * review_vec) + (name_weight * name_vec)) / total_w

    return all_places
