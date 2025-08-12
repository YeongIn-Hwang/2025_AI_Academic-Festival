import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function Journey() {
  const navigate = useNavigate();
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
  const [editMode, setEditMode] = useState(false);   // 삭제 모드
  const [splitMode, setSplitMode] = useState(false); // 분할 모드

  // 서버에 보낼 변경 누적
  const [deletions, setDeletions] = useState([]); // [{date,start,end}]
  const [splits, setSplits] = useState([]);       // [{date,start,end,mid?}]

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
    if (Array.isArray(data?.timeline)) return data.timeline;
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
          })),
        }));
    }
    return [];
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

      // 1) 장소 수집 (동일 제목 존재시 스킵)
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

      // 2) basic
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

      // 3) dqn
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
      if (next) setSplitMode(false);
      if (!next) setDeletions([]);
      return next;
    });
  const toggleSplit = () =>
    setSplitMode((v) => {
      const next = !v;
      if (next) setEditMode(false);
      if (!next) setSplits([]);
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
  const roundTo = (mins, base = 15) => Math.round(mins / base) * base;

  // —— 삭제
  const handleDeleteSlot = (date, ev) => {
  // 보호: start/end/accommodation 삭제 금지
  if (["start", "end", "accommodation"].includes(ev.type)) {
    return alert("시작/종료/숙소 블록은 삭제할 수 없어요.");
  }

  // 이미 빈칸이면 굳이 또 처리하지 않음
  if (!ev.title) {
    return; // 이미 비어있는 슬롯
  }

  // UI에서 "빈칸"으로 전환 (시간대 유지)
  setTimelineDays((prev) =>
    prev.map((d) => {
      if (d.date !== date) return d;
      return {
        ...d,
        events: d.events.map((e) =>
          e.start === ev.start && e.end === ev.end
            ? { ...e, title: null, type: "etc" } // <-- 핵심: 제거 말고 빈칸으로
            : e
        ),
      };
    })
  );

  // 서버 반영용으로 기록(중복 방지)
  setDeletions((prev) => {
    const key = `${date}|${ev.start}|${ev.end}`;
    if (prev.find((x) => `${x.date}|${x.start}|${x.end}` === key)) return prev;
    return [...prev, { date, start: ev.start, end: ev.end }];
  });
};

  // —— 분할
  const handleSplitSlot = (date, ev) => {
    if (["start", "end", "accommodation"].includes(ev.type)) {
      return alert("시작/종료/숙소 블록은 분할할 수 없어요.");
    }
    if (ev.title) {
      return alert("채워진 슬롯은 분할 전에 삭제해 주세요.");
    }
    const s = toMin(ev.start);
    const e = toMin(ev.end);
    if (e - s < 60) return alert("분할하려면 최소 60분 이상이어야 해요.");

    let mid = roundTo((s + e) / 2, 15);
    const leftMin = s + 30;
    const rightMin = e - 30;
    mid = Math.max(leftMin, Math.min(rightMin, mid));

    // 프런트 즉시 반영
    setTimelineDays((prev) =>
      prev.map((d) => {
        if (d.date !== date) return d;
        const events = [];
        d.events.forEach((x) => {
          if (x.start === ev.start && x.end === ev.end) {
            events.push({ title: null, start: ev.start, end: toHHMM(mid), type: "etc" });
            events.push({ title: null, start: toHHMM(mid), end: ev.end, type: "etc" });
          } else {
            events.push(x);
          }
        });
        return { ...d, events };
      })
    );

    // 서버 전송용 기록
    setSplits((prev) => {
      const key = `${date}|${ev.start}|${ev.end}|${toHHMM(mid)}`;
      if (prev.find((x) => `${x.date}|${x.start}|${x.end}|${x.mid || ""}` === key)) return prev;
      return [...prev, { date, start: ev.start, end: ev.end, mid: toHHMM(mid) }];
    });
  };

  // —— 재생성 (삭제/분할 반영)
  const handleRegenerate = async () => {
    const user = auth.currentUser;
    if (!user) return alert("로그인이 필요합니다.");
    if (!basePayload) return;

    const hasOps = deletions.length > 0 || splits.length > 0;

    try {
      setOptimizing(true);
      const res = await fetch(`${API_BASE}/routes/prepare_dqn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasOps ? { ...basePayload, deletions, splits } : { ...basePayload }
        ),
      });
      if (res.ok) {
        const data = await res.json();
        const days = asTimeline(data);
        if (days.length > 0) setTimelineDays(days);
        setDeletions([]);
        setSplits([]);
        setEditMode(false);
        setSplitMode(false);
      } else {
        const msg = await res.text().catch(() => "");
        alert("경로 재생성 실패: " + msg);
      }
    } catch (e) {
      console.error(e);
      alert("요청 실패: " + (e?.message || String(e)));
    } finally {
      setOptimizing(false);
    }
  };

  if (loading) return <div>로딩 중...</div>;

  return (
    <div style={styles.wrap}>
      {/* 좌측 네비 (STEP 1) */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.brandDot} />
          <h2 style={{ margin: 0, fontSize: 18 }}>여행 설정</h2>
        </div>

        <div style={styles.stepTag}>STEP 1</div>
        <h3 style={styles.stepTitle}>기본 정보 입력</h3>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <Field label="여행 제목">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 나의 여름 제주 여행"
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            />
          </Field>

          <Field label="지역(기점)">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예) 제주시청, 서귀포, 신도림역"
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            />
          </Field>

          <Field label="이동 방식">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            >
              <option value="1">도보 (반경 3km)</option>
              <option value="2">대중교통 (반경 15km)</option>
              <option value="3">직접 운전 (반경 30km)</option>
            </select>
          </Field>

          {/* 날짜/시간 */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="시작 날짜">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={submitting || preparing || optimizing}
                  style={styles.input}
                />
              </Field>
              <Field label="종료 날짜">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={submitting || preparing || optimizing}
                  style={styles.input}
                />
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="시작 시간">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={submitting || preparing || optimizing}
                  style={styles.input}
                />
              </Field>
              <Field label="종료 시간">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={submitting || preparing || optimizing}
                  style={styles.input}
                />
              </Field>
            </div>
          </div>

          {/* 위치들 */}
          <Field label="시작 위치">
            <input
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              placeholder="예) 김포공항, 제주시청"
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            />
          </Field>

          <Field label="숙소(옵션)">
            <input
              type="text"
              value={lodging}
              onChange={(e) => setLodging(e.target.value)}
              placeholder="예) OO호텔 제주점"
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            />
          </Field>

          <Field label="종료 위치">
            <input
              type="text"
              value={endLocation}
              onChange={(e) => setEndLocation(e.target.value)}
              placeholder="예) 제주공항, 서귀포버스터미널"
              disabled={submitting || preparing || optimizing}
              style={styles.input}
            />
          </Field>

          {/* 선호 타입 */}
          <Field label="여행 성향">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Radio label="명소 중심" name="focus" value="attraction" checked={focusType === "attraction"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
              <Radio label="식사 중심" name="focus" value="food" checked={focusType === "food"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
              <Radio label="카페·빵집 중심" name="focus" value="cafe" checked={focusType === "cafe"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
              <Radio label="쇼핑 중심" name="focus" value="shopping" checked={focusType === "shopping"} onChange={setFocusType} disabled={submitting || preparing || optimizing} />
            </div>
          </Field>

          <button type="submit" disabled={submitting || preparing || optimizing} style={styles.primaryBtn}>
            {submitting || preparing || optimizing ? "처리 중..." : "저장 & 경로 생성"}
          </button>
        </form>
      </aside>

      {/* 우측 콘텐츠 (STEP 2) */}
      <main style={styles.main}>
        <div style={styles.headerRow}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>AI 경로 추천</div>
            <div style={{ color: "#666" }}>저장이 끝나면 우측에 막대형 타임라인으로 일정이 표시됩니다.</div>
          </div>

          {/* 편집/재생성 컨트롤 */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={toggleEdit}
              disabled={preparing || optimizing || timelineDays.length === 0}
              style={{ ...styles.primaryBtn, background: editMode ? "#0a7" : "#111" }}
              title="빈칸을 삭제(유지)하기 위한 모드"
            >
              {editMode ? "삭제 모드 종료" : "삭제 모드"}
            </button>
            <button
              onClick={toggleSplit}
              disabled={preparing || optimizing || timelineDays.length === 0}
              style={{ ...styles.primaryBtn, background: splitMode ? "#8b5cf6" : "#4b5563" }}
              title="빈칸 슬롯을 둘로 쪼개기"
            >
              {splitMode ? "분할 모드 종료" : "분할 모드"}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={optimizing || timelineDays.length === 0}
              style={{ ...styles.primaryBtn, background: "#2563eb" }}
              title="삭제/분할 반영된 빈칸만 자동으로 다시 채웁니다"
            >
              {optimizing ? "DQN 재생성 중..." : `경로 다시 생성${(deletions.length || splits.length) ? ` (${deletions.length + splits.length})` : ""}`}
            </button>
          </div>
        </div>

        <section style={styles.stageCard}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0a7" }}>STEP 2</div>
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>여행 경로 타임라인</h3>

          {preparing && <div style={{ marginBottom: 8 }}>기초 테이블 생성 중...</div>}
          {optimizing && <div style={{ marginBottom: 12 }}>DQN 최적화 중...</div>}

          {timelineDays.length === 0 ? (
            <div style={styles.placeholder}><div>아직 생성된 일정이 없습니다.</div></div>
          ) : (
            <Timeline
              days={timelineDays}
              editable={editMode}
              splitable={splitMode}
              onDelete={handleDeleteSlot}
              onSplit={handleSplitSlot}
            />
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- 작은 UI 헬퍼 ---------- */
function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#444" }}>{label}</label>
      {children}
    </div>
  );
}

function Radio({ label, name, value, checked, onChange, disabled }) {
  return (
    <label style={styles.radioItem}>
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

/* ---------- 타임라인 (삭제/분할) ---------- */
function Timeline({ days, editable = false, splitable = false, onDelete, onSplit }) {
  const toMin = (hm) => {
    const [h, m] = hm.split(":").map(Number);
    return h * 60 + m;
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {days.map((day) => {
        const events = day.events || [];
        if (events.length === 0) {
          return (
            <div key={day.date} style={styles.dayBlock}>
              <DayHeader date={day.date} weekday={day.weekday} />
              <div style={styles.placeholder}>이 날의 일정이 없습니다.</div>
            </div>
          );
        }

        const minStart = Math.min(...events.map((e) => toMin(e.start)));
        const maxEnd = Math.max(...events.map((e) => toMin(e.end)));
        const rangeStart = Math.max(0, minStart - 30);
        const rangeEnd = Math.min(24 * 60, maxEnd + 30);
        const total = Math.max(1, rangeEnd - rangeStart);

        return (
          <div key={day.date} style={styles.dayBlock}>
            <DayHeader date={day.date} weekday={day.weekday} />

            <div style={styles.axisRow}>
              <span>{minLabel(rangeStart)}</span>
              <span>{maxLabel(rangeEnd)}</span>
            </div>

            <div style={styles.timelineRow}>
              <div style={styles.timelineTrack}>
                {events.map((e, idx) => {
                  const left = ((toMin(e.start) - rangeStart) / total) * 100;
                  const width = ((toMin(e.end) - toMin(e.start)) / total) * 100;
                  const lock = ["start", "end", "accommodation"].includes(e.type);

                  const isEmpty = !e.title;
                  const showDelete = editable && !lock;
                  const showSplit = splitable && !lock && isEmpty;

                  return (
                    <div
                      key={`${e.start}-${e.end}-${idx}`}
                      title={`${e.title || "(빈칸)"} (${e.start}~${e.end})`}
                      style={{
                        position: "absolute",
                        left: `${left}%`,
                        width: `${Math.max(0, width)}%`,
                        top: 6,
                        height: 28,
                        borderRadius: 8,
                        padding: "4px 8px",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        ...barStyleByType(e.type),
                        opacity: isEmpty ? 0.85 : 1,
                        borderStyle: isEmpty ? "dashed" : "solid",
                      }}
                    >
                      <strong style={{ marginRight: 6 }}>{e.start}</strong>
                      <span style={{ flex: 1, minWidth: 0 }}>{e.title || "빈 슬롯"}</span>

                      {showSplit && (
                        <button
                          onClick={() => onSplit?.(day.date, e)}
                          style={btnSplit}
                          title="이 빈 슬롯을 두 개로 분할"
                        >
                          분할
                        </button>
                      )}

                      {showDelete && (
                        <button
                          onClick={() => onDelete?.(day.date, e)}
                          style={btnDelete}
                          title="이 슬롯 삭제(빈칸으로 만들어 DQN이 다시 채우게 함)"
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

function DayHeader({ date, weekday }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{date}</div>
      {weekday && <div style={{ color: "#888" }}>{weekday}</div>}
    </div>
  );
}

function minLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function maxLabel(mins) {
  return minLabel(mins);
}

function barStyleByType(type) {
  const map = {
    start: { background: "#e0f2fe", border: "1px solid #bae6fd", color: "#0c4a6e" },
    end: { background: "#fee2e2", border: "1px solid #fecaca", color: "#7f1d1d" },
    accommodation: { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#0f172a" },
    tourist_attraction: { background: "#dcfce7", border: "1px solid #bbf7d0", color: "#14532d" },
    restaurant: { background: "#fef9c3", border: "1px solid #fde68a", color: "#713f12" },
    cafe: { background: "#fae8ff", border: "1px solid #f5d0fe", color: "#4a044e" },
    bakery: { background: "#ffedd5", border: "1px solid #fed7aa", color: "#7c2d12" },
    bar: { background: "#ede9fe", border: "1px solid #ddd6fe", color: "#3730a3" },
    shopping_mall: { background: "#fee2f2", border: "1px solid #fbcfe8", color: "#831843" },
    etc: { background: "#e5e7eb", border: "1px solid #d1d5db", color: "#111827" },
  };
  return map[type] || map.etc;
}

/* ---------- 스타일 ---------- */
const styles = {
  wrap: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    minHeight: "100vh",
    background: "#f7f7f8",
  },
  sidebar: {
    padding: 16,
    borderRight: "1px solid #eee",
    background: "#fff",
    position: "sticky",
    top: 0,
    alignSelf: "start",
    height: "100vh",
    overflowY: "auto",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #38bdf8, #34d399)",
  },
  stepTag: {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    color: "#0a7",
    background: "#eafff6",
    padding: "4px 8px",
    borderRadius: 8,
    marginTop: 4,
  },
  stepTitle: {
    margin: "8px 0 12px",
    fontSize: 16,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
  },
  radioItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    background: "#fff",
  },
  primaryBtn: {
    marginTop: 6,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  main: {
    padding: 24,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  stageCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 16,
    padding: 18,
  },
  placeholder: {
    border: "1px dashed #ccc",
    borderRadius: 12,
    padding: 24,
    textAlign: "center",
    color: "#888",
    background: "#fafafa",
  },
  dayBlock: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 12,
  },
  axisRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#777",
    marginBottom: 6,
  },
  timelineRow: {
    position: "relative",
    height: 40,
  },
  timelineTrack: {
    position: "relative",
    height: 40,
    background: "#f5f5f7",
    border: "1px dashed #e5e7eb",
    borderRadius: 10,
    overflow: "hidden",
  },
};

const btnDelete = {
  fontSize: 11,
  border: "1px solid #ef4444",
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 6,
  padding: "2px 6px",
  cursor: "pointer",
};

const btnSplit = {
  fontSize: 11,
  border: "1px solid #7c3aed",
  background: "#ede9fe",
  color: "#5b21b6",
  borderRadius: 6,
  padding: "2px 6px",
  cursor: "pointer",
};
