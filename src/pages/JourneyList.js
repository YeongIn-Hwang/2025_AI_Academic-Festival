// src/pages/JourneyList.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { FiPlus, FiSearch, FiCalendar, FiClock, FiChevronRight } from "react-icons/fi";

const INLINE_CSS = `
/* 컨테이너 */
.jl-wrap {
  padding: 24px;
  max-width: 1080px;
  margin: 0 auto;
  color: #0f172a; /* ← 기본 텍스트 색(짙은 남회색) */
}

/* 헤더 */
.jl-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.jl-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
}

.jl-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 검색 */
.jl-search {
  position: relative;
}

.jl-search input {
  width: 220px;
  padding: 10px 12px 10px 36px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  outline: none;
}

.jl-search input:focus {
  border-color: #cbd5e1;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.jl-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

/* 정렬 */
.jl-sort {
  display: flex;
  align-items: center;
  gap: 6px;
}

.jl-sort select {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

/* 버튼 */
.jl-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  font-weight: 700;
}

.jl-primary {
  background: #2563eb;
  color: #fff;
}

.jl-primary:hover {
  filter: brightness(0.95);
}

.jl-ghost {
  background: #f1f5f9;
  color: #111827;
  border: 1px solid #e5e7eb;
}

.jl-ghost:hover {
  background: #e2e8f0;
}

/* 빈 상태 */
.jl-empty {
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: #64748b;
  background: #f8fafc;
}

.jl-link {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  cursor: pointer;
}

/* 그리드 & 카드 */
.jl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.jl-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  background: linear-gradient(180deg, #ffffff, #fbfbfd);
  border-radius: 14px;
  padding: 14px;
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  color: #0f172a;
}

.jl-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(0,0,0,0.06);
  border-color: #d1d5db;
}

.jl-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.jl-title {
  font-weight: 800;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
  color: #0f172a;
}

.jl-badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  color: #111827;
}

.jl-card-meta {
  display: grid;
  gap: 6px;
  margin: 8px 0 10px;
  color: #475569;
  font-size: 13px;
}

.jl-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jl-card-foot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #2563eb;
  font-size: 13px;
}

/* 스켈레톤 */
.jl-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.jl-skeleton-card {
  height: 108px;
  border-radius: 14px;
  background: linear-gradient(90deg, #f3f4f6, #eef2f7, #f3f4f6);
  background-size: 200% 100%;
  animation: jl-shimmer 1.2s ease-in-out infinite;
  border: 1px solid #e5e7eb;
}

@keyframes jl-shimmer {
  0% { background-position: 0% 0; }
  100% { background-position: -200% 0; }
}
`;

export default function JourneyList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rawTrips, setRawTrips] = useState([]); // [{id, dayCount, firstDate, lastDate, updatedAt}]
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("updated"); // 'updated' | 'title' | 'days'
  const [sortDir, setSortDir] = useState("desc");    // 'asc' | 'desc'

  // 스타일 한 번만 주입
  useEffect(() => {
    const id = "jl-inline-style";
    if (!document.getElementById(id)) {
      const tag = document.createElement("style");
      tag.id = id;
      tag.textContent = INLINE_CSS;
      document.head.appendChild(tag);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      try {
        const colRef = collection(db, "user_trips", user.uid, "trips_log");
        const snap = await getDocs(colRef);

        const items = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const meta = docSnap.data() || {};
            let dayCount = 0;
            try {
              const daysCol = collection(db, "user_trips", user.uid, "trips_log", docSnap.id, "days");
              const daysSnap = await getDocs(daysCol);
              dayCount = daysSnap.size;
            } catch {}
            return {
              id: docSnap.id,
              dayCount,
              firstDate: meta.first_date || null,
              lastDate: meta.last_date || null,
              updatedAt: meta.updated_at || null,
            };
          })
        );
        setRawTrips(items);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [navigate]);

  const trips = useMemo(() => {
    const norm = (s) => (s || "").toLowerCase();
    let arr = rawTrips.filter((t) => norm(t.id).includes(norm(q)));

    arr.sort((a, b) => {
      if (sortKey === "title") {
        const cmp = a.id.localeCompare(b.id);
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortKey === "days") {
        const cmp = (a.dayCount || 0) - (b.dayCount || 0);
        return sortDir === "asc" ? cmp : -cmp;
      }
      // 'updated'
      const at = toMs(a.updatedAt);
      const bt = toMs(b.updatedAt);
      const cmp = at - bt;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [rawTrips, q, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="jl-wrap">
        <div className="jl-header">
          <h1>내 여행 리스트</h1>
          <div className="jl-actions">
            <button className="jl-btn jl-primary" disabled>
              <FiPlus /> 새 경로 생성
            </button>
          </div>
        </div>
        <div className="jl-skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="jl-skeleton-card" key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="jl-wrap">
      {/* 헤더 */}
      <div className="jl-header">
        <h1>내 여행 리스트</h1>
        <div className="jl-actions">
          <div className="jl-search">
            <FiSearch className="jl-search-icon" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="여행 제목 검색"
            />
          </div>
          <div className="jl-sort">
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="updated">최신 순</option>
              <option value="title">제목</option>
              <option value="days">날짜 수</option>
            </select>
            <button
              className="jl-btn jl-ghost"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "오름차순" : "내림차순"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <button
            onClick={() => navigate("/journey")}
            className="jl-btn jl-primary"
            title="새 경로 생성"
          >
            <FiPlus /> 새 경로 생성
          </button>
        </div>
      </div>

      {/* 콘텐츠 */}
      {trips.length === 0 ? (
        <div className="jl-empty">
          저장된 여행이 없어요.&nbsp;
          <button className="jl-link" onClick={() => navigate("/journey")}>
            지금 만들기
          </button>
        </div>
      ) : (
        <div className="jl-grid">
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate("/journey", { state: { loadTitle: t.id } })}
              className="jl-card"
              title={`${t.id} 열기`}
            >
              <div className="jl-card-head">
                <div className="jl-title">{t.id}</div>
                <div className="jl-badge">{t.dayCount}일</div>
              </div>

              <div className="jl-card-meta">
                <div className="jl-meta-row">
                  <FiCalendar />
                  <span>{fmtRange(t.firstDate, t.lastDate)}</span>
                </div>
                <div className="jl-meta-row">
                  <FiClock />
                  <span>{fmtUpdated(t.updatedAt)}</span>
                </div>
              </div>

              <div className="jl-card-foot">
                열기 <FiChevronRight />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */
function toMs(ts) {
  if (!ts) return 0;
  try {
    return ts.toDate().getTime();
  } catch {
    return 0;
  }
}
function fmtRange(a, b) {
  if (a && b) return `${a} ~ ${b}`;
  if (a || b) return `${a || b}`;
  return "날짜 미정";
}
function fmtUpdated(ts) {
  if (!ts || !ts.toDate) return "업데이트 정보 없음";
  const d = ts.toDate();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mm}-${dd} ${hh}:${mi}`;
}
