import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/login.css"; // CSS 파일 import

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleLogin = async () => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            alert("로그인 성공!");
            navigate("/home");
        } catch (error) {
            alert("로그인 실패: " + error.message);
        }
    };

    return (
        <div className="login-container">
            <h1 className={"login-logo"}>Boyage</h1>
            <h2 className="login-title">로그인</h2>
            <input
                className="login-input"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            /><br/>
            <input
                className="login-input"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            /><br />
            <div className="signup-link">
                <p>아직 회원이 아니신가요?</p>
                <button className="signup-button" onClick={() => navigate("/signup")}>회원가입</button>
            </div>
            <button className="login-button" onClick={handleLogin}>로그인</button>
        </div>
    );
}

export default Login;
