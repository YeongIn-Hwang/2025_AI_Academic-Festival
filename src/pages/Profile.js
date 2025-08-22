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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setDisplayName(currentUser.displayName || currentUser.email);
      else setDisplayName("");
    });
    return () => unsubscribe();
  }, []);

  return (
      <div className="profile-container">
        {/* 히어로 영역 */}
        <header className="profile-header">
          <h2 className="profile-logo" onClick={() => navigate("/home")}>
            Boyage
          </h2>
          <h1 className="welcome-text">{displayName} 님, 환영합니다!</h1>
        </header>

        {/* 카드 타일 3개 */}
        <main className="profile-content">
          <div className="profile-tiles" role="list">
            <button
                type="button"
                className="profile-tile"
                role="listitem"
                onClick={() => navigate("/map")}
                aria-label="나의 일기장 바로가기"
            >
              <div className="tile-text">
                <div className="tile-title">나의 일기장</div>
                <div className="tile-sub">바로가기</div>
              </div>
              <IoMdArrowDropright className="tile-icon" aria-hidden="true" />
            </button>

            <button
                type="button"
                className="profile-tile"
                role="listitem"
                onClick={() => navigate("/journey")}
                aria-label="나의 경로 바로가기"
            >
              <div className="tile-text">
                <div className="tile-title">나의 경로</div>
                <div className="tile-sub">바로가기</div>
              </div>
              <IoMdArrowDropright className="tile-icon" aria-hidden="true" />
            </button>

            <button
                type="button"
                className="profile-tile"
                role="listitem"
                onClick={() => navigate("/hearts")}
                aria-label="좋아요 누른 장소 보기"
            >
              <div className="tile-text">
                <div className="tile-title">좋아요 누른 장소</div>
                <div className="tile-sub">바로가기</div>
              </div>
              <IoMdArrowDropright className="tile-icon" aria-hidden="true" />
            </button>
          </div>
        </main>
      </div>
  );
}
