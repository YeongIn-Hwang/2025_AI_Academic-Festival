import math
import requests
import time as tm

def compute_review_weight_log(reviews, max_reviews=1000):
    if reviews is None or reviews <= 0:
        return 0.0
    log_base = 10
    normalized = math.log(min(reviews, max_reviews), log_base) / math.log(max_reviews, log_base)
    return round(normalized, 4)

def compute_trust_score(rating, reviews, latest_review_time_str=""):
    if rating is None or reviews is None:
        return 0.0
    review_weight = compute_review_weight_log(reviews)
    bonus_ratio = 0.0
    try:
        if "day" in latest_review_time_str or "week" in latest_review_time_str:
            bonus_ratio = 0.10
        elif "month" in latest_review_time_str:
            months = int(latest_review_time_str.split()[0])
            if months <= 1:
                bonus_ratio = 0.10
            elif months <= 6:
                bonus_ratio = 0.05
    except:
        bonus_ratio = 0.0
    trust_score = rating * review_weight * (1 + bonus_ratio)
    return round(min(trust_score, 5.0), 4)

def get_reviews_and_business_info(place_id, api_key):
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "fields": "review,business_status,opening_hours",
        "language": "ko",
        "key": api_key
    }
    res = requests.get(url, params=params).json()
    result = res.get("result", {})
    reviews = result.get("reviews", [])
    texts = [r["text"] for r in reviews[:5]]
    latest_time = reviews[0]["relative_time_description"] if reviews else ""
    business_status = result.get("business_status", "UNKNOWN")
    opening_hours = result.get("opening_hours", {})
    open_now = opening_hours.get("open_now", None)
    weekday_text = opening_hours.get("weekday_text", [])
    return texts, latest_time, business_status, open_now, weekday_text

def search_places_basic(lat, lng, radius, place_type, api_key):
    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "type": place_type,
        "language": "ko",
        "key": api_key
    }

    candidates = []
    for _ in range(2):
        res = requests.get(url, params=params).json()
        results = res.get("results", [])
        for place in results:
            rating = place.get("rating", 0)
            user_ratings_total = place.get("user_ratings_total", 0)
            if user_ratings_total < 1 or rating < 3.5:
                continue
            location = place.get("geometry", {}).get("location", {})
            candidates.append({
                "place_id": place.get("place_id"),
                "name": place.get("name"),
                "vicinity": place.get("vicinity", "주소 없음"),
                "rating": rating,
                "user_ratings_total": user_ratings_total,
                "trust_score": compute_trust_score(rating, user_ratings_total),
                "type": place_type,
                "lat": location.get("lat"),
                "lng": location.get("lng"),
                "weekday_text": place.get("weekday_text", []),  
            })
        token = res.get("next_page_token")
        if not token:
            break
        tm.sleep(2)
        params = {"pagetoken": token, "key": api_key, "language": "ko"}

    candidates.sort(key=lambda x: x["trust_score"], reverse=True)
    return candidates[:30]

def fetch_trusted_places(query: str, method: int, api_key: str, place_types: list) -> list:
    radius = {1: "3000", 2: "15000", 3: "30000"}.get(method)
    
    # 지오코딩
    geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
    geo_params = {
        "address": query,
        "key": api_key,
        "language": "ko"
    }
    geo_res = requests.get(geo_url, params=geo_params).json()

    if not geo_res["results"]:
        print("위치를 찾을 수 없습니다.")
        return []

    location = geo_res["results"][0]["geometry"]["location"]
    lat, lng = location["lat"], location["lng"]

    all_places = []

    for place_type in place_types:
        top_places = search_places_basic(lat, lng, radius, place_type, api_key)
        for place in top_places:
            reviews, latest_time, biz_status, open_now, weekday_hours = get_reviews_and_business_info(place["place_id"], api_key)
            place["reviews"] = reviews
            place["trust_score"] = compute_trust_score(place["rating"], place["user_ratings_total"], latest_time)
            place["business_status"] = biz_status
            place["open_now"] = open_now
            place["weekday_text"] = weekday_hours
            all_places.append(place)
    return all_places
