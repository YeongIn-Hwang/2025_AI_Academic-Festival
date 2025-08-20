// src/pages/Journey.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { throttle } from "lodash";
import { RiArrowDropDownLine } from "react-icons/ri";
import "../styles/Journey.css";

const TRACK_HEIGHT = 800;   // 세로 트랙 높이(px)
const DAY_COL_WIDTH = 360;

const MIN_SLOT = 30; // 분
const SNAP = 15;     // 분

export default function Journey() {
  const navigate = useNavigate();
  const location = useLocation();
  const loadTitle = location.state?.loadTitle || null;
  const [loading, setLoading] = useState(true);

  // 기본 입력
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("2");

  // 신규 입력
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("22:00");
  const [startLocation, setStartLocation] = useState("");
  const [lodging, setLodging] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [focusType, setFocusType] = useState("attraction");

  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // 타임라인 & 편집 상태
  const [timelineDays, setTimelineDays] = useState([]);
  const [editMode, setEditMode] = useState(false);    // 삭제 모드
  const [splitMode, setSplitMode] = useState(false);  // 분할 모드
  const [mergeMode, setMergeMode] = useState(false);  // 병합 모드

  // 추가 모드 & 후보 패널
  const [addMode, setAddMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // {date,start,end}
  const [placeTypeFilter, setPlaceTypeFilter] = useState("all");
  const [placeOptions, setPlaceOptions] = useState([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = () => setSidebarOpen((v) => !v);

  const API_BASE =
      (import.meta?.env?.VITE_API_URL) ||
      process.env.REACT_APP_API_URL ||
      "http://localhost:8000";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/login");
      else setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!loadTitle) return;
    (async () => {
      try {
        await loadSavedTrip(loadTitle);
      } catch (e) {
        console.warn("[Journey] loadSavedTrip error:", e);
        alert("저장된 여행을 불러오지 못했어요.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTitle, loading]);

  // Firestore에 동일 title 존재 여부 확인
  const checkTripExists = async (uid, tripTitle) => {
    try {
      const ref = doc(db, "user_trips", uid, "trips", tripTitle.trim());
      const snap = await getDoc(ref);
      return snap.exists();
    } catch (e) {
      console.warn("[Journey] checkTripExists error:", e);
      return false;
    }
  };

  const asTimeline = (data) => {
    if (data?.tables && typeof data.tables === "object") {
      return Object.keys(data.tables)
          .sort()
          .map((date) => ({
            date,
            weekday: data.tables[date].weekday || "",
            events: (data.tables[date].schedule || []).map((s) => ({
              title: s.title,
              start: s.start,
              end: s.end,
              type: s.place_type || s.type || "etc",
              place_id: s.place_id ?? null,
              lat: typeof s.lat === "number" ? s.lat : (s.location_info?.lat ?? null),
              lng: typeof s.lng === "number" ? s.lng : (s.location_info?.lng ?? null),
              locked: s.locked === true,
            })),
          }));
    }
    if (Array.isArray(data?.timeline)) return data.timeline;
    return [];
  };

  const toTables = (days = []) => {
    const tables = {};
    for (const d of days) {
      tables[d.date] = {
        weekday: d.weekday || "",
        schedule: (d.events || []).map((e) => ({
          title: e.title ?? null,
          start: e.start,
          end: e.end,
          place_type: e.title ? (e.type || "etc") : null,
          place_id: e.place_id ?? null,
          lat: typeof e.lat === "number" ? e.lat : (e.lat != null ? Number(e.lat) : null),
          lng: typeof e.lng === "number" ? e.lng : (e.lng != null ? Number(e.lng) : null),
        })),
      };
    }
    return tables;
  };

  const basePayload = useMemo(() => {
    const user = auth.currentUser;
    return user
        ? {
          uid: user.uid,
          title: title.trim(),
          query: query.trim(),
          method: Number(method),
          start_date: startDate,
          end_date: endDate,
          start_time: startTime,
          end_time: endTime,
          start_location: startLocation.trim(),
          lodging: lodging.trim(),
          end_location: endLocation.trim(),
          focus_type: focusType,
        }
        : null;
  }, [
    title, query, method,
    startDate, endDate, startTime, endTime,
    startLocation, lodging, endLocation, focusType
  ]);

  const loadSavedTrip = async (tripTitle) => {
    const user = auth.currentUser;
    if (!user || !tripTitle) return;

    const daysCol = collection(db, "user_trips", user.uid, "trips_log", tripTitle, "days");
    const snap = await getDocs(daysCol);

    const rows = snap.docs
        .map(d => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a,b) => a.id.localeCompare(b.id));

    const days = rows.map(row => ({
      date: row.id,
      weekday: row.weekday || "",
      events: (row.schedule || []).map(s => ({
        title: s.title ?? null,
        start: s.start,
        end: s.end,
        type: s.place_type || s.type || "etc",
        place_id: s.place_id ?? null,
        lat: typeof s.lat === "number" ? s.lat : (s.lat != null ? Number(s.lat) : null),
        lng: typeof s.lng === "number" ? s.lng : (s.lng != null ? Number(s.lng) : null),
        locked: ["start","end","accommodation"].includes(s.place_type || s.type),
      })),
    }));

    setTitle(tripTitle);
    setTimelineDays(days);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    if (!title.trim()) return alert("여행 제목을 입력하세요.");
    if (!query.trim()) return alert("지역(기점)을 입력하세요.");
    if (!startDate || !endDate) return alert("시작/종료 날짜를 선택하세요.");
    if (!startTime || !endTime) return alert("시작/종료 시간을 입력하세요.");
    if (!startLocation.trim() || !endLocation.trim())
      return alert("시작/종료 위치를 입력하세요.");

    try {
      setSubmitting(true);
      const payload = { ...basePayload, uid: user.uid };

      const alreadyExists = await checkTripExists(user.uid, title);
      if (!alreadyExists) {
        const res = await fetch(`${API_BASE}/places_build_save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          alert("로그인이 만료되었습니다. 다시 로그인해 주세요.");
          navigate("/login");
          return;
        }
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          console.error(msg);
          alert("서버 오류: " + msg);
          return;
        }
        await res.text().catch(() => "");
      }

      setPreparing(true);
      const prepBasic = await fetch(`${API_BASE}/routes/prepare_basic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!prepBasic.ok) {
        const msg = await prepBasic.text().catch(() => "");
        console.error(msg);
        alert("경로 생성 실패: " + msg);
        return;
      }
      const basicData = await prepBasic.json();
      setTimelineDays(asTimeline(basicData));

      setOptimizing(true);
      const prepDqn = await fetch(`${API_BASE}/routes/prepare_dqn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (prepDqn.ok) {
        const dqnData = await prepDqn.json();
        const dqnDays = asTimeline(dqnData);
        if (dqnDays.length > 0) setTimelineDays(dqnDays);
      } else {
        const msg = await prepDqn.text().catch(() => "");
        console.warn("DQN 실패:", msg);
      }
    } catch (err) {
      console.error(err);
      alert("요청 실패: " + (err?.message || String(err)));
    } finally {
      setPreparing(false);
      setOptimizing(false);
      setSubmitting(false);
    }
  };

  // —— 모드 토글
  const toggleEdit = () =>
      setEditMode((v) => {
        const next = !v;
        if (next) { setSplitMode(false); setAddMode(false); setMergeMode(false); }
        return next;
      });
  const toggleSplit = () =>
      setSplitMode((v) => {
        const next = !v;
        if (next) { setEditMode(false); setAddMode(false); setMergeMode(false); }
        return next;
      });
  const toggleMerge = () =>
      setMergeMode((v) => {
        const next = !v;
        if (next) { setEditMode(false); setAddMode(false); setSplitMode(false); }
        return next;
      });
  const toggleAdd = () =>
      setAddMode((v) => {
        const next = !v;
        if (next) { setEditMode(false); setSplitMode(false); setMergeMode(false); }
        if (!next) { setPickerOpen(false); setPickerTarget(null); }
        return next;
      });

  // —— 프런트 유틸
  const toMin = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const roundTo = (mins, base = SNAP) => Math.round(mins / base) * base;

  // —— 드래그 커밋
  const applyTimeChange = React.useCallback((date, idx, newStartHHMM, newEndHHMM) => {
    setTimelineDays(prev =>
        prev.map(day => {
          if (day.date !== date) return day;
          const events = [...day.events].sort((a, b) => toMin(a.start) - toMin(b.start));
          const curOrig = events[idx];
          if (!curOrig) return day;

          const isFixedType = (t) => ["start", "end", "accommodation"].includes(t);
          if (isFixedType(curOrig.type)) return day;

          const cur = { ...curOrig };

          let ns = toMin(newStartHHMM);
          let ne = toMin(newEndHHMM);
          if (ne - ns < MIN_SLOT) ne = ns + MIN_SLOT;

          const prevIdx = idx > 0 ? idx - 1 : null;
          const nextIdx = idx < events.length - 1 ? idx + 1 : null;

          const prevEv = prevIdx != null ? { ...events[prevIdx] } : null;
          const nextEv = nextIdx != null ? { ...events[nextIdx] } : null;

          if (nextEv) {
            if (!isFixedType(nextEv.type)) {
              const minNextEnd = toMin(nextEv.end);
              if (ne > toMin(cur.end)) {
                let diff = ne - toMin(cur.end);
                let newNextStart = toMin(nextEv.start) + diff;
                if (minNextEnd - newNextStart < MIN_SLOT) {
                  newNextStart = minNextEnd - MIN_SLOT;
                  ne = newNextStart;
                }
                nextEv.start = toHHMM(newNextStart);
              }
              if (ne < toMin(cur.end)) {
                let diff = toMin(cur.end) - ne;
                let newNextStart = toMin(nextEv.start) - diff;
                if (newNextStart < ns) newNextStart = ns;
                nextEv.start = toHHMM(newNextStart);
              }
            } else {
              ne = Math.min(ne, toMin(nextEv.start));
              if (ne - ns < MIN_SLOT) ns = ne - MIN_SLOT;
            }
          }

          if (prevEv) {
            if (!isFixedType(prevEv.type)) {
              if (ns < toMin(cur.start)) {
                const diff = toMin(cur.start) - ns;
                const prevStart = toMin(prevEv.start);
                let newPrevEnd = toMin(prevEv.end) - diff;
                if (newPrevEnd - prevStart < MIN_SLOT) {
                  newPrevEnd = prevStart + MIN_SLOT;
                  ns = newPrevEnd;
                }
                if (ne - ns < MIN_SLOT) ns = ne - MIN_SLOT;
                prevEv.end = toHHMM(newPrevEnd);
              }
              if (ns > toMin(cur.start)) {
                let diff = ns - toMin(cur.start);
                let newPrevEnd = toMin(prevEv.end) + diff;
                if (toMin(cur.end) - newPrevEnd < MIN_SLOT) {
                  newPrevEnd = toMin(cur.end) - MIN_SLOT;
                  ns = newPrevEnd;
                }
                prevEv.end = toHHMM(newPrevEnd);
              }
            } else {
              ns = Math.max(ns, toMin(prevEv.end));
              if (ne - ns < MIN_SLOT) ne = ns + MIN_SLOT;
            }
          }

          cur.start = toHHMM(ns);
          cur.end   = toHHMM(ne);
          events[idx] = cur;
          if (prevEv) events[prevIdx] = prevEv;
          if (nextEv) events[nextIdx] = nextEv;

          return { ...day, events };
        })
    );
  }, []);

  const throttledDrag = useMemo(
      () => throttle((date, idx, s, e) => applyTimeChange(date, idx, s, e), 50),
      [applyTimeChange]
  );
  useEffect(() => () => throttledDrag.cancel(), [throttledDrag]);

  const handleSaveLog = async () => {
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");
    if (!title.trim()) return alert("여행 제목을 입력하세요.");
    if (!Array.isArray(timelineDays) || timelineDays.length === 0) {
      return alert("저장할 일정이 없습니다.");
    }

    try {
      const batch = writeBatch(db);

      const tripRef = doc(db, "user_trips", user.uid, "trips_log", title.trim());

      const daysColRef = collection(tripRef, "days");
      const existingSnap = await getDocs(daysColRef);
      const existingIds = new Set(existingSnap.docs.map(d => d.id));

      const newIds = new Set(timelineDays.map(d => d.date));

      existingSnap.docs.forEach(d => {
        if (!newIds.has(d.id)) {
          batch.delete(d.ref);
        }
      });

      timelineDays.forEach((day) => {
        const dateId = day.date;
        const dayRef = doc(daysColRef, dateId);

        const schedule = (day.events || []).map((e) => ({
          title: e?.title ?? null,
          start: e?.start ?? null,
          end:   e?.end   ?? null,
          place_type: e?.type ?? null,
          place_id: e?.place_id ?? null,
          lat: typeof e?.lat === "number" ? e.lat : (e?.lat != null ? Number(e.lat) : null),
          lng: typeof e?.lng === "number" ? e.lng : (e?.lng != null ? Number(e.lng) : null),
        }));

        batch.set(dayRef, {
          date: dateId,
          weekday: day.weekday ?? "",
          schedule,
          saved_at: serverTimestamp(),
        });
      });

      const firstDate = timelineDays[0]?.date ?? null;
      const lastDate  = timelineDays[timelineDays.length - 1]?.date ?? null;

      batch.set(tripRef, {
        title: title.trim(),
        day_count: timelineDays.length,
        first_date: firstDate,
        last_date: lastDate,
        updated_at: serverTimestamp(),
      }, { merge: true });

      await batch.commit();
      alert("일정을 날짜별로 저장했습니다!");
    } catch (err) {
      console.error("[Journey] handleSaveLog error:", err);
      alert("일정 저장 실패: " + (err?.message || String(err)));
    }
  };

  const handleDeleteSlot = (date, ev) => {
    if (["start", "end", "accommodation"].includes(ev.type)) {
      return alert("시작/종료/숙소 블록은 삭제할 수 없어요.");
    }
    setTimelineDays((prev) =>
        prev.map((d) => {
          if (d.date !== date) return d;
          return {
            ...d,
            events: d.events.map((e) =>
                e.start === ev.start && e.end === ev.end
                    ? { ...e, title: null, type: null, place_id: null, lat: null, lng: null }
                    : e
            ),
          };
        })
    );
  };

  const handleSplitSlot = (date, ev) => {
    if (["start", "end", "accommodation"].includes(ev.type)) {
      return alert("시작/종료/숙소 블록은 분할할 수 없어요.");
    }
    const s = toMin(ev.start);
    const e = toMin(ev.end);
    if (e - s < 60) return alert("분할하려면 최소 60분 이상이어야 해요.");

    let mid = roundTo((s + e) / 2, 15);
    const leftMin = s + 30;
    const rightMin = e - 30;
    mid = Math.max(leftMin, Math.min(rightMin, mid));

    setTimelineDays((prev) =>
        prev.map((d) => {
          if (d.date !== date) return d;
          const events = [];
          d.events.forEach((x) => {
            if (x.start === ev.start && x.end === ev.end) {
              events.push({ title: null, start: ev.start, end: toHHMM(mid), type: "etc", place_id:null, lat:null, lng:null });
              events.push({ title: null, start: toHHMM(mid), end: ev.end,  type: "etc", place_id:null, lat:null, lng:null });
            } else {
              events.push(x);
            }
          });
          return { ...d, events };
        })
    );
  };

  const handlePickTarget = (date, ev) => {
    if (!addMode) return;
    if (["start", "end", "accommodation"].includes(ev.type)) return;
    if (ev.title) return;
    setPickerTarget({ date, start: ev.start, end: ev.end });
    setPickerOpen(true);
  };

  const loadPlaces = async () => {
    const user = auth.currentUser;
    if (!user || !title.trim()) return;
    try {
      setLoadingPlaces(true);
      const col = collection(db, "user_trips", user.uid, "trips", title.trim(), "places");
      const snap = await getDocs(col);
      let rows = snap.docs.map((d) => {
        const p = d.data() || {};
        const score =
            (typeof p.total_score === "number" ? p.total_score : null) ??
            (typeof p.value_score === "number" ? p.value_score : null) ??
            (typeof p.trust_score === "number" ? p.trust_score : 0);
        return {
          id: d.id,
          place_id: p.place_id ?? null,
          name: p.name ?? "(이름 없음)",
          type: p.type || "etc",
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          vicinity: p.vicinity ?? "",
          business_status: p.business_status ?? "",
          open_now: typeof p.open_now === "boolean" ? p.open_now : null,
          rating: typeof p.rating === "number" ? p.rating : null,
          user_ratings_total: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
          trust_score: typeof p.trust_score === "number" ? p.trust_score : null,
          hope_score: typeof p.hope_score === "number" ? p.hope_score : null,
          nonhope_score: typeof p.nonhope_score === "number" ? p.nonhope_score : null,
          totalScore: score,
        };
      });

      if (placeTypeFilter !== "all") {
        rows = rows.filter((r) => r.type === placeTypeFilter);
      }

      rows.sort((a, b) => (b.totalScore ?? -1e9) - (a.totalScore ?? -1e9));
      setPlaceOptions(rows);
    } catch (e) {
      console.warn("[Journey] loadPlaces error:", e);
      setPlaceOptions([]);
    } finally {
      setLoadingPlaces(false);
    }
  };

  useEffect(() => {
    if (pickerOpen) loadPlaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, placeTypeFilter, title]);

  const handleApplyPlaceToSlot = (place) => {
    const tgt = pickerTarget;
    if (!tgt) return;

    setTimelineDays((prev) =>
        prev.map((d) => {
          if (d.date !== tgt.date) return d;
          return {
            ...d,
            events: d.events.map((e) =>
                e.start === tgt.start && e.end === tgt.end
                    ? {
                      ...e,
                      title: place.name,
                      type: place.type || "etc",
                      place_id: place.place_id ?? null,
                      lat: typeof place.lat === "number" ? place.lat : null,
                      lng: typeof place.lng === "number" ? place.lng : null,
                    }
                    : e
            ),
          };
        })
    );

    setPickerOpen(false);
    setPickerTarget(null);
    setAddMode(false);
  };

  const handleMergeSlots = (date, firstIdx, secondIdx) => {
    setTimelineDays(prev =>
        prev.map(d => {
          if (d.date !== date) return d;

          const events = [...d.events].sort((a,b)=>toMin(a.start)-toMin(b.start));
          if (Math.abs(firstIdx - secondIdx) !== 1) {
            alert("인접한 슬롯만 병합할 수 있어요.");
            return d;
          }

          const first  = events[firstIdx];
          const second = events[secondIdx];
          if (!first || !second) return d;

          if (
              ["start","end","accommodation"].includes(first?.type) ||
              ["start","end","accommodation"].includes(second?.type)
          ) {
            alert("시작/종료/숙소 블록은 병합할 수 없어요.");
            return d;
          }

          const winner = first;
          const merged = {
            title: winner.title ?? null,
            type:  winner.type  || "etc",
            place_id: winner.place_id ?? null,
            lat: winner.lat ?? null,
            lng: winner.lng ?? null,
            start: toHHMM(Math.min(toMin(first.start),  toMin(second.start))),
            end:   toHHMM(Math.max(toMin(first.end),    toMin(second.end))),
          };

          const keep = events.filter((_, k) => k !== firstIdx && k !== secondIdx);
          const insertAt = Math.min(firstIdx, secondIdx);
          keep.splice(insertAt, 0, merged);
          return { ...d, events: keep };
        })
    );
  };

  const handleRegenerate = async () => {
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");
    if (!basePayload) return;

    try {
      setOptimizing(true);
      const client_tables = toTables(timelineDays);
      const res = await fetch(`${API_BASE}/routes/prepare_dqn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, client_tables }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "서버 오류");
      }
      const data = await res.json();
      const days = asTimeline(data);
      if (days.length > 0) setTimelineDays(days);
      setEditMode(false);
      setSplitMode(false);
      setMergeMode(false);
    } catch (e) {
      console.error(e);
      alert("경로 재생성 실패: " + (e?.message || String(e)));
    } finally {
      setOptimizing(false);
    }
  };

  if (loading) return <div>로딩 중...</div>;

  return (
      <>
      {/* 상단 헤더 */}
      <header className="jr-topbar">
        <div className="jr-topbar-inner">
          <h1 className="jr-logo" onClick={() => navigate("/home")}>
            Boyage
          </h1>
          <div className="jr-actions">
            <button
                onClick={() => navigate("/home")}
                className="btn btn-primary"
                title="홈 화면으로 이동합니다"
            >
              홈으로
            </button>
            <button
                onClick={handleSaveLog}
                disabled={preparing || optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                title="현재 타임라인을 날짜별로 Firestore에 저장합니다"
            >
              일정 저장
            </button>
            <button
                onClick={toggleAdd}
                disabled={preparing || optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                style={{ color: addMode ? "#3884FF" : "black" }}
                title="빈칸을 클릭해 직접 장소를 추가합니다"
            >
              {addMode ? "일정 추가 모드 종료" : "일정 추가"}
            </button>
          <button
                onClick={toggleEdit}
                disabled={preparing || optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                style={{ color: editMode ? "#ef4444" : "black" }}
                title="슬롯을 빈칸으로 바꿉니다"
            >
              {editMode ? "삭제 모드 종료" : "삭제 모드"}
            </button>
            <button
                onClick={toggleSplit}
                disabled={preparing || optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                style={{ color: splitMode ? "#5b21b6" : "black" }}
                title="슬롯을 둘로 쪼개기"
            >
              {splitMode ? "분할 모드 종료" : "분할 모드"}
            </button>
            <button
                onClick={toggleMerge}
                disabled={preparing || optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                style={{ color: mergeMode ? "orange" : "black" }}
                title="인접한 두 슬롯 병합 (첫번째 클릭한 슬롯이 승자)"
            >
              {mergeMode ? "병합 모드 종료" : "병합 모드"}
            </button>
            <button
                onClick={handleRegenerate}
                disabled={optimizing || timelineDays.length === 0}
                className="btn btn-primary"
                style={{ color: optimizing ? "#3884FF" : "black" }}
                title="지금 보이는 테이블 그대로 서버에 보내서 재배치합니다"
            >
              {optimizing ? "DQN 재생성 중..." : "경로 재생성"}
            </button>

          </div>
          <div className={"header-divider"}/>
        </div>
      </header>
      <div
          className="jr-wrap"
          style={{
            gridTemplateColumns: sidebarOpen ? "320px 1fr" : "0px 1fr",
            transition: "grid-template-columns .25s ease",
            position: "relative",
          }}
      >
        {/* 사이드바 토글 핸들 */}
        <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "세부정보 닫기" : "세부정보 열기"}
            title={sidebarOpen ? "세부정보 닫기" : "세부정보 열기"}
            className={`jr-handle ${sidebarOpen ? "is-open" : ""}`}
            style={{ left: sidebarOpen ? 320 : 40 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {sidebarOpen ? (
                <path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            ) : (
                <path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            )}
          </svg>
        </button>

        {/* 좌측 네비 (STEP 1) */}
        <aside
            className={`jr-sidebar ${sidebarOpen ? "is-open" : "is-closed"}`}
            aria-hidden={!sidebarOpen}
        >
          {sidebarOpen && (
              <>
                <h3 className="jr-step-title">여행 정보 입력</h3>

                <form onSubmit={handleSubmit} className="jr-form-grid">
                  <Field label="여행 제목">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="예) 나의 여름 제주 여행"
                        disabled={submitting || preparing || optimizing}
                        className="jr-input"
                    />
                  </Field>

                  <Field label="지역(기점)">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="예) 제주시청, 서귀포, 신도림역"
                        disabled={submitting || preparing || optimizing}
                        className="jr-input"
                    />
                  </Field>

                  <Field label="이동 방식">
                    <div className="jr-select-wrapper">
                      <select
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                          disabled={submitting || preparing || optimizing}
                          className="jr-input jr-select"
                      >
                        <option value="1">도보 (반경 3km)</option>
                        <option value="2">대중교통 (반경 15km)</option>
                        <option value="3">직접 운전 (반경 30km)</option>
                      </select>
                      <RiArrowDropDownLine className="jr-select-icon" />
                    </div>
                  </Field>

                  {/* 날짜/시간 */}
                  <div className="jr-grid-2">
                    <Field label="시작 날짜">
                      <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={submitting || preparing || optimizing}
                          className="jr-input"
                      />
                    </Field>
                    <Field label="종료 날짜">
                      <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          disabled={submitting || preparing || optimizing}
                          className="jr-input"
                      />
                    </Field>
                  </div>

                  <div className="jr-grid-2">
                    <Field label="시작 시간">
                      <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          disabled={submitting || preparing || optimizing}
                          className="jr-input"
                      />
                    </Field>
                    <Field label="종료 시간">
                      <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          disabled={submitting || preparing || optimizing}
                          className="jr-input"
                      />
                    </Field>
                  </div>

                  <Field label="시작 위치">
                    <input
                        type="text"
                        value={startLocation}
                        onChange={(e) => setStartLocation(e.target.value)}
                        placeholder="예) 김포공항, 제주시청"
                        disabled={submitting || preparing || optimizing}
                        className="jr-input"
                    />
                  </Field>

                  <Field label="숙소(옵션)">
                    <input
                        type="text"
                        value={lodging}
                        onChange={(e) => setLodging(e.target.value)}
                        placeholder="예) OO호텔 제주점"
                        disabled={submitting || preparing || optimizing}
                        className="jr-input"
                    />
                  </Field>

                  <Field label="종료 위치">
                    <input
                        type="text"
                        value={endLocation}
                        onChange={(e) => setEndLocation(e.target.value)}
                        placeholder="예) 제주공항, 서귀포버스터미널"
                        disabled={submitting || preparing || optimizing}
                        className="jr-input"
                    />
                  </Field>

                  <Field label="여행 성향">
                    <div className="jr-grid-2 gap-8">
                      <Radio label="명소 중심" name="focus" value="attraction" checked={focusType === "attraction"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
                      <Radio label="식사 중심" name="focus" value="food" checked={focusType === "food"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
                      <Radio label="카페·빵집 중심" name="focus" value="cafe" checked={focusType === "cafe"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
                      <Radio label="쇼핑 중심" name="focus" value="shopping" checked={focusType === "shopping"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
                    </div>
                  </Field>

                  <button type="submit" disabled={submitting || preparing || optimizing} className="btn-primary_main">
                    {submitting || preparing || optimizing ? "처리 중..." : "저장 & 경로 생성"}
                  </button>
                </form>
              </>
          )}
        </aside>

        {/* 우측 콘텐츠 (STEP 2) */}
        <main className="jr-main">
          <div className="jr-header-row">
            <div>
              <div className="jr-title-lg">AI 경로 추천</div>
            </div>
          </div>
          {/* ✅ 카드 + 사진 2컬럼 래퍼로 감싸기 */}
          <div className="jr-stage-flex">
            {/* 왼쪽: 타임라인 카드 */}
            <section className="jr-stage-card">
              {preparing && <div className="jr-note">기초 테이블 생성 중...</div>}
              {optimizing && <div className="jr-note">DQN 최적화 중...</div>}

              {timelineDays.length === 0 ? (
                  <div className="placeholder"><div>아직 생성된 일정이 없습니다.</div></div>
              ) : (
                  /* ✅ 가로 스크롤 전용 래퍼로 교체 (원래 jr-grid 사용하던 자리) */
                  <div className={`tl-scroll ${pickerOpen ? "has-panel" : ""}`}>
                    <Timeline
                        days={timelineDays}
                        editable={editMode}
                        splitable={splitMode}
                        pickable={addMode}
                        onDelete={handleDeleteSlot}
                        onSplit={handleSplitSlot}
                        onPick={handlePickTarget}
                        onDragCommit={throttledDrag}
                        mergeable={mergeMode}
                        onMerge={handleMergeSlots}
                    />

                    {pickerOpen && (
                        <AddPlacePanel
                            placeTypeFilter={placeTypeFilter}
                            setPlaceTypeFilter={setPlaceTypeFilter}
                            loading={loadingPlaces}
                            places={placeOptions}
                            onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
                            onChoose={handleApplyPlaceToSlot}
                        />
                    )}
                  </div>
              )}
            </section>

            {/* ✅ 오른쪽: 사진(카드 밖, 화면 꽉 채우는 컬럼) */}
            <aside className="jr-right-photo">
              {/* 원하는 이미지 경로 */}

            </aside>
          </div>
        </main>
      </div>
      </>
  );
}

/* ---------- 작은 UI 헬퍼 ---------- */
function Field({ label, children }) {
  return (
      <div>
        <label className="jr-label">{label}</label>
        {children}
      </div>
  );
}

function Radio({ label, name, value, checked, onChange, disabled }) {
  return (
      <label className="jr-radio">
        <input
            type="radio"
            name={name}
            value={value}
            checked={checked}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
        />
        <span>{label}</span>
      </label>
  );
}

/* ---------- 우측 후보 패널 ---------- */
function AddPlacePanel({ placeTypeFilter, setPlaceTypeFilter, loading, places, onClose, onChoose }) {
  return (
      <aside className="panel">
        <div className="panel-header">
          <div className="fw-700">후보 선택</div>
          <button onClick={onClose} className="panel-close">닫기</button>
        </div>

        <div className="mb-8">
          <label className="panel-label">타입 필터</label>
          <select
              value={placeTypeFilter}
              onChange={(e) => setPlaceTypeFilter(e.target.value)}
              className="jr-input"
          >
            <option value="all">전체</option>
            <option value="tourist_attraction">명소</option>
            <option value="restaurant">식당</option>
            <option value="cafe">카페</option>
            <option value="bakery">빵집</option>
            <option value="bar">바</option>
            <option value="shopping_mall">쇼핑</option>
          </select>
        </div>

        <div className="panel-count">
          {loading ? "불러오는 중..." : `총 ${places.length}개`}
        </div>

        <div className="panel-list">
          {loading ? (
              <div className="placeholder">목록 로딩 중…</div>
          ) : places.length === 0 ? (
              <div className="placeholder">해당 타입 후보가 없습니다.</div>
          ) : (
              places.map((p) => (
                  <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onChoose?.(p)}
                      onKeyDown={(e) => { if (e.key === "Enter") onChoose?.(p); }}
                      className="panel-item"
                      title={`${p.name} · 점수 ${fmtScore(p.totalScore)}`}
                  >
                    <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          window.open(mapsSearchUrl(p.name, p.vicinity), "_blank", "noopener");
                        }}
                        className="panel-detail-btn"
                        title="Google 지도에서 보기"
                        aria-label="Google 지도에서 보기"
                    >
                      상세
                    </button>

                    <div className="panel-item-top">
                      <div className="panel-item-name">{p.name}</div>
                    </div>

                    <div className="panel-item-mid">
                      <StarRating value={p.rating} />
                      <div className="panel-text-sm">{p.rating ? p.rating.toFixed(1) : "N/A"}</div>
                      <div className="panel-text-sm">· 리뷰 {p.user_ratings_total ?? 0}</div>
                      <div className="panel-text-sm">· {typeLabel(p.type)}</div>
                    </div>

                    {p.vicinity && (
                        <div className="panel-vicinity">
                          {p.vicinity}
                        </div>
                    )}
                    <div className="panel-scores">
                      희망 {fmtScore(p.hope_score)} · 비희망 {fmtScore(p.nonhope_score)}
                    </div>
                  </div>
              ))
          )}
        </div>
      </aside>
  );
}

function fmtScore(v) {
  if (v == null) return "0.0";
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);
  return num.toFixed(2);
}
function typeLabel(t) {
  const map = {
    tourist_attraction: "명소",
    restaurant: "식당",
    cafe: "카페",
    bakery: "빵집",
    bar: "바",
    shopping_mall: "쇼핑",
    start: "출발",
    end: "도착",
    accommodation: "숙소",
    etc: "기타",
  };
  return map[t] || "기타";
}
function mapsSearchUrl(name, vicinity) {
  const q = [name, vicinity].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function mapsUrlFromEvent(ev) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.title || "")}`;
}
function StarRating({ value, size = 12 }) {
  const v = Math.max(0, Math.min(5, Number(value ?? 0)));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  const star = "★";
  const hollow = "☆";
  const halfChar = "⯪";
  const part = [];
  for (let i = 0; i < full; i++) part.push(<span key={`f${i}`}>{star}</span>);
  if (half) part.push(<span key="h">{halfChar}</span>);
  for (let i = 0; i < empty; i++) part.push(<span key={`e${i}`}>{hollow}</span>);
  return (
      <span style={{ fontSize: size, lineHeight: 1, color: "#f59e0b" }}>
      {part}
    </span>
  );
}

/* ---------- 타임라인 ---------- */
function Timeline({ days, editable = false, splitable = false, pickable = false, mergeable = false, onDelete, onSplit, onPick, onDragCommit, onMerge }) {
  const trackRefs = useRef({});
  const [preview, setPreview] = useState({});
  const [mergeSel, setMergeSel] = useState(null);

  const toMin = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const snap = (mins) => Math.round(mins / SNAP) * SNAP;

  const getKey = (date, idx) => `${date}|${idx}`;

  const handleMouseDown = (e, day, events, idx, edge /* 'left' | 'right' */) => {
    const ev = events[idx];
    if (!ev || ["start","end","accommodation"].includes(ev.type)) return;

    const trackEl = trackRefs.current[day.date];
    if (!trackEl) return;

    const rect = trackEl.getBoundingClientRect();
    const totalPx = rect.height;
    const rangeStart = Math.max(0, Math.min(...events.map(x => toMin(x.start))) - 30);
    const rangeEnd   = Math.min(24*60, Math.max(...events.map(x => toMin(x.end))) + 30);
    const totalMin = Math.max(1, rangeEnd - rangeStart);

    const start0 = toMin(ev.start);
    const end0   = toMin(ev.end);
    const mouseStartY = e.clientY;

    const onMove = (me) => {
      const dyPx  = me.clientY - mouseStartY;
      const dyMin = (dyPx / totalPx) * totalMin;

      let ns = start0;
      let ne = end0;

      if (edge === "left") ns = snap(start0 + dyMin);
      else                 ne = snap(end0 + dyMin);

      if (ne - ns < MIN_SLOT) {
        if (edge === "left") ns = ne - MIN_SLOT;
        else                 ne = ns + MIN_SLOT;
      }

      ns = Math.max(0, Math.min(ns, 24 * 60 - MIN_SLOT));
      ne = Math.max(MIN_SLOT, Math.min(ne, 24 * 60));

      setPreview((p) => ({
        ...p,
        [getKey(day.date, idx)]: { start: toHHMM(ns), end: toHHMM(ne) },
      }));

      onDragCommit?.(day.date, idx, toHHMM(ns), toHHMM(ne));
    };

    const onUp = () => {
      setPreview((p) => {
        const n = { ...p };
        delete n[getKey(day.date, idx)];
        return n;
      });

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  };

  return (
      <div className="tl-day-list">
        {days.map((day) => {
          const events = day.events || [];
          if (events.length === 0) {
            return (
                <div key={day.date} className="day-block">
                  <DayHeader date={day.date} weekday={day.weekday} />
                  <div className="placeholder">이 날의 일정이 없습니다.</div>
                </div>
            );
          }

          const minStart = Math.min(...events.map((e) => toMin(e.start)));
          const maxEnd = Math.max(...events.map((e) => toMin(e.end)));
          const rangeStart = Math.max(0, minStart - 30);
          const rangeEnd = Math.min(24 * 60, maxEnd + 30);
          const total = Math.max(1, rangeEnd - rangeStart);

          return (
              <div key={day.date} className="day-block">
                <DayHeader date={day.date} weekday={day.weekday} />

                <div className="axis-col">
                  <span>{minLabel(rangeStart)}</span><p>~</p>
                  <span>{maxLabel(rangeEnd)}</span>
                </div>

                <div className="tl-row" style={{ height: TRACK_HEIGHT }}>
                  <div
                      className="tl-track"
                      style={{ width: DAY_COL_WIDTH }}
                      ref={(el) => { trackRefs.current[day.date] = el; }}
                  >
                    {(() => {
                      const ordered = [...events].sort((a,b)=>toMin(a.start)-toMin(b.start));
                      return ordered.map((e, idx) => {
                        const pv = preview[getKey(day.date, idx)];
                        const start = pv?.start || e.start;
                        const end   = pv?.end   || e.end;

                        const topPct = ((toMin(start) - rangeStart) / total) * 100;
                        const heightPct = ((toMin(end) - toMin(start)) / total) * 100;
                        const lockType = ["start", "end", "accommodation"].includes(e.type);

                        const GAP_PX = 3;
                        const gapPct = (GAP_PX / TRACK_HEIGHT) * 100;
                        const topWithGap = topPct + idx * gapPct;
                        const heightWithGap = Math.max(0, heightPct - gapPct);

                        const isEmpty = !e.title;
                        const showDelete = editable && !lockType;
                        const showSplit = splitable && !lockType;
                        const canPick = pickable && !lockType && isEmpty;

                        const slotClass = [
                          "tl-slot",
                          isEmpty ? "is-empty" : "",
                          lockType ? "is-locked" : "",
                          mergeable && mergeSel && mergeSel.date === day.date && mergeSel.idx === idx ? "is-selected" : ""
                        ].join(" ").trim();

                        return (
                            <div
                                key={`${e.start}-${e.end}-${idx}`}
                                className={slotClass}
                                title={`${e.title || "(빈칸)"} (${start}~${end})`}
                                onClick={() => {
                                  if (mergeable) {
                                    if (lockType) return;
                                    const curIdx = idx;
                                    if (!mergeSel) {
                                      setMergeSel({ date: day.date, idx: curIdx });
                                    } else {
                                      if (mergeSel.date !== day.date) {
                                        alert("같은 날짜의 인접 슬롯만 병합할 수 있어요.");
                                        setMergeSel(null);
                                        return;
                                      }
                                      if (Math.abs(mergeSel.idx - curIdx) !== 1) {
                                        alert("인접한 슬롯만 선택해 주세요.");
                                        setMergeSel(null);
                                        return;
                                      }
                                      onMerge?.(day.date, mergeSel.idx, idx);
                                      setMergeSel(null);
                                    }
                                    return;
                                  }
                                  if (canPick) {
                                    onPick?.(day.date, e);
                                    return;
                                  }
                                  if (e.title && !lockType) {
                                    const url = mapsUrlFromEvent(e);
                                    window.open(url, "_blank", "noopener");
                                  }
                                }}
                                style={{
                                  top: `${Math.max(0, topWithGap)}%`,
                                  height: `${Math.max(0, heightWithGap)}%`,
                                  ...barStyleByType(e.type),
                                }}
                            >
                              {!lockType && !mergeable && (
                                  <div
                                      onMouseDown={(me) => { me.stopPropagation(); handleMouseDown(me, day, ordered, idx, "left"); }}
                                      className="tl-slot-handle top"
                                      title="시작 시간을 드래그로 조절"
                                  />
                              )}

                              <strong className="time">{start}</strong>
                              <span className="slot-title">
                          {e.title || "빈 슬롯 (클릭하여 추가)"}
                        </span>

                              {showSplit && (
                                  <button
                                      onClick={(ev) => { ev.stopPropagation(); onSplit?.(day.date, e); }}
                                      className="btn btn-split"
                                      title="이 슬롯을 두 개로 분할"
                                  >
                                    분할
                                  </button>
                              )}

                              {showDelete && (
                                  <button
                                      onClick={(ev) => { ev.stopPropagation(); onDelete?.(day.date, e); }}
                                      className="btn btn-delete"
                                      title="이 슬롯을 빈칸으로"
                                  >
                                    삭제
                                  </button>
                              )}

                              {!lockType && !mergeable && (
                                  <div
                                      onMouseDown={(me) => { me.stopPropagation(); handleMouseDown(me, day, ordered, idx, "right"); }}
                                      className="tl-slot-handle bottom"
                                      title="종료 시간을 드래그로 조절"
                                  />
                              )}
                            </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
          );
        })}
      </div>
  );
}

function DayHeader({ date, weekday }) {
  return (
      <div className="day-header">
        <div className="day-date">{date}</div>
        {weekday && <div className="day-wd">{weekday}</div>}
      </div>
  );
}

function minLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function maxLabel(mins) { return minLabel(mins); }

function barStyleByType(type) {
  const map = {

    start: { background: null, border: "2px solid #5b21b6", color:"black"},
    end: { background: null, border: "2px solid #D63384", color:"black" },
    accommodation: { background: null, border: "2px solid #00C853", color:"black" },
    tourist_attraction: { background: null, border: "2px solid #3884FF", color:"black" },
    restaurant: { background: null, border: "2px solid #F0735B", color:"black" },
    cafe: { background: null, border: "2px solid #8B4513", color:"black"},
    bakery: { background: null, border: "2px solid #B8860B", color:"black"},
    bar: { background: null, border: "2px solid #EA4F85", color:"black" },
    shopping_mall: { background: null, border: "2px solid blue", color:"black"},
    etc: { background: null, border: "2px solid orange", color:"black"},
  };
  return map[type] || map.etc;
}
