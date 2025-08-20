# routes/geocode.py
import os
import re
import sys
import logging
import requests
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException

router = APIRouter()

# ────────────── 로깅 설정 ──────────────
# uvicorn 콘솔에 바로 출력되도록 stdout 핸들러 연결
logger = logging.getLogger("geocode")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("[geocode:%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
# uvicorn --log-level 에 맞춰서 info 이상 보이도록 기본 INFO
logger.setLevel(logging.INFO)

# ────────────── 키 로드 ──────────────
GOOGLE_KEY = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not GOOGLE_KEY:
    # 실제 요청 시 500을 던지긴 하지만, 부팅 로그로도 알려주기
    logger.warning("GOOGLE_MAPS_API_KEY / GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
    GOOGLE_KEY = None

# ────────────── 공통 유틸 ──────────────
def _pick_kr_district_from_components(components: List[Dict[str, Any]]) -> Optional[str]:
    """address_components 배열에서 '구/군/시'를 최대한 보수적으로 추출."""
    if not components:
        return None

    # 우선순위 높은 타입들 (광범위하게 커버)
    PREFERRED = [
        "sublocality_level_1",          # 강남구/수영구 등
        "administrative_area_level_3",  # 구/읍/면/동이 걸리는 경우 존재
        "administrative_area_level_2",  # ○○시/○○군/○○구
        "locality",                     # 시(서울, 부산 등)
        "sublocality_level_2",          # 하위 구역
        "neighborhood",                 # 동/리/인근 지역명
    ]

    # 1) 우선순위 타입들에서 바로 반환
    types_map = {tuple(comp.get("types", [])): comp.get("long_name") for comp in components}
    for comp in components:
        types = comp.get("types", [])
        name = comp.get("long_name")
        if not isinstance(name, str):
            continue
        if any(t in PREFERRED for t in types):
            m = re.search(r"([가-힣A-Za-z]+(구|군|시))", name)
            if m:
                return m.group(1)

    # 2) 타입이 맞지 않아도 컴포넌트 이름에 '구/군/시'가 들어있으면 사용
    for comp in components:
        name = comp.get("long_name")
        if isinstance(name, str):
            m = re.search(r"([가-힣A-Za-z]+(구|군|시))", name)
            if m:
                return m.group(1)

    return None


def _pick_kr_district_from_results(results: List[Dict[str, Any]]) -> Optional[str]:
    """results 전체를 훑어 '구/군/시'를 추출. formatted_address 폴백 포함."""
    if not results:
        return None

    # 1) 모든 결과의 components를 훑어서 찾기
    for res in results:
        comps = res.get("address_components", [])
        d = _pick_kr_district_from_components(comps)
        if d:
            return d

    # 2) 그래도 못 찾으면 formatted_address에서 폴백 정규식
    for res in results:
        fa = res.get("formatted_address")
        if isinstance(fa, str):
            m = re.search(r"([가-힣A-Za-z]+(구|군|시))", fa)
            if m:
                return m.group(1)

    return None

# ────────────── 엔드포인트 ──────────────
@router.get("/geocode/query_district")
def query_to_district(q: str = Query(..., min_length=2)):
    """
    장소/주소 query -> '구/군/시'만 반환
    """
    if not GOOGLE_KEY:
        logger.error("요청 거부: GOOGLE_MAPS_API_KEY 미설정 (query=%r)", q)
        raise HTTPException(status_code=500, detail="GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.")

    url = (
        "https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={requests.utils.quote(q)}&language=ko&region=kr&key={GOOGLE_KEY}"
    )

    try:
        r = requests.get(url, timeout=8)
    except Exception as e:
        logger.error("Google Geocoding 요청 예외 (query=%r): %s", q, e)
        raise HTTPException(status_code=503, detail="Google Geocoding API 요청 실패")

    if r.status_code != 200:
        logger.error("Google Geocoding HTTP %s (query=%r): %s",
                     r.status_code, q, r.text[:300])
        raise HTTPException(status_code=503, detail="Google Geocoding API 요청 실패")

    data = r.json()
    results = data.get("results", [])

    if not results:
        logger.info("입력 query=%r → 변환 결과 없음", q)
        return None  # 결과 없으면 그냥 null 내려감

    district = _pick_kr_district_from_results(results)

    # 디버그 로그
    logger.info("입력 query=%r → 출력 district=%r", q, district)

    return district  # 문자열 그대로 반환
