import json
from datetime import time, datetime, timedelta
import requests
from core.firebase import db

# ===== DEBUG 도우미 =====
DEBUG = True
def _dbg(*args):
    if DEBUG:
        print("[making_table]", *args, flush=True)

def _fmt_time(t):
    try:
        return t.strftime("%H:%M")
    except Exception:
        return str(t)

class ScheduleItem:
    def __init__(self, title, start, end, place_type, location_info=None):
        self.title = title
        self.start = start
        self.end = end
        self.place_type = place_type
        self.location_info = location_info
    def __repr__(self):
        return f"ScheduleItem(title={self.title!r}, { _fmt_time(self.start)}-{ _fmt_time(self.end)}, type={self.place_type})"

def generate_empty_slots(time_table, day_start=time(9, 0), day_end=time(23, 59)):
    _dbg("generate_empty_slots: in_count=", len(time_table), "day_start=", _fmt_time(day_start), "day_end=", _fmt_time(day_end))

    def to_datetime(t):
        return datetime.combine(datetime.today(), t)

    sorted_table = sorted(time_table, key=lambda x: x.start)
    if sorted_table:
        _dbg("generate_empty_slots: first=", _fmt_time(sorted_table[0].start), "last=", _fmt_time(sorted_table[-1].end))

    empty_slots = []

    # Step 1
    if not sorted_table or sorted_table[0].start > day_start:
        _dbg("empty before first: ", _fmt_time(day_start), "→", _fmt_time(sorted_table[0].start if sorted_table else day_end))
        empty_slots += split_empty_range(day_start, sorted_table[0].start if sorted_table else day_end)

    # Step 2
    for i in range(len(sorted_table) - 1):
        current_end = sorted_table[i].end
        next_start = sorted_table[i + 1].start
        if current_end < next_start:
            _dbg(f"gap between idx {i} and {i+1}:", _fmt_time(current_end), "→", _fmt_time(next_start))
            empty_slots += split_empty_range(current_end, next_start)

    # Step 3
    if sorted_table and sorted_table[-1].end < day_end:
        _dbg("empty after last: ", _fmt_time(sorted_table[-1].end), "→", _fmt_time(day_end))
        empty_slots += split_empty_range(sorted_table[-1].end, day_end)

    _dbg("generate_empty_slots: out_count=", len(empty_slots))
    return empty_slots

