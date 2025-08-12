import re
import time
from datetime import time as dtime, datetime
from core.firebase import db

# ---------- Firestore → 장소 로드 ----------
def get_places_from_json(user_id, title, filename=None):
    col = (
        db.collection("user_trips")
          .document(user_id)
          .collection("trips")
          .document(title)
          .collection("places")
    )
    docs = col.stream()
    places = []
    for doc in docs:
        p = doc.to_dict() or {}
        normalized = {
            "name": p.get("name"),
            "lat": p.get("lat"),
            "lng": p.get("lng"),
            "type": p.get("type"),
            "business_status": p.get("business_status", "OPERATIONAL"),
            "weekday_text": p.get("weekday_text", []),
            "trust_score": p.get("trust_score", 0.0),
            "hope_score": p.get("hope_score", 0.0),
            "nonhope_score": p.get("nonhope_score", 0.0),
            "cluster_scores": p.get("cluster_scores", p.get("hope_score", 0.0)),
        }
        places.append(normalized)
    return places

# ---------- 유틸 ----------
def time_diff_minutes(t1, t2):
    dt1 = datetime.combine(datetime.today(), t1)
    dt2 = datetime.combine(datetime.today(), t2)
    return abs((dt1 - dt2).total_seconds() / 60)

def get_constraints(base_mode="명소 중심"):
    constraints = {
        "must_visit_attraction_every_minutes": 240,
        "attraction_required": True,
        "min_minutes_between_meals": 360,
        "require_meal_after_threshold": True,
        "dont_eat_meal": 240,
        "department_store_required_interval": None,
        "allow_multiple_cafes": False
    }
    if base_mode == "식사 중심":
        constraints["attraction_required"] = False
        constraints["min_minutes_between_meals"] = 240
    if base_mode == "카페, 빵집 중심":
        constraints["require_meal_after_threshold"] = False
        constraints["attraction_required"] = False
        constraints["allow_multiple_cafes"] = True
    if base_mode == "쇼핑 중심":
        constraints["department_store_required_interval"] = 180
        constraints["attraction_required"] = False
    return constraints

def get_elapsed_minutes_since_last_type(place_type, time_table, idx):
    current_start = time_table[idx].start
    for i in range(idx - 1, -1, -1):
        if time_table[i].place_type == place_type:
            last_end = time_table[i].end
            return time_diff_minutes(last_end, current_start)
    first_time = time_table[0].start
    return time_diff_minutes(first_time, current_start)

# ---------- 타입 선택 ----------
def select_allowed_types(time_table, base_mode, idx):
    allowed_types = ['tourist_attraction', 'cafe', 'restaurant', 'bakery', 'bar', 'shopping_mall']
    constraints = get_constraints(base_mode)

    if constraints["attraction_required"]:
        if get_elapsed_minutes_since_last_type('tourist_attraction', time_table, idx) >= constraints["must_visit_attraction_every_minutes"]:
            return ['tourist_attraction']

    if constraints["require_meal_after_threshold"]:
        if get_elapsed_minutes_since_last_type('restaurant', time_table, idx) <= constraints["dont_eat_meal"]:
            if "restaurant" in allowed_types:
                allowed_types.remove("restaurant")
        if get_elapsed_minutes_since_last_type('restaurant', time_table, idx) >= constraints["min_minutes_between_meals"]:
            return ['restaurant']

    if constraints["department_store_required_interval"] is not None:
        if get_elapsed_minutes_since_last_type('shopping_mall', time_table, idx) >= constraints["department_store_required_interval"]:
            return ['shopping_mall']

    if not constraints["allow_multiple_cafes"] and idx > 0:
        if time_table[idx-1].place_type in ("cafe", "bakery"):
            allowed_types = [t for t in allowed_types if t not in ("cafe", "bakery")]

    return allowed_types

# ---------- 거리/시간 ----------
def compute_distance(place1, place2):
    if not place1 or not place2:
        return float("inf")
    return ((place1['lat'] - place2['lat']) ** 2 + (place1['lng'] - place2['lng']) ** 2) ** 0.5

def parse_korean_time(text: str):
    try:
        text = text.strip()
        if text.startswith("오전"):
            h, m = map(int, text.replace("오전 ", "").split(":"))
            if h == 12:
                h = 0
            return dtime(h, m)
        if text.startswith("오후"):
            h, m = map(int, text.replace("오후 ", "").split(":"))
            if h != 12:
                h += 12
            return dtime(h, m)
        h, m = map(int, text.split(":"))
        return dtime(h, m)
    except:
        return None

