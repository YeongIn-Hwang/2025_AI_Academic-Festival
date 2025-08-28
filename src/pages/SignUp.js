// src/pages/SignUp.js
import React, { useState, useRef } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import "../styles/signup.css";

export default function SignUp() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading]   = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Vite: .env의 VITE_API_URL 사용, 없으면 로컬 기본값
    const API_BASE = import.meta?.env?.VITE_API_URL || "http://localhost:8000";

    // 중복 네비/중복 제출 방지
    const navigatingRef = useRef(false);

    const handleSignUp = async (e) => {
        e?.preventDefault?.();
        if (loading || navigatingRef.current) return;

        if (!username.trim() || !email.trim() || !password) {
            setErrorMsg("이름/이메일/비밀번호를 모두 입력해 주세요.");
            return;
        }

        setLoading(true);
        setErrorMsg("");

        try {
            // 1) Firebase 회원가입
            const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

            // 2) displayName 반영 (실패해도 치명적 X → 개별 try-catch)
            try {
                if (username.trim()) {
                    await updateProfile(cred.user, { displayName: username.trim() });
                }
            } catch (e) {
                console.warn("updateProfile 실패:", e);
            }

            // 3) 서버 초기화는 '베스트 에포트'로. 실패해도 온보딩 이동은 막지 않음.
            try {
                const uid = cred.user.uid;
                const res = await fetch(`${API_BASE}/user_param_init`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ uid }),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    console.warn("user_param_init 실패:", msg);
                    // 필요하면 여기서 사용자에게 토스트로 "서버 초기화 지연" 정도만 안내
                }
            } catch (e) {
                console.warn("user_param_init 호출 에러:", e);
            }

            // 4) 가입 성공 → 온보딩 페이지로 확정 이동
            if (!navigatingRef.current) {
                navigatingRef.current = true;
                navigate("/set-preferences", { replace: true });
            }
        } catch (error) {
            console.error("SIGNUP_FAIL", error);
            setErrorMsg("회원가입 실패: " + (error?.message || String(error)));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleSignUp(e);
    };

    return (
        <div className="signup-container">
            <h1 className="signup-logo">Boyage</h1>
            <h2 className="signup-title">회원가입</h2>

            <form className="signup-form" onSubmit={handleSignUp}>
                <input
                    className="signup-input"
                    type="text"
                    placeholder="사용자 이름"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="nickname"
                />
                <br />

                <input
                    className="signup-input"
                    type="email"
                    placeholder="이메일"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="email"
                />
                <br />

                <input
                    className="signup-input"
                    type="password"
                    placeholder="비밀번호"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="new-password"
                />
                <br />

                {errorMsg && <p className="signup-error">{errorMsg}</p>}

                <button
                    type="submit"
                    className="signup-button2"
                    onClick={handleSignUp}
                    disabled={loading}
                >
                    {loading ? "처리 중..." : "회원가입"}
                </button>
            </form>
        </div>
    );
}
