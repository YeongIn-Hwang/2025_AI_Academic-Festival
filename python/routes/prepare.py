# routes/prepare.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os, traceback
from datetime import time as dtime, datetime

from services.making_table import (
    create_empty_daily_tables,
    insert_initial_schedule_items_dynamic,
    ScheduleItem,  # ScheduleItem이 공개되어 있다고 가정
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

# ---- 프런트에서 보내는 현재 타임라인 / 고정 슬롯 ----
class ClientEvent(BaseModel):
    start: str
    end: str
    title: Optional[str] = None
    type: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class ClientDay(BaseModel):
    date: str
    weekday: Optional[str] = ""
    events: List[ClientEvent] = Field(default_factory=list)

class FixedPlace(BaseModel):
    name: str
    type: Optional[str] = None
    place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class MergeItem(BaseModel):
    date: str                           # "YYYY-MM-DD"
    winner: dict                        # {"start":"HH:MM","end":"HH:MM"}
    loser: dict                         # {"start":"HH:MM","end":"HH:MM"}


class FixedSlot(BaseModel):
    date: str
    start: str
    end: str
    place: FixedPlace


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
    client_timeline: Optional[List[ClientDay]] = None
    fixed_slots: Optional[List[FixedSlot]] = None
    merges: Optional[List[MergeItem]] = None

    # 프런트( Journey.js > toTables )가 보내는 현재 화면 테이블
    client_tables: Optional[Dict[str, Any]] = None

def _log(*args):
    print("[/routes/prepare]", *args, flush=True)

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
            "schedule": []
        }
        for it in info.get("schedule", []):
            loc = getattr(it, "location_info", None) or {}
            out[d]["schedule"].append({
                "title": it.title,
                "start": it.start.strftime("%H:%M"),
                "end": it.end.strftime("%H:%M"),
                "place_type": it.place_type,
                "lat": loc.get("lat"),
                "lng": loc.get("lng"),
                "location_info": loc,
            })
            
    #import json
    #print("[_serialize_tables] 결과:\n", json.dumps(out, ensure_ascii=False, indent=2))
            
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

# ---------- 베이스 테이블 생성 ----------
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

# ---------- 분할/병합 공통 ----------
MIN_SLOT_MINUTES = 30
ROUND_TO_MINUTES = 15
PROTECTED_TYPES = {"start", "end", "accommodation"}

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

# ---------- 병합 -----------------------------

def _find_slot_index_by_se(schedule, start_hhmm: str, end_hhmm: str):
    for i, slot in enumerate(schedule):
        s = _time_to_hhmm(getattr(slot, "start", None))
        e = _time_to_hhmm(getattr(slot, "end", None))
        if s == start_hhmm and e == end_hhmm:
            return i
    return None

def _apply_merges(tables: dict, merges: Optional[List["MergeItem"]]):
    """프런트에서 선택한 두 인접 슬롯을 하나로 합친다.
    - 첫 클릭(=winner)의 콘텐츠/타입을 유지
    - 시간은 두 슬롯의 min(start) ~ max(end)로 확장
    - 보호 슬롯(start/end/accommodation) 포함 시 skip
    """
    if not merges:
        return
    applied = 0
    for m in merges:
        info = tables.get(m.date)
        if not info:
            continue
        schedule = info.get("schedule", [])
        wi = _find_slot_index_by_se(schedule, m.winner["start"], m.winner["end"])
        li = _find_slot_index_by_se(schedule, m.loser["start"],  m.loser["end"])
        if wi is None or li is None:
            continue
        i, j = sorted([wi, li])
        a = schedule[i]
        b = schedule[j]
        # 보호 슬롯 방어
        if (getattr(a, "place_type", None) in PROTECTED_TYPES or
            getattr(b, "place_type", None) in PROTECTED_TYPES):
            continue

        # 시간 병합 범위
        a_s = _parse_hhmm(_time_to_hhmm(a.start))
        a_e = _parse_hhmm(_time_to_hhmm(a.end))
        b_s = _parse_hhmm(_time_to_hhmm(b.start))
        b_e = _parse_hhmm(_time_to_hhmm(b.end))
        new_start = min(a_s, b_s)
        new_end   = max(a_e, b_e)

        # 승자(winner) 정보 유지
        winner_is_a = (wi == i)
        winner_slot = a if winner_is_a else b

        # slot 타입은 같은 클래스 인스턴스로 생성
        NewCls = type(a)
        merged = NewCls(
            title = getattr(winner_slot, "title", None),
            start = new_start,
            end   = new_end,
            place_type = getattr(winner_slot, "place_type", None),
            location_info = getattr(winner_slot, "location_info", None),
        )

        # 두 칸을 하나로 치환
        schedule.pop(j)
        schedule.pop(i)
        schedule.insert(i, merged)
        applied += 1
    _log(f"merges applied: {applied}")


# ---------- 클라이언트 타임라인 오버레이 ----------

