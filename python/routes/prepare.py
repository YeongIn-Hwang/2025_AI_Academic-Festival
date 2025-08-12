# routes/prepare.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os, traceback
from datetime import time as dtime, datetime

from services.making_table import (
    create_empty_daily_tables,
    insert_initial_schedule_items_dynamic,
)
from services.dqn_table_making import dqn_fill_schedule

router = APIRouter()

# ---------- 입력 스키마 ----------
class DeletionItem(BaseModel):
    date: str   # "YYYY-MM-DD"
    start: str  # "HH:MM"
    end: str    # "HH:MM"

class SplitItem(BaseModel):
    date: str   # "YYYY-MM-DD"
    start: str  # "HH:MM"  # 분할 대상 슬롯 시작
    end: str    # "HH:MM"  # 분할 대상 슬롯 끝
    mid: Optional[str] = None  # "HH:MM" (없으면 중앙으로 자동 분할)

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
    deletions: Optional[List[DeletionItem]] = None
    splits: Optional[List[SplitItem]] = None

def _log(*args): print("[/routes/prepare]", *args, flush=True)

# ---------- 공통 유틸 ----------
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

# ---------- 삭제 반영 ----------
def _time_to_hhmm(t) -> str:
    if t is None:
        return ""
    if isinstance(t, str):
        return t
    return f"{t.hour:02d}:{t.minute:02d}"

def _clear_slots_by_deletions(tables: dict, deletions: Optional[List[DeletionItem]]):
    if not deletions:
        return

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
                if getattr(slot, "place_type", None) in ("start", "end", "accommodation"):
                    continue
                slot.title = None
                slot.place_type = None
                slot.location_info = None
                cleared += 1
    _log(f"dqn deletions applied. cleared_slots={cleared}")

# ---------- 분할 반영 ----------
MIN_SLOT_MINUTES = 30
ROUND_TO_MINUTES = 15

def _parse_hhmm(s: str) -> dtime:
    h, m = s.split(":")
    return dtime(int(h), int(m))

def _to_minutes(t: dtime) -> int:
    return t.hour * 60 + t.minute

def _to_time(mins: int) -> dtime:
    mins = max(0, min(24 * 60 - 1, mins))
    return dtime(mins // 60, mins % 60)

def _round_to(mins: int, base: int) -> int:
    return round(mins / base) * base

def _apply_splits(tables: dict, splits: Optional[List[SplitItem]]):
    if not splits:
        return
    applied = 0

    by_date = {}
    for s in splits:
        by_date.setdefault(s.date, []).append(s)

    for date_str, info in tables.items():
        reqs = by_date.get(date_str)
        if not reqs:
            continue
        schedule = info.get("schedule", [])

        for sp in reqs:
            target_start, target_end = sp.start, sp.end

            hit_idx = None
            for i, slot in enumerate(schedule):
                s = slot.start.strftime("%H:%M") if not isinstance(slot.start, str) else slot.start
                e = slot.end.strftime("%H:%M")   if not isinstance(slot.end, str)   else slot.end
                if s == target_start and e == target_end:
                    hit_idx = i
                    break
            if hit_idx is None:
                continue

            slot = schedule[hit_idx]
            if getattr(slot, "place_type", None) in ("start", "end", "accommodation"):
                continue
            if slot.title not in (None, ""):
                # 이미 채워진 슬롯은 프런트에서 삭제 후 분할하도록 유도
                continue

            st = _parse_hhmm(target_start)
            en = _parse_hhmm(target_end)
            st_m, en_m = _to_minutes(st), _to_minutes(en)
            if en_m - st_m < MIN_SLOT_MINUTES * 2:
                continue

            if sp.mid:
                mid_m = _to_minutes(_parse_hhmm(sp.mid))
            else:
                mid_m = (st_m + en_m) // 2

            mid_m = _round_to(mid_m, ROUND_TO_MINUTES)
            left_min  = st_m + MIN_SLOT_MINUTES
            right_min = en_m - MIN_SLOT_MINUTES
            mid_m = max(left_min, min(right_min, mid_m))
            if not (st_m < mid_m < en_m):
                continue

            def _new_empty_slot(start_m, end_m):
                ns = type(slot)()
                ns.start = _to_time(start_m)
                ns.end   = _to_time(end_m)
                ns.title = None
                ns.place_type = None
                ns.location_info = None
                return ns

            left  = _new_empty_slot(st_m, mid_m)
            right = _new_empty_slot(mid_m, en_m)

            schedule.pop(hit_idx)
            schedule.insert(hit_idx, right)
            schedule.insert(hit_idx, left)
            applied += 1

    _log(f"splits applied: {applied}")

# ---------- 라우터 ----------
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

        # 1) 삭제 반영 (슬롯을 None으로)
        _clear_slots_by_deletions(tables, req.deletions)
        # 2) 분할 반영 (빈칸 슬롯만 둘로 쪼개기)
        _apply_splits(tables, req.splits)

        # 3) DQN으로 빈칸만 채우기
        phase = "dqn"
        base_mode = _focus_to_mode(req.focus_type)
        tables = dqn_fill_schedule(req.uid, req.title, tables, base_mode=base_mode)

        # 4) 응답
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
