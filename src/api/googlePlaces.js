export async function fetchNearbyPlace(lat, lng) {
    try {
        const res = await fetch(`/api/nearby?lat=${lat}&lng=${lng}`); // ✅ 프록시 서버로 요청
        const data = await res.json();

        if (data.results?.length > 0) {
            const place = data.results[0];
            return { name: place.name, place_id: place.place_id };
        }
        return null;
    } catch (err) {
        console.error("❌ 프록시 API 오류:", err);
        return null;
    }
}
