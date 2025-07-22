import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "./../styles/splash.css";

function SplashIntro() {
    const navigate = useNavigate();

    const handleStart = () => {
        navigate("/home");
    };

    return (
        <div className="splash-container">

            {/* ✅ 배경 동영상 추가 */}
            <video
                autoPlay
                loop
                muted
                playsInline
                className="background-video"
            >
                <source src="/videos/background.mp4" type="video/mp4" />
                브라우저가 video 태그를 지원하지 않습니다.
            </video>

            {/* 1번 섹션 */}
            <motion.section
                className="splash-section first"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
            >
                <div className={"logoName"}>Boyage</div>
                <div className={"description"}>나의 여행이 더 즐거워지도록</div>
                <button className={"startButton"} onClick={handleStart}>시작하기</button>
            </motion.section>
        </div>
    );
}

export default SplashIntro;
