import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Home from "../pages/Home";
import News from "../pages/News";
import Map from "../pages/Map";
import Calendar from "../pages/Calendar";     // ✅ 너의 코드 유지
import Journey from "../pages/Journey";       // ✅ 협업자 코드 추가
import Diary from "../pages/Diary";           // ✅ 중복 제거 후 하나만 유지
import DiaryView from "../pages/DiaryView";   // ✅ 너의 코드 유지

export default function AppRouter() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/news" element={<News />} />
                <Route path="/map" element={<Map />} />
                <Route path="/calendar/:region" element={<Calendar />} />
                <Route path="/journey" element={<Journey />} />       {/* ✅ 협업자 페이지 라우팅 */}
                <Route path="/diary/:region" element={<Diary />} />
                <Route path="/diaryview/:region" element={<DiaryView />} />
            </Routes>
        </Router>
    );
}
