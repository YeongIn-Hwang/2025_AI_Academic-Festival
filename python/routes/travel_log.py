# routes/travel_log.py
from datetime import datetime
from typing import Dict, Any, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.firebase import db
from services.save_travel_log import save_travel_log

router = APIRouter()

# ---------- 유틸: 프론트 막대 타임라인 변환 ----------
def to_timeline_payload(tables_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    days = []
    for date in sorted(tables_json.keys()):
        info = tables_json[date]
        events = []
        for s in info.get("schedule", []):
            events.append({
                "title": s.get("title"),
                "start": s.get("start"),
                "end": s.get("end"),
                "type": s.get("place_type") or "etc",
            })
        days.append({
            "date": date,
            "weekday": info.get("weekday", ""),
            "events": events,
        })
    return days

# ---------- 모델 ----------
class ScheduleItemModel(BaseModel):
    title: str | None
    start: str
    end: str
    type: str | None
    location_info: dict
    rating: float | None = None

class DailyScheduleModel(BaseModel):
    start_location: str
    end_location: str
    schedule: list[ScheduleItemModel]

class SaveTravelLogRequest(BaseModel):
    user_id: str
    route_places: Dict[str, Any]  # ← 느슨하게
    user_rating: float | None = None
    title: str = "나의 여행"

# ---------- 1) 여행 로그 저장 ----------
@router.post("/save_travel_log")
def save_travel_log_route(req: SaveTravelLogRequest):
    """
    프론트에서 만든(혹은 /routes/prepare_*에서 받은) tables를 그대로 저장.
    """
    try:
        save_travel_log(req.user_id, req.route_places, req.user_rating, req.title)
        return {"status": "success", "message": f"'{req.title}' 여행 기록 저장 완료"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------- 2) 저장된 여행 타임라인 조회 ----------
@router.get("/trips/{uid}/{title}/timeline")
def get_saved_timeline(uid: str, title: str):
    """
    저장된 trip 문서에서 table 필드를 읽어, 프론트 타임라인 렌더용으로 변환해 반환.
    """
    doc = (
        db.collection("user_trips")
          .document(uid)
          .collection("trips")
          .document(title)
          .get()
    )
    if not doc.exists:
        raise HTTPException(status_code=404, detail="해당 여행 기록이 없습니다.")

    data = doc.to_dict() or {}
    table = data.get("table", {})
    return to_timeline_payload(table)
