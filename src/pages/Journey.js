// src/pages/Journey.js
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { throttle } from "lodash";
import "../styles/Journey.css";
import {RiArrowDropDownLine} from "react-icons/ri";

const TRACK_HEIGHT = 800;   // 세로 트랙 높이(px)
const DAY_COL_WIDTH = 360;
const AXIS_COL_WIDTH = 72;  // 세로 타임라인 축 너비(px)

const MIN_SLOT = 30; // 분
const SNAP = 15;     // 분

export default function Journey() {
  const navigate = useNavigate();
  const location = useLocation();
  const loadTitle = location.state?.loadTitle || null;
  const [loading, setLoading] = useState(true);
  const [saveMode, setSaveMode] = useState(false);
  const [settingMode, setSettingMode] = useState(false);

  // 기본 입력(상태는 유지: 재생성 등에 사용)
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("2");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("22:00");
  const [startLocation, setStartLocation] = useState("");
  const [lodging, setLodging] = useState("");
  const [endLocation, setEndLocation] = useState("");
  const [focusType, setFocusType] = useState("attraction");

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

  // 일차 보기
  const [dayView, setDayView] = useState("all");

  // ⬇ “일차 번호”를 day 객체에 주입 (사이드바 i를 재활용)
  const displayedDays = useMemo(() => {
    if (dayView === "all") {
      return timelineDays.map((d, i) => ({ ...d, _dayNum: i + 1 }));
    }
    const idx = Number(dayView);
    if (Number.isInteger(idx) && timelineDays[idx]) {
      return [{ ...timelineDays[idx], _dayNum: idx + 1 }];
    }
    return timelineDays.map((d, i) => ({ ...d, _dayNum: i + 1 }));
  }, [dayView, timelineDays]);

  const dateRangeLabel = useMemo(() => {
    let s = startDate;
    let e = endDate;
    if ((!s || !e) && Array.isArray(timelineDays) && timelineDays.length > 0) {
      s = s || timelineDays[0]?.date;
      e = e || timelineDays[timelineDays.length - 1]?.date;
    }
    if (!s || !e) return "";
    const fmt = (str) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.replaceAll("-", ".");
      try {
        const d = new Date(str);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
      } catch {
        return str;
      }
    };
    return `${fmt(s)} ~ ${fmt(e)}`;
  }, [startDate, endDate, timelineDays]);

  const API_BASE =
      (import.meta?.env?.VITE_API_URL) ||
      process.env.REACT_APP_API_URL ||
      "http://localhost:8000";

  // 로그인 체크
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) navigate("/login");
      else setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // 저장된 일정 불러오기 (loadTitle로 들어온 경우)
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

  // ✅ 설정페이지에서 넘어온 payload로 자동 생성
  const generateFromPayload = async (payload) => {
    const user = auth.currentUser;
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }
    try {
      const filled = { ...payload, uid: user.uid };

      // 새 trip이면 places 저장
      const already = await checkTripExists(user.uid, filled.title);
      if (!already) {
        const r1 = await fetch(`${API_BASE}/places_build_save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filled),
        });
        if (r1.status === 401) {
          alert("로그인이 만료되었습니다. 다시 로그인해 주세요.");
          navigate("/login");
          return;
        }
        if (!r1.ok) {
          const msg = await r1.text().catch(()=> "");
          throw new Error("서버 오류: " + msg);
        }
        await r1.text().catch(()=> "");
      }

      // 기본 테이블
      setPreparing(true);
      const r2 = await fetch(`${API_BASE}/routes/prepare_basic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filled),
      });
      if (!r2.ok) {
        const msg = await r2.text().catch(()=> "");
        throw new Error("경로 생성 실패: " + msg);
      }
      const basic = await r2.json();
      setTimelineDays(asTimeline(basic));

      // DQN 최적화
      setOptimizing(true);
      const r3 = await fetch(`${API_BASE}/routes/prepare_dqn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filled),
      });
      if (r3.ok) {
        const dqn = await r3.json();
        const dqnDays = asTimeline(dqn);
        if (dqnDays.length > 0) setTimelineDays(dqnDays);
      } else {
        const msg = await r3.text().catch(()=> "");
        console.warn("DQN 실패:", msg);
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || String(err));
    } finally {
      setPreparing(false);
      setOptimizing(false);
    }
  };

  // ✅ payload 감지하여 상태 세팅 + 자동 생성
  useEffect(() => {
    const pl = location.state?.payload;
    if (!loading && pl) {
      setTitle(pl.title || "");
      setQuery(pl.query || "");
      setMethod(String(pl.method ?? "2"));
      setStartDate(pl.start_date || "");
      setEndDate(pl.end_date || "");
      setStartTime(pl.start_time || "10:00");
      setEndTime(pl.end_time || "22:00");
      setStartLocation(pl.start_location || "");
      setLodging(pl.lodging || "");
      setEndLocation(pl.end_location || "");
      setFocusType(pl.focus_type || "attraction");

      generateFromPayload(pl);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [loading, location.state, navigate]);

  // —— 프런트 유틸
  const toMin = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).toString().padStart(2, "0")}`;
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
    // 중복 클릭 방지
    if (saveMode) return;

    setSaveMode(true); // ✅ 시작할 때 '활성(검정)' 켬

    const user = auth.currentUser;
    if (!user) { alert("로그인이 필요합니다."); setSaveMode(false); return; }
    if (!title.trim()) { alert("여행 제목을 입력하세요."); setSaveMode(false); return; }
    if (!Array.isArray(timelineDays) || timelineDays.length === 0) {
      alert("저장할 일정이 없습니다.");
      setSaveMode(false);
      return;
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
    } finally {
      setSaveMode(false); // ✅ 성공/실패 상관없이 항상 OFF
    }
  };


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
  useEffect(() => {
    setSettingMode(false);  // 라우트 변경될 때마다 초기화
  }, [location.pathname]);

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
        <div className="jr-wrap two-col">
          <main className="jr-main">
            <div className="jr-stage-flex has-mini">
              {/* 왼쪽: 일차 네비 + 하단 액션들 */}
              <nav className="jr-mini-sidenav" aria-label="일정 보기 선택">
                <button
                    type="button"
                    className="Journey-logo"
                    onClick={() => navigate("/home")}
                    aria-label="Boyage 홈으로"
                >
                  Boyage
                </button>

                <div className="mini-list">
                  <button
                      className={`mini-btn ${dayView === "all" ? "is-active" : ""}`}
                      onClick={() => setDayView("all")}
                  >
                    전체&nbsp;일정
                  </button>

                  {timelineDays.map((d, i) => (
                      <button
                          key={d.date || i}
                          className={`mini-btn ${dayView === i ? "is-active" : ""}`}
                          onClick={() => setDayView(i)}
                          title={d.date}
                      >
                        <span className="mini-daynum">{i + 1}일차</span>
                      </button>
                  ))}
                </div>

                <div className="mini-actions">
                  <button
                      onClick={() => {
                        setSettingMode(true);   // 클릭하면 검은색
                        navigate("/journey/setting");
                      }}
                      className={`mini-act ${settingMode ? "active" : "ghost"}`}
                      title="여행 정보 입력 페이지로 이동"
                  >
                    <span>설정</span>
                    <span>페이지</span>
                  </button>
                  <button
                      onClick={handleRegenerate}
                      disabled={preparing || optimizing || timelineDays.length === 0}
                      className={`mini-act ${optimizing ? "active-outline" : "ghost"}`}
                      title="지금 보이는 테이블 그대로 서버에 보내서 재배치합니다"
                  >
                    {optimizing ? (
                        <>
                          <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;재생성중..</span>
                        </>
                    ) : (
                        <>
                          <span>경로</span>
                          <span>재생성</span>
                        </>
                    )}
                  </button>
                  <button
                      onClick={toggleMerge}
                      disabled={preparing || optimizing || timelineDays.length === 0}
                      className={`mini-act ${mergeMode ? "is-yellow" : ""}`}
                      title="인접한 두 슬롯 병합 (첫번째 클릭한 슬롯이 승자)"
                  >
                    <span>병합</span>
                    <span>{mergeMode ? "모드" : "모드"}</span>
                    {mergeMode && <span>종료</span>}
                  </button>

                  <button
                      onClick={toggleSplit}
                      disabled={preparing || optimizing || timelineDays.length === 0}
                      className={`mini-act ${splitMode ? "is-purple" : ""}`}
                      title="슬롯을 둘로 쪼개기"
                  >
                    <span>분할</span>
                    <span>{splitMode ? "모드" : "모드"}</span>
                    {splitMode && <span>종료</span>}
                  </button>

                  <button
                      onClick={toggleEdit}
                      disabled={preparing || optimizing || timelineDays.length === 0}
                      className={`mini-act ${editMode ? "is-red" : ""}`}
                      title="슬롯을 빈칸으로 바꿉니다"
                  >
                    {editMode ? (
                        <>
                          <span>삭제</span>
                          <span>모드</span>
                          <span>종료</span>
                        </>
                    ) : (
                        <>
                          <span>삭제</span>
                          <span>모드</span>
                        </>
                    )}
                  </button>
                  <button
                      onClick={toggleAdd}
                      disabled={preparing || optimizing || timelineDays.length === 0}
                      className={`mini-act ${addMode ? "active-outline" : "ghost"}`}
                      title="빈칸을 클릭해 직접 장소를 추가합니다"
                  >
                    {addMode ? (
                        <>
                          <span>일정</span>
                          <span>추가</span>
                          <span>종료</span>
                        </>
                    ) : (
                        <>
                          <span>일정</span>
                          <span>추가</span>
                        </>
                    )}
                  </button>
                  <button
                      onClick={handleSaveLog}
                      disabled={preparing || optimizing || timelineDays.length === 0 || saveMode}
                      className={`mini-act ${saveMode ? "active" : "ghost"}`}
                      title="현재 타임라인을 날짜별로 Firestore에 저장합니다"
                  >
                    {saveMode ? (
                        <>
                          <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;저장중..</span>
                        </>
                    ) : (
                        <>
                          <span>일정</span>
                          <span>저장</span>
                        </>
                    )}
                  </button>


                </div>
              </nav>

              {/* 가운데: 타임라인 */}
              <section className="jr-stage-card">
                {/* 여행 요약 헤더 */}
                <div className="trip-summary">
                  <div className="trip-place">{query || "여행지 미정"}</div>
                  {dateRangeLabel && <div className="trip-dates">{dateRangeLabel}</div>}
                </div>

                {preparing && <div className="jr-note">기초 테이블 생성 중...</div>}
                {optimizing && <div className="jr-note">DQN 최적화 중...</div>}

                {displayedDays.length === 0 ? (
                    <div className="placeholder"><div>아직 생성된 일정이 없습니다.</div></div>
                ) : (
                    <div className={`tl-scroll ${pickerOpen ? "has-panel" : ""}`}>
                      <Timeline
                          days={displayedDays}
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

              {/* 오른쪽: 비워둠 */}
              <aside className="jr-right-empty" />
            </div>
          </main>
        </div>
      </>
  );
}

