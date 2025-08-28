// src/pages/Profile.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { IoMdArrowDropright } from "react-icons/io";

export default function Profile() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [activeTab, setActiveTab] = useState("info"); // "info" | "move"

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setDisplayName(currentUser.displayName || currentUser.email || "회원");
      } else {
        setDisplayName("");
      }
    });
    return () => unsubscribe();
  }, []);

  return (
      <div className="profile-container">
        {/* 상단 배경 히어로 (가로 전체) + 좌측 상단 로고 */}
        <header className="profile-hero" aria-label="프로필 배경">
          <h2
              className="hero-logo"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/home")}
              onKeyDown={(e) => e.key === "Enter" && navigate("/home")}
              aria-label="홈으로 이동"
          >
            Boyage
          </h2>
        </header>

        {/* 배경 바로 아래 중앙 - 프로필 사진 + 이름(검은색) */}
        <section className="profile-identity" aria-label="프로필 정보">
          <img
              className="profile-avatar"
              src="/images/profile-icon.png"   /* public/images/profile-icon.png */
              alt="프로필 사진"
          />
          <div className="profile-name">{displayName} 님</div>
        </section>

        {/* 탭 카드 영역 (가로 폭 제한) */}
        <main className="profile-main">
          <div className="tab-header">
            <button
                className={`tab-btn ${activeTab === "info" ? "active" : ""}`}
                onClick={() => setActiveTab("info")}
            >
              나의 정보
            </button>
            <button
                className={`tab-btn ${activeTab === "move" ? "active" : ""}`}
                onClick={() => setActiveTab("move")}
            >
              탭으로 이동
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "info" && (
                <div className="tile-list">
                  <button
                      type="button"
                      className="profile-tile"
                      onClick={() => navigate("/map")}
                  >
                    <span className="tile-text">나의 일기장 바로가기</span>
                    <IoMdArrowDropright className="tile-icon" />
                  </button>
                  <button
                      type="button"
                      className="profile-tile"
                      onClick={() => navigate("/journey")}
                  >
                    <span className="tile-text">나의 경로 바로가기</span>
                    <IoMdArrowDropright className="tile-icon" />
                  </button>
                  <button
                      type="button"
                      className="profile-tile"
                      onClick={() => navigate("/hearts")}
                  >
                    <span className="tile-text">좋아요 누른 장소 바로가기</span>
                    <IoMdArrowDropright className="tile-icon" />
                  </button>
                </div>
            )}

            {activeTab === "move" && (
                <div className="tile-list">
                  <button
                      type="button"
                      className="profile-tile"
                      onClick={() => navigate("/journey_list")}
                  >
                    <span className="tile-text">AI 추천 경로</span>
                    <IoMdArrowDropright className="tile-icon" />
                  </button>
                  <button
                      type="button"
                      className="profile-tile"
                      onClick={() => navigate("/news")}
                  >
                    <span className="tile-text">뉴스 & 매거진</span>
                    <IoMdArrowDropright className="tile-icon" />
                  </button>
                </div>
            )}
          </div>
        </main>
      </div>
  );
}
