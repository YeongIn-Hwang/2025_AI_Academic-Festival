// src/pages/Diary.js
import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { db, auth, storage } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "../styles/diary.css";

/* ========= 별점 컴포넌트 ========= */
function StarRating({ value = 0, onChange, size = 28, readOnly = false }) {
    const [hover, setHover] = useState(null);
    const containerRef = useRef(null);
    const display = hover ?? value;

    const labelFor = (r) => {
        if (r <= 1) return "별로에요";
        if (r <= 2) return "그냥 그래요";
        if (r <= 3) return "보통이에요";
        if (r <= 4) return "맘에 들어요";
        if (r <= 5) return "또 오고 싶어요!";
        return "";
    };

    // 컨테이너 내 마우스 X → 0.5 단위 별점 (각 별 기준)
    const calcHalfStar = (clientX) => {
        const el = containerRef.current;
        if (!el) return value;
        const rect = el.getBoundingClientRect();
        const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
        const slice = rect.width / 5;                  // 별 1개 너비
        const idx = Math.min(4, Math.floor(x / slice)); // 0..4
        const within = (x - idx * slice) / slice;      // 0..1
        const half = within < 0.5 ? 0.5 : 1.0;         // 반/풀
        const rating = idx + half;                     // 0.5..5
        return Math.round(rating * 2) / 2;
    };

    const handleMove = (e) => { if (!readOnly) setHover(calcHalfStar(e.clientX)); };
    const handleLeave = () => { if (!readOnly) setHover(null); };
    const handleClick = (e) => { if (!readOnly && onChange) onChange(calcHalfStar(e.clientX)); };

    // 각 별의 채움비율(0, 0.5, 1) — i는 0..4
    const fillOf = (i) => {
        const diff = display - (i + 1);
        if (diff >= 0) return 1;
        if (diff >= -0.5) return 0.5;
        return 0;
    };

    return (
        <div className="rating-block">
            <div
                className="stars-row"
                ref={containerRef}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
                onClick={handleClick}
                role={readOnly ? "img" : "slider"}
                aria-valuemin={0}
                aria-valuemax={5}
                aria-valuenow={value}
                aria-label="별점"
                style={{ ["--star-size"]: `${size}px` }}
            >
                {[0,1,2,3,4].map((i) => {
                    const f = fillOf(i);
                    return (
                        <span
                            key={i}
                            className={`star ${f > 0 ? "filled" : ""}`}
                            style={{ ["--fill"]: f }}
                            aria-hidden="true"
                        >
              ★
            </span>
                    );
                })}
            </div>
            {!readOnly && <div className="rating-caption">{labelFor(display)}</div>}
        </div>
    );
}
/* =================================== */

