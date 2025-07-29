import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import Login from "../pages/Login";
import SignUp from "../pages/SignUp";
import SplashIntro from "../pages/SplashIntro";
import News from "../pages/News";
import Map from "../pages/Map";
import Diary from "../pages/Diary"; // ✅ 반드시 필요!

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
                <Route path="/diary/:region" element={<Diary />} />  {/* OK */}
            </Routes>
        </BrowserRouter>
    );
}

export default AppRouter;
