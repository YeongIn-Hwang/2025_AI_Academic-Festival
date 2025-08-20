// src/pages/SetPreferences.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/SetPreferences.css";
import island from "../assets/island.png"; // ← 카메라 아이콘 자리에 쓸 이미지

function SetPreferences() {
    const navigate = useNavigate();
    const MAX = 5;

    const TAGS = [
        "인생샷은 필수",
        "북적임을 피해 자연으로",
        "랜드마크는 못 참지",
        "오감만족 액티비티",
        "쇼핑에 진심인 편",
        "현지 맛집 탐방",
    ];

    const [selectedHope, setSelectedHope] = useState([]);
    const [selectedNonHope, setSelectedNonHope] = useState([]);
    const [loading, setLoading] = useState(false);

    const API_BASE = import.meta?.env?.VITE_API_URL || "http://localhost:8000";

    const toggleTag = (type, tag) => {
        const [selected, setSelected] =
            type === "hope" ? [selectedHope, setSelectedHope] : [selectedNonHope, setSelectedNonHope];

        const exists = selected.includes(tag);
        if (exists) return setSelected(selected.filter((t) => t !== tag));
        if (selected.length >= MAX) return alert(`최대 ${MAX}개까지 선택할 수 있어요.`);
        setSelected([...selected, tag]);
    };

    const save = async () => {
        const user = auth.currentUser;
        if (!user) return alert("로그인이 필요합니다.");

        const hope = selectedHope.slice(0, MAX);
        const nonhope = selectedNonHope.slice(0, MAX);
        if (hope.length === 0 && nonhope.length === 0) return alert("최소 1개 이상 선택해 주세요.");

        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/user_keywords_embed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: user.uid, hope, nonhope }),
            });
            if (!res.ok) {
                const msg = await res.text();
                console.error("저장 실패:", msg);
                return alert("서버 오류: " + msg);
            }
            alert("저장 완료!");
            navigate("/home");
        } catch (e) {
            console.error(e);
            alert("저장 실패: " + (e?.message || String(e)));
        } finally {
            setLoading(false);
        }
    };

    const Tag = ({ type, active, children, onClick }) => (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                "tag",
                "tag-neutral",        // 기본은 중립(연회색)
                type === "hope" ? "tag-hope" : "tag-nonhope",
                active ? "is-active" : ""
            ].join(" ")}
        >
            {children}
        </button>
    );

    const TagGrid = ({ type, selected }) => (
        <div className="tag-grid">
            {TAGS.map((tag) => (
                <Tag
                    key={`${type}-${tag}`}
                    type={type}
                    active={selected.includes(tag)}
                    onClick={() => toggleTag(type, tag)}
                >
                    {tag}
                </Tag>
            ))}
        </div>
    );

    return (
        <div className="pref-page">
            <div className="pref-container">
                <header className="pref-header">
                    {/* 카메라 아이콘 자리에 섬 이미지 */}
                    <img src={island} alt="" aria-hidden="true" className="header-icon" />
                    <h1>내가 선호하는 여행 스타일은?</h1>
                    <p className="hint">다중 선택이 가능해요.</p>
                </header>

                {/* 선호 섹션 */}
                <section className="panel">
                    <div className="panel-head">
                        <h3>선호 스타일 선택</h3>
                        <span className="count">{selectedHope.length}/{MAX}</span>
                    </div>
                    <TagGrid type="hope" selected={selectedHope} />
                </section>

                {/* 비선호 섹션 */}
                <section className="panel">
                    <div className="panel-head">
                        <h3>비선호 스타일 선택</h3>
                        <span className="count">{selectedNonHope.length}/{MAX}</span>
                    </div>
                    <TagGrid type="nonhope" selected={selectedNonHope} />
                </section>

                <button onClick={save} disabled={loading} className="primary-btn">
                    {loading ? "저장 중..." : "저장하기"}
                </button>
            </div>
        </div>
    );
}

export default SetPreferences;
