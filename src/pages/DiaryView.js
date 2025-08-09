import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import "../styles/diaryview.css";

export default function DiaryView() {
    const { region } = useParams();
    const [places, setPlaces] = useState([]);

    // ✅ 도시명 비교를 위한 normalize 함수
    const normalize = (name) => (name || "").trim().replace(/(시|군|구)$/, "");

    useEffect(() => {
        const fetchDiary = async () => {
            const user = auth.currentUser;
            if (!user) return;
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                const trips = snap.data().trips || [];

                // ✅ normalize 적용 → 강릉 vs 강릉시 일치시킴
                const trip = trips.find((t) => normalize(t.city) === normalize(region));

                if (trip) setPlaces(trip.places || []);
            }
        };
        fetchDiary();
    }, [region]);

    return (
        <div className="diaryview-container">
            <h2>📍 {region} 여행 기록</h2>

            {places.length === 0 ? (
                <p className="empty-message">📌 저장된 일기가 없습니다.</p>
            ) : (
                <div className="diary-cards">
                    {places.map((p, idx) => (
                        <div key={idx} className="diary-card">
                            <img src={p.photoURL} alt={p.name} />
                            <h4>📍 {p.name}</h4>
                            <p>{p.review}</p>
                            {p.mapsUrl && (
                                <a href={p.mapsUrl} target="_blank" rel="noopener noreferrer">
                                    📍 Google Maps에서 보기
                                </a>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