def is_place_open_during_slot(place, date_str, start_time, end_time):
    if place.get("business_status") != "OPERATIONAL":
        return False
    weekday_text = place.get("weekday_text") or []
    if not weekday_text:
        return True
    weekday = datetime.strptime(date_str, "%Y-%m-%d").weekday()
    weekday_kr = ["월요일","화요일","수요일","목요일","금요일","토요일","일요일"]
    target_day = weekday_kr[weekday]
    for text in weekday_text:
        line = str(text)
        if not line.startswith(target_day):
            continue
        body = line.split(": ", 1)[-1].strip()
        if "24시간" in body:
            return True
        parts = re.split(r"\s*~\s*", body)
        if len(parts) != 2:
            continue
        open_time = parse_korean_time(parts[0])
        close_time = parse_korean_time(parts[1])
        if not open_time or not close_time:
            continue
        if close_time < open_time:
            close_time = dtime(23, 59)
        if open_time <= start_time and end_time <= close_time:
            return True
    return False

# ---------- 후보 필터 ----------
def get_valid_candidates(all_places, allowed_types, date_str, slot):
    candidates = []
    for place in all_places:
        if place.get("in_timetable"):
            continue
        if "호텔" in (place.get("name") or ""):
            continue
        if place.get('type') not in allowed_types:
            continue
        if is_place_open_during_slot(place, date_str, slot.start, slot.end):
            candidates.append(place)
    return candidates

# ---------- 점수 ----------
def get_user_params(user_id):
    try:
        doc = db.collection("user_params").document(user_id).get()
        if doc.exists:
            return doc.to_dict()
    except:
        pass
    return {"w_dist": 0.5, "w_cluster": 0.4, "w_trust": 0.4, "w_nonhope": 0.3}

def get_score_ranges(all_places):
    hope_scores = [float(p.get("hope_score", 0.0)) for p in all_places]
    nonhope_scores = [float(p.get("nonhope_score", 0.0)) for p in all_places]
    return {
        "hope": {"min": min(hope_scores or [0.0]), "max": max(hope_scores or [1.0])},
        "nonhope": {"min": min(nonhope_scores or [0.0]), "max": max(nonhope_scores or [1.0])},
    }

# ==== 빠른 점수 계산용 유틸 ====
def _precompute_norm_scores(all_places, ranges):
    cmin, cmax = ranges["hope"]["min"], ranges["hope"]["max"]
    nmin, nmax = ranges["nonhope"]["min"], ranges["nonhope"]["max"]
    for p in all_places:
        rc = float(p.get("cluster_scores", 0.0))
        rn = float(p.get("nonhope_score", 0.0))
        p["_cluster_n"] = ((rc - cmin) / (cmax - cmin)) if cmax > cmin else 0.0
        p["_nonhope_n"] = ((rn - nmin) / (nmax - nmin)) if nmax > nmin else 0.0

def _dist_key(a, b):
    return (round(a["lat"], 6), round(a["lng"], 6), round(b["lat"], 6), round(b["lng"], 6))

def _distance_cached(prev_loc, place, dist_cache):
    if not prev_loc or not place:
        return float("inf")
    key = _dist_key(prev_loc, place)
    d = dist_cache.get(key)
    if d is not None:
        return d
    d = ((prev_loc["lat"] - place["lat"]) ** 2 + (prev_loc["lng"] - place["lng"]) ** 2) ** 0.5
    dist_cache[key] = d
    return d

def compute_total_score_fast(params, place, prev_location, dist_cache):
    if not prev_location:
        return 0.0
    dist = _distance_cached(prev_location, place, dist_cache)
    dist_score = 1 / (1 + dist)
    cluster_n = place.get("_cluster_n", 0.0)
    nonhope_n = place.get("_nonhope_n", 0.0)
    trust = float(place.get("trust_score", 0.0))
    return (
        params["w_dist"] * dist_score +
        params["w_cluster"] * cluster_n +
        params["w_trust"] * trust -
        params["w_nonhope"] * nonhope_n
    )

# ==== 후보 캐시 키 ====
def _candidates_key(date_str, slot, allowed_types):
    return (date_str, slot.start, slot.end, tuple(sorted(allowed_types)))

