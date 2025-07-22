import React from "react";
import "../styles/section-ai.css";

function SectionAI() {
    return (
        <section className="ai-section-wrapper">
            <div className="ai-section-container">
                <p className="ai-section-label">추천 경로 생성·관리</p>
                <h2 className="ai-section-heading">
                    맞춤형 여행의 새로운 기준,<br />
                    Boyage에서 만나보세요
                </h2>
                <p className="ai-section-subheading">여행 경로를 고민없이 손쉽게!</p>
                <p className="ai-section-description">
                    나의 취향, 상황을 모두 고려한 여행 경로가 Boyage를 통해 만들어집니다.
                    나만의 맞춤 여행 경로를 Boyage를 통해 경험해보세요.
                </p>
                <button className="ai-section-button">AI 추천 경로 생성하기</button>
            </div>
        </section>
    );
}

export default SectionAI;
