import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "../styles/heart.css";

const normalize = (name) => (name || "").trim().replace(/(시|군|구)$/, "");

export default function Heart() {
    const [favorites, setFavorites] = useState([]); // {city, place}[]
    const navigate = useNavigate();

    useEffect(() => {
        const load = async () => {
            const user = auth.currentUser;
            if (!user) return;

            const ref = doc(db, "users", user.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) return;

            const trips = snap.data().trips || [];
            const favs = [];
            trips.forEach((t) => {
                (t.places || []).forEach((p) => {
                    if (p.liked) favs.push({ city: t.city, place: p });
                });
            });

            // 최신 하트가 위로
            favs.sort((a, b) => (b.place.likedAt || 0) - (a.place.likedAt || 0));
            setFavorites(favs);
        };

        load();
    }, []);

    // 하트 해제(토글 off)
    const unheart = async (city, place) => {
        const user = auth.currentUser;
        if (!user) return;

        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const trips = snap.data().trips || [];
        const tIdx = trips.findIndex((t) => normalize(t.city) === normalize(city));
        if (tIdx === -1) return;

        const pIdx = trips[tIdx].places.findIndex((p) => {
            if (p.place_id && place.place_id) return p.place_id === place.place_id;
            return p.name === place.name && p.photoURL === place.photoURL;
        });
        if (pIdx === -1) return;

        trips[tIdx].places[pIdx].liked = false;
        trips[tIdx].places[pIdx].likedAt = null;

        await setDoc(ref, { trips }, { merge: true });

        // 로컬 목록 즉시 반영
        setFavorites((prev) =>
            prev.filter(
                (f) =>
                    !(
                        normalize(f.city) === normalize(city) &&
                        ((f.place.place_id && place.place_id && f.place.place_id === place.place_id) ||
                            (f.place.name === place.name && f.place.photoURL === place.photoURL))
                    )
            )
        );
    };

    return (
        <div className="heart-page">
            {/* 상단 고정 로고 (DiaryView와 동일) */}
            <div className="dv-topbar">
                <h1 className="dv-logo" onClick={() => navigate("/")}>Boyage</h1>
            </div>

            {/* 본문 */}
            <div className="heart-body">
                {favorites.length === 0 ? (
                    <p className="heart-empty">아직 하트한 장소가 없습니다.</p>
                ) : (
                    <div className="heart-grid">
                        {favorites.map(({ city, place }, i) => (
                            <article key={i} className="heart-card">
                                {/* 지역명 */}
                                <span className="city-badge">{city}</span>

                                {/* 이미지 */}
                                <img src={place.photoURL} alt={place.name} className="card-photo" />

                                {/* 제목 + 하트(라인 하트) */}
                                <div className="place-header">
                                    <h4 className="card-title">📍 {place.name}</h4>

                                    <button
                                        className="heart-icon is-active"
                                        onClick={() => unheart(city, place)}
                                        aria-label="하트 취소"
                                        title="하트 취소"
                                    >
                                        <svg viewBox="0 0 24 24" className="icon-line-heart" aria-hidden="true">
                                            <path d="M12.1 20.3c-.1 0-.1 0-.2-.1C8 17.5 5.4 15.3 4 13.2 2.5 11.1 2.7 8.4 4.4 6.9c1.7-1.5 4.3-1.2 5.8.6l.8 1 .8-1c1.5-1.8 4.1-2.1 5.8-.6 1.8 1.5 1.9 4.2.4 6.3-1.4 2.1-4 4.3-7.9 7.0-.1.1-.2.1-.3.1Z"/>
                                        </svg>
                                    </button>
                                </div>

                                {/* 메모 */}
                                <p className="card-note">{place.review}</p>

                                {/* 푸터: 평점/지도보기 */}
                                <div className="card-footer">
                                    {typeof place.rating === "number" && (
                                        <span className="card-rating">⭐ {place.rating}</span>
                                    )}
                                    {place.mapsUrl && (
                                        <a
                                            href={place.mapsUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="map-link"
                                        >
                                            지도 보기
                                        </a>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