export default function Diary() {
    const navigate = useNavigate();
    const { region } = useParams();
    const query = new URLSearchParams(useLocation().search);
    const startDate = query.get("start");
    const endDate = query.get("end");

    const [user, setUser] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [review, setReview] = useState("");
    const [places, setPlaces] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [loading, setLoading] = useState(false);
    const [rating, setRating] = useState(0); // ⭐ 추가

    const inputRef = useRef(null);
    const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;

    // 로그인 상태
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (currentUser) => {
             if (!currentUser) {
                   navigate("/login", { replace: true });
                 } else {
                   setUser(currentUser);
                 }
        });
        return () => unsub();
    }, []);

    // 기존 장소 불러오기
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

    // 자동완성
    const fetchPlaces = async (q) => {
        if (!q.trim() || !GOOGLE_API_KEY) return [];
        try {
            const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_API_KEY,
                    "X-Goog-FieldMask":
                        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
                },
                body: JSON.stringify({ input: q, languageCode: "ko" }),
            });
            if (!res.ok) return [];
            const data = await res.json();
            return data.suggestions || [];
        } catch {
            return [];
        }
    };

    const fetchPlaceDetails = async (placeId, fallbackName) => {
        if (!GOOGLE_API_KEY) return null;
        try {
            const res = await fetch(
                `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,googleMapsUri`,
                { headers: { "X-Goog-Api-Key": GOOGLE_API_KEY } }
            );
            if (!res.ok) return null;
            const details = await res.json();
            return {
                name: details.displayName?.text || fallbackName,
                place_id: placeId,
                mapsUrl: details.googleMapsUri,
            };
        } catch {
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

    // 장소 저장
    const handleAddPlace = async () => {
        if (!photo || !selectedPlace) return alert("사진과 장소를 모두 선택하세요.");
        if (!user) return;

        setLoading(true);
        try {
            const storageRef = ref(storage, `places/${user.uid}/${Date.now()}_${photo.name}`);
            await uploadBytes(storageRef, photo);
            const photoURL = await getDownloadURL(storageRef);

            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            let trips = snap.exists() ? snap.data().trips || [] : [];

            // ⭐ rating + liked 기본값 저장
            const newPlace = {
                ...selectedPlace,
                photoURL,
                review,
                rating,
                liked: false,
                likedAt: null,
            };

            const idx = trips.findIndex(
                (t) => t.city === region && t.startDate === startDate && t.endDate === endDate
            );

            if (idx !== -1) trips[idx].places.push(newPlace);
            else trips.push({ city: region, startDate, endDate, places: [newPlace] });

            await setDoc(userRef, { trips }, { merge: true });

            setPlaces((prev) => [...prev, newPlace]);
            // 입력값 초기화
            setPhoto(null);
            setPhotoPreview(null);
            setSelectedPlace(null);
            setReview("");
            setRating(0);
            setSearchTerm("");
            if (inputRef.current) inputRef.current.value = "";
        } catch (err) {
            console.error("🔥 장소 저장 오류:", err);
        } finally {
            setLoading(false);
        }
    };

    // ✅ 하트 토글
    const toggleLike = async (place) => {
        if (!user) return;
        try {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            if (!snap.exists()) return;

            const data = snap.data();
            const trips = data.trips || [];
            const tIdx = trips.findIndex(
                (t) => t.city === region && t.startDate === startDate && t.endDate === endDate
            );
            if (tIdx === -1) return;

            const pIdx = trips[tIdx].places.findIndex((p) => {
                if (p.place_id && place.place_id) return p.place_id === place.place_id;
                return p.name === place.name && p.photoURL === place.photoURL;
            });
            if (pIdx === -1) return;

            const cur = trips[tIdx].places[pIdx].liked === true;
            trips[tIdx].places[pIdx].liked = !cur;
            trips[tIdx].places[pIdx].likedAt = !cur ? Date.now() : null;

            await setDoc(userRef, { trips }, { merge: true });

            // 로컬 상태 반영
            setPlaces((prev) =>
                prev.map((p) =>
                    (p.place_id && place.place_id ? p.place_id === place.place_id : p.name === place.name && p.photoURL === place.photoURL)
                        ? { ...p, liked: !cur, likedAt: !cur ? Date.now() : null }
                        : p
                )
            );
        } catch (e) {
            console.error("🔥 하트 토글 실패:", e);
        }
    };

    // 작성 완료
    const handleCompleteDiary = async () => {
        if (!user) return;
        try {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            let visitedCities = snap.exists() ? snap.data().visitedCities || [] : [];

            if (!visitedCities.includes(region)) {
                visitedCities.push(region);
                await setDoc(userRef, { visitedCities }, { merge: true });
            }

            alert("✅ 일기가 저장되었습니다! 지도에서 방문 도시를 확인하세요.");
                  navigate("/map"); // ✅ 새로고침 없이 이동
        } catch (err) {
            console.error("🔥 일기 완료 처리 오류:", err);
        }
    };

    return (
        <div className="diary-page">
            <header className="diary-header">
                <h2>{region}</h2>
                <p> {startDate} ~ {endDate}</p>
            </header>

            <main className="diary-content">
                {/* 이미지 업로드 */}
                <div className="row">
                    <label className="btn btn-primary upload-btn" role="button">
                        <span className="btn-text">이미지 선택</span>
                        <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setPhoto(file);
                                setPhotoPreview(URL.createObjectURL(file));
                            }}
                        />
                    </label>

                    {photoPreview && <img className="preview" src={photoPreview} alt="미리보기" />}
                </div>

                {/* 여행지 입력 + 자동완성 */}
                <div className="field">
                    <input
                        className="jr-input"
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
                </div>



                {selectedPlace && (
                    <p className="selected">✅ 선택된 장소: <strong> {selectedPlace.name}</strong></p>
                )}

                {/* 여행 메모 */}
                <div className="field">            {/* ← 동일한 field 래퍼로 감싸기 */}
                    <textarea
                        className="jr-input"
                        placeholder="여행을 간단히 기록해보세요!"
                        value={review}
                        onChange={(e) => setReview(e.target.value)}
                    />
                </div>


                {/* ⭐ 메모 바로 아래 별점 */}
                <div className="field rating-field">
                    <label>별점</label>
                    <StarRating value={rating} onChange={setRating} size={28} />
                </div>

                {/* 액션 */}
                <div className="actions">
                    <button className="btn btn-ghost" onClick={handleAddPlace} disabled={loading}>
                        <span className="btn-icon">＋</span>
                        <span className="btn-text">{loading ? "저장 중..." : "장소 추가"}</span>
                    </button>
                </div>

                {/* 저장된 장소 리스트 */}
                <div className="places-list">
                    {places.map((p, idx) => (
                        <article key={idx} className="place-card">
                            {/* 사진 상단 */}
                            <img src={p.photoURL} alt={p.name} className="place-photo" />

                            {/* 제목 + 하트 버튼 */}
                            <div className="place-header">
                                <h4 className="place-name">📷 {p.name}</h4>
                                <button
                                    className={`heart-icon ${p.liked ? "is-active" : ""}`}
                                    onClick={() => toggleLike(p)}
                                    aria-label={p.liked ? "하트 취소" : "하트 추가"}
                                    title={p.liked ? "하트 취소" : "하트 추가"}
                                >
                                    <svg viewBox="0 0 24 24" className="icon-line-heart" aria-hidden="true">
                                        <path d="M12.1 20.3c-.1 0-.1 0-.2-.1C8 17.5 5.4 15.3 4 13.2 2.5 11.1 2.7 8.4 4.4 6.9c1.7-1.5 4.3-1.2 5.8.6l.8 1 .8-1c1.5-1.8 4.1-2.1 5.8-.6 1.8 1.5 1.9 4.2.4 6.3-1.4 2.1-4 4.3-7.9 7.0-.1.1-.2.1-.3.1Z"/>
                                    </svg>
                                </button>
                            </div>

                            {/* 메모 */}
                            <p className="place-review">{p.review}</p>

                            {/* [별점 | 지도보기] */}
                            <div className="place-footer">
                                {typeof p.rating === "number" && (
                                    <StarRating value={p.rating} readOnly size={18} />
                                )}
                                {p.mapsUrl && (
                                    <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="map-link">
                                        지도 보기
                                    </a>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </main>

            {/* 하단 스티키 CTA */}
            <button className="complete-btn" onClick={handleCompleteDiary}>
                일기 작성 완료
            </button>
        </div>
    );
}