# ---------- 미래 보상 (Depth=3, 후보 상한 5개) ----------
def compute_future_reward(user_id, schedule, current_idx, all_places, date_str, ranges, depth, base_mode,
                          params, dist_cache, cand_cache):
    if depth == 0 or current_idx >= len(schedule):
        return 0.0

    current_slot = schedule[current_idx]
    if current_slot.title is not None:
        future_loc = current_slot.location_info
        prev_loc = next((s.location_info for s in reversed(schedule[:current_idx]) if s.location_info), None)
        if prev_loc and future_loc:
            return compute_total_score_fast(params, future_loc, prev_loc, dist_cache)
        return 0.0

    allowed_types = select_allowed_types(schedule, base_mode, current_idx)

    key = _candidates_key(date_str, current_slot, allowed_types)
    base_candidates = cand_cache.get(key)
    if base_candidates is None:
        base_candidates = get_valid_candidates(all_places, allowed_types, date_str, current_slot)
        cand_cache[key] = base_candidates
    candidates = [p for p in base_candidates if not p.get("in_timetable")]

    if not candidates:
        return 0.0

    prev_loc = next((s.location_info for s in reversed(schedule[:current_idx]) if s.location_info), None)

    if prev_loc and prev_loc.get("lat") is not None and prev_loc.get("lng") is not None:
        candidates.sort(key=lambda p: _distance_cached(prev_loc, p, dist_cache))
    else:
        candidates.sort(key=lambda p: -float(p.get("trust_score", 0.0)))

    # 🔧 후보 상한 = 5
    top_candidates = candidates[:5]

    best_reward = -float("inf")
    for place in top_candidates:
        current_slot.title = place["name"]
        current_slot.place_type = place["type"]
        current_slot.location_info = {"lat": place["lat"], "lng": place["lng"], "name": place["name"]}
        place["in_timetable"] = True

        immediate = compute_total_score_fast(params, place, prev_loc, dist_cache)
        future = compute_future_reward(
            user_id, schedule, current_idx + 1, all_places, date_str, ranges, depth - 1, base_mode,
            params, dist_cache, cand_cache
        )
        total = immediate + future
        if total > best_reward:
            best_reward = total

        current_slot.title = None
        current_slot.place_type = None
        current_slot.location_info = None
        place["in_timetable"] = False

    return best_reward if best_reward != -float("inf") else 0.0


# ---------- 메인 ----------
def dqn_fill_schedule(user_id, title, tables, base_mode="명소 중심"):
    import time as _tmod
    t0 = _tmod.time()

    all_places = get_places_from_json(user_id, title)
    if not all_places:
        print("[DQN] 장소 데이터 없음")
        return tables

    ranges = get_score_ranges(all_places)
    _precompute_norm_scores(all_places, ranges)
    params = get_user_params(user_id)
    dist_cache = {}
    cand_cache = {}

    for date_str, info in tables.items():
        schedule = info["schedule"]
        for idx, slot in enumerate(schedule):
            if slot.title is not None:
                continue

            allowed_types = select_allowed_types(schedule, base_mode, idx)
            if not allowed_types:
                continue

            key = _candidates_key(date_str, slot, allowed_types)
            base_candidates = cand_cache.get(key)
            if base_candidates is None:
                base_candidates = get_valid_candidates(all_places, allowed_types, date_str, slot)
                cand_cache[key] = base_candidates
            candidates = [p for p in base_candidates if not p.get("in_timetable")]
            if not candidates:
                continue

            prev_loc = next((s.location_info for s in reversed(schedule[:idx]) if s.location_info), None)

            if prev_loc and prev_loc.get("lat") is not None and prev_loc.get("lng") is not None:
                candidates.sort(key=lambda p: _distance_cached(prev_loc, p, dist_cache))
            else:
                candidates.sort(key=lambda p: -float(p.get("trust_score", 0.0)))

            # 현재 슬롯 후보 상한 = 5
            top_candidates = candidates[:5]

            best_score, best_place = -float("inf"), None
            for place in top_candidates:
                immediate = compute_total_score_fast(params, place, prev_loc, dist_cache)
                future = compute_future_reward(
                    user_id, schedule, idx + 1, all_places, date_str, ranges, depth=3, base_mode=base_mode,
                    params=params, dist_cache=dist_cache, cand_cache=cand_cache
                )
                total = immediate + future
                if total > best_score:
                    best_score, best_place = total, place

            if best_place:
                slot.title = best_place["name"]
                slot.place_type = best_place["type"]
                slot.location_info = {"name": best_place["name"], "lat": best_place["lat"], "lng": best_place["lng"]}
                best_place["in_timetable"] = True
                print(f"[확정] {date_str} {slot.start}-{slot.end} → {best_place['name']} ({best_place['type']})")

    print(f"[DQN 완료] 총 소요 시간: {_tmod.time() - t0:.2f}초")
    return tables

def clear_deleted_slots(tables, deletions):
    for d in deletions:
        date = d["date"]
        start = d["start"]
        end = d["end"]
        if date not in tables:
            continue
        for slot in tables[date]["schedule"]:
            s = slot.start.strftime("%H:%M") if not isinstance(slot.start, str) else slot.start
            e = slot.end.strftime("%H:%M") if not isinstance(slot.end, str) else slot.end
            if s == start and e == end:
                if slot.place_type not in ["start", "end", "accommodation"]:
                    slot.title = None
                    slot.place_type = None
                    slot.location_info = None