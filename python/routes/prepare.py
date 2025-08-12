# routes/prepare.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os, traceback
from datetime import time as dtime

from services.making_table import (
    create_empty_daily_tables,
    insert_initial_schedule_items_dynamic,
)
from services.dqn_table_making import dqn_fill_schedule

router = APIRouter()

# ---- 입력 스키마 ----
class DeletionItem(BaseModel):
    date: str   # "YYYY-MM-DD"
    start: str  # "HH:MM"
    end: str    # "HH:MM"

class PreparePayload(BaseModel):
    uid: str
    title: str
    query: str
    method: int
    start_date: str
    end_date: str
    start_time: str
    end_time: str
    start_location: str
    lodging: Optional[str] = None
    end_location: str
    focus_type: str  # "attraction"|"food"|"cafe"|"shopping"
    deletions: Optional[List[DeletionItem]] = None  # 🔹추가: 삭제 슬롯 리스트

def _log(*args): print("[/routes/prepare]", *args, flush=True)

def _hhmm(s: str) -> dtime:
    h, m = s.split(":")
    return dtime(int(h), int(m))

def _focus_to_mode(f: str) -> str:
    return {
        "attraction": "명소 중심",
        "food": "식사 중심",
        "cafe": "카페, 빵집 중심",
        "shopping": "쇼핑 중심",
    }.get(f, "명소 중심")

def _serialize_tables(tables: dict) -> dict:
    out = {}
    for d, info in tables.items():
        out[d] = {
            "weekday": info.get("weekday"),
            "start_location": info.get("start_location"),
            "end_location": info.get("end_location"),
            "schedule": [
                {
                    "title": it.title,
                    "start": it.start.strftime("%H:%M"),
                    "end": it.end.strftime("%H:%M"),
                    "place_type": it.place_type,
                    "location_info": it.location_info,
                }
                for it in info.get("schedule", [])
            ],
        }
    return out

def _to_timeline(tables_json: dict):
    days = []
    for date in sorted(tables_json.keys()):
        info = tables_json[date]
        events = [
            {
                "title": s.get("title"),
                "start": s.get("start"),
                "end":   s.get("end"),
                "type":  s.get("place_type") or "etc",
            }
            for s in info.get("schedule", [])
        ]
        days.append({"date": date, "weekday": info.get("weekday", ""), "events": events})
    return days

def _build_base_tables(req: PreparePayload):
    API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
    table_place_info, tables = create_empty_daily_tables(
        API_KEY,
        start_date_str=req.start_date,
        end_date_str=req.end_date,
        first_day_start_time=_hhmm(req.start_time),
        last_day_end_time=_hhmm(req.end_time),
        start_location=req.start_location,
        final_end_location=req.end_location,
        accommodation_location=req.lodging or req.end_location,
    )
    tables = insert_initial_schedule_items_dynamic(tables, table_place_info)
    if not tables:
        raise ValueError("생성된 일정 테이블이 비어 있습니다. 날짜/시간을 확인하세요.")
    return tables

# ---- 삭제 반영 유틸 ----
def _time_to_hhmm(t) -> str:
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    return f"{t.hour:02d}:{t.minute:02d}"

def _clear_slots_by_deletions(tables: dict, deletions: Optional[List[DeletionItem]]):
    if not deletions:
        return

    # date별로 묶기
    by_date = {}
    for d in deletions:
        by_date.setdefault(d.date, set()).add((d.start, d.end))

    cleared = 0
    for date_str, info in tables.items():
        targets = by_date.get(date_str)
        if not targets:
            continue
        schedule = info.get("schedule", [])
        for slot in schedule:
            s = _time_to_hhmm(getattr(slot, "start", None))
            e = _time_to_hhmm(getattr(slot, "end", None))
            if (s, e) in targets:
                # 보호: 시작/종료/숙소 블록은 비우지 않음
                if getattr(slot, "place_type", None) in ("start", "end", "accommodation"):
                    continue
                # 슬롯 비우기
                slot.title = None
                slot.place_type = None
                slot.location_info = None
                cleared += 1
    _log(f"dqn deletions applied. cleared_slots={cleared}")

# ---- 라우터 ----
@router.post("/routes/prepare_basic")
def prepare_basic(req: PreparePayload):
    phase = "start"
    try:
        _log("basic payload:", req.model_dump())
        phase = "build"
        tables = _build_base_tables(req)
        phase = "serialize"
        tables_json = _serialize_tables(tables)
        timeline = _to_timeline(tables_json)
        _log("basic ok. timeline_days:", len(timeline))
        return {"mode": "basic", "tables": tables_json, "timeline": timeline}
    except Exception as e:
        _log("ERROR(basic) phase:", phase, "error:", e); traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"[{phase}] {e}")

@router.post("/routes/prepare_dqn")
def prepare_dqn(req: PreparePayload):
    phase = "start"
    try:
        _log("dqn payload:", req.model_dump())
        phase = "build"
        tables = _build_base_tables(req)

        # 🔹(옵션) 삭제된 슬롯 비워두기 → DQN이 빈칸만 다시 채움
        _clear_slots_by_deletions(tables, req.deletions)

        phase = "dqn"
        base_mode = _focus_to_mode(req.focus_type)
        tables = dqn_fill_schedule(req.uid, req.title, tables, base_mode=base_mode)

        phase = "serialize"
        tables_json = _serialize_tables(tables)
        timeline = _to_timeline(tables_json)
        _log("dqn ok. timeline_days:", len(timeline))
        return {"mode": "dqn", "base_mode": base_mode, "tables": tables_json, "timeline": timeline}
    except Exception as e:
        _log("ERROR(dqn) phase:", phase, "error:", e); traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"[{phase}] {e}")

# 호환용: 기존 /routes/prepare 는 DQN으로 연결
@router.post("/routes/prepare")
def prepare_compat(req: PreparePayload):
    return prepare_dqn(req)