def _overlay_client_timeline(tables: dict, client_days: Optional[List[ClientDay]]):
    if not client_days:
        return
    by_date = {d.date: d for d in client_days}
    applied_fill = applied_clear = 0
    for date_str, info in tables.items():
        day = by_date.get(date_str)
        if not day:
            continue
        ev_by_time = {(ev.start, ev.end): ev for ev in (day.events or [])}
        schedule = info.get("schedule", [])
        for slot in schedule:
            s = _time_to_hhmm(getattr(slot, "start", None))
            e = _time_to_hhmm(getattr(slot, "end", None))
            ev = ev_by_time.get((s, e))
            if not ev:
                continue
            # 보호 슬롯은 건너뜀
            if getattr(slot, "place_type", None) in ("start", "end", "accommodation"):
                continue
            if ev.title:
                slot.title = ev.title
                slot.place_type = ev.type or slot.place_type
                if ev.lat is not None and ev.lng is not None:
                    slot.location_info = {"name": ev.title, "lat": ev.lat, "lng": ev.lng}
                applied_fill += 1
            else:
                # 프런트가 빈칸으로 표시한 슬롯은 명시적으로 비움
                slot.title = None
                slot.place_type = None
                slot.location_info = None
                applied_clear += 1
    _log(f"overlay client timeline: filled={applied_fill}, cleared={applied_clear}")

# ---------- 고정 슬롯 적용 (pins) ----------

def _apply_fixed_slots(tables: dict, fixed_slots: Optional[List[FixedSlot]]):
    if not fixed_slots:
        return
    applied = 0
    for fs in fixed_slots:
        info = tables.get(fs.date)
        if not info:
            continue
        for slot in info.get("schedule", []):
            s = _time_to_hhmm(getattr(slot, "start", None))
            e = _time_to_hhmm(getattr(slot, "end", None))
            if s == fs.start and e == fs.end:
                if getattr(slot, "place_type", None) in ("start", "end", "accommodation"):
                    break
                p = fs.place
                slot.title = p.name
                slot.place_type = p.type or "etc"
                if p.lat is not None and p.lng is not None:
                    slot.location_info = {"name": p.name, "lat": p.lat, "lng": p.lng}
                else:
                    slot.location_info = {"name": p.name}
                applied += 1
                break
    _log(f"fixed_slots applied: {applied}")

# ---------- 분할 적용 ----------

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
                return type(slot)(
                    title=None,
                    start=_to_time(start_m),
                    end=_to_time(end_m),
                    place_type=None,
                    location_info=None,
                )

            left  = _new_empty_slot(st_m, mid_m)
            right = _new_empty_slot(mid_m, en_m)

            schedule.pop(hit_idx)
            schedule.insert(hit_idx, right)
            schedule.insert(hit_idx, left)
            applied += 1

    _log(f"splits applied: {applied}")

# ---------- 프런트 client_tables → 내부 테이블 변환 ----------

def _client_event_to_item(ev: dict) -> "ScheduleItem":
    """프런트 이벤트 한 칸을 ScheduleItem으로 변환"""
    start_s = ev.get("start")
    end_s   = ev.get("end")
    if not start_s or not end_s:
        raise ValueError("event start/end missing")

    start_t = _parse_hhmm(start_s)
    end_t   = _parse_hhmm(end_s)

    title = ev.get("title")
    # Journey.toTables()는 'place_type'로 내려줌. 혹시 'type'만 있는 경우도 보정
    place_type = ev.get("place_type") or ev.get("type") or None
    if not title:
        # 삭제된 슬롯은 진짜 빈칸으로
        place_type = None
        lat = None
        lng = None

    # 위치 정보 조립
    lat = ev.get("lat")
    lng = ev.get("lng")
    loc = None
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        loc = {"name": (title or ev.get("name") or ""), "lat": lat, "lng": lng}
    elif title:
        loc = {"name": title}

    return ScheduleItem(
        title=title,
        start=start_t,
        end=end_t,
        place_type=place_type,
        location_info=loc,
    )

def _tables_from_client_tables(client_tables: Dict[str, Any]) -> dict:
    """Journey.js -> toTables() 포맷을 서버 내부 테이블(dict[date] -> {..., schedule:[ScheduleItem,...]})로 변환"""
    out = {}
    for date, info in (client_tables or {}).items():
        sched_items = []
        for ev in info.get("schedule", []):
            try:
                item = _client_event_to_item(ev)
                sched_items.append(item)
            except Exception as e:
                _log(f"skip bad event on {date}: {e}")
                continue
        # 시작시간 기준 정렬
        sched_items.sort(key=lambda it: (it.start.hour, it.start.minute))
        out[date] = {
            "weekday": info.get("weekday", ""),
            "start_location": info.get("start_location"),
            "end_location": info.get("end_location"),
            "schedule": sched_items,
        }
    return out

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
        used_client_tables = False

        phase = "build"
        if req.client_tables:
            # 프런트가 보낸 현재 화면 상태를 그대로 사용
            tables = _tables_from_client_tables(req.client_tables)
            used_client_tables = True
            _log("using client_tables as base")
        else:
            # 기존 로직: 새로 베이스를 만들고 각종 diff를 반영
            tables = _build_base_tables(req)

        if not used_client_tables:
            # 화면 전체 테이블이 아닌, 일부 diff만 온 경우에만 적용
            _clear_slots_by_deletions(tables, req.deletions)
            _apply_splits(tables, req.splits)
            _apply_merges(tables, req.merges)
            _overlay_client_timeline(tables, req.client_timeline)
            _apply_fixed_slots(tables, req.fixed_slots)

        # 6) DQN
        phase = "dqn"
        base_mode = _focus_to_mode(req.focus_type)
        tables = dqn_fill_schedule(req.uid, req.title, tables, base_mode=base_mode)

        # 병합 요청이 있었다면, DQN 이후에도 한 번 더 반영(선택):
        _apply_merges(tables, req.merges)

        # 7) 응답
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
