import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";  // ✅ 포탈 추가
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { ReactComponent as KoreaMap } from "../assets/blue_map.svg";
import "../styles/map.css";

export default function Map() {
    const [visitedCities, setVisitedCities] = useState([]);
    const [searchRegion, setSearchRegion] = useState("");
    const [selectedCity, setSelectedCity] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [isPopupClosing, setIsPopupClosing] = useState(false);
    const popupRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    const searchParams = new URLSearchParams(location.search);
    const newlyVisited = searchParams.get("region");

    const goHome = (e) => {
        e?.preventDefault();
        navigate("/home");
    };

    const decodeId = (raw) => {
        if (!raw) return "";
        try { return JSON.parse(`"${raw}"`); } catch { return raw; }
    };

    const normalize = (name) => (name || "").trim().replace(/(시|군|구)$/, "");

    // ✅ Firestore에서 방문 도시 불러오기
    useEffect(() => {
        const fetchVisitedCities = async () => {
            const user = auth.currentUser;
            if (!user) { navigate("/login"); return; }
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            let updated = docSnap.exists() ? docSnap.data().visitedCities || [] : [];
            if (newlyVisited && !updated.includes(newlyVisited)) updated.push(newlyVisited);
            setVisitedCities(updated);
        };
        fetchVisitedCities();
    }, [location.search, navigate, newlyVisited]);

    // ✅ SVG path 클릭 이벤트
    useEffect(() => {


        const timer = setTimeout(() => {
            document.querySelectorAll("svg path").forEach((el) => {
                el.style.cursor = "pointer";
                const rawId = el.id || el.getAttribute("id") || "";
                const decodedId = decodeId(rawId);
                const cleanedId = normalize(decodedId);

                visitedCities.forEach((city) => {
                    if (normalize(city) === cleanedId || decodedId.includes(normalize(city))) {
                        el.style.fill = "#2E86FF";
                    }
                });

                el.addEventListener("click", () => {
                    if (visitedCities.some((v) => decodedId.includes(normalize(v)))) {
                        const rect = el.getBoundingClientRect();
                        setPopupPosition({ x: rect.right + 10, y: rect.top });
                        setIsPopupClosing(false);
                        setSelectedCity(decodedId);
                    } else {
                        navigate(`/calendar/${encodeURIComponent(decodedId)}`);
                    }
                });
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [visitedCities, newlyVisited, navigate]);

    // ✅ 외부 클릭 시 팝업 닫기
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (popupRef.current && !popupRef.current.contains(e.target)) {
                setIsPopupClosing(true);
                setTimeout(() => setSelectedCity(null), 250);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    const handleSearch = () => {
        if (!searchRegion.trim()) return;
        navigate(`/calendar/${encodeURIComponent(searchRegion.trim())}`);
    };

    return (
        <div className="map-container">
            <header className="map-topbar">
                <h2
                    className="map-logo"
                    role="link"
                    tabIndex={0}
                    onClick={goHome}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goHome(e)}
                    title="홈으로 이동"
                >
                    Boyage
                </h2>
            </header>
            <div className="map-left">
                <h1>나만의 여행 발자취</h1>
                <h3>"떠난 만큼, 기억은 선명해진다."</h3>
                <p className={"map-left-p"}>방문한 도시를 기록하고 새로운 추억을 남겨보세요.</p>

                <div className={"visited-box"}>
                    <p>방문한 지역: {visitedCities.length}곳</p>
                </div>

                <div className="region-search-box">
                    <input type="text" placeholder="지역명을 입력하세요 (예: 포항)"
                           value={searchRegion} onChange={(e) => setSearchRegion(e.target.value)} />
                    <button onClick={handleSearch}>추억 작성</button>
                </div>

            </div>

            <div className="map-right">
                <KoreaMap className="svg-map" />
            </div>

            {selectedCity &&
                createPortal(
                    <div ref={popupRef}
                         className={`region-popup ${isPopupClosing ? "popup-closing" : "popup-animated"}`}
                         style={{ top: popupPosition.y, left: popupPosition.x }}>
                        <h3>{selectedCity}</h3>
                        <button className="view-diary-btn" onClick={() => navigate(`/diaryview/${selectedCity}`)}>
                            일기 확인하기
                        </button>
                    </div>,
                    document.body
                )
            }
        </div>
    );
}

