// src/api/googlePlaces.js
export async function fetchNearbyPlace(lat, lng) {
    const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=500&type=point_of_interest&key=${apiKey}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.results.length > 0) {
            const place = data.results[0];
            return { name: place.name, place_id: place.place_id };
        }
        return null;
    } catch (err) {
        console.error("❌ Google Places API 호출 오류:", err);
        return null;
    }
}
