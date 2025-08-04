import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { db, auth, storage } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "../styles/diary.css";

export default function Diary() {
    const { region } = useParams();
    const query = new URLSearchParams(useLocation().search);
    const startDate = query.get("start");
    const endDate = query.get("end");

    const [user, setUser] = useState(null);   // ✅ 로그인된 사용자 상태
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [review, setReview] = useState("");
    const [places, setPlaces] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [loading, setLoading] = useState(false);

    const inputRef = useRef(null);

    // ✅ 로그인 상태 감지 (Firebase 권장 방식)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                alert("로그인이 필요합니다.");
                window.location.href = "/login";
            } else {
                setUser(currentUser);
            }
        });
        return () => unsubscribe();
    }, []);

    // ✅ 기존 장소 불러오기
    useEffect(() => {
        const loadPlaces = async () => {
            if (!user) return;
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const trips = snap.data().trips || [];
                const trip = trips.find(
                    (t) => t.city === region && t.startDate === startDate && t.endDate === endDate
                );
                if (trip) setPlaces(trip.places || []);
            }
        };
        loadPlaces();
    }, [user, region, startDate, endDate]);

    // ✅ Google Places API 자동완성
    const fetchPlaces = async (query) => {
        if (!query.trim()) return [];
        try {
            const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": process.env.REACT_APP_GOOGLE_API_KEY,
                    "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
                },
                body: JSON.stringify({ input: query, languageCode: "ko" })
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.suggestions || [];
        } catch (err) {
            console.error("🔥 자동완성 오류:", err);
            return [];
        }
    };

    const fetchPlaceDetails = async (placeId, fallbackName) => {
        try {
            const res = await fetch(
                `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,googleMapsUri`,
                { headers: { "X-Goog-Api-Key": process.env.REACT_APP_GOOGLE_API_KEY } }
            );
            const details = await res.json();
            return {
                name: details.displayName?.text || fallbackName,
                place_id: placeId,
                mapsUrl: details.googleMapsUri
            };
        } catch (err) {
            console.error("🔥 장소 상세정보 오류:", err);
            return null;
        }
    };

    const handleSearchChange = async (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.trim().length < 2) return setSuggestions([]);
        setSuggestions(await fetchPlaces(value));
    };

    const handleSelectPlace = async (prediction) => {
        const details = await fetchPlaceDetails(prediction.placeId, prediction.text.text);
        if (details) {
            setSelectedPlace(details);
            setSuggestions([]);
            setSearchTerm(details.name);
        }
    };

    // ✅ 장소 저장
    const handleAddPlace = async () => {
        if (!photo || !selectedPlace) return alert("사진과 장소를 모두 선택하세요.");
        if (!user) return;  // 로그인 확인

        setLoading(true);
        try {
            const storageRef = ref(storage, `places/${user.uid}/${Date.now()}_${photo.name}`);
            await uploadBytes(storageRef, photo);
            const photoURL = await getDownloadURL(storageRef);

            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            let trips = snap.exists() ? snap.data().trips || [] : [];

            const newPlace = { ...selectedPlace, photoURL, review };
            const tripIndex = trips.findIndex(
                (t) => t.city === region && t.startDate === startDate && t.endDate === endDate
            );

            if (tripIndex !== -1) trips[tripIndex].places.push(newPlace);
            else trips.push({ city: region, startDate, endDate, places: [newPlace] });

            await setDoc(userRef, { trips }, { merge: true });

            setPlaces((prev) => [...prev, newPlace]);
            setPhoto(null);
            setPhotoPreview(null);
            setSelectedPlace(null);
            setReview("");
            setSearchTerm("");
            inputRef.current.value = "";
        } catch (err) {
            console.error("🔥 장소 저장 오류:", err);
        } finally {
            setLoading(false);
        }
    };

    // ✅ 일기 작성 완료 → visitedCities 업데이트 후 /map 이동
    const handleCompleteDiary = async () => {
        if (!user) return; // onAuthStateChanged에서 이미 처리됨
        try {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            let visitedCities = snap.exists() ? snap.data().visitedCities || [] : [];

            if (!visitedCities.includes(region)) {
                visitedCities.push(region);
                await setDoc(userRef, { visitedCities }, { merge: true });
            }

            alert("✅ 일기가 저장되었습니다! 지도에서 방문 도시를 확인하세요.");
            window.location.assign("/map");
        } catch (err) {
            console.error("🔥 일기 완료 처리 오류:", err);
        }
    };

    return (
        <div className="diary-container">
            <h2>📍 {region}</h2>
            <p>📅 {startDate} ~ {endDate}</p>

            {/* ✅ 이미지 선택 */}
            <label className="upload-btn">
                📷 이미지 선택
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPhoto(file);
                        setPhotoPreview(URL.createObjectURL(file));
                    }}
                    hidden
                />
            </label>
            {photoPreview && <img src={photoPreview} alt="미리보기" width="200" />}

            {/* ✅ 장소 검색 */}
            <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="다녀온 여행지를 입력해보세요"
            />

            {suggestions.length > 0 && (
                <ul className="suggestions">
                    {suggestions.map((s, i) => (
                        <li key={i} onClick={() => handleSelectPlace(s.placePrediction)}>
                            {s.placePrediction.text.text}
                        </li>
                    ))}
                </ul>
            )}

            {selectedPlace && <p>✅ 선택된 장소: <strong>📍 {selectedPlace.name}</strong></p>}

            <textarea
                placeholder="여행을 간단히 기록해보세요!"
                value={review}
                onChange={(e) => setReview(e.target.value)}
            />

            <button onClick={handleAddPlace} disabled={loading}>
                {loading ? "저장 중..." : "➕ 장소 저장"}
            </button>

            <button className="complete-btn" onClick={handleCompleteDiary}>
                일기 작성 완료
            </button>

            {/* ✅ 저장된 장소 카드 */}
            <div className="places-list">
                {places.map((p, idx) => (
                    <div key={idx} className="place-card">
                        <h4>📍 {p.name}</h4>
                        <img src={p.photoURL} alt={p.name} />
                        <p>{p.review}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
