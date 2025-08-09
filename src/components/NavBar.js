import React from "react";
import { Link } from "react-router-dom";

function NavBar() {
    return (
        <nav style={{ display: "flex", justifyContent: "space-around", padding: "10px" }}>
            <Link to="/home">홈</Link>
            <Link to="/map">지도</Link>
            <Link to="/journey">여정</Link>
            <Link to="/diary">일기</Link>
            <Link to="/news">뉴스</Link>
            <Link to="/profile">프로필</Link>
        </nav>
    );
}

export default NavBar;
