import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/section-magazine.css";

function SectionMagazine() {
    const navigate = useNavigate();

    const goToNews = () => {
        navigate("/news");
    };

    return (
        <section className="section-magazine-container">
            <div className="section-magazine-content">
                <span className="section-magazine-label">여행 뉴스 한눈에</span>
                <h2 className="section-magazine-title">
                    여행 소식을 모아서,<br />
                    국내외 트렌드를 빠르게 만나보세요
                </h2>
                <h3 className="section-magazine-sub">
                    다양한 여행 소식을 한곳에,<br />
                    놓치기 쉬운 정보도 간편하게 확인해요
                </h3>
                <p className="section-magazine-description">
                    해외 트렌드부터 지역 축제 소식까지,<br />
                    여행에 영감을 주는 뉴스를 Boyage에서 한눈에 확인해보세요.
                </p>
                <button
                    className="magazine-section-button"
                    onClick={goToNews}>
                    여행 뉴스 보러가기
                </button>
            </div>
            <div className="section-magazine-image-wrapper">
                <img
                    src="/images/news-image.png"
                    alt="여행 뉴스 이미지"
                    className="section-magazine-image"
                />
            </div>
        </section>
    );
}

export default SectionMagazine;
