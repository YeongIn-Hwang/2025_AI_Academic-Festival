import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/signup.css";

function SignUp() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState(""); // 사용자 이름 입력 받기
    const navigate = useNavigate();

    const handleSignUp = async () => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);

            // 사용자 이름 설정
            await updateProfile(userCredential.user, {
                displayName: username,
            });

            alert("회원가입 성공!");
            navigate("/login");
        } catch (error) {
            alert("회원가입 실패: " + error.message);
        }
    };

    return (
        <div className="signup-container">
            <h1 className="signup-logo">Boyage</h1>
            <h2 className="signup-title">회원가입</h2>
            <input
                className="signup-input"
                type="text"
                placeholder="사용자 이름"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            /><br />
            <input
                className="signup-input"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            /><br />
            <input
                className="signup-input"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            /><br />
            <button className="signup-button2" onClick={handleSignUp}>회원가입</button>
        </div>
    );
}

export default SignUp;
