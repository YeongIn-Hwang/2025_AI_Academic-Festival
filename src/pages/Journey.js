// src/pages/Journey.js
/* global naver */
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { throttle } from "lodash";
import "../styles/Journey.css";
import {RiArrowDropDownLine} from "react-icons/ri";

const TRACK_HEIGHT = 1900;   // 세로 트랙 높이(px)
const DAY_COL_WIDTH = 360;
const AXIS_COL_WIDTH = 72;  // 세로 타임라인 축 너비(px)

const MIN_SLOT = 30; // 분
const SNAP = 30;     // 분

function dayColor(dayNum) {
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
  const idx = Math.max(1, Math.min(colors.length, Number(dayNum || 1))) - 1;
  return colors[idx];
}
// 지도에 표시에서 제외할 타입
const MAP_EXCLUDE_TYPES = new Set([]); // 필요하면 ["accommodation"]도 추가

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

  // 추가 패널 검색어
  const [placeSearch, setPlaceSearch] = useState("");
  // LightGCN 별도 패널
  const [lgnOpen, setLgnOpen] = useState(false);
  const [lgnLoading, setLgnLoading] = useState(false);
  const [lgnList, setLgnList] = useState([]);
  const [lgnMsg, setLgnMsg] = useState("");

  const [placeOptions, setPlaceOptions] = useState([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  // 일차 보기
  const [dayView, setDayView] = useState("all");
  const isSingleDay = dayView !== "all";
  const mapDivRef = useRef(null);    // <div> 참조
  const mapRef = useRef(null);       // naver.maps.Map 인스턴스
  const mapOverlaysRef = useRef([]); // 마커/폴리라인 등 오버레이 목록

  const displayTitle = useMemo(() => {
  const t  = (title || "").trim();       // 상태에 있는 제목
  const q  = (query || "").trim();       // 검색/설정에서 온 질의
  const lt = (loadTitle || "").trim();   // 라우팅 state로 넘어온 저장된 제목
  return t || q || lt || "여행 제목 미정";
}, [title, query, loadTitle]);

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
  useEffect(() => {
    // 바디 스크롤 잠금
    if (pickerOpen) document.body.classList.add("modal-open");
    else document.body.classList.remove("modal-open");

    // ESC로 닫기
    const onKey = (e) => {
      if (e.key === "Escape" && pickerOpen) {
        setPickerOpen(false);
        setPickerTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

// 네이버 지도 초기화 (1회) — SDK + 컨테이너 크기 준비 상태까지 대기
useEffect(() => {
  let poll;
  const boot = () => {
    const ready = !!window.__NAVER_MAPS_READY__;
    const el = mapDivRef.current;
    const hasSize = el && el.offsetWidth > 0 && el.offsetHeight > 0;

    if (!ready || !hasSize || mapRef.current) {
      poll = setTimeout(boot, 120);
      return;
    }

    if (!(window.naver && window.naver.maps)) {
      console.error("[NAVER] window.naver.maps 없음");
      poll = setTimeout(boot, 120);
      return;
    }

    // 🔹 지도 생성
    const map = new naver.maps.Map(el, {
      center: new naver.maps.LatLng(37.5665, 126.9780),
      zoom: 11,
      minZoom: 6,
      zoomControl: true,
      mapDataControl: false,
    });
    mapRef.current = map;

    // 🔹 첫 프레임 이후 크기 반영 (flex 레이아웃일 때 필수)
    setTimeout(() => {
      try {
        naver.maps.Event.trigger(map, "resize");
      } catch {}
    }, 0);

    // 🔹 디버깅용 타일 로드 확인
    naver.maps.Event.addListener(map, "tilesloaded", () => {
      console.log("[NAVER] tilesloaded");
    });

    // 🔹 보이는지 테스트 마커 1개 (나중에 지워도 됨)
    new naver.maps.Marker({
      position: new naver.maps.LatLng(37.5665, 126.9780),
      map,
    });

    console.log("[NAVER] map initialized");
  };

  boot();
  return () => clearTimeout(poll);
}, []);

// 유틸: 이벤트 → 좌표 포인트로 변환(타입/좌표 유효성 검사 포함)
function eventsToPoints(events = []) {
  return (events || [])
    .filter(e => e && e.title && typeof e.lat === "number" && typeof e.lng === "number")
    .filter(e => !MAP_EXCLUDE_TYPES.has(e.type || "")) // start/end 제외
    .map((e, i) => ({
      idx: i + 1,
      title: e.title,
      lat: e.lat,
      lng: e.lng,
      type: e.type || "etc",
    }));
}

function buildExistingPlaceSets(timelineDays = []) {
  const nameSet = new Set();
  const pidSet = new Set();
  for (const d of timelineDays || []) {
    for (const e of d.events || []) {
      const nm = (e?.title || "").trim().toLowerCase();
      if (nm) nameSet.add(nm);
      const pid = e?.place_id;
      if (pid) pidSet.add(pid);
    }
  }
  return { nameSet, pidSet };
}
function openKakaoDirections(from, to, mode = "car") {
  // 카카오 링크 스펙: https://map.kakao.com/link/by/{mode}/{이름,위도,경도}/{이름,위도,경도}
  const enc = (s) => encodeURIComponent(String(s || ""));
  const seg = (p) => `${enc(p.title || "")},${p.lat},${p.lng}`;

  // mode: 'car' | 'walk' | 'traffic' | 'bicycle'
  const valid = new Set(["car","walk","traffic","bicycle"]);
  const m = valid.has(mode) ? mode : "car";

  const url = `https://map.kakao.com/link/by/${m}/${seg(from)}/${seg(to)}`;

  // 팝업 차단 최소화: a 클릭
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function openGoogleMapsPlace(p) {
  // 무조건 title 기반으로 검색
  const q = String(p.title || "");
  if (!q) return;

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const fetchLightGCNScores = async (rows) => {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const res = await fetch(`${API_BASE}/api/lightgcn/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        items: rows.map(r => r.name),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    const map = new Map();
    for (const s of data.scores || []) map.set(s.name, s.score);
    return map;
  } catch {
    return null;
  }
};

const handleChoosePlace = (place) => {
    if (pickerTarget) {
      handleApplyPlaceToSlot(place);
    } else {
      window.open(mapsSearchUrl(place.name, place.vicinity), "_blank", "noopener");
    }
  };

// 타임라인 → 날짜별 라우트 덩어리 만들기
const dayRoutes = useMemo(() => {
  // displayedDays 는 이미 "all" 또는 특정 일차 하나만 반영된 배열
  return (displayedDays || []).map((d) => ({
    date: d.date,
    color: dayColor(d._dayNum),   // ✅ 일차 번호 색깔과 동일하게
    points: eventsToPoints(
      [...(d.events || [])].sort((a,b) => {
        const t = (x) => (x?.start || "00:00");
        return t(a).localeCompare(t(b));
      })
    ),
  }));
}, [displayedDays]);

// 지도에 경로/마커 렌더링
useEffect(() => {
  const map = mapRef.current;
  if (!map || !window.naver || !window.naver.maps) return;

  // 이전 오버레이 제거
  mapOverlaysRef.current.forEach(ov => {
    try { ov.setMap(null); } catch {}
  });
  mapOverlaysRef.current = [];

  const bounds = new naver.maps.LatLngBounds();
  let hasPoint = false;

  dayRoutes.forEach(route => {
    const { color, points } = route;
    if (!points.length) return;

    // 마커/라벨
    points.forEach((p, i) => {
      const pos = new naver.maps.LatLng(p.lat, p.lng);
      bounds.extend(pos);
      hasPoint = true;

      const marker = new naver.maps.Marker({
        position: pos,
        map,
        icon: {
          content: `
            <div style="
              transform:translate(-50%,-50%);
              display:flex;align-items:center;gap:6px;
              background:${color};color:#fff;padding:6px 10px;border-radius:12px;
              box-shadow:0 1px 4px rgba(0,0,0,.25);font-size:12px;white-space:nowrap;font-weight: bold;
              cursor:pointer;" title="구글 지도로 열기">
              ${String(i+1)}. ${p.title}
            </div>
          `
        }
      });
      mapOverlaysRef.current.push(marker);

      naver.maps.Event.addListener(marker, "mouseover", () => map.setCursor("pointer"));
      naver.maps.Event.addListener(marker, "mouseout",  () => map.setCursor("auto"));
      naver.maps.Event.addListener(marker, "click", () => openGoogleMapsPlace(p));
   });

    // 세그먼트 폴리라인 (클릭 → 이전→다음 구간 길찾기)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segPath = [
        new naver.maps.LatLng(a.lat, a.lng),
        new naver.maps.LatLng(b.lat, b.lng),
      ];
      const segLine = new naver.maps.Polyline({
        map,
        path: segPath,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 3,
        clickable: true,
        strokeLineCap: "round",
        strokeLineJoin: "round",
      });
      const hitLine = new naver.maps.Polyline({
        map,
        path: segPath,
        strokeColor: "#000000",
        strokeOpacity: 0.0001,
        strokeWeight: 18,     // 클릭 영역 넉넉
        clickable: true,
        zIndex: 999
      });
      const handleClick = () => {
        const kakaoMode =
          method === "1" ? "walk" :
          method === "3" ? "car"  :
                           "traffic";
        openKakaoDirections(a, b, kakaoMode);
      };
      [segLine, hitLine].forEach(l => {
        naver.maps.Event.addListener(l, "mouseover", () => map.setCursor("pointer"));
        naver.maps.Event.addListener(l, "mouseout",  () => map.setCursor("auto"));
        naver.maps.Event.addListener(l, "click", handleClick);
      });
      // 클릭 시 카카오 길찾기 열기 (method → kakao mode 매핑)
      naver.maps.Event.addListener(segLine, "click", handleClick);
      mapOverlaysRef.current.push(segLine, hitLine);
    }
  });

  if (hasPoint) {
    map.fitBounds(bounds);
  }
}, [dayRoutes, method]);

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
  const buildSettingInitial = async () => {
  const user = auth.currentUser;
  let meta = { query: "", method: undefined, lodging: "" };

  // 1) trips 문서에서 query / method / lodging 가져오기
  if (user && title.trim()) {
    try {
      const ref = doc(db, "user_trips", user.uid, "trips", title.trim());
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() || {};
        if (typeof d.query === "string") meta.query = d.query;
        if (d.method != null) meta.method = String(d.method);
        if (typeof d.lodging === "string") meta.lodging = d.lodging;
      }
    } catch (e) {
      console.warn("[Journey] buildSettingInitial trips fetch error:", e);
    }
  }

  // 2) 타임테이블에서 날짜/시간/위치 계산
  const firstDay = timelineDays[0];
  const lastDay  = timelineDays[timelineDays.length - 1];

  const start_date = firstDay?.date ?? startDate;
  const end_date   = lastDay?.date  ?? endDate;

  // 모든 이벤트를 날짜+시작시간 기준으로 정렬
  const allEvents = timelineDays.flatMap((d) =>
    (d.events || []).map((ev) => ({ ...ev, _date: d.date }))
  ).sort((a, b) => {
    const dc = (a._date || "").localeCompare(b._date || "");
    if (dc !== 0) return dc;
    return (a.start || "00:00").localeCompare(b.start || "00:00");
  });

  const firstEv = allEvents[0];
  const lastEv  = allEvents[allEvents.length - 1];

  // 요구사항: 시작/종료 시간은 각각 "첫번째 일정의 끝 시간", "마지막 일정의 첫 시간"
  const start_time = firstEv?.end   || startTime;
  const end_time   = lastEv?.start  || endTime;

  // 요구사항: 시작/종료 위치는 "첫 일정의 여행지 이름", "마지막 일정의 여행지 이름"
  const start_location = firstEv?.title || startLocation;
  const end_location   = lastEv?.title  || endLocation;

  // 숙소: trips.lodging 우선, 없으면 타임테이블의 accommodation 첫 항목, 그래도 없으면 기존 상태
  let lodgingPref = meta.lodging || lodging;
  if (!lodgingPref) {
    const acc = allEvents.find((e) => e?.type === "accommodation" && e?.title);
    if (acc?.title) lodgingPref = acc.title;
  }

  return {
    title,
    query: meta.query || query,
    method: meta.method || String(method),
    start_date,
    end_date,
    start_time,
    end_time,
    start_location,
    lodging: lodgingPref || "",
    end_location,
    focus_type: focusType,
  };
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

    let mid = roundTo((s + e) / 2, 30);
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
      setLgnMsg("");

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
  // 🔍 간단 검색(이름/주소)
  if (placeSearch.trim()) {
    const q = placeSearch.trim().toLowerCase();
    rows = rows.filter(r =>
     r.name.toLowerCase().includes(q) ||
     (r.vicinity || "").toLowerCase().includes(q)
    );
  }
  // 기본: 내부 추천 점수 기준
  rows.sort((a, b) => (b.totalScore ?? -1e9) - (a.totalScore ?? -1e9));
      setPlaceOptions(rows);
    } catch (e) {
      console.warn("[Journey] loadPlaces error:", e);
      setPlaceOptions([]);
    } finally {
      setLoadingPlaces(false);
    }
  };

  const loadLgnList = async () => {
  const user = auth.currentUser;
  if (!user || !title.trim()) return;
  try {
    setLgnLoading(true);
    setLgnMsg("");

    const col = collection(db, "user_trips", user.uid, "trips", title.trim(), "places");
    const snap = await getDocs(col);
    let rows = snap.docs.map((d) => {
      const p = d.data() || {};
      return {
        id: d.id,
        place_id: p.place_id ?? null,
        name: p.name ?? "(이름 없음)",
        type: p.type || "etc",
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        vicinity: p.vicinity ?? "",
        rating: typeof p.rating === "number" ? p.rating : null,
        user_ratings_total: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
      };
    });

    if (rows.length < 1) {
      setLgnList([]);
      setLgnMsg("추천할 후보가 없어요.");
      return;
    }

    // LightGCN 점수 요청
    const scoreMap = await fetchLightGCNScores(rows);
    if (!scoreMap) {
      setLgnList([]);
      setLgnMsg("LightGCN 점수를 불러올 수 없어요.");
      return;
    }

    rows = rows.map(r => ({ ...r, lgn_score: scoreMap.get(r.name) ?? null }));

    // 🔧 현재 일정에 들어간 애들 제외 (이름 또는 place_id 기준)
    const { nameSet, pidSet } = buildExistingPlaceSets(timelineDays);
    rows = rows.filter(r => {
      const nameKey = (r.name || "").trim().toLowerCase();
      if (nameKey && nameSet.has(nameKey)) return false;
      if (r.place_id && pidSet.has(r.place_id)) return false;
      return true;
    });

    // 점수 없는 경우 메시지
    const any = rows.some(r => r.lgn_score != null);
    if (!any) setLgnMsg("데이터 부족");

    // 정렬
    rows.sort((a, b) => {
      const A = (a.lgn_score == null) ? -1e18 : a.lgn_score;
      const B = (b.lgn_score == null) ? -1e18 : b.lgn_score;
      return B - A;
    });

    setLgnList(rows);
  } catch (e) {
    console.warn("[Journey] loadLgnList error:", e);
    setLgnList([]);
    setLgnMsg("추천을 불러오는 중 오류가 발생했습니다");
  } finally {
    setLgnLoading(false);
  }
};

useEffect(() => {
  if (lgnOpen) loadLgnList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [lgnOpen, title]);

  useEffect(() => {
  if (pickerOpen) {
    loadPlaces();
  loadLgnList();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pickerOpen, placeTypeFilter, placeSearch, title]);
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
            <div className={`jr-stage-flex has-mini ${isSingleDay ? "is-singleday" : ""}`}>
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
          onClick={async () => {
            const ok = window.confirm(
            "설정 페이지로 이동하면 현재 변경한 경로는 저장되지 않습니다.\n계속 진행할까요?"
          );
          if (!ok) return; // 취소 시 아무 것도 안 함

          setSettingMode(true); // 클릭하면 검은색
            const initial = await buildSettingInitial();
          navigate("/journey/setting", { state: { initial } });
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
  <div className="trip-place">{displayTitle}</div>
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
  <div
    className="modal-overlay"
    onClick={() => { setPickerOpen(false); setPickerTarget(null); }}
  >
    {/* 🔧 두 패널을 나란히 배치 */}
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        // overlay 클릭으로 닫히는 걸 막기 위해 내부는 클릭 이벤트 중단
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 기존 왼쪽: 수동 선택 패널 */}
      <AddPlacePanel
        modal
        placeTypeFilter={placeTypeFilter}
        setPlaceTypeFilter={setPlaceTypeFilter}
        search={placeSearch}
        setSearch={setPlaceSearch}
        loading={loadingPlaces}
        places={placeOptions}
        onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
        onChoose={handleChoosePlace}
      />

      {/* 🔧 오른쪽: 비슷한 사용자는 여길 선호했어요! */}
      <LgnSuggestPanel
        loading={lgnLoading}
        items={lgnList}
        msg={lgnMsg}
        onChoose={handleChoosePlace}
      />
    </div>
  </div>
)}


                    </div>
                )}
              </section>

{/* 오른쪽: 지도 패널 */}
              <aside className="jr-right-map" style={{ minWidth: 420, position: "relative" }}>
  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"8px 12px"}}>
    {/* ✅ 클릭 가능한 레전드: 전체 / 일차 선택 */}
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", maxWidth:320}}>
      {/* 전체 보기 버튼 */}
      <button
        type="button"
        onClick={() => setDayView("all")}
        className="jr-chip"
        aria-pressed={dayView === "all"}
        title="전체 일정 보기"
        style={{
          border:"1px solid rgba(0,0,0,0.15)",
          background: dayView === "all" ? "#111827" : "#fff",
          color: dayView === "all" ? "#fff" : "#111827",
          borderRadius:12, padding:"2px 10px", fontSize:12, lineHeight:1.6, cursor:"pointer", fontWeight:"bold"
        }}
      >
        전체
      </button>

      {/* 일차별 버튼 */}
      {timelineDays.map((d, i) => {
        const color = dayColor(i + 1);
        const isActive = dayView === i;
        return (
          <button
            key={d.date || i}
            type="button"
            onClick={() => setDayView(i)}
            className="jr-chip"
            aria-pressed={isActive}
            title={`${i + 1}일차 (${d.date || ""})`}
            style={{
              background: color,
              color: "#fff",
              opacity: isActive || dayView === "all" ? 1 : 0.35,
              border: "none",
              borderRadius: 12,
              padding: "4px 13px",
              fontSize: 12,
              lineHeight: 1.6,
              cursor: "pointer",
              fontWeight:"bold",
              boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.15) inset" : "none"
            }}
          >
            {i + 1}일차
          </button>
        );
      })}
    </div>
  </div>

  <div
    id="mapMain"
    ref={mapDivRef}
    style={{ width:"100%", height:"calc(100vh - 140px)", boxShadow:"0 1px 6px rgba(0,0,0,.12)" }}
  />
</aside>
            </div>
          </main>
        </div>
        {lgnOpen && (
  <LgnPanel
    loading={lgnLoading}
    items={lgnList}
    msg={lgnMsg}
    onClose={() => setLgnOpen(false)}
    onChoose={handleChoosePlace}
  />
  
)}
      </>
  );
}

function LgnPanel({ loading, items, msg, onClose, onChoose }) {
  return (
    <aside
      style={{
        position:"fixed", right:16, bottom:72, width:360,
        maxHeight:"70vh", overflow:"auto",
        background:"#fff", border:"1px solid rgba(0,0,0,.12)",
        borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,.2)",
        padding:12, zIndex:1000
      }}
    >
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
        <div style={{fontWeight:700}}>유사 사용자 추천 (LightGCN)</div>
        <button onClick={onClose} className="jr-chip" style={{cursor:"pointer"}}>닫기</button>
      </div>
      {loading ? (
        <div className="placeholder">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="placeholder">{msg || "추천 결과가 없습니다."}</div>
      ) : (
        <div className="panel-list">
          {msg && <div className="panel-note" style={{marginBottom:8, color:"#b45309"}}>{msg}</div>}
          {items.map(p => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onChoose?.(p)}
              onKeyDown={(e) => { if (e.key === "Enter") onChoose?.(p); }}
              className="panel-item"
              title={`${p.name} · LGN ${p.lgn_score != null ? p.lgn_score.toFixed(2) : "N/A"}`}
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
              </div>
              <div className="panel-scores">LightGCN {p.lgn_score != null ? p.lgn_score.toFixed(2) : "N/A"}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

/* ---------- 우측 후보 패널 ---------- */
function AddPlacePanel({ placeTypeFilter, setPlaceTypeFilter, search, setSearch, loading, places, onClose, onChoose,  modal = false,
                         ...rest}) {
  return (
      <aside
          className={`panel ${modal ? "panel--modal" : ""}`}
          role={modal ? "dialog" : undefined}
          aria-modal={modal ? "true" : undefined}
          onClick={rest.onClick}                 // overlay 닫힘 방지용 전달
      >
        <div className="panel-header">
          <div className="fw-700">일정 추가</div>
          <button className="panel-close" onClick={onClose}>닫기</button>
        </div>
      {/* 🔍 검색 */}
    <div className="mb-8">
      <label className="panel-label">검색</label>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="jr-input"
        placeholder="장소명/주소 검색"
      />
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
  //const MIN_GAP_PX  = 6;   // 인접 카드 사이 최소 간격(px)
  const CARD_UNIT_MIN = 30;

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

          // 최종 트랙 높이(px): 범위를 k로 환산 + 마지막 카드가 충분히 들어갈 여유
          const last = events[events.length - 1];
const lastTopPx = (toMin(last.start) - rangeStart) * k;
const lastHeightPx = CARD_UNIT_MIN * k;

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
                      const durPx = Math.max(2, CARD_UNIT_MIN * k);

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
                      const cardHeightPx = CARD_UNIT_MIN * k;

                      const lockType = ["start", "end", "accommodation"].includes(e.type);
                      const isEmpty = !e.title;
                      const canPick = !lockType && !e.title && pickable;

                      return (
                          <div
                              key={`${e.start}-${e.end}-${idx}-card`}
                              className={`ev-card ${isEmpty ? "is-empty" : ""} ${lockType ? "is-locked" : ""} ${
   mergeable && mergeSel && mergeSel.date === day.date && mergeSel.idx === idx ? "is-selected" : ""
 }`}
                              style={{
      top: `${topPx}px`,
      height: `${cardHeightPx}px`,
      // 카드 높이를 CSS 변수로 전달 (폰트/줄 높이 계산용)
      "--card-h": `${cardHeightPx}px`,
    }}
                              title={`${e.title || "(빈칸)"} (${start}~${end})`}
                              onClick={() => {
   if (mergeable) {
     // 병합 모드: 첫 번째 선택 → 두 번째 선택 시 병합 시도
     if (!mergeSel) {
       setMergeSel({ date: day.date, idx });
     } else {
       // 같은 날짜 & 인접 여부 확인
       if (mergeSel.date === day.date && Math.abs(mergeSel.idx - idx) === 1) {
         onMerge?.(day.date, mergeSel.idx, idx);
       }
       // 병합 성공/실패와 무관히 선택 해제
       setMergeSel(null);
     }
     return;
   }
   // 일반 클릭 동작
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
                            {/* 왼쪽: 시간 / 오른쪽: 타입 + 이름 */}
<div className="ev-left">
  <div className="ev-time">{start} ~ {end}</div>
  <div className="ev-type" style={{ color: typeColor(e.type) }}>
    {typeLabel(e.type)}
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

<div className="ev-right">
  <div className="ev-title">
    {e.title || "빈 슬롯 (클릭하여 추가)"}
  </div>

</div>

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

function LgnSuggestPanel({ loading, items, msg, onChoose }) {
  return (
    <aside
      style={{
        width: 360,
        maxHeight: "70vh",
        overflow: "auto",
        background: "#fff",
        border: "1px solid rgba(0,0,0,.12)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,.2)",
        padding: 12,
      }}
    >
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
        <div style={{fontWeight:700}}>비슷한 사용자는 여길 선호했어요!</div>
      </div>

      {loading ? (
        <div className="placeholder">불러오는 중…</div>
      ) : (items?.length || 0) === 0 ? (
        <div className="placeholder">{msg || "데이터 부족"}</div>
      ) : (
        <div className="panel-list">
          {msg && msg !== "데이터 부족" && (
            <div className="panel-note" style={{marginBottom:8, color:"#b45309"}}>{msg}</div>
          )}
          {items.map(p => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onChoose?.(p)}          // 🔑 클릭 시 빈 슬롯에 곧장 적용
              onKeyDown={(e) => { if (e.key === "Enter") onChoose?.(p); }}
              className="panel-item"
              title={`${p.name} · LGN ${p.lgn_score != null ? p.lgn_score.toFixed(2) : "N/A"}`}
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
              </div>
              <div className="panel-scores">
                LightGCN {p.lgn_score != null ? p.lgn_score.toFixed(2) : "N/A"}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
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