def split_empty_range(start_time, end_time):
    dt_start = datetime.combine(datetime.today(), start_time)
    dt_end   = datetime.combine(datetime.today(), end_time)
    gap_minutes = int((dt_end - dt_start).total_seconds() // 60)
    _dbg("split_empty_range:", _fmt_time(start_time), "→", _fmt_time(end_time), "gap(min)=", gap_minutes)

    # 디버그 가드: 음수/이상 gap
    if gap_minutes < 0:
        raise ValueError(f"[split_empty_range] end < start ({_fmt_time(start_time)} → {_fmt_time(end_time)})")

    slots = []
    if gap_minutes < 90:
        return []  # 너무 짧으면 무시

    elif gap_minutes < 120:
        slots.append(ScheduleItem(None, start_time, end_time, None))
    else:
        dt_cursor = dt_start
        while (dt_end - dt_cursor).total_seconds() >= 120 * 60:
            dt_next = dt_cursor + timedelta(minutes=120)
            slots.append(ScheduleItem(None, dt_cursor.time(), dt_next.time(), None))
            dt_cursor = dt_next

        remaining_minutes = int((dt_end - dt_cursor).total_seconds() // 60)
        _dbg("split_empty_range: remaining=", remaining_minutes)
        if 120 <= remaining_minutes <= 210:
            slots.append(ScheduleItem(None, dt_cursor.time(), dt_end.time(), None))
        elif remaining_minutes >= 90:
            slots.append(ScheduleItem(None, dt_cursor.time(), dt_end.time(), None))

    _dbg("split_empty_range: made", len(slots), "slots")
    return slots

def place_location_info(place_name, api_key):
    _dbg("place_location_info: query=", place_name, "has_key=", bool(api_key))
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": place_name,
        "key": api_key,
        "language": "ko"
    }

    # 네트워크 예외를 그대로 올려서 어디서 터졌는지 로그로 확인
    try:
        res = requests.get(url, params=params, timeout=8)
        _dbg("place_location_info: status_code=", res.status_code)
        res.raise_for_status()
        data = res.json()
    except Exception as ex:
        _dbg("place_location_info: request ERROR:", repr(ex))
        raise

    results = data.get("results") or []
    _dbg("place_location_info: results_len=", len(results))
    if not results:
        return None

    top_result = results[0]
    name = top_result.get("name")
    lat = top_result.get("geometry", {}).get("location", {}).get("lat")
    lng = top_result.get("geometry", {}).get("location", {}).get("lng")
    _dbg("place_location_info: top=", name, lat, lng)
    return {"name": name, "lat": lat, "lng": lng}

def place_location_info_lodging(place_name, api_key, *, bias=None, radius=5000, lenient=True):
    """
    숙소(lodging) 전용 검색 (유연한 폴백 내장)
    - bias = (lat, lng) 주면 해당 중심 반경(radius m) 안에서 랭킹 가산
    - 순서:
      1) Text Search(type=lodging, region=kr, [location+radius])
      2) (lenient) Nearby Search(type=lodging, [location+radius])
      3) (lenient) Text Search(query='... 호텔', region=kr, [location+radius]) 후 lodging/hotel 타입만 선택
      4) (lenient) 일반 Text Search 후 lodging/hotel 타입만 선택
    - 모두 실패 시 None
    """
    _dbg("place_location_info_lodging:", place_name, "bias=", bias, "radius=", radius, "lenient=", lenient)

    TEXT_URL   = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    def _text_search(query, extra=None):
        params = {"query": query, "key": api_key, "language": "ko", "region": "kr"}
        if extra:
            params.update(extra)
        if bias:
            lat, lng = bias
            params["location"] = f"{lat},{lng}"
            params["radius"] = radius
        res = requests.get(TEXT_URL, params=params, timeout=8)
        _dbg("textsearch:", res.status_code, params)
        res.raise_for_status()
        return (res.json().get("results") or [])

    def _nearby_search(extra=None):
        if not bias:
            return []
        lat, lng = bias
        params = {"key": api_key, "language": "ko", "location": f"{lat},{lng}", "radius": radius}
        if extra:
            params.update(extra)
        res = requests.get(NEARBY_URL, params=params, timeout=8)
        _dbg("nearby:", res.status_code, params)
        res.raise_for_status()
        return (res.json().get("results") or [])

    def _pick_basic(results):
        if not results:
            return None
        r = results[0]
        loc = (r.get("geometry") or {}).get("location") or {}
        return {"name": r.get("name"), "lat": loc.get("lat"), "lng": loc.get("lng")}

    def _pick_by_types(results, wanted={"lodging", "hotel"}):
        for r in results:
            types = set(r.get("types") or [])
            if types & wanted:
                loc = (r.get("geometry") or {}).get("location") or {}
                return {"name": r.get("name"), "lat": loc.get("lat"), "lng": loc.get("lng")}
        return None

    # 1) Text Search: type=lodging
    r1 = _text_search(place_name, {"type": "lodging"})
    if r1:
        p = _pick_by_types(r1) or _pick_basic(r1)
        if p:
            _dbg("picked by text(type=lodging):", p)
            return p

    if not lenient:
        _dbg("no results and lenient=False -> None")
        return None

    # 2) Nearby Search: type=lodging (bias가 있어야 효과적)
    r2 = _nearby_search({"type": "lodging"})
    if r2:
        p = _pick_by_types(r2) or _pick_basic(r2)
        if p:
            _dbg("picked by nearby(type=lodging):", p)
            return p

    # 3) Text Search: '호텔' 키워드 추가
    r3 = _text_search(f"{place_name} 호텔")
    p3 = _pick_by_types(r3)
    if p3:
        _dbg("picked by text('호텔' keyword):", p3)
        return p3

    # 4) 일반 Text Search → lodging/hotel 타입만 골라서
    r4 = _text_search(place_name)
    p4 = _pick_by_types(r4)
    if p4:
        _dbg("picked by text(general, types filtered):", p4)
        return p4

    _dbg("no lodging result found -> None")
    return None


def create_empty_daily_tables(API_KEY, start_date_str, end_date_str, 
                              first_day_start_time, last_day_end_time, 
                              start_location, final_end_location,
                              accommodation_location,
                              default_start_time=time(9, 0), default_end_time=time(23, 0)):
    _dbg("create_empty_daily_tables: dates=", start_date_str, end_date_str,
         "first/last=", _fmt_time(first_day_start_time), _fmt_time(last_day_end_time))
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date   = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    num_days   = (end_date - start_date).days + 1
    _dbg("create_empty_daily_tables: num_days=", num_days)

    if num_days <= 0:
        raise ValueError(f"[create_empty_daily_tables] invalid date range: {start_date_str}~{end_date_str}")

    daily_tables = {}
    table_place_info = {}

    for i in range(num_days):
        date = start_date + timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")
        weekday = date.strftime("%A")
        is_first_day = (i == 0)
        is_last_day  = (i == num_days - 1)

        start_time = first_day_start_time if is_first_day else default_start_time
        end_time   = last_day_end_time   if is_last_day  else default_end_time

        _dbg(f"[{date_str}] is_first={is_first_day} is_last={is_last_day} start={_fmt_time(start_time)} end={_fmt_time(end_time)}")

        # 빈 슬롯 생성
        slots = split_empty_range(start_time, end_time)
        _dbg(f"[{date_str}] slots_count={len(slots)}")

        # 위치 조회 (현재 로직 유지)
        table_place_info["시작위치"] = place_location_info(start_location, API_KEY)
        table_place_info["종료위치"] = place_location_info(final_end_location, API_KEY)
        table_place_info["숙소"]   = place_location_info_lodging(accommodation_location, API_KEY)

        # 디버그 가드: None 이면 어디가 None인지 즉시 알기
        if is_first_day and table_place_info["시작위치"] is None:
            raise ValueError("[create_empty_daily_tables] 시작위치 검색 결과가 없습니다.")
        if is_last_day and table_place_info["종료위치"] is None:
            raise ValueError("[create_empty_daily_tables] 종료위치 검색 결과가 없습니다.")
        if table_place_info["숙소"] is None:
            raise ValueError("[create_empty_daily_tables] 숙소 검색 결과가 없습니다.")

        start_loc = table_place_info["시작위치"]["name"] if is_first_day else table_place_info["숙소"]["name"]
        end_loc   = table_place_info["종료위치"]["name"] if is_last_day else table_place_info["숙소"]["name"]

        _dbg(f"[{date_str}] start_loc={start_loc} end_loc={end_loc}")

        daily_tables[date_str] = {
            "weekday": weekday,
            "start_location": start_loc,
            "end_location": end_loc,
            "schedule": slots
        }

    _dbg("create_empty_daily_tables: done. days=", list(daily_tables.keys()))
    return table_place_info, daily_tables

def insert_initial_schedule_items_dynamic(daily_tables, table_place_info):
    _dbg("insert_initial_schedule_items_dynamic: days=", len(daily_tables))
    for idx, (date, info) in enumerate(daily_tables.items()):
        schedule = info["schedule"]

        # 빈 스케줄일 수 있으니 기본값 로그 출력
        start_time = schedule[0].start if schedule else time(9, 0)
        end_time   = schedule[-1].end if schedule else time(21, 0)
        _dbg(f"[{date}] before insert: schedule_len={len(schedule)} start={_fmt_time(start_time)} end={_fmt_time(end_time)} idx={idx}")

        items_to_insert = []

        # 시작 전
        if idx == 0:
            if table_place_info.get("시작위치") is None or table_place_info["시작위치"].get("name") is None:
                raise ValueError("[insert_initial_schedule_items_dynamic] 시작위치 name 접근 실패 (None)")
            title   = table_place_info["시작위치"]["name"]
            loc_info= table_place_info["시작위치"]
        else:
            if table_place_info.get("숙소") is None or table_place_info["숙소"].get("name") is None:
                raise ValueError("[insert_initial_schedule_items_dynamic] 숙소 name 접근 실패 (None)")
            title   = table_place_info["숙소"]["name"]
            loc_info= table_place_info["숙소"]
        new_start = (datetime.combine(datetime.today(), start_time) - timedelta(hours=1)).time()
        items_to_insert.append(ScheduleItem(title, new_start, start_time, "start" if idx==0 else "accommodation", loc_info))

        # 종료 후
        if idx == 0 and len(daily_tables)!=0:
            if table_place_info.get("숙소") is None or table_place_info["숙소"].get("name") is None:
                raise ValueError("[insert_initial_schedule_items_dynamic] 숙소 name 접근 실패 (None)")
            title   = table_place_info["숙소"]["name"]
            loc_info= table_place_info["숙소"]
        elif idx == len(daily_tables) - 1:
            if table_place_info.get("종료위치") is None or table_place_info["종료위치"].get("name") is None:
                raise ValueError("[insert_initial_schedule_items_dynamic] 종료위치 name 접근 실패 (None)")
            title   = table_place_info["종료위치"]["name"]
            loc_info= table_place_info["종료위치"]
        else:
            if table_place_info.get("숙소") is None or table_place_info["숙소"].get("name") is None:
                raise ValueError("[insert_initial_schedule_items_dynamic] 숙소 name 접근 실패 (None)")
            title   = table_place_info["숙소"]["name"]
            loc_info= table_place_info["숙소"]

        new_end = (datetime.combine(datetime.today(), end_time) + timedelta(hours=1)).time()
        items_to_insert.append(ScheduleItem(title, end_time, new_end, "end" if idx == len(daily_tables) - 1 else "accommodation", loc_info))

        # 삽입
        schedule.insert(0, items_to_insert[0])
        schedule.append(items_to_insert[1])

        _dbg(f"[{date}] after insert: schedule_len={len(schedule)} first={schedule[0]} last={schedule[-1]}")

    # 원래 name 삭제하던 코드 유지(의도 유지) — 디버그 로그 추가
    _dbg("delete names in table_place_info keys=", list(table_place_info.keys()))
    del table_place_info["숙소"]["name"]
    del table_place_info["시작위치"]["name"]
    del table_place_info["종료위치"]["name"]
    _dbg("names deleted. return daily_tables")
    return daily_tables
