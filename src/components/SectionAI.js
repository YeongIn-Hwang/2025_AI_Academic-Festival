import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/section-ai.css";

function SectionAI() {
    const navigate = useNavigate();
    const goToJourney = () => navigate("/journey_list");

    // 섹션 루트 ref
    const sectionRef = useRef(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;

        // 화면에 일정 비율(30%) 이상 보이면 in-view ON
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                } else {
                    // 화면에서 벗어나면 끄기 → 다시 들어올 때 재생됨
                    setInView(false);
                }
            },
            {
                root: null,
                threshold: 0.3,        // 30% 보이면 트리거
                rootMargin: "0px 0px -5% 0px", // 살짝 일찍/늦게 트리거 조절 가능
            }
        );

        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <section
            ref={sectionRef}
            className={`ai-section-wrapper ${inView ? "in-view" : ""}`}
        >
            <div className="ai-section-container">
                <div className="ai-text">
                    <p className="ai-section-label reveal label">추천 경로 생성·관리</p>

                    <h2 className="ai-section-heading reveal heading">
                        맞춤형 여행의 새로운 기준,<br />
                        Boyage에서 만나보세요
                    </h2>

                    <p className="ai-section-subheading reveal sub">
                        여행 경로를 고민없이 손쉽게!
                    </p>

                    <p className="ai-section-description reveal desc">
                        나의 취향, 상황을 모두 고려한 여행 경로가 Boyage를 통해 만들어집니다.
                        나만의 맞춤 여행 경로를 Boyage를 통해 경험해보세요.
                    </p>

                    <button
                        className="ai-section-button reveal"
                        onClick={goToJourney}
                    >
                        AI 추천 경로 생성하기
                    </button>
                </div>
            </div>

            <div className="ai-icon-box">
                <img
                    src="/images/section-image1.png"
                    alt="아이콘"
                    className="ai-icon"
                />
            </div>
        </section>
    );
}

export default SectionAI;
