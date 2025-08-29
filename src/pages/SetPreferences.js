import React, { useState } from "react";
import { auth } from "../firebase";
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

  // ✅ API_BASE: Vite env 우선, 없으면 백엔드 고정 도메인 사용
  const API_BASE = (import.meta?.env?.VITE_API_URL || "https://voyage-ovqt.onrender.com").replace(/\/+$/, "");
  console.log("[DEBUG] API_BASE(final)", API_BASE);

  const toggleTag = (type, tag) => {
    const [selected, setSelected] =
      type === "hope" ? [selectedHope, setSelectedHope] : [selectedNonHope, setSelectedNonHope];
    const exists = selected.includes(tag);
    if (exists) return setSelected(selected.filter((t) => t !== tag));
    if (selected.length >= MAX) return alert(`최대 ${MAX}개까지 선택할 수 있어요.`);
    setSelected([...selected, tag]);
  };

  const save = async () => {
    if (loading) return;

    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    const hope = selectedHope.slice(0, MAX);
    const nonhope = selectedNonHope.slice(0, MAX);
    if (hope.length === 0 && nonhope.length === 0) {
      return alert("최소 1개 이상 선택해 주세요.");
    }

    // 혼합콘텐츠 사전 감지
    if (window.location.protocol === "https:" && API_BASE.startsWith("http://")) {
      console.warn("[SetPreferences] Mixed content detected:", { API_BASE, page: window.location.href });
      alert("보안 정책 때문에 저장할 수 없어요. 서버 주소를 https로 바꿔주세요.");
      return;
    }

    setLoading(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      console.log("[SetPreferences] POST", `${API_BASE}/user_keywords_embed`, { uid: user.uid, hope, nonhope });

      const res = await fetch(`${API_BASE}/user_keywords_embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, hope, nonhope }),
        signal: controller.signal,
      });

      const text = await res.text();
      console.log("[SetPreferences] Response", res.status, text);

      if (!res.ok) {
        // 프리플라이트/프록시 문제 힌트
        if (res.status === 405) {
          try {
            const u = new URL(`${API_BASE}/user_keywords_embed`);
            if (u.hostname === window.location.hostname) {
              console.error("[Hint] Posting to FRONTEND host (wrong). Set VITE_API_URL to backend URL.");
            }
          } catch {}
        }
        const msg = text || "서버 오류가 발생했어요.";
        alert(`저장 실패(${res.status}). ${msg}`);
        return;
      }

      // 선택: Firestore 온보딩 플래그
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
        "tag-neutral",
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
