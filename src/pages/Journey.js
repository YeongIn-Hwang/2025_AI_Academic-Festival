/*import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function Journey() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // 기본 입력 (기존)
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("2"); // 1:도보, 2:대중교통, 3:운전

  // 신규 입력
  const [startDate, setStartDate] = useState("");   // yyyy-mm-dd
  const [endDate, setEndDate] = useState("");       // yyyy-mm-dd
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("22:00");
  const [startLocation, setStartLocation] = useState(""); // 출발지
  const [lodging, setLodging] = useState("");             // 숙소
  const [endLocation, setEndLocation] = useState("");     // 도착지
  const [focusType, setFocusType] = useState("attraction"); // 명소/식사/카페·빵집/쇼핑

  const [submitting, setSubmitting] = useState(false);

  // Vite + CRA 대응
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }

    // 간단 검증
    if (!title.trim()) return alert("여행 제목을 입력하세요.");
    if (!query.trim()) return alert("지역(기점)을 입력하세요.");
    if (!startDate || !endDate) return alert("시작/종료 날짜를 선택하세요.");
    if (!startTime || !endTime) return alert("시작/종료 시간을 입력하세요.");
    if (!startLocation.trim() || !endLocation.trim())
      return alert("시작/종료 위치를 입력하세요.");

    try {
      setSubmitting(true);

      // 백엔드: /places_build_save (기존 파이프라인 + 저장)
      // 백엔드가 아래 신규 필드를 받도록 스키마만 추가해주면 바로 연동됩니다.
      const res = await fetch(`${API_BASE}/places_build_save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          title: title.trim(),
          query: query.trim(),
          method: Number(method),

          // 신규 파라미터
          start_date: startDate,     // "2025-08-15"
          end_date: endDate,         // "2025-08-20"
          start_time: startTime,     // "10:00"
          end_time: endTime,         // "22:00"
          start_location: startLocation.trim(),
          lodging: lodging.trim(),
          end_location: endLocation.trim(),
          focus_type: focusType,     // "attraction" | "food" | "cafe" | "shopping"
        }),
      });

      if (res.status === 401) {
        alert("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        navigate("/login");
        return;
      }
      if (!res.ok) {
        const msg = await res.text();
        console.error(msg);
        alert("서버 오류: " + msg);
        return;
      }

      const data = await res.json();
      alert("1단계 저장 완료! 장소 수집/임베딩/저장을 시작합니다.");
      // 이후: 우측 패널에서 상태/결과를 보여주도록 확장 가능
      // navigate(`/journey/${encodeURIComponent(title)}`);
    } catch (err) {
      console.error(err);
      alert("요청 실패: " + (err?.message || String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>로딩 중...</div>;

  return (
    <div style={styles.wrap}>
      {}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.brandDot} />
          <h2 style={{ margin: 0, fontSize: 18 }}>여행 설정</h2>
        </div>

        <div style={styles.stepTag}>STEP 1</div>
        <h3 style={styles.stepTitle}>기본 정보 입력</h3>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          {}
          <Field label="여행 제목">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 나의 여름 제주 여행"
              disabled={submitting}
              style={styles.input}
            />
          </Field>

          <Field label="지역(기점)">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예) 제주시청, 서귀포, 신도림역"
              disabled={submitting}
              style={styles.input}
            />
          </Field>

          <Field label="이동 방식">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={submitting}
              style={styles.input}
            >
              <option value="1">도보 (반경 3km)</option>
              <option value="2">대중교통 (반경 15km)</option>
              <option value="3">직접 운전 (반경 30km)</option>
            </select>
          </Field>

          {}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="시작 날짜">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={submitting}
                  style={styles.input}
                />
              </Field>
              <Field label="종료 날짜">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={submitting}
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
                  disabled={submitting}
                  style={styles.input}
                />
              </Field>
              <Field label="종료 시간">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={submitting}
                  style={styles.input}
                />
              </Field>
            </div>
          </div>

          {}
          <Field label="시작 위치">
            <input
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              placeholder="예) 김포공항, 제주시청"
              disabled={submitting}
              style={styles.input}
            />
          </Field>

          <Field label="숙소(옵션)">
            <input
              type="text"
              value={lodging}
              onChange={(e) => setLodging(e.target.value)}
              placeholder="예) OO호텔 제주점"
              disabled={submitting}
              style={styles.input}
            />
          </Field>

          <Field label="종료 위치">
            <input
              type="text"
              value={endLocation}
              onChange={(e) => setEndLocation(e.target.value)}
              placeholder="예) 제주공항, 서귀포버스터미널"
              disabled={submitting}
              style={styles.input}
            />
          </Field>

          {}
          <Field label="여행 성향">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={styles.radioItem}>
                <input
                  type="radio"
                  name="focus"
                  value="attraction"
                  checked={focusType === "attraction"}
                  onChange={(e) => setFocusType(e.target.value)}
                  disabled={submitting}
                />
                <span>명소 중심</span>
              </label>
              <label style={styles.radioItem}>
                <input
                  type="radio"
                  name="focus"
                  value="food"
                  checked={focusType === "food"}
                  onChange={(e) => setFocusType(e.target.value)}
                  disabled={submitting}
                />
                <span>식사 중심</span>
              </label>
              <label style={styles.radioItem}>
                <input
                  type="radio"
                  name="focus"
                  value="cafe"
                  checked={focusType === "cafe"}
                  onChange={(e) => setFocusType(e.target.value)}
                  disabled={submitting}
                />
                <span>카페·빵집 중심</span>
              </label>
              <label style={styles.radioItem}>
                <input
                  type="radio"
                  name="focus"
                  value="shopping"
                  checked={focusType === "shopping"}
                  onChange={(e) => setFocusType(e.target.value)}
                  disabled={submitting}
                />
                <span>쇼핑 중심</span>
              </label>
            </div>
          </Field>

          <button type="submit" disabled={submitting} style={styles.primaryBtn}>
            {submitting ? "처리 중..." : "1단계 저장 & 경로 준비"}
          </button>
        </form>
      </aside>

      {}
      <main style={styles.main}>
        <div style={styles.headerRow}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>AI 경로 추천</div>
            <div style={{ color: "#666" }}>
              좌측에서 기본 정보를 저장하면, 여기서 추천 경로가 전개됩니다.
            </div>
          </div>
        </div>

        <section style={styles.stageCard}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0a7" }}>STEP 2</div>
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>여행 경로 생성</h3>
          <p style={{ color: "#666", marginBottom: 16 }}>
            현재는 플레이스 수집/임베딩까지 수행하고 저장합니다. 다음 단계로
            경로 작성기가 결과를 불러와 시간표에 배치하도록 연결할 수 있어요.
          </p>

          {}
          <div style={styles.placeholder}>
            <div>결과 패널 (후보 장소, 일정표, 드래그 배치 등)</div>
          </div>
        </section>
      </main>
    </div>
  );
}


function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#444" }}>
        {label}
      </label>
      {children}
    </div>
  );
}


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
};
*/
/////////////////////////////////////////////////////////////////////////////////////////*/
// src/pages/Journey.jsx

