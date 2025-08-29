// src/pages/SetPreferences.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
// Firestore에 온보딩 완료 플래그를 기록하려면 아래 주석 해제:
// import { db } from "../firebase";
// import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "../styles/SetPreferences.css";
import island from "../assets/island.png";

function SetPreferences() {
  const navigate = useNavigate();
  const MAX = 5;

  const TAGS = [
    "인생샷은 필수",
    "북적임을 피해 자연으로",
    "랜드마크는 못 참지",
    "오감만족 액티비티",
    "쇼핑에 진심인 편",
    "현지 맛집 탐방",
  ];

  const [selectedHope, setSelectedHope] = useState([]);
  const [selectedNonHope, setSelectedNonHope] = useState([]);
  const [loading, setLoading] = useState(false);

  // =========================
  // API_BASE 결정 로직
  // - VITE_API_URL 우선
  // - 로컬(localhost/127.0.0.1)이면 http://localhost:8000
  // - 배포면 window.location.origin (프록시/리라이트 구성되어 있다는 가정)
  // - 배포 https 페이지에서 http://를 가리키면, 같은 호스트일 때 https로 자동 승격 시도
  // =========================
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  let RAW_API_BASE = (import.meta?.env?.VITE_API_URL || "").replace(/\/+$/, "");
  if (!RAW_API_BASE) {
    RAW_API_BASE = isLocalhost ? "http://localhost:8000" : window.location.origin;
  }

  let API_BASE = (RAW_API_BASE || "").replace(/\/+$/, "");

  if (window.location.protocol === "https:" && API_BASE.startsWith("http://")) {
    try {
      const u = new URL(API_BASE);
      // 같은 호스트라면 https로 올려서 호출 시도(예: https://front.com → http://front.com)
      if (u.hostname === window.location.hostname) {
        API_BASE = `https://${u.host}`;
        console.warn("[SetPreferences] http→https 자동 승격:", API_BASE);
      }
    } catch (_) {
      // URL 파싱 실패 시 무시
    }
  }

  // 디버그 로그가 필요하면 VITE_DEBUG=true 로 빌드/배포
  if (import.meta?.env?.VITE_DEBUG === "true") {
    console.log("[DEBUG] location", window.location.protocol, window.location.hostname, window.location.origin);
    console.log("[DEBUG] VITE_API_URL", import.meta?.env?.VITE_API_URL);
    console.log("[DEBUG] isLocalhost", isLocalhost);
    console.log("[DEBUG] API_BASE(final)", API_BASE);
  }

  const toggleTag = (type, tag) => {
    const [selected, setSelected] =
      type === "hope" ? [selectedHope, setSelectedHope] : [selectedNonHope, setSelectedNonHope];

    const exists = selected.includes(tag);
    if (exists) return setSelected(selected.filter((t) => t !== tag));
    if (selected.length >= MAX) return alert(`최대 ${MAX}개까지 선택할 수 있어요.`);
    setSelected([...selected, tag]);
  };

  const save = async () => {
    if (loading) return; // 중복 클릭 방지

    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    const hope = selectedHope.slice(0, MAX);
    const nonhope = selectedNonHope.slice(0, MAX);
    if (hope.length === 0 && nonhope.length === 0) {
      return alert("최소 1개 이상 선택해 주세요.");
    }

    // 혼합콘텐츠(https 페이지에서 http API 호출) 차단 사전 감지
    if (window.location.protocol === "https:" && API_BASE.startsWith("http://")) {
      console.warn("[SetPreferences] Mixed content detected:", { API_BASE, page: window.location.href });
      alert("보안 정책 때문에 저장할 수 없어요. 서버 주소를 https로 바꿔주세요.");
      return;
    }

    setLoading(true);

    // 10초 타임아웃으로 fetch 보호
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      console.log("[SetPreferences] POST", `${API_BASE}/user_keywords_embed`, {
        uid: user.uid,
        hope,
        nonhope,
      });

      const res = await fetch(`${API_BASE}/user_keywords_embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, hope, nonhope }),
        signal: controller.signal,
      });

      const text = await res.text(); // 본문 확보(성공/실패 모두)
      console.log("[SetPreferences] Response", res.status, text);

      if (!res.ok) {
        // CORS 문제일 때는 브라우저가 preflight에서 막아서 여기까지 안 올 수도 있음(콘솔 Network 확인)
        const msg = text || "서버 오류가 발생했어요.";
        alert(`저장 실패(${res.status}). ${msg}`);
        return;
      }

      // (선택) Firestore에 온보딩 완료 플래그 기록
      // try {
      //   await updateDoc(doc(db, "users", user.uid), {
      //     onboardingDone: true,
      //     updatedAt: serverTimestamp(),
      //   });
      // } catch (e) {
      //   console.warn("onboardingDone 업데이트 실패(무시 가능):", e);
      // }

      alert("저장 완료!");
      navigate("/home", { replace: true });
    } catch (e) {
      // AbortError 등 네트워크 예외
      console.error("[SetPreferences] 저장 요청 예외:", e?.name, e?.message || e);
      if (e?.name === "AbortError") {
        alert("요청이 시간 초과되었습니다. 네트워크 상태를 확인해 주세요.");
      } else {
        alert("네트워크 오류로 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  const Tag = ({ type, active, children, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "tag",
        "tag-neutral", // 기본 중립(연회색)
        type === "hope" ? "tag-hope" : "tag-nonhope",
        active ? "is-active" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );

  const TagGrid = ({ type, selected }) => (
    <div className="tag-grid">
      {TAGS.map((tag) => (
        <Tag
          key={`${type}-${tag}`}
          type={type}
          active={selected.includes(tag)}
          onClick={() => toggleTag(type, tag)}
        >
          {tag}
        </Tag>
      ))}
    </div>
  );

  return (
    <div className="pref-page">
      <div className="pref-container">
        <header className="pref-header">
          <img src={island} alt="" aria-hidden="true" className="header-icon" />
          <h1>내가 선호하는 여행 스타일은?</h1>
          <p className="hint">다중 선택이 가능해요.</p>
        </header>

        {/* 선호 섹션 */}
        <section className="panel">
          <div className="panel-head">
            <h3>선호 스타일 선택</h3>
            <span className="count">
              {selectedHope.length}/{MAX}
            </span>
          </div>
          <TagGrid type="hope" selected={selectedHope} />
        </section>

        {/* 비선호 섹션 */}
        <section className="panel">
          <div className="panel-head">
            <h3>비선호 스타일 선택</h3>
            <span className="count">
              {selectedNonHope.length}/{MAX}
            </span>
          </div>
          <TagGrid type="nonhope" selected={selectedNonHope} />
        </section>

        <button onClick={save} disabled={loading} className="primary-btn">
          {loading ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}

export default SetPreferences;
