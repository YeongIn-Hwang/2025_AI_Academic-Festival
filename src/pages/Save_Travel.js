// src/pages/Save_Travel.js
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, db, storage } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { FiArrowLeft, FiDownload, FiCalendar, FiClock, FiMapPin } from "react-icons/fi";

/* ---------- 스타일 ---------- */
const INLINE_CSS = `
.st-wrap { max-width: 1080px; margin: 0 auto; padding: 24px; color:#0f172a; }
.st-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.st-title { font-size:22px; font-weight:800; margin:0; }
.st-actions { display:flex; gap:8px; }
.st-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#f8fafc; cursor:pointer; font-weight:700; }
.st-btn:hover { background:#e2e8f0; }
.st-primary { background:#2563eb; color:#fff; border-color:#2563eb; }
.st-primary:hover { filter:brightness(0.95); }
.st-info { color:#475569; margin-top:-8px; margin-bottom:12px; }
.st-grid { display:grid; grid-template-columns: 1fr; gap:14px; }
.st-card { border:1px solid #e5e7eb; border-radius:14px; background:linear-gradient(180deg,#fff,#fbfbfd); padding:16px; }
.st-card h2 { margin:0 0 10px; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px; color:#0f172a; }
.st-table { width:100%; border-collapse: collapse; }
.st-table th, .st-table td { border-top:1px solid #e5e7eb; padding:10px 8px; text-align:left; font-size:14px; vertical-align:top; }
.st-table thead th { border-top:none; color:#475569; font-weight:700; }
.st-tag { display:inline-block; padding:2px 8px; font-size:12px; border:1px solid #e5e7eb; border-radius:999px; background:#f8fafc; color:#111827; }
.st-muted { color:#64748b; }
.st-empty { border:1px dashed #cbd5e1; background:#f8fafc; color:#64748b; padding:24px; border-radius:12px; text-align:center; }
.st-skeleton { height:120px; border-radius:12px; background:linear-gradient(90deg,#f3f4f6,#eef2f7,#f3f4f6); background-size:200% 100%; animation: st-shimmer 1.2s ease-in-out infinite; border:1px solid #e5e7eb; }
@keyframes st-shimmer { 0% { background-position: 0% 0; } 100% { background-position: -200% 0; } }
.st-rate-btn { padding:6px 10px; font-size:12px; border-radius:999px; border:1px solid #e5e7eb; background:#000; color:#fff; cursor:pointer; }
.st-rate-btn:hover { background:#333; }
.st-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; padding: 16px; z-index: 50; }
.st-modal { width: 100%; max-width: 620px; background: #fff; border-radius: 14px; border:1px solid #e5e7eb; box-shadow: 0 20px 40px rgba(0,0,0,0.12); }
.st-modal-head { display:flex; align-items:center; justify-content:space-between; padding: 14px 16px; border-bottom:1px solid #e5e7eb; }
.st-modal-title { margin:0; font-size:16px; font-weight:800; }
.st-modal-body { padding: 14px 16px; display:grid; gap:12px; }
.st-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding: 12px 16px; border-top:1px solid #e5e7eb; }
.st-stars { display:flex; gap:6px; }
.st-star { font-size: 22px; cursor:pointer; user-select:none; transition: transform .08s ease;display:inline-block; width:24px; line-height:1;}
.st-star:hover { transform: translateY(-1px); }
.st-textarea { width:100%; min-height:96px; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; outline:none; }
.st-textarea:focus { border-color:#cbd5e1; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
.st-previews { display:flex; gap:8px; flex-wrap:wrap; }
.st-thumb { width:84px; height:84px; border-radius:10px; border:1px solid #e5e7eb; object-fit:cover; }
.st-hint { color:#64748b; font-size:12px; }
.st-black {background:#000 !important;color:#fff !important;border-color:#000 !important;}
.st-black:hover {background:#333 !important;}
`;

// ===== API BASE & 공용 헬퍼 =====
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8000";

