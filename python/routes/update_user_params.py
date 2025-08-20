# routes/update_user_params.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import math
import numpy as np

# Firebase Admin (어플리케이션 어딘가에서 이미 initialize_app 되었으면 생략)
import firebase_admin
from firebase_admin import firestore
# from firebase_admin import credentials
# cred = credentials.Certificate("service_account.json")
# firebase_admin.initialize_app(cred)

db = firestore.client()
router = APIRouter(prefix="/api/user_params", tags=["user_params"])


# =========================
#         Schemas
# =========================
class UpdateReq(BaseModel):
    user_id: str
    title: str
    debug: bool | None = False


# =========================
#        Utilities
# =========================
def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """위경도로 두 점 사이의 거리(km)"""
    R = 6371.0
    to_rad = math.pi / 180.0
    dlat = (lat2 - lat1) * to_rad
    dlon = (lon2 - lon1) * to_rad
    a = (math.sin(dlat / 2) ** 2
         + math.cos(lat1 * to_rad) * math.cos(lat2 * to_rad) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def try_load_place_meta(user_id: str, title: str) -> Dict[str, Dict[str, float]]:
    """
    (선택) 보조 점수(hope/nonhope/trust)가 Firestore 어딘가에 있다면 읽어옵니다.
    스키마 예시 1: /place_meta/{user_id}/trips/{title} (문서) -> fields.by_name = { "국립중앙박물관": {...} }
    스키마 예시 2: /place_meta/{user_id}/titles/{title}/by_name (컬렉션) -> 각 문서 id=place_name
    없으면 빈 dict 반환하여 기본값(0.5) 사용.
    """
    by_name: Dict[str, Dict[str, float]] = {}

    # 시도 1: 단일 문서 형태
    try:
        doc_ref = db.collection("place_meta").document(user_id).collection("trips").document(title)
        snap = doc_ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            cand = data.get("by_name") or {}
            # {"장소명": {"hope_score":.., "nonhope_score":.., "trust_score":..}}
            if isinstance(cand, dict):
                return cand
    except Exception:
        pass

    # 시도 2: 하위 컬렉션 형태
    try:
        subcol = (
            db.collection("place_meta")
              .document(user_id)
              .collection("titles")
              .document(title)
              .collection("by_name")
        )
        for ds in subcol.stream():
            d = ds.to_dict() or {}
            name = d.get("name") or ds.id
            if name:
                by_name[name] = {
                    "hope_score": float(d.get("hope_score", 0.5)),
                    "nonhope_score": float(d.get("nonhope_score", 0.5)),
                    "trust_score": float(d.get("trust_score", 0.5)),
                }
    except Exception:
        pass

    return by_name


def _get_prev_params(uid: str) -> Optional[Dict[str, float]]:
    """이전 저장된 user_params 읽기"""
    snap = db.collection("user_params").document(uid).get()
    if not snap.exists:
        return None
    d = snap.to_dict() or {}
    return {
        "w_dist": float(d.get("w_dist", 0.0)),
        "w_cluster": float(d.get("w_cluster", 0.0)),
        "w_trust": float(d.get("w_trust", 0.0)),
        "w_nonhope": float(d.get("w_nonhope", 0.0)),
        # intercept는 참고용으로만 (없을 수도 있음)
        "intercept": float(d.get("intercept", 0.0)),
    }


def _blend_params(old: Optional[Dict[str, float]], new: Dict[str, float], beta: float = 0.3) -> Dict[str, float]:
    """EMA 방식 블렌딩: 저장 시 갑작스런 튐 방지"""
    if not old:
        return new
    out: Dict[str, float] = {}
    for k, v in new.items():
        out[k] = (1 - beta) * float(old.get(k, 0.0)) + beta * float(v)
    return out


def _clip(v: float, lo: float = -2.0, hi: float = 2.0) -> float:
    """가중치 클리핑(과도한 값 방지)"""
    return float(max(lo, min(hi, v)))


# =========================
#         Endpoint
# =========================
@router.post("/update_from_log")
def update_from_log(req: UpdateReq):
    uid = req.user_id
    title = req.title

    # 1) Firestore에서 여행 로그 읽기: /user_trips/{uid}/trips_log/{title}/days/*
    days_col = (
        db.collection("user_trips")
          .document(uid)
          .collection("trips_log")
          .document(title)
          .collection("days")
    )
    day_snaps = list(days_col.stream())

    # date -> schedule(list) 맵 구성
    table: Dict[str, Dict[str, Any]] = {}
    for ds in day_snaps:
        dd = ds.to_dict() or {}
        date_str = dd.get("date") or ds.id
        schedule = dd.get("schedule", [])
        if isinstance(schedule, list):
            table[date_str] = {"schedule": schedule}

    if not table:
        raise HTTPException(400, "업데이트할 로그가 없습니다. (/days 문서 없거나 schedule 배열 없음)")

    # (선택) 장소 보조 점수 불러오기. 없으면 기본값(0.5) 사용
    meta_by_name = try_load_place_meta(uid, title)

    # 2) 학습 데이터 구성 (이동 prev->curr, curr의 user_rating 사용)
    X, y = [], []
    for date, day_info in table.items():
        sched = day_info.get("schedule", [])
        for i in range(1, len(sched)):
            prev = sched[i - 1] or {}
            curr = sched[i] or {}
            rating = curr.get("user_rating")
            if rating is None:
                continue

            # 거리 점수 계산
            lat1, lon1 = prev.get("lat"), prev.get("lng")
            lat2, lon2 = curr.get("lat"), curr.get("lng")
            dist_km = 0.0
            if isinstance(lat1, (int, float)) and isinstance(lon1, (int, float)) \
               and isinstance(lat2, (int, float)) and isinstance(lon2, (int, float)):
                dist_km = haversine_km(lat1, lon1, lat2, lon2)

            # (기본) 1/(1 + km) — 근거리 가중↑
            dist_score = 1.0 / (1.0 + dist_km)

            # (원하면 지수감쇠로 교체) dist_score = math.exp(-dist_km / 2.0)

            # 보조 점수 (없으면 0.5)
            cname = (curr.get("title") or "").strip()
            meta = meta_by_name.get(cname, {})
            hope = float(meta.get("hope_score", 0.5))        # 0~1 가정
            nonhope_raw = float(meta.get("nonhope_score", 0.5))  # 0~1 가정
            trust = float(meta.get("trust_score", 0.5))      # 0~1 가정

            cluster = hope
            nonhope_score = 1.0 - nonhope_raw

            X.append([dist_score, cluster, trust, nonhope_score])
            y.append(float(rating))

            if req.debug:
                print(f"[{date}] {prev.get('title')} -> {cname} | km={dist_km:.2f} | "
                      f"X={[round(dist_score,3), round(cluster,3), round(trust,3), round(nonhope_score,3)]} | y={rating}")

    if not X:
        raise HTTPException(400, "업데이트할 평가 데이터가 없습니다. (user_rating 없음)")

    X = np.array(X, dtype=float)
    y = np.array(y, dtype=float)

    # 3) 선형 회귀 (릿지 + 절편 포함)
    # 절편 추가
    ones = np.ones((X.shape[0], 1), dtype=float)
    X_aug = np.hstack([X, ones])  # [dist, cluster, trust, nonhope, 1]

    # 릿지 정규화
    alpha = 0.1  # 0.05~0.5 정도에서 튜닝
    XtX = X_aug.T @ X_aug
    regI = alpha * np.eye(XtX.shape[0], dtype=float)

    try:
        w_full, *_ = np.linalg.lstsq(XtX + regI, X_aug.T @ y, rcond=None)
    except Exception as e:
        raise HTTPException(500, f"회귀 실패: {e}")

    # 분해
    w_dist, w_cluster, w_trust, w_nonhope, b = map(float, w_full.tolist())

    # 4) 가중치 클리핑 (과도한 튐 방지)
    w_dist    = _clip(w_dist,    lo=-2.0, hi=2.0)
    w_cluster = _clip(w_cluster, lo=-2.0, hi=2.0)
    w_trust   = _clip(w_trust,   lo=-2.0, hi=2.0)
    w_nonhope = _clip(w_nonhope, lo=-2.0, hi=2.0)
    b         = _clip(b,         lo=-2.0, hi=2.0)

    # 5) 이전 파라미터와 블렌딩(EMA)
    prev = _get_prev_params(uid)
    # 표본이 적으면(예: 20개 미만) 더 보수적으로 반영
    beta = 0.3 if X_aug.shape[0] >= 20 else 0.15
    new_params = {
        "w_dist": w_dist,
        "w_cluster": w_cluster,
        "w_trust": w_trust,
        "w_nonhope": w_nonhope,
    }
    blended = _blend_params(prev, new_params, beta=beta)

    # 6) Firestore 저장: /user_params/{uid}
    params_doc = db.collection("user_params").document(uid)
    params_doc.set(
        {
            **blended,
            "intercept": b,           # 추천 계산 시 사용 가능
            "updated_from": title,
            "sample_count": int(X_aug.shape[0]),
            "alpha": alpha,
            "blend_beta": beta,
        },
        merge=True,
    )

    return {
        "ok": True,
        "weights_fitted": new_params,   # 이번 로그로 학습된 생(raw) 가중치
        "weights_saved": blended,       # EMA 블렌딩 후 실제 저장된 값
        "intercept": b,
        "n_samples": int(X_aug.shape[0]),
    }
