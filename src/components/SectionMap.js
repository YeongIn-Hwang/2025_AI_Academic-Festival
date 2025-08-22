import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/section-map.css";

function SectionMap() {
    const navigate = useNavigate();
    const goToMap = () => navigate("/map");

    // 상단 섹션(텍스트+오른쪽 이미지)만 관찰
    const sectionRef = useRef(null);
    const [inViewTop, setInViewTop] = useState(false);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;

        const io = new IntersectionObserver(
            ([entry]) => setInViewTop(entry.isIntersecting),
            { threshold: 0.3, rootMargin: "0px 0px -5% 0px" }
        );

        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <>
            <section
                ref={sectionRef}
                className={`map-section-wrapper ${inViewTop ? "in-view" : ""}`}
            >
                <div className="map-section-container">
                    <p className="map-section-label reveal-map label">여행 정보 기록</p>

                    <h2 className="map-section-title reveal-map title">
                        <span className="underline">다녀온 지역을 누르면,</span><br />
                        <span className="underline">여행 중 남긴 일기와 사진이 그대로</span>
                    </h2>

                    <p className="map-section-subheading reveal-map sub">
                        지도를 클릭하는 순간,<br />
                        그날의 기억이 펼쳐집니다
                    </p>

                    <p className="map-section-description reveal-map desc">
                        지도를 클릭해 여행했던 지역의 추억을 되살리고,<br />
                        나만의 여행 일지를 기록해보세요.
                    </p>

                    <button className="dairy-section-button reveal-map" onClick={goToMap}>
                        일기 작성하기
                    </button>
                </div>

                <div className="ai-icon-box-2">
                    <img
                        src="/images/section-image2.png"
                        alt="아이콘"
                        className="ai-icon-2 reveal-map image"
                    />
                    <img
                        src="/images/map-description.png"
                        alt="지도 설명"
                        className="map-description-overlay reveal-map overlay"
                    />
                </div>
            </section>

            {/* ✅ 하단 예시 이미지는 원래 구조/클래스 그대로, 애니메이션 클래스 없음 */}
            <div className="map-section-container">
                <img
                    src="/images/map-ex-margin-end.png"
                    alt="지도 예시"
                    className="map-example-img"
                />
            </div>
        </>
    );
}

export default SectionMap;
