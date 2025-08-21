// src/routes/AppRouter.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import SignUp from "../pages/SignUp";
import SplashIntro from "../pages/SplashIntro";
import News from "../pages/News";
import Map from "../pages/Map";
import Calendar from "../pages/Calendar";
import Journey from "../pages/Journey";
import Diary from "../pages/Diary";
import DiaryView from "../pages/DiaryView";
import Profile from "../pages/Profile";
import SetPreferences from "../pages/SetPreferences";
import JourneyList from "../pages/JourneyList";

// ← 두 브랜치 모두의 추가분을 포함
import Heart from "../pages/Heart";
import Save_Travel from "../pages/Save_Travel";
import JourneySetting from "../pages/JourneySetting";

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
        <Route path="/calendar/:region" element={<Calendar />} />
        <Route path="/journey" element={<Journey />} />
        <Route path="/diary/:region" element={<Diary />} />
        <Route path="/diaryview/:region" element={<DiaryView />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/set-preferences" element={<SetPreferences />} />
        <Route path="/journey_list" element={<JourneyList />} />
        <Route path="/journey_list.js" element={<Navigate to="/journey_list" replace />} />

        {/* 두 브랜치의 신규 라우트 모두 포함 */}
        <Route path="/hearts" element={<Heart />} />
        <Route path="/save_travel" element={<Save_Travel />} />
        <Route path="/journey/setting" element={<JourneySetting />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
