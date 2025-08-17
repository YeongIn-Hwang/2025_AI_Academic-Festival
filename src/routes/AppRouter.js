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
import SetPreferences from "../pages/SetPreferences"; ////////////////////////////////////////////////////추가
import JourneyList from "../pages/JourneyList";

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


            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