// src/pages/Journey.jsx
// src/pages/Journey.jsx
// src/pages/Journey.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";

// 🔹 Firestore 불러오기 (이미 프로젝트에 있는 인스턴스를 사용)
import { db } from "../firebase";
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
  const [preparing, setPreparing] = useState(false);   // basic 생성 단계
  const [optimizing, setOptimizing] = useState(false); // DQN 단계
  const [timelineDays, setTimelineDays] = useState([]);

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

  // 🔹 Firestore에 동일 title 존재 여부 확인
  const checkTripExists = async (uid, tripTitle) => {
    try {
      const ref = doc(db, "user_trips", uid, "trips", tripTitle.trim());
      const snap = await getDoc(ref);
      return snap.exists();
    } catch (e) {
      console.warn("[Journey] checkTripExists error:", e);
      // 에러 시엔 보수적으로 '존재하지 않음'으로 처리해서 신규 저장을 시도
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

      const basePayload = {
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
        focus_type: focusType, // "attraction" | "food" | "cafe" | "shopping"
      };

      // ✅ 먼저 Firestore에 같은 title이 이미 있는지 확인
      const alreadyExists = await checkTripExists(user.uid, title);

      // 1) 장소 수집/저장 (only if NOT exists)
      if (!alreadyExists) {
        const res = await fetch(`${API_BASE}/places_build_save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
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
      } else {
        console.log("[Journey] 동일 title 존재 → places_build_save 스킵, 저장된 지역 데이터만 사용");
      }

      // 2) 기본 테이블 생성
      setPreparing(true);
      const prepBasic = await fetch(`${API_BASE}/routes/prepare_basic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });

      if (!prepBasic.ok) {
        const msg = await prepBasic.text().catch(() => "");
        console.error(msg);
        alert("경로 생성 실패: " + msg);
        return;
      }

      const basicData = await prepBasic.json();
      const basicDays = asTimeline(basicData);
      setTimelineDays(basicDays);

      // 3) DQN 최적화 (표시: ‘DQN 최적화 중…’)
      setOptimizing(true);
      const prepDqn = await fetch(`${API_BASE}/routes/prepare_dqn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });

      if (prepDqn.ok) {
        const dqnData = await prepDqn.json();
        const dqnDays = asTimeline(dqnData);
        if (dqnDays.length > 0) {
          setTimelineDays(dqnDays); // DQN 결과로 갱신
        }
      } else {
        const msg = await prepDqn.text().catch(() => "");
        console.warn("DQN 실패:", msg);
        // 실패해도 basic 결과는 유지
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
            <div style={{ color: "#666" }}>
              저장이 끝나면 우측에 막대형 타임라인으로 일정이 표시됩니다.
            </div>
          </div>
        </div>

        <section style={styles.stageCard}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0a7" }}>STEP 2</div>
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>여행 경로 타임라인</h3>

          {preparing && <div style={{ marginBottom: 8 }}>기초 테이블 생성 중...</div>}
          {optimizing && <div style={{ marginBottom: 12 }}>DQN 최적화 중...</div>}

          {timelineDays.length === 0 ? (
            <div style={styles.placeholder}>
              <div>아직 생성된 일정이 없습니다.</div>
            </div>
          ) : (
            <Timeline days={timelineDays} />
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
      <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "#444" }}>
        {label}
      </label>
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

/* ---------- 타임라인 ---------- */
function Timeline({ days }) {
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
                  return (
                    <div
                      key={idx}
                      title={`${e.title} (${e.start}~${e.end})`}
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
                        ...barStyleByType(e.type),
                      }}
                    >
                      <strong style={{ marginRight: 6 }}>{e.start}</strong>
                      <span>{e.title}</span>
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
    border: "1px solid " + "#ddd",
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
