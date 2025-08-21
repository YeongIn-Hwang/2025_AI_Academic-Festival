// src/pages/DiaryView.js
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import "../styles/diaryview.css";
import bgFerris from "../assets/ferris_wheel.jpg";
import { MdPlace } from "react-icons/md";

/* ===== 읽기 전용 별점 ===== */
function StarRating({ value = 0, size = 18 }) {
  const containerRef = useRef(null);
  const display = value;

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
        role="img"
        aria-label={`별점 ${display}점`}
        style={{ ["--star-size"]: `${size}px` }}
      >
        {[0, 1, 2, 3, 4].map((i) => {
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
    </div>
  );
}

export default function DiaryView() {
  const { region } = useParams();
  const navigate = useNavigate();

  const [tripDates, setTripDates] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [places, setPlaces] = useState([]);

  const normalize = (name) => (name || "").trim().replace(/(시|군|구)$/, "");

  // 로그인 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  // 일기 데이터 로드
  useEffect(() => {
    const fetchDiary = async () => {
      if (!ready || !user) return;

      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return;

      const trips = snap.data().trips || [];
      const sameCity = trips.filter(
        (t) => normalize(t.city) === normalize(region)
      );
      if (sameCity.length === 0) return;

      const dated = sameCity.filter((t) => t.startDate && t.endDate);
      const pool = dated.length > 0 ? dated : sameCity;
      const chosen = pool[pool.length - 1];

      setPlaces(chosen.places || []);
      setTripDates(
        chosen.startDate && chosen.endDate
          ? { start: chosen.startDate, end: chosen.endDate }
          : null
      );
    };

    fetchDiary();
  }, [ready, user, region]);

  // 하트 토글
  const toggleLike = async (place) => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const trips = data.trips || [];
    const tIdx = trips.findIndex(
      (t) => normalize(t.city) === normalize(region)
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

    setPlaces((prev) =>
      prev.map((p) =>
        p.place_id && place.place_id
          ? p.place_id === place.place_id
            ? { ...p, liked: !cur, likedAt: !cur ? Date.now() : null }
            : p
          : p.name === place.name && p.photoURL === place.photoURL
          ? { ...p, liked: !cur, likedAt: !cur ? Date.now() : null }
          : p
      )
    );
  };

  return (
    <div className="diaryview-container">
      {/* ✅ 전체 화면 배경 (고정) */}
      <div
        className="dv-bg"
        style={{ backgroundImage: `url(${bgFerris})` }}
      />

      {/* 상단 고정 로고 */}
      <div className="dv-topbar">
        <h1 className="dv-logo" onClick={() => navigate("/")}>
          Boyage
        </h1>
      </div>

      <h2>📍 {region} 여행 기록</h2>
      {tripDates && (
        <p className="dv-dates">
          📅 {tripDates.start} ~ {tripDates.end}
        </p>
      )}

      {places.length === 0 ? (
        <p className="empty-message"> 저장된 일기가 없습니다.</p>
      ) : (
        <div className="diary-cards">
          {places.map((p, idx) => (
            <article key={idx} className="place-card">
              {/* 사진 */}
              <img src={p.photoURL} alt={p.name} className="place-photo" />

              {/* 제목 + 하트 */}
              <div className="place-header">
                <h4 className="place-name">
                  <MdPlace /> {p.name}
                </h4>

                <button
                  className={`heart-icon ${p.liked ? "is-active" : ""}`}
                  onClick={() => toggleLike(p)}
                  aria-label={p.liked ? "하트 취소" : "하트 추가"}
                  title={p.liked ? "하트 취소" : "하트 추가"}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="icon-line-heart"
                    aria-hidden="true"
                  >
                    <path d="M12.1 20.3c-.1 0-.1 0-.2-.1C8 17.5 5.4 15.3 4 13.2 2.5 11.1 2.7 8.4 4.4 6.9c1.7-1.5 4.3-1.2 5.8.6l.8 1 .8-1c1.5-1.8 4.1-2.1 5.8-.6 1.8 1.5 1.9 4.2.4 6.3-1.4 2.1-4 4.3-7.9 7.0-.1.1-.2.1-.3.1Z" />
                  </svg>
                </button>
              </div>

              {/* 메모 */}
              <p className="place-review">{p.review}</p>

              {/* [별점 | 지도 보기] */}
              <div className="place-footer">
                {typeof p.rating === "number" && (
                  <StarRating value={p.rating} size={18} />
                )}
                {p.mapsUrl && (
                  <a
                    href={p.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
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
  );
}
