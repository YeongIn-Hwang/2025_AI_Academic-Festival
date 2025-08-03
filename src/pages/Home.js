// src/pages/Home.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/home.css";
import { FaBars } from "react-icons/fa6";
import { IoCloseOutline } from "react-icons/io5";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

// ✅ background 이미지 import
import backgroundImg from "../assets/background.png";

// 섹션 컴포넌트 import
import SectionAI from "../components/SectionAI";
import SectionMap from "../components/SectionMap";
import SectionMagazine from "../components/SectionMagazine";

function Home() {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [user, setUser] = useState(null);

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const handleLogout = async () => {
        await signOut(auth);
        setUser(null);
        setIsMenuOpen(false);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                await currentUser.reload();
                setUser(auth.currentUser);
            } else {
                setUser(null);
            }
        });
        return () => unsubscribe();
    }, []);

    return (
        <div
            className="home-page"
            style={{
                backgroundImage: `url(${backgroundImg})`,
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                backgroundAttachment: "fixed"
            }}
        >
            {/* Hero 화면 */}
            <section className="hero">
                <div className="logo">Boyage</div>
                <div className="sub-title">추천 경로부터 기록까지, 여행이 더 즐거워지는</div>
                <div className="main-title">
                    나의 여정의 모든 것<br />Boyage
                </div>
                <button className="menu-button" onClick={toggleMenu}>
                    <FaBars />
                </button>
            </section>

            {/* 각 설명 섹션 */}
            <div className="main-content">
                <SectionAI />
                <SectionMap />
                <SectionMagazine />
            </div>

            {/* 사이드 메뉴 */}
            <div className={`side-tab ${isMenuOpen ? "open" : ""}`}>
                <button className="close-button" onClick={toggleMenu}><IoCloseOutline /></button>
                {isMenuOpen && user && (
                    <div className="user-info">
                        <span>{user.displayName || user.email}님</span>
                        <p className="description-sidebar">Boyage에 오신 것을 환영합니다!</p>
                    </div>
                )}
                <ul>
                    {!user && <li onClick={() => navigate("/login")}>로그인/회원가입</li>}
                    <li onClick={() => navigate("/journey")}>AI 추천 경로</li>
                    <li onClick={() => navigate("/map")}>지도/일기장</li>
                    <li onClick={() => navigate("/news")}>뉴스&메거진</li>
                    <li onClick={() => navigate("/profile")}>내 프로필</li>
                </ul>
                {user && (
                    <div className="logout-button">
                        <button onClick={handleLogout}>로그아웃</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Home;
