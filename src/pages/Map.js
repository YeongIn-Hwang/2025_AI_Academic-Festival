import React, { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useLocation } from "react-router-dom";
import { ReactComponent as KoreaMap } from "../assets/blue_map.svg";
import "../styles/map.css";

export default function Map() {
    const [visitedCities, setVisitedCities] = useState([]);
    const [searchRegion, setSearchRegion] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const searchParams = new URLSearchParams(location.search);
    const newlyVisited = searchParams.get("region");

    // ✅ 한글 디코딩 (\uXXXX → UTF-8)
    const decodeId = (raw) => {
        if (!raw) return "";
        try {
            return JSON.parse(`"${raw}"`);
        } catch {
            return raw;
        }
    };

    // ✅ 지역명 정규화 (시/군/구 제거)
    const normalize = (name) => (name || "").trim().replace(/(시|군|구)$/, "");

    // ✅ 구 단위 클릭 시 시 단위로 변환
    const getCityForDiary = (name) => {
        // 예: "포항시 북구" → "포항시"
        // 예: "수원시 장안구" → "수원시"
        return name.replace(/\s.*구$/, "").trim();
    };

    // ✅ Firestore에서 방문 도시 가져오기
    useEffect(() => {
        const fetchVisitedCities = async () => {
            const user = auth.currentUser;
            if (!user) {
                navigate("/login");
                return;
            }

            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            let updatedVisitedCities = [];
            if (docSnap.exists()) {
                updatedVisitedCities = docSnap.data().visitedCities || [];
            }

            if (newlyVisited && !updatedVisitedCities.includes(newlyVisited)) {
                updatedVisitedCities.push(newlyVisited);
            }

            console.log("🔥 Firestore에서 가져온 visitedCities:", updatedVisitedCities);
            setVisitedCities(updatedVisitedCities);
        };

        fetchVisitedCities();
    }, [location.search, navigate, newlyVisited]);

    // ✅ SVG 색칠 및 클릭 기능 (구 단위 통합 적용)
    useEffect(() => {
        if (visitedCities.length === 0 && !newlyVisited) return;

        const timer = setTimeout(() => {
            const allPaths = document.querySelectorAll("svg path");
            console.log("➡️ SVG path 개수:", allPaths.length);

            // 디코딩된 ID 확인
            const decodedIdList = Array.from(allPaths).map((el) =>
                decodeId(el.id || el.getAttribute("id") || "")
            );
            console.log("🟢 디코딩된 SVG ID 목록:", decodedIdList);

            // 1️⃣ 기본 스타일 초기화 및 이벤트 제거
            allPaths.forEach((el) => {
                el.style.fill = "#ffffff";
                el.style.stroke = "#3884FF";
                el.style.strokeWidth = "0.5";
                el.style.cursor = "pointer";
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
            });

            // 2️⃣ 이벤트 재등록
            const paths = document.querySelectorAll("svg path");
            paths.forEach((el) => {
                const rawId = el.id || el.getAttribute("id") || "";
                const decodedId = decodeId(rawId);
                const cleanedId = normalize(decodedId);

                // ✅ 방문 도시 색칠
                visitedCities.forEach((city) => {
                    const cleanedCity = normalize(city);
                    if (
                        cleanedId === cleanedCity ||
                        decodedId === city ||
                        decodedId.includes(cleanedCity) ||
                        cleanedCity.includes(cleanedId)
                    ) {
                        el.style.fill = "#007bff";
                    }
                });

                // ✅ 클릭 시 Diary 페이지 이동 (구 단위 → 시 단위 변환)
                el.addEventListener("click", () => {
                    const cityForDiary = getCityForDiary(decodedId);
                    console.log(`🟢 [CLICK] ${decodedId} → Diary 이동: ${cityForDiary}`);
                    navigate(`/diary/${encodeURIComponent(cityForDiary)}`);
                });
            });
        }, 500);

        return () => clearTimeout(timer);
    }, [visitedCities, newlyVisited, navigate]);

    // ✅ 검색 기능
    const handleSearch = () => {
        const trimmed = searchRegion.trim();
        if (!trimmed) return;
        navigate(`/diary/${encodeURIComponent(trimmed)}`);
    };

    return (
        <div className="map-page-container">
            <h2>나의 지도</h2>

            <div className="region-search-box">
                <input
                    type="text"
                    placeholder="지역명을 입력하세요 (예: 포항)"
                    value={searchRegion}
                    onChange={(e) => setSearchRegion(e.target.value)}
                />
                <button onClick={handleSearch}>추억 작성</button>
            </div>

            <div className="map-image-wrapper">
                <KoreaMap className="svg-map" />
            </div>

            <p>방문한 지역: {visitedCities.length}곳</p>
            <p style={{ fontSize: "14px" }}>지도를 클릭하면 시 단위로 여행 일기로 이동합니다!</p>
        </div>
    );
}

