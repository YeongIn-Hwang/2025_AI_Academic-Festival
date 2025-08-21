// src/pages/JourneyList.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  FiPlus,
  FiSearch,
  FiCalendar,
  FiClock,
  FiChevronRight,
  FiFileText,
  FiCopy,
  FiTrash2,
} from "react-icons/fi";
import { RiArrowDropDownLine } from "react-icons/ri";
import "../styles/JourneyList.css";

export default function JourneyList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rawTrips, setRawTrips] = useState([]); // [{id, dayCount, firstDate, lastDate, updatedAt}]
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("updated"); // 'updated' | 'title' | 'days'
  const [sortDir, setSortDir] = useState("desc");    // 'asc' | 'desc'
  const [userObj, setUserObj] = useState(null);
  const [busyId, setBusyId] = useState(null); // 카드별 진행중 표시

  // 여행 목록 로딩 (HEAD 기능 유지)
  const fetchTrips = useCallback(async (user) => {
    const colRef = collection(db, "user_trips", user.uid, "trips_log");
    const snap = await getDocs(colRef);
    const items = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const meta = docSnap.data() || {};
        let dayCount = 0;
        try {
          const daysCol = collection(
            db,
            "user_trips",
            user.uid,
            "trips_log",
            docSnap.id,
            "days"
          );
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
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      setUserObj(user);
      try {
        await fetchTrips(user);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [navigate, fetchTrips]);

  // ---- 여행 복사 (trips_log/* + trips/* + trips/*/places/*) ----
  const handleCopy = useCallback(
    async (srcId) => {
      if (!userObj) return;

      const newId =
        (window.prompt("복사본 제목을 입력하세요", `${srcId} (복사)`) || "").trim();
      if (!newId) return;
      if (newId === srcId) {
        alert("같은 제목으로는 복사할 수 없어요.");
        return;
      }

      try {
        setBusyId(srcId);

        // 대상 제목 중복 체크
        const dstMetaRef = doc(
          db,
          "user_trips",
          userObj.uid,
          "trips_log",
          newId
        );
        const dstExists = await getDoc(dstMetaRef);
        if (dstExists.exists()) {
          alert("이미 같은 제목의 여행이 있어요. 다른 제목을 사용해주세요.");
          return;
        }

        // 1) trips_log 메타/일정 복사
        const srcMetaRef = doc(
          db,
          "user_trips",
          userObj.uid,
          "trips_log",
          srcId
        );
        const srcMetaSnap = await getDoc(srcMetaRef);
        const srcMeta = srcMetaSnap.data() || {};

        const srcDaysCol = collection(
          db,
          "user_trips",
          userObj.uid,
          "trips_log",
          srcId,
          "days"
        );
        const srcDaysSnap = await getDocs(srcDaysCol);

        await setDoc(dstMetaRef, { ...srcMeta, updated_at: serverTimestamp() });

        const dayDocs = srcDaysSnap.docs;
        for (let i = 0; i < dayDocs.length; i += 450) {
          const batch = writeBatch(db);
          const chunk = dayDocs.slice(i, i + 450);
          chunk.forEach((d) => {
            const dstDayRef = doc(
              db,
              "user_trips",
              userObj.uid,
              "trips_log",
              newId,
              "days",
              d.id
            );
            batch.set(dstDayRef, d.data());
          });
          await batch.commit();
        }

        // 2) /trips/{srcId} 문서 복사
        const srcTripDocRef = doc(
          db,
          "user_trips",
          userObj.uid,
          "trips",
          srcId
        );
        const srcTripSnap = await getDoc(srcTripDocRef);
        if (srcTripSnap.exists()) {
          const dstTripDocRef = doc(
            db,
            "user_trips",
            userObj.uid,
            "trips",
            newId
          );
          await setDoc(dstTripDocRef, srcTripSnap.data());
        } else {
          await setDoc(
            doc(db, "user_trips", userObj.uid, "trips", newId),
            {}
          );
        }

        // 3) /trips/{srcId}/places/* 전부 복사
        const srcPlacesCol = collection(
          db,
          "user_trips",
          userObj.uid,
          "trips",
          srcId,
          "places"
        );
        const srcPlacesSnap = await getDocs(srcPlacesCol);
        const placeDocs = srcPlacesSnap.docs;

        for (let i = 0; i < placeDocs.length; i += 450) {
          const batch = writeBatch(db);
          const chunk = placeDocs.slice(i, i + 450);
          chunk.forEach((d) => {
            const dstPlaceRef = doc(
              db,
              "user_trips",
              userObj.uid,
              "trips",
              newId,
              "places",
              d.id
            );
            batch.set(dstPlaceRef, d.data());
          });
          await batch.commit();
        }

        await fetchTrips(userObj);
        alert("복사 완료!");
      } catch (e) {
        console.error(e);
        alert("복사 중 오류가 발생했어요.");
      } finally {
        setBusyId(null);
      }
    },
    [userObj, fetchTrips]
  );

  // ---- 여행 삭제 (trips_log/* + trips/* + trips/*/places/*) ----
  const handleDelete = useCallback(
    async (tripId) => {
      if (!userObj) return;
      if (
        !window.confirm(
          `'${tripId}' 여행을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
        )
      )
        return;

      try {
        setBusyId(tripId);

        // 1) trips_log/{tripId}/days/* 삭제
        const daysCol = collection(
          db,
          "user_trips",
          userObj.uid,
          "trips_log",
          tripId,
          "days"
        );
        const daysSnap = await getDocs(daysCol);
        const dayDocs = daysSnap.docs;

        for (let i = 0; i < dayDocs.length; i += 450) {
          const batch = writeBatch(db);
          const chunk = dayDocs.slice(i, i + 450);
          chunk.forEach((d) => {
            batch.delete(
              doc(
                db,
                "user_trips",
                userObj.uid,
                "trips_log",
                tripId,
                "days",
                d.id
              )
            );
          });
          await batch.commit();
        }

        // 2) /trips/{tripId}/places/* 삭제
        const placesCol = collection(
          db,
          "user_trips",
          userObj.uid,
          "trips",
          tripId,
          "places"
        );
        const placesSnap = await getDocs(placesCol);
        const placeDocs = placesSnap.docs;

        for (let i = 0; i < placeDocs.length; i += 450) {
          const batch = writeBatch(db);
          const chunk = placeDocs.slice(i, i + 450);
          chunk.forEach((d) => {
            batch.delete(
              doc(
                db,
                "user_trips",
                userObj.uid,
                "trips",
                tripId,
                "places",
                d.id
              )
            );
          });
          await batch.commit();
        }

        // 3) 상위 문서 삭제
        await deleteDoc(
          doc(db, "user_trips", userObj.uid, "trips_log", tripId)
        );
        await deleteDoc(doc(db, "user_trips", userObj.uid, "trips", tripId));

        await fetchTrips(userObj);
        alert("삭제 완료!");
      } catch (e) {
        console.error(e);
        alert("삭제 중 오류가 발생했어요.");
      } finally {
        setBusyId(null);
      }
    },
    [userObj, fetchTrips]
  );

  // ---- 정렬/검색 ----
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
      {/* 상단 헤더(로고/새경로 버튼) — 클래스는 dayoung CSS 기준 */}
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

      {/* 헤더(검색/정렬) */}
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
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
              >
                <option value="updated">최신 순</option>
                <option value="title">제목</option>
                <option value="days">날짜 수</option>
              </select>
              <RiArrowDropDownLine className="jl-select-icon" />
            </div>

            <button
              className="jl-btn jl-ghost"
              onClick={() =>
                setSortDir((d) => (d === "asc" ? "desc" : "asc"))
              }
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
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate("/journey", { state: { loadTitle: t.id } })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  navigate("/journey", { state: { loadTitle: t.id } });
              }}
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

              {/* 카드 하단 기록/복사/삭제 (HEAD 기능 유지) */}
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="jl-btn jl-ghost"
                  title="이 여행을 기록하기"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/save_travel", { state: { loadTitle: t.id } });
                  }}
                >
                  <FiFileText /> 기록
                </button>

                <button
                  className="jl-btn jl-ghost"
                  style={{ padding: "6px 8px", fontSize: "12px" }}
                  title="복사"
                  disabled={busyId === t.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(t.id);
                  }}
                >
                  <FiCopy />
                </button>

                <button
                  className="jl-btn jl-ghost"
                  style={{
                    padding: "6px 8px",
                    fontSize: "12px",
                    color: "#dc2626",
                  }}
                  title="삭제"
                  disabled={busyId === t.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t.id);
                  }}
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
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
