from core.firebase import db
import json

def save_travel_log(user_id, route_places, user_rating, title="나의 여행"):
    # Firestore 경로: user_trips/{user_id}/trips/{title}
    trips_ref = db.collection("user_trips").document(user_id).collection("trips")

    # 제목 중복 처리
    existing_titles = [doc.id for doc in trips_ref.stream()]
    base_title = title
    suffix = 1
    while title in existing_titles:
        suffix += 1
        title = f"{base_title} ({suffix})"

    # 일정 구성
    table_data = {}
    for date_str, info in route_places.items():
        table_data[date_str] = {
            "start_location": info["start_location"],
            "end_location": info["end_location"],
            "schedule": [
                {
                    "title": travel_place.title,
                    "start": travel_place.start.strftime("%H:%M"),
                    "end": travel_place.end.strftime("%H:%M"),
                    "type": travel_place.place_type,
                    "location_info": {
                        "lat": travel_place.location_info["lat"],
                        "lng": travel_place.location_info["lng"]
                    },
                    "rating": None
                }
                for travel_place in info["schedule"]
            ]
        }

    # Firestore에 저장
    trips_ref.document(title).set({
        "title": title,
        "table": table_data,
        "rating": user_rating
    })