async function getDistrict(q) {
  if (!q) return null;
  try {
    const r = await fetch(`${API_BASE}/api/geocode/query_district?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const district = await r.json();
    return typeof district === "string" ? district.trim() : null;
  } catch {
    return null;
  }
}

async function applyRatingsToTripsLog({ uid, loadTitle, days, reviews }) {
  if (!uid || !loadTitle) return;

  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const d = days[dayIdx];
    const dayRef = doc(db, "user_trips", uid, "trips_log", loadTitle, "days", d._id || d.date);
    const daySnap = await getDoc(dayRef);
    const dayData = daySnap.exists() ? (daySnap.data() || {}) : {};

    let changed = false;
    const updated = { ...dayData };

    // 1-a) 루트 맵 슬롯("1","2"...) 매칭
    for (let slotIdx = 0; slotIdx < d.slots.length; slotIdx++) {
      if (slotIdx === 0 || slotIdx === d.slots.length - 1) continue;

      const s = d.slots[slotIdx];
      const key = `${dayIdx}-${slotIdx}`;
      const rating = reviews[key]?.rating ?? 0;
      if (!rating || !s?.title) continue;

      Object.keys(updated).forEach((k) => {
        const v = updated[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          if (v.title && v.title === s.title) {
            updated[k] = { ...v, user_rating: rating };
            changed = true;
          }
        }
      });
    }

    if (changed) {
      await setDoc(dayRef, updated, { merge: true });
    }

    // 1-b) schedule이 "배열 필드"인 경우 매칭/갱신
    if (Array.isArray(updated.schedule) && updated.schedule.length > 0) {
      const arr = [...updated.schedule];
      let arrChanged = false;

      // UI에서 저장한 리뷰 타겟 구성 (시작/끝 제외)
      const targets = [];
      for (let slotIdx = 0; slotIdx < d.slots.length; slotIdx++) {
        if (slotIdx === 0 || slotIdx === d.slots.length - 1) continue;

        const s = d.slots[slotIdx];
        const key = `${dayIdx}-${slotIdx}`;
        const r = reviews[key]?.rating ?? 0;
        if (!r) continue;

        targets.push({
          title: s.title?.trim() || "",
          start: s.start || "",
          end: s.end || "",
          place_id: s._raw?.place_id || null,
          rating: r,
        });
      }

      if (targets.length) {
        for (let i = 0; i < arr.length; i++) {
          if (i === 0 || i === arr.length - 1) continue; // 시작/끝 제외

          const it = arr[i] || {};
          const itTitle = (it.title || "").trim();
          const itStart = it.start || "";
          const itEnd = it.end || "";
          const itPid = it.place_id || null;

          // 매칭 우선순위: place_id → (title+start+end) → title
          const t = targets.find((x) =>
            (x.place_id && itPid && x.place_id === itPid) ||
            (!!x.title && !!itTitle && x.title === itTitle && x.start === itStart && x.end === itEnd) ||
            (!!x.title && !!itTitle && x.title === itTitle)
          );

          if (t?.rating) {
            arr[i] = { ...it, user_rating: t.rating }; // 0.5 단위 그대로 저장
            arrChanged = true;
          }
        }
      }

      if (arrChanged) {
        await setDoc(dayRef, { schedule: arr }, { merge: true });
      }
    }

    // 2) schedule "서브컬렉션" 구조라면 타이틀로 반영
    try {
      const schedCol = collection(
        db,
        "user_trips",
        uid,
        "trips_log",
        loadTitle,
        "days",
        d._id || d.date,
        "schedule"
      );
      const schedSnaps = await getDocs(schedCol);
      if (!schedSnaps.empty) {
        const titleToRating = new Map();
        for (let slotIdx = 0; slotIdx < d.slots.length; slotIdx++) {
          if (slotIdx === 0 || slotIdx === d.slots.length - 1) continue;
          const s = d.slots[slotIdx];
          const key = `${dayIdx}-${slotIdx}`;
          const r = reviews[key]?.rating ?? 0;
          if (r && s?.title) {
            titleToRating.set(s.title, r);
          }
        }

        const updates = [];
        schedSnaps.forEach((docSnap) => {
          const sd = docSnap.data() || {};
          const t = sd.title || "";
          if (titleToRating.has(t)) {
            updates.push(updateDoc(docSnap.ref, { user_rating: titleToRating.get(t) }));
          }
        });
        if (updates.length) await Promise.all(updates);
      }
    } catch (e) {
      console.warn("[applyRatingsToTripsLog] schedule subcollection not found or failed:", e);
    }
  }
}

// ===== 유틸 =====
function toMinutes(hhmm = "") {
  if (!hhmm.includes(":")) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function sortSlots(a, b) {
  const am = toMinutes(a.start);
  const bm = toMinutes(b.start);
  if (!isNaN(am) && !isNaN(bm)) return am - bm;
  return (a.start || "").localeCompare(b.start || "");
}
function normalizeSlot(raw = {}) {
  const start = raw.start ?? raw.begin ?? raw.timeStart ?? raw.from ?? "";
  const end = raw.end ?? raw.finish ?? raw.timeEnd ?? raw.to ?? "";
  const title = raw.title ?? raw.name ?? raw.label ?? raw.place_name ?? "";
  const placeType = raw.place_type ?? raw.type ?? raw.category ?? "";
  const loc = raw.location_info ?? raw.location ?? raw.loc ?? {};
  const addr = loc?.address ?? raw.address ?? "";
  let duration = "";
  const sm = toMinutes(start);
  const em = toMinutes(end);
  if (!isNaN(sm) && !isNaN(em) && em >= sm) duration = `${em - sm}분`;
  return { start, end, duration, title, placeType, address: addr, _raw: raw };
}
function exportCSV(days) {
  const header = ["date", "start", "end", "duration(min)", "title", "place_type", "address"];
  const rows = [header.join(",")];
  days.forEach((d) => {
    d.slots.forEach((s) => {
      const sm = toMinutes(s.start);
      const em = toMinutes(s.end);
      const durMin = !isNaN(sm) && !isNaN(em) && em >= sm ? em - sm : "";
      rows.push(
        [
          d.date || "",
          s.start || "",
          s.end || "",
          durMin,
          (s.title || "").replaceAll(",", " "),
          (s.placeType || "").replaceAll(",", " "),
          (s.address || "").replaceAll(",", " "),
        ].join(",")
      );
    });
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "travel_log.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Save_Travel() {
  const navigate = useNavigate();
  const location = useLocation();
  const loadTitle = location.state?.loadTitle || null;

  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState([]);
  const [error, setError] = useState("");

  // 리뷰/이미지 모달 상태
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [pickedFiles, setPickedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [reviews, setReviews] = useState({});

  useEffect(() => {
    const id = "st-inline-style";
    if (!document.getElementById(id)) {
      const tag = document.createElement("style");
      tag.id = id;
      tag.textContent = INLINE_CSS;
      document.head.appendChild(tag);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      setUid(user.uid);
    });
    return () => unsub();
  }, [navigate]);

  // 데이터 로드 + query → 구/군/시 변환
  useEffect(() => {
    if (!uid || !loadTitle) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const daysCol = collection(db, "user_trips", uid, "trips_log", loadTitle, "days");
        const daySnaps = await getDocs(daysCol);

        const dayList = [];
        for (const dayDoc of daySnaps.docs) {
          const ddata = dayDoc.data() || {};
          const dateStr = ddata.date || dayDoc.id;

          const arrayCandidates = ddata.schedule || ddata.items || ddata.events || ddata.timeline;
          let slots = Array.isArray(arrayCandidates) ? arrayCandidates : null;

          if (!slots) {
            try {
              const schedCol = collection(
                db,
                "user_trips",
                uid,
                "trips_log",
                loadTitle,
                "days",
                dayDoc.id,
                "schedule"
              );
              const schedSnaps = await getDocs(schedCol);
              if (!schedSnaps.empty) slots = schedSnaps.docs.map((s) => s.data());
            } catch {}
          }

          const normSlots = (slots || []).map(normalizeSlot).sort(sortSlots);
          dayList.push({ date: dateStr, _id: dayDoc.id, slots: normSlots });
        }
        dayList.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setDays(dayList);

        try {
          const metaRef = doc(db, "user_trips", uid, "trips", loadTitle);
          const metaSnap = await getDoc(metaRef);
          const q = metaSnap.exists() ? (metaSnap.data()?.query || "") : "";
          console.log("[load] meta.query", q);
        } catch (e) {
          console.warn("[load] meta.query 로드 실패", e);
        }
      } catch (e) {
        console.error(e);
        setError("여행 기록을 불러오는 중 문제가 발생했어요.");
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, loadTitle]);

  const totalDays = days.length;
  const totalSlots = useMemo(() => days.reduce((acc, d) => acc + d.slots.length, 0), [days]);

  // 별 클릭
  function onClickStar(e, i) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width; // 0~1
    const half = rel < 0.5 ? 0.5 : 1.0;               // 왼쪽 절반=0.5, 오른쪽 절반=1
    const val = i - 1 + half;                         // 0.5, 1.0, 1.5, ... 5.0
    setRating(val);
  }

  // 별 렌더
  function renderStar(i) {
    const fill = Math.max(0, Math.min(1, rating - (i - 1)));
    const pct = Math.round(fill * 100);
    return (
      <span
        key={i}
        className="st-star"
        role="button"
        aria-label={`${i}번째 별`}
        onClick={(e) => onClickStar(e, i)}
        style={{
          backgroundImage: `linear-gradient(90deg, #000 ${pct}%, #e5e7eb ${pct}%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        ★
      </span>
    );
  }

  function openReview(dayIdx, slotIdx) {
    const s = days[dayIdx].slots[slotIdx];
    setReviewTarget({ dayIdx, slotIdx, slot: s });
    const key = `${dayIdx}-${slotIdx}`;
    const prev = reviews[key] || {};
    setNote(prev.note || "");
    setRating(prev.rating || 0);
    setPickedFiles([]);
    setPreviews([]);
    setReviewOpen(true);
  }
  function closeReview() {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews([]);
    setPickedFiles([]);
    setReviewOpen(false);
  }
  function onPickImages(e) {
    const files = Array.from(e.target.files || []);
    setPickedFiles(files);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return urls;
    });
  }
  function saveLocalReview() {
    if (!reviewTarget) return;
    const key = `${reviewTarget.dayIdx}-${reviewTarget.slotIdx}`;
    setReviews((prev) => ({ ...prev, [key]: { note, rating, files: pickedFiles } }));
    setReviewOpen(false);
  }

  // Storage 업로드
  async function uploadFilesAndGetUrls({ uid, title, date, slotIdx, files }) {
    if (!files || files.length === 0) return [];
    const folderSafe = `${title || "trip"}`.replace(/[^\w\-]+/g, "_");
    const dateSafe = `${date || ""}`.replace(/[^\w\-]+/g, "_");
    const ts = Date.now();
    const basePath = `places/${uid}/${folderSafe}/${dateSafe}_${slotIdx}_${ts}`;
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const nameSafe = (f.name || `img_${i}.jpg`).replace(/[^\w\.\-]+/g, "_");
      const fileRef = sRef(storage, `${basePath}/${i}_${nameSafe}`);
      await uploadBytes(fileRef, f);
      const url = await getDownloadURL(fileRef);
      urls.push(url);
    }
    return urls;
  }

  // ⭐ 모든(시작/끝 제외) 슬롯에 별점이 있는지 검증
  function validateAllRatingsFilled(days, reviews) {
    const missing = [];
    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const d = days[dayIdx];
      for (let slotIdx = 0; slotIdx < d.slots.length; slotIdx++) {
        if (slotIdx === 0 || slotIdx === d.slots.length - 1) continue; // 시작/끝 제외
        const key = `${dayIdx}-${slotIdx}`;
        const r = reviews[key]?.rating;
        if (!(typeof r === "number" && r > 0)) {
          missing.push({
            day: d.date || d._id || "",
            title: d.slots[slotIdx]?.title || "제목 없음",
            time: `${d.slots[slotIdx]?.start || ""}~${d.slots[slotIdx]?.end || ""}`,
          });
        }
      }
    }
    if (missing.length > 0) {
      // 목록이 너무 길면 앞 몇 개만 보여주고 개수 표시
      const preview = missing.slice(0, 5).map(m => `- ${m.day} | ${m.time} | ${m.title}`).join("\n");
      const more = missing.length > 5 ? `\n...외 ${missing.length - 5}개` : "";
      alert(`모든 일정에 별점을 매겨야 저장할 수 있어요.\n다음 일정에 별점이 비었습니다:\n\n${preview}${more}`);
      return false;
    }
    return true;
  }

  // 저장
  async function saveToUserTrips() {
    if (!uid) return alert("로그인이 필요합니다.");
    if (!days.length) return alert("저장할 일정이 없습니다.");

    // ✅ 저장 전에 전 슬롯 별점 검증
    if (!validateAllRatingsFilled(days, reviews)) {
      return; // 저장 중단
    }

    try {
      const startDate = days[0].date || "";
      const endDate = days[days.length - 1].date || "";

      // places: 입력값(제목/주소/메모/사진)만 저장
      const urlsMap = {};
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        const d = days[dayIdx];
        for (let slotIdx = 0; slotIdx < d.slots.length; slotIdx++) {
          const key = `${dayIdx}-${slotIdx}`;
          const rv = reviews[key];
          const files = rv?.files || [];
          if (files.length > 0) {
            const urls = await uploadFilesAndGetUrls({
              uid,
              title: loadTitle,
              date: d.date,
              slotIdx,
              files,
            });
            urlsMap[key] = urls;
          }
        }
      }

      const places = [];
      days.forEach((d, dayIdx) => {
        d.slots.forEach((s, slotIdx) => {
          if (slotIdx === 0 || slotIdx === d.slots.length - 1) return; // 시작/끝 제외

          const key = `${dayIdx}-${slotIdx}`;
          const userReview = reviews[key]?.note || "";
          const photoUrls = urlsMap[key] || [];
          const searchQ = [s.title, s.address].filter(Boolean).join(" ");
          places.push({
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQ || "대한민국")}`,
            name: s.title || "제목 없음",
            review: userReview,
            startDate: d.date,
            photos: photoUrls,
            photoURL: photoUrls[0] || "",
          });
        });
      });

      // 저장 직전 query → district
      let city = "도시 미정";
      try {
        const metaRef = doc(db, "user_trips", uid, "trips", loadTitle);
        const metaSnap = await getDoc(metaRef);
        const q = metaSnap.exists() ? (metaSnap.data()?.query || "") : "";
        const district = await getDistrict(q);
        if (district) city = district;
        console.log("[save] geocode", { q, district, city });
      } catch (e) {
        console.warn("[save] geocode 실패", e);
      }

      // 별점 반영 (trips_log)
      await applyRatingsToTripsLog({ uid, loadTitle, days, reviews });

      // /users/{uid} 업데이트
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      const hasCity = city && city !== "도시 미정";
      const newTrip = { city, startDate, endDate, places };

      if (!snap.exists()) {
        await setDoc(userRef, {
          trips: [newTrip],
          ...(hasCity ? { visitedCities: arrayUnion(city) } : {}),
        });
      } else {
        const data = snap.data() || {};
        const prevTrips = Array.isArray(data.trips) ? data.trips : [];
        const nextTrips = [...prevTrips];

        if (hasCity) {
          const idx = nextTrips.findIndex((t) => t.city === city);
          if (idx >= 0) {
            const ex = nextTrips[idx];
            const mergedStart = [ex.startDate, startDate].filter(Boolean).sort()[0] || startDate;
            const mergedEnd = [ex.endDate, endDate].filter(Boolean).sort().slice(-1)[0] || endDate;

            const keyFor = (p) =>
              `${(p.name || "").trim()}__${(p.startDate || "").trim()}__${(p.mapsUrl || "").trim()}`;
            const mp = new Map();
            (ex.places || []).forEach((p) => mp.set(keyFor(p), p));
            (places || []).forEach((p) => mp.set(keyFor(p), p));
            const mergedPlaces = Array.from(mp.values());

            nextTrips[idx] = { city, startDate: mergedStart, endDate: mergedEnd, places: mergedPlaces };
          } else {
            nextTrips.push(newTrip);
          }
        } else {
          const idx = nextTrips.findIndex(
            (t) => t.startDate === startDate && t.endDate === endDate && t.city === city
          );
          if (idx >= 0) nextTrips[idx] = newTrip;
          else nextTrips.push(newTrip);
        }

        const payload = { trips: nextTrips };
        if (hasCity) {
          payload.visitedCities = arrayUnion(city);
        }
        await updateDoc(userRef, payload);
      }

      // user_params 업데이트 트리거
      try {
        const res = await fetch(`${API_BASE}/api/user_params/update_from_log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: uid, title: loadTitle }),
        });
        if (!res.ok) {
          console.warn("[user_params] 업데이트 실패", await res.text());
        } else {
          console.log("[user_params] 업데이트 완료");
        }
        // LightGCN 상호작용 문서 생성
       const gcn = await fetch(`${API_BASE}/api/lightgcn/build_from_log`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ user_id: uid, title: loadTitle }),
       });
       if (!gcn.ok) {
         console.warn("[lightgcn] 빌드 실패", await gcn.text());
       } else {
         console.log("[lightgcn] 빌드 완료");
       }
      } catch (e) {
        console.warn("[user_params] 호출 에러", e);
      }

      alert("저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("이미지 업로드 또는 저장 중 오류가 발생했습니다.");
    }
  }

  if (!loadTitle) {
    return (
      <div className="st-wrap">
        <div className="st-empty">로드할 여행 제목(loadTitle)이 없습니다.</div>
        <div className="st-actions" style={{ marginTop: 12 }}>
          <button className="st-btn st-black" onClick={() => navigate(-1)}>
            <FiArrowLeft /> 뒤로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="st-wrap">
      <div className="st-head">
        <h1 className="st-title">여행 기록: {loadTitle}</h1>
        <div className="st-actions">
          <button className="st-btn st-black" onClick={() => navigate(-1)}>
            <FiArrowLeft /> 뒤로
          </button>
          <button className="st-btn st-black" onClick={() => exportCSV(days)}>
            <FiDownload /> CSV
          </button>
          <button
            className="st-btn st-primary"
            onClick={() => {
              console.log("[UI] SAVE CLICK");
              saveToUserTrips();
            }}
          >
            저장
          </button>
        </div>
      </div>
      <div className="st-info">
        총 <b>{totalDays}</b>일 / 슬롯 <b>{totalSlots}</b>개
      </div>

      {loading ? (
        <div className="st-skeleton" />
      ) : error ? (
        <div className="st-empty">{error}</div>
      ) : days.length === 0 ? (
        <div className="st-empty">표시할 기록이 없습니다.</div>
      ) : (
        <div className="st-grid">
          {days.map((day, dayIdx) => (
            <div key={day.date} className="st-card">
              <h2><FiCalendar /> {day.date}</h2>
              {day.slots.length === 0 ? (
                <div className="st-muted">이 날에는 등록된 슬롯이 없습니다.</div>
              ) : (
                <table className="st-table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>시간</th>
                      <th>제목</th>
                      <th style={{ width: 140 }}>타입</th>
                      <th>위치</th>
                      <th style={{ width: 110 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.slots.map((s, slotIdx) => {
                      if (slotIdx === 0 || slotIdx === day.slots.length - 1) return null;
                      const key = `${dayIdx}-${slotIdx}`;
                      const prevCount = reviews[key]?.files?.length || 0;

                      return (
                        <tr key={`${day.date}-${slotIdx}`}>
                          <td>
                            <div><FiClock style={{ marginRight: 6 }} />{s.start} ~ {s.end}</div>
                            <div className="st-muted" style={{ marginTop: 4 }}>{s.duration || ""}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700 }}>
                              {s.title || <span className="st-muted">제목 없음</span>}
                            </div>
                          </td>
                          <td>
                            {s.placeType ? <span className="st-tag">{s.placeType}</span> : <span className="st-muted">-</span>}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <FiMapPin /><span>{s.address || <span className="st-muted">정보 없음</span>}</span>
                            </div>
                          </td>
                          <td>
                            <button className="st-rate-btn" onClick={() => openReview(dayIdx, slotIdx)}>
                              평가{prevCount ? ` · 이미지 ${prevCount}` : ""}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {reviewOpen && reviewTarget && (
        <div className="st-modal-backdrop" onClick={closeReview}>
          <div className="st-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-modal-head">
              <h3 className="st-modal-title">
                {reviewTarget.slot.title || "제목 없음"} · {reviewTarget.slot.start}~{reviewTarget.slot.end}
              </h3>
            </div>
            <div className="st-modal-body">
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>별점 (저장 눌러야 반영)</div>
                <div className="st-stars">
                  {[1,2,3,4,5].map(renderStar)}
                  <div className="st-muted" style={{ marginLeft: 8 }}>
                    {rating ? `${rating.toFixed(rating % 1 ? 1 : 0)}점` : "선택 안 함"}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>메모</div>
                <textarea
                  className="st-textarea"
                  placeholder="이 일정에 대한 소감, 팁 등을 적어주세요."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>이미지</div>
                <input type="file" accept="image/*" multiple onChange={onPickImages} />
                {previews.length > 0 ? (
                  <div className="st-previews" style={{ marginTop: 8 }}>
                    {previews.map((src, i) => (<img key={i} src={src} alt={`preview-${i}`} className="st-thumb" />))}
                  </div>
                ) : (
                  <div className="st-hint" style={{ marginTop: 6 }}>이미지를 선택하면 미리보기가 표시됩니다.</div>
                )}
                {(() => {
                  const key = `${reviewTarget.dayIdx}-${reviewTarget.slotIdx}`;
                  const prevCount = reviews[key]?.files?.length || 0;
                  return prevCount ? (
                    <div className="st-hint" style={{ marginTop: 6 }}>
                      이전에 저장한 이미지 {prevCount}개가 있습니다. 새로 선택하지 않으면 그대로 유지돼요.
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
            <div className="st-modal-foot">
              <button className="st-btn" onClick={closeReview}>닫기</button>
              <button className="st-btn st-primary" onClick={saveLocalReview}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
