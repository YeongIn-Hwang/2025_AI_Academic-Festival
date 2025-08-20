// src/pages/JourneyList.js
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { FiPlus, FiSearch, FiCalendar, FiClock, FiChevronRight } from "react-icons/fi";
import { RiArrowDropDownLine } from "react-icons/ri";
import "../styles/JourneyList.css";

export default function JourneyList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rawTrips, setRawTrips] = useState([]); // [{id, dayCount, firstDate, lastDate, updatedAt}]
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("updated"); // 'updated' | 'title' | 'days'
  const [sortDir, setSortDir] = useState("desc");    // 'asc' | 'desc'

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
        {/* 상단 헤더 */}
        <div className="jl-topbar">
          <h1 className="jl-logo" onClick={() => navigate("/")}>
            Boyage
          </h1>
          <button
              className="jl-btn_newpath"
              onClick={() => navigate("/journey/setting")}
          >
            + 새 경로 생성
          </button>
        </div>
        <div className="jl-divider" />
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
              <div className="jl-select">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  <option value="updated">최신 순</option>
                  <option value="title">제목</option>
                  <option value="days">날짜 수</option>
                </select>
                {/* 아이콘을 select 위에 겹치기 */}
                <RiArrowDropDownLine className="jl-select-icon" />
              </div>

              <button
                  className="jl-btn jl-ghost"
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  title={sortDir === "asc" ? "오름차순" : "내림차순"}
              >
                {sortDir === "asc" ? "↑" : "↓"}
              </button>
            </div>
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
