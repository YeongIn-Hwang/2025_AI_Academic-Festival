import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

/* 배경 이미지 JS에서 직접 적용 */
import bg from "../assets/profile-background.png";
// ↑ public/images 를 쓰고 싶다면 import 대신: const bg = "/images/profile-background.png";

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

    /* ✅ 배경/레이아웃을 JS에서 직접 지정 */
    const containerStyle = useMemo(() => ({
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "60vh 1fr",     // ← 한 화면(무스크롤) 레이아웃 유지: 위 히어로 60%, 아래 메뉴 40%
        // 읽기 쉬우라고 살짝 오버레이 추가(원치 않으면 linear-gradient(...) 부분 삭제)
        backgroundImage: `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.15)), url(${bg})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundAttachment: "fixed",     // iOS에서 문제면 이 줄 지워도 됨
    }), []);

    const headerStyle = useMemo(() => ({
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start", // 상단 정렬
        alignItems: "flex-start",
        padding: "15vh 0 24px",        // 상단 여백(원하면 숫자 줄이면 더 위로 붙음)
        gap: 10,
        color: "#fff",
        background: "transparent",
        boxSizing: "border-box",
    }), []);

    const logoStyle = useMemo(() => ({
        fontSize: 65,
        fontWeight: 800,
        margin: "0 0 6px 40px",
    }), []);

    const welcomeStyle = useMemo(() => ({
        fontSize: 38,
        fontWeight: 600,
        margin: "0 0 0 40px",
    }), []);

    const menuItemStyle = useMemo(() => ({
        fontSize: 35,
        fontWeight: 900,
        color: "#f0f0f0",
        marginLeft: 40,
        cursor: "pointer",
    }), []);

    return (
        <div className="profile-container" style={containerStyle}>
            <header className="profile-header" style={headerStyle}>
                <h2 className="profile-logo" style={logoStyle}>Boyage</h2>
                <h1 className="welcome-text" style={welcomeStyle}>
                    {displayName} 님, 환영합니다!
                </h1>
            </header>

            <main className="profile-content" style={{ display: "flex", alignItems: "center" }}>
                <div className="profile-menu" style={{ display: "flex", flexDirection: "column", gap: 35 }}>
                    <div className="menu-item" style={menuItemStyle} onClick={() => navigate("/map")}>
                        &gt; 나의 일기장 바로가기
                    </div>
                    <div className="menu-item" style={menuItemStyle} onClick={() => navigate("/journey")}>
                        &gt; 나의 경로 바로가기
                    </div>
                    <div className="menu-item" style={menuItemStyle} onClick={() => navigate("/hearts")}>
                        &gt; 좋아요 누른 장소 보기
                    </div>
                </div>
            </main>
        </div>
    );
}