/* ---------- 우측 후보 패널 ---------- */
function AddPlacePanel({ placeTypeFilter, setPlaceTypeFilter, loading, places, onClose, onChoose }) {
  return (
      <aside className="panel">
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
          <RiArrowDropDownLine className="jr-select-icon-2" />
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
    shopping_mall: "쇼핑몰",
    start: "출발",
    end: "도착",
    accommodation: "숙소",
    etc: "기타",
  };
  return map[t] || "기타";
}
function typeColor(t) {
  const map = {
    tourist_attraction: "#3884FF",
    restaurant: "#F0735B",
    cafe: "#8B4513",
    bakery: "#B8860B",
    bar: "#EA4F85",
    shopping_mall: "#2563eb",
    start: "#5b21b6",
    end: "#D63384",
    accommodation: "#00C853",
    etc: "#f59e0b",
  };
  return map[t] || map.etc;
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

/* ---------- 타임라인 (새 UI, 겹침 방지 버전) ---------- */
function Timeline({
                    days,
                    editable = false,
                    splitable = false,
                    pickable = false,
                    mergeable = false,
                    onDelete,
                    onSplit,
                    onPick,
                    onDragCommit,
                    onMerge,
                  }) {
  const trackRefs = useRef({});
  const [preview, setPreview] = useState({});
  const [mergeSel, setMergeSel] = useState(null);

  const MIN_CARD_PX = 100; // 카드 최소 높이(px) - CSS의 min-height와 맞추세요
  const MIN_GAP_PX  = 6;   // 인접 카드 사이 최소 간격(px)

  const toMin = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).toString().padStart(2, "0")}`;
  };
  const snap = (mins) => Math.round(mins / SNAP) * SNAP;
  const getKey = (date, idx) => `${date}|${idx}`;

  // 축(회색구간)에서 드래그
  const handleMouseDown = (e, day, events, idx, edge /* 'left'|'right' */) => {
    e.preventDefault();
    e.stopPropagation();

    const ev = events[idx];
    if (!ev || ["start", "end", "accommodation"].includes(ev.type)) return;

    const trackEl = trackRefs.current[day.date];
    if (!trackEl) return;

    document.body.classList.add("dragging");

    const rect = trackEl.getBoundingClientRect();
    const totalPx = rect.height;

    const rangeStart = Math.max(0, Math.min(...events.map((x) => toMin(x.start))) - 30);
    const rangeEnd = Math.min(
        24 * 60,
        Math.max(...events.map((x) => toMin(x.end))) + 30
    );
    const totalMin = Math.max(1, rangeEnd - rangeStart);

    const start0 = toMin(ev.start);
    const end0 = toMin(ev.end);
    const mouseStartY = e.clientY;

    const onMove = (me) => {
      me.preventDefault();
      const dyPx = me.clientY - mouseStartY;
      const dyMin = (dyPx / totalPx) * totalMin;

      let ns = start0;
      let ne = end0;

      if (edge === "left") ns = snap(start0 + dyMin);
      else ne = snap(end0 + dyMin);

      if (ne - ns < MIN_SLOT) {
        if (edge === "left") ns = ne - MIN_SLOT;
        else ne = ns + MIN_SLOT;
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
      document.body.classList.remove("dragging");
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const dayColor = (dayNum) => {
    const colors = [
      "#ef4444", // 1 빨
      "#f97316", // 2 주
      "#eab308", // 3 노
      "#22c55e", // 4 초
      "#3b82f6", // 5 파
      "#6366f1", // 6 남
      "#a855f7", // 7 보
      "#b45309", // 8 황토
      "#8b5e3c", // 9 갈
      "#111827", // 10 검
    ];
    const idx = Math.max(1, Math.min(10, Number(dayNum || 1))) - 1;
    return colors[idx];
  };

  return (
      <div className="tl-day-list">
        {days.map((day) => {
          const eventsRaw = day.events || [];
          if (eventsRaw.length === 0) {
            return (
                <div key={day.date} className="day-block">
                  <DayHeader date={day.date} weekday={day.weekday} dayNum={day._dayNum} />
                  <div className="placeholder">이 날의 일정이 없습니다.</div>
                </div>
            );
          }

          // 시간 정렬
          const events = [...eventsRaw].sort(
              (a, b) => toMin(a.start) - toMin(b.start)
          );

          // 범위(분)
          const minStart = Math.min(...events.map((e) => toMin(e.start)));
          const maxEnd = Math.max(...events.map((e) => toMin(e.end)));
          const rangeStart = Math.max(0, minStart - 30);
          const rangeEnd = Math.min(24 * 60, maxEnd + 30);
          const totalMin = Math.max(1, rangeEnd - rangeStart);

          // --- 스케일(px/min) 계산: 겹침이 없도록 k를 충분히 키움
          let k = TRACK_HEIGHT / totalMin; // 기본 스케일

          // 1) 각 카드의 최소 높이를 보장
          for (let i = 0; i < events.length; i++) {
            const d = Math.max(1, toMin(events[i].end) - toMin(events[i].start));
            k = Math.max(k, MIN_CARD_PX / d);
          }
          // 2) 인접 일정의 시작-시작 간격이 (이전 카드 높이 + 최소 간격) 이상
          for (let i = 0; i < events.length - 1; i++) {
            const s0 = toMin(events[i].start);
            const e0 = toMin(events[i].end);
            const s1 = toMin(events[i + 1].start);

            const startDiff = Math.max(1, s1 - s0);       // 분
            const dur0 = Math.max(1, e0 - s0);            // 분
            // 이전 카드 실제 px 높이 후보: max(MIN_CARD_PX, dur0 * k)
            // 겹치지 않으려면: startDiff * k >= prevHeight + MIN_GAP_PX
            // prevHeight가 아직 k에 의존 -> 보수적으로 MIN_CARD_PX 사용
            k = Math.max(k, (MIN_CARD_PX + MIN_GAP_PX) / startDiff);
          }

          // 최종 트랙 높이(px): 범위를 k로 환산 + 마지막 카드가 충분히 들어갈 여유
          const last = events[events.length - 1];
          const lastTopPx = (toMin(last.start) - rangeStart) * k;
          const lastHeightPx = Math.max(
              MIN_CARD_PX,
              (toMin(last.end) - toMin(last.start)) * k
          );
          const trackHeight = Math.max(
              Math.ceil(k * totalMin),
              Math.ceil(lastTopPx + lastHeightPx + 24)
          );

          return (
              <div key={day.date} className="day-block">
                <DayHeader date={day.date} weekday={day.weekday} dayNum={day._dayNum} />

                {/* 날짜별 한 줄(축+카드). 높이를 동적으로 지정 */}
                <div className="tl-row" style={{ height: `${trackHeight}px` }}>
                  {/* 세로 축 */}
                  <div
                      className="tl-axis"
                      style={{ width: AXIS_COL_WIDTH, height: "100%" }}
                      ref={(el) => {
                        trackRefs.current[day.date] = el;
                      }}
                  >
                    <div className="axis-line" />

                    {events.map((e, idx) => {
                      const pv = preview[getKey(day.date, idx)];
                      const start = pv?.start || e.start;
                      const end = pv?.end || e.end;

                      const startPx = (toMin(start) - rangeStart) * k;
                      const durPx = Math.max(2, (toMin(end) - toMin(start)) * k);

                      const circleColor = dayColor(day._dayNum);

                      return (
                          <div key={`${e.start}-${e.end}-${idx}`}>
                            {/* 번호 동그라미 */}
                            <div
                                className="axis-bullet"
                                style={{
                                  top: `${Math.max(0, startPx - 10)}px`,
                                  backgroundColor: circleColor,
                                }}
                                title={`${idx + 1} • ${start}`}
                            >
                              {idx + 1}
                            </div>

                            {/* 회색 구간 + 드래그 핸들 */}
                            <div
                                className="axis-span"
                                style={{ top: `${startPx}px`, height: `${durPx}px` }}
                                title={`${start} - ${end}`}
                            >
                              <div
                                  className="axis-handle axis-handle-top"
                                  onMouseDown={(me) =>
                                      handleMouseDown(me, day, events, idx, "left")
                                  }
                                  title="시작 시간을 드래그로 조절"
                              />
                              <div
                                  className="axis-handle axis-handle-bottom"
                                  onMouseDown={(me) =>
                                      handleMouseDown(me, day, events, idx, "right")
                                  }
                                  title="종료 시간을 드래그로 조절"
                              />
                            </div>
                          </div>
                      );
                    })}
                  </div>

                  {/* 카드 영역 */}
                  <div className="tl-cards" style={{ width: DAY_COL_WIDTH, height: "100%" }}>
                    {events.map((e, idx) => {
                      const pv = preview[getKey(day.date, idx)];
                      const start = pv?.start || e.start;
                      const end = pv?.end || e.end;

                      const topPx = (toMin(start) - rangeStart) * k;

                      const lockType = ["start", "end", "accommodation"].includes(e.type);
                      const isEmpty = !e.title;
                      const canPick = !lockType && !e.title && pickable;

                      return (
                          <div
                              key={`${e.start}-${e.end}-${idx}-card`}
                              className={`ev-card ${isEmpty ? "is-empty" : ""} ${
                                  lockType ? "is-locked" : ""
                              }`}
                              style={{ top: `${topPx}px` }}
                              title={`${e.title || "(빈칸)"} (${start}~${end})`}
                              onClick={() => {
                                if (mergeable) return;
                                if (canPick) {
                                  onPick?.(day.date, e);
                                  return;
                                }
                                if (e.title && !lockType) {
                                  const url = mapsUrlFromEvent(e);
                                  window.open(url, "_blank", "noopener");
                                }
                              }}
                          >
                            <div className="ev-body">
                              <div className="ev-sub">
                          <span className="ev-range">
                            {start} ~ {end}
                          </span>
                                <span className="ev-type" style={{ color: typeColor(e.type) }}>
                            {typeLabel(e.type)}
                          </span>
                              </div>
                              <div className="ev-title">
                                {e.title || "빈 슬롯 (클릭하여 추가)"}
                              </div>
                            </div>

                            {!lockType && splitable && (
                                <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      onSplit?.(day.date, e);
                                    }}
                                    className="btn btn-split"
                                    title="이 슬롯을 두 개로 분할"
                                >
                                  분할
                                </button>
                            )}
                            {!lockType && editable && (
                                <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      onDelete?.(day.date, e);
                                    }}
                                    className="btn btn-delete"
                                    title="이 슬롯을 빈칸으로"
                                >
                                  삭제
                                </button>
                            )}
                          </div>
                      );
                    })}
                  </div>
                </div>
              </div>
          );
        })}
      </div>
  );
}


function DayHeader({ date, weekday, dayNum }) {
  return (
      <div className="day-header">
        {typeof dayNum === "number" && <div className="day-num">{dayNum}일차</div>}
        <div className="day-date">{date}</div>
        {weekday && <div className="day-wd">{weekday}</div>}
      </div>
  );
}

function minLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).toString().padStart(2, "0")}`;
}
function maxLabel(mins) { return minLabel(mins); }

/* (barStyleByType는 더 이상 카드 테두리에 쓰지 않으므로 유지하지 않아도 되지만,
   혹시 다른 곳에서 참조할 수 있어 남겨둡니다.) */
function barStyleByType(type) {
  return {};
}
