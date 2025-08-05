import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Profile() {
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState("");

    // ✅ Firebase에서 로그인된 사용자 정보 가져오기
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                // displayName이 없으면 email을 대신 표시
                setDisplayName(currentUser.displayName || currentUser.email);
            } else {
                setDisplayName(""); // 로그아웃 상태
            }
        });
        return () => unsubscribe();
    }, []);

    const goToDiaryView = () => {
        navigate("/diaryview");
    };

    return (
        <div className="profile-container">
            <header className="profile-header">
                <video className="background-video" autoPlay loop muted playsInline>
                    <source src="/videos/profile-background.mp4" type="video/mp4" />
                </video>
                <h2 className="profile-logo">Boyage</h2>
                <h1 className="welcome-text">{displayName} 님, 환영합니다!</h1>
            </header>

            <main className="profile-content">
                <div className="profile-menu">
                    <div className="menu-item" onClick={goToDiaryView}>
                        &gt; 나의 일기장 바로가기
                    </div>
                    <div className="menu-item">
                        &gt; 나의 경로 바로가기
                    </div>
                </div>
            </main>
        </div>
    );
}
