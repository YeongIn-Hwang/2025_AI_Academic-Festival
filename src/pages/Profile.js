// src/pages/Profile.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { IoMdArrowDropright } from "react-icons/io";

/* 배경 이미지를 JS에서 지정하려면 import 유지 (원치 않으면 CSS에서 처리) */
import bg from "../assets/profile-background.png";

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
    <div
      className="profile-container"

    >
      <header className="profile-header">
        <h2 className="profile-logo">Boyage</h2>
        <h1 className="welcome-text">{displayName} 님, 환영합니다!</h1>
      </header>

      <main className="profile-content">
        <div className="profile-menu">
          <div
            className="menu-item"
            onClick={() => navigate("/map")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/map")}
          >
            <span className="menu-item-icon">
              <IoMdArrowDropright />
            </span>
            <span className="menu-item-text">나의 일기장 바로가기</span>
          </div>

          <div
            className="menu-item"
            onClick={() => navigate("/journey")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/journey")}
          >
            <span className="menu-item-icon">
              <IoMdArrowDropright />
            </span>
            <span className="menu-item-text">나의 경로 바로가기</span>
          </div>

          <div
            className="menu-item"
            onClick={() => navigate("/hearts")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate("/hearts")}
          >
            <span className="menu-item-icon">
              <IoMdArrowDropright />
            </span>
            <span className="menu-item-text">좋아요 누른 장소 보기</span>
          </div>
        </div>
      </main>
    </div>
  );
}
