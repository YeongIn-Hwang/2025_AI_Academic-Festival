# services/save_embedding_place.py
import re
from typing import Dict, Any, List
from firebase_admin import firestore as admin_fs
from core.firebase import db
import numpy as np

def convert_place_for_json(place: dict) -> dict:
    p = place.copy()
    # 무거운 필드만 제거
    p.pop("review_vector", None)
    p.pop("name_vector", None)
    p.pop("reviews", None)

    # weekday_text 정리(있으면 최대 7줄만, 문자열화)
    wt = p.get("weekday_text", [])
    if wt is None:
        wt = []
    if isinstance(wt, list):
        p["weekday_text"] = [str(x) for x in wt[:7]]
    else:
        p["weekday_text"] = [str(wt)]

    # 숫자 필드 소수 줄이기
    for k in ("rating", "trust_score", "hope_score", "nonhope_score"):
        if k in p and isinstance(p[k], (int, float)):
            p[k] = round(float(p[k]), 4)

    if "cluster_scores" in p and isinstance(p["cluster_scores"], list):
        p["cluster_scores"] = [round(float(x), 4) for x in p["cluster_scores"]]

    return p

def _normalize_base_title(title: str) -> str:
    """
    '제목 (2)' 같은 suffix가 붙어 있으면 제거해서 base로 돌려줌.
    """
    m = re.match(r"^(.*?)(?:\s*\((\d+)\))?$", title.strip())
    return (m.group(1) or "").strip()

def get_unique_title(user_id: str, title: str) -> str:
    """
    user_trips/{uid}/trips/* 의 문서 id(=title)들을 조회해서
    중복 시 '제목 (2)', '제목 (3)' ... 로 증가시켜 반환.
    """
    base = _normalize_base_title(title)
    existing = set(doc.id for doc in db.collection("user_trips").document(user_id)
                   .collection("trips").stream())
    if base not in existing:
        return base

    # 이미 같은 제목이 있으면 숫자 suffix를 올리기
    n = 2
    while True:
        cand = f"{base} ({n})"
        if cand not in existing:
            return cand
        n += 1

def save_places_to_firestore(all_places: List[Dict[str, Any]],
                             user_id: str,
                             title: str,
                             query: str,
                             method: int) -> str:
    """
    user_trips/{uid}/trips/{final_title}  ← 메타
    user_trips/{uid}/trips/{final_title}/places/{place_id}  ← 각 장소
    반환: 실제 저장된 최종 제목(final_title)
    """
    final_title = get_unique_title(user_id, title)

    # 1) 상위 trip 메타 저장
    trip_ref = db.collection("user_trips").document(user_id).collection("trips").document(final_title)
    trip_ref.set({
        "uid": user_id,
        "title": final_title,
        "query": query,
        "method": int(method),
        "placeCount": len(all_places),
        "updatedAt": admin_fs.SERVER_TIMESTAMP,
    }, merge=True)

    # 2) places 서브컬렉션 저장(배치 분할)
    places_col = trip_ref.collection("places")
    batch = db.batch()
    ops = 0
    BATCH_LIMIT = 400  # 안전 여유

    for place in all_places:
        pid = place.get("place_id")
        if not pid:
            continue
        clean = convert_place_for_json(place)
        doc_ref = places_col.document(pid)
        batch.set(doc_ref, clean)
        ops += 1
        if ops >= BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            ops = 0
    if ops > 0:
        batch.commit()

    return final_title
