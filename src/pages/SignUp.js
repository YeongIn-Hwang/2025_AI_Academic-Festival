import React, { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "../firebase"; //////////////////////////////////////////////////////// 수정
import { useNavigate } from "react-router-dom";
import "../styles/signup.css";
////////////////////////////////////////////////////////////////////////////////////////////////
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
////////////////////////////////////////////////////////////////////////////////////////////////
function SignUp() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState(""); // 사용자 이름 입력 받기
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
///////////////////////////////////////////////////////////////////////////////////////////////
    const API_BASE = import.meta?.env?.VITE_API_URL || "http://localhost:8000";

    const handleSignUp = async () => {
    if (!email || !password || !username) {
      alert("이름/이메일/비밀번호를 모두 입력해 주세요.");
      return;
    }
    setLoading(true);

    try {
      // 1) Firebase 회원가입
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2) displayName 반영
      await updateProfile(cred.user, { displayName: username });

      // 3) FastAPI에 초기 파라미터 생성 요청
      const uid = cred.user.uid;
      const res = await fetch(`${API_BASE}/user_param_init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });

      if (!res.ok) {
        const msg = await res.text();
        console.error("user_param_init 실패:", msg);
        alert("서버 초기화 실패: " + msg);
        setLoading(false);
        return;
      }

      // 4) 성공 → 키워드 입력 페이지로
      navigate("/set-preferences");
    } catch (error) {
      console.error(error);
      alert("회원가입 실패: " + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

///////////////////////////////////////////////////////////////////////////////////////////////
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

      <button className="signup-button2" onClick={handleSignUp} disabled={loading}>
        {loading ? "처리 중..." : "회원가입"}
      </button>
    </div>
  );
}

export default SignUp;