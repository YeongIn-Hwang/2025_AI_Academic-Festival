import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import SignUp from "../pages/SignUp";
import SplashIntro from "../pages/SplashIntro";
import News from "../pages/News";
import Map from "../pages/Map";
import Calendar from "../pages/Calendar";    // ✅ Calendar 유지
import Journey from "../pages/Journey";      // ✅ Journey 추가
import Diary from "../pages/Diary";          // ✅ Diary 유지
import DiaryView from "../pages/DiaryView";  // ✅ DiaryView 유지

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
                <Route path="/calendar/:region" element={<Calendar />} />   {/* ✅ Calendar 라우팅 */}
                <Route path="/journey" element={<Journey />} />             {/* ✅ Journey 라우팅 */}
                <Route path="/diary/:region" element={<Diary />} />         {/* ✅ Diary 라우팅 */}
                <Route path="/diaryview/:region" element={<DiaryView />} /> {/* ✅ DiaryView 라우팅 */}
            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
