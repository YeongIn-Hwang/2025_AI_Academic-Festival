// src/pages/SetPreferences.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

function SetPreferences() {
  const [hopeInputs, setHopeInputs] = useState([""]);
  const [nonHopeInputs, setNonHopeInputs] = useState([""]);
  const [isComposing, setIsComposing] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const MAX = 5;

  const API_BASE = import.meta?.env?.VITE_API_URL || "http://localhost:8000";

  const handleAddInput = (type) => {
    if (type === "hope" && hopeInputs.length < MAX) {
      setHopeInputs([...hopeInputs, ""]);
    }
    if (type === "nonhope" && nonHopeInputs.length < MAX) {
      setNonHopeInputs([...nonHopeInputs, ""]);
    }
  };

  const handleRemoveInput = (type, index) => {
    if (type === "hope") {
      setHopeInputs(hopeInputs.filter((_, i) => i !== index));
    }
    if (type === "nonhope") {
      setNonHopeInputs(nonHopeInputs.filter((_, i) => i !== index));
    }
  };

  const handleChange = (type, index, value) => {
    if (type === "hope") {
      const updated = [...hopeInputs];
      updated[index] = value;
      setHopeInputs(updated);
    }
    if (type === "nonhope") {
      const updated = [...nonHopeInputs];
      updated[index] = value;
      setNonHopeInputs(updated);
    }
  };

    const save = async () => {
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    // 공백 제거 + 빈 값 제외
    const hope = hopeInputs.map(v => v.trim()).filter(Boolean).slice(0, MAX);
    const nonhope = nonHopeInputs.map(v => v.trim()).filter(Boolean).slice(0, MAX);

    if (hope.length === 0 && nonhope.length === 0) {
      return alert("최소 1개 이상 입력해 주세요.");
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/user_keywords_embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          hope,
          nonhope,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        console.error("임베딩 저장 실패:", msg);
        return alert("서버 오류: " + msg);
      }
      alert("임베딩 저장 완료!");
      navigate("/home");
    } catch (e) {
      console.error(e);
      alert("저장 실패: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const renderInputList = (type, inputs, setInputs) => (
    <>
      {inputs.map((value, index) => (
        <div key={index} style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
          <input
            type="text"
            value={value}
            placeholder={type === "hope" ? "예) 카페, 전시회, 야경..." : "예) 대기줄, 실내, 매운맛..."}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onChange={(e) => handleChange(type, index, e.target.value)}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
            }}
          />
          <button
            onClick={() => handleRemoveInput(type, index)}
            style={{
              marginLeft: 6,
              padding: "4px 8px",
              fontSize: 12,
              background: "#ccc",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </>
  );

  return (
    <div style={{ padding: 24, maxWidth: 840, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>희망 / 비희망 키워드 설정</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        버튼을 눌러 입력칸을 추가하고, 필요 없으면 옆의 ✕ 버튼으로 삭제하세요. 각 항목은 최대{" "}
        <b>{MAX}개</b>까지 저장됩니다.
      </p>

      {/* 희망 키워드 */}
      <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>희망 키워드</h3>
          <button
            onClick={() => handleAddInput("hope")}
            disabled={hopeInputs.length >= MAX}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            키워드 추가
          </button>
        </div>

        {renderInputList("hope", hopeInputs, setHopeInputs)}
        <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>
          {hopeInputs.length}/{MAX}
        </div>
      </section>

      {/* 비희망 키워드 */}
      <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>비희망 키워드</h3>
          <button
            onClick={() => handleAddInput("nonhope")}
            disabled={nonHopeInputs.length >= MAX}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#000",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            키워드 추가
          </button>
        </div>

        {renderInputList("nonhope", nonHopeInputs, setNonHopeInputs)}
        <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>
          {nonHopeInputs.length}/{MAX}
        </div>
      </section>

      <button
        onClick={save}
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          border: "none",
          background: "#000",
          color: "#fff",
          cursor: "pointer",
          width: "100%",
          fontWeight: 600,
        }}
      >
        저장하기
      </button>
    </div>
  );
}

export default SetPreferences;