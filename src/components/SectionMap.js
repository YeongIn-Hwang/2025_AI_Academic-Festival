import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/section-map.css";

function SectionMap() {
    const navigate = useNavigate();
    const goToMap = () => {
        navigate("/map");
    };

    return (
        <>
        <section className="map-section-wrapper">
            <div className="map-section-container">
                <p className="map-section-label">여행 정보 기록</p>

                <h2 className="map-section-title">
                    <span className="underline">다녀온 지역을 누르면,</span><br />
                    <span className="underline">여행 중 남긴 일기와 사진이 그대로</span>
                </h2>

                <p className="map-section-subheading">
                    지도를 클릭하는 순간,<br />
                    그날의 기억이 펼쳐집니다
                </p>
                <p className="map-section-description">
                    지도를 클릭해 여행했던 지역의 추억을 되살리고,<br />
                    나만의 여행 일지를 기록해보세요.
                </p>
                <button className="dairy-section-button" onClick={goToMap}>일기 작성하기</button>
            </div>

            <div className="ai-icon-box-2">
                <img src="/images/section-image2.png" alt="아이콘" className="ai-icon-2" />
                <img src="/images/map-description.png" alt="지도 설명" className="map-description-overlay" />
            </div>
        </section>
            <div className="map-section-container">
    <img src="/images/map-ex-margin-end.png" alt="지도 예시" className="map-example-img" />
            </div>
        </>
    );

}

export default SectionMap;
