/*////////////////////////////////////////////////////////////////////////////////////////// 
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase"; // Firebase 설정 불러오기
import { onAuthStateChanged } from "firebase/auth";

function Journey() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 로그인 상태 감지
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                // 로그인 안 된 경우 로그인 페이지로 이동
                navigate("/login");
            } else {
                // 로그인 된 경우 페이지 표시
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [navigate]);

    if (loading) {
        return <div>로딩 중...</div>; // 로그인 상태 확인하는 동안 로딩 표시
    }

    return (
        <div>
            <h1>AI 경로 추천 페이지</h1>
            <p>여기에 추천 경로 UI를 넣을 수 있습니다.</p>
        </div>
    );
}

export default Journey;
/////////////////////////////////////////////////////////////////////////////////////////*/
// src/pages/Journey.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

function Journey() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // form state
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("2"); // 1:도보, 2:대중교통, 3:운전
  const [submitting, setSubmitting] = useState(false);

  // Vite + CRA 모두 대응
  const API_BASE =
  (import.meta?.env?.VITE_API_URL) ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:8000";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login");
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!title.trim() || !query.trim()) {
      alert("제목과 지역을 입력해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      // 백엔드: /places_build_save (서버가 파이프라인 실행 + Firestore 저장)
      const res = await fetch(`${API_BASE}/places_build_save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          title: title.trim(),
          query: query.trim(),
          method: Number(method),
        }),
      });

      if (res.status === 401) {
        alert("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        navigate("/login");
        return;
      }

      if (!res.ok) {
        const msg = await res.text();
        console.error(msg);
        alert("서버 오류: " + msg);
        return;
      }

      const data = await res.json();
      alert("여행지 수집/임베딩/저장 완료!");
      // navigate(`/journey/${encodeURIComponent(title)}`);
    } catch (err) {
      console.error(err);
      alert("요청 실패: " + (err?.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>로딩 중...</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>AI 경로 추천</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        제목과 지역을 입력하고 방식을 선택하세요. 제출 시 서버가 장소를 수집·전처리·임베딩하고 Firestore에 저장합니다.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 6 }}>여행 제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 나의 여름 서울 여행"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            disabled={submitting}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6 }}>지역(기점)</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예) 신도림역, 경복궁, 강남역"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            disabled={submitting}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6 }}>이동 방식</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            disabled={submitting}
          >
            <option value="1">도보 (반경 3km)</option>
            <option value="2">대중교통 (반경 15km)</option>
            <option value="3">직접 운전 (반경 30km)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: "#000",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {submitting ? "처리 중..." : "여행지 수집 및 저장"}
        </button>
      </form>
    </div>
  );
}

export default Journey;
