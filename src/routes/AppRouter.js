import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import SignUp from "../pages/SignUp";
import SplashIntro from "../pages/SplashIntro";
import News from "../pages/News";
import Map from "../pages/Map";
import Journey from "../pages/Journey";    // ✅ 너의 코드
import Diary from "../pages/Diary";        // ✅ 협업자 코드

function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<SplashIntro />} />
                <Route path="/home" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/news" element={<News />} />
                <Route path="/map" element={<Map />} />
                <Route path="/journey" element={<Journey />} />             {/* ✅ 너의 코드 */}
                <Route path="/diary/:region" element={<Diary />} />         {/* ✅ 협업자 코드 */}
            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
