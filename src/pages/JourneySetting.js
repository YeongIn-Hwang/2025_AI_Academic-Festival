// src/pages/JourneySetting.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { RiArrowDropDownLine } from "react-icons/ri";
import "../styles/Journey.css";
import "../styles/JourneySetting.css";

export default function JourneySetting() {
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);

    // 기본 입력 상태 (Journey.js에서 쓰던 것과 동일 키)
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

    // 로그인 체크
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            if (!user) navigate("/login");
            else setLoading(false);
        });
        return () => unsub();
    }, [navigate]);

    // 다른 페이지에서 initial 값 전달받으면 채워넣기
    useEffect(() => {
        if (loading) return;
        const init = location.state?.initial;
        if (!init) return;
        setTitle(init.title ?? "");
        setQuery(init.query ?? "");
        setMethod(String(init.method ?? "2"));
        setStartDate(init.start_date ?? "");
        setEndDate(init.end_date ?? "");
        setStartTime(init.start_time ?? "10:00");
        setEndTime(init.end_time ?? "22:00");
        setStartLocation(init.start_location ?? "");
        setLodging(init.lodging ?? "");
        setEndLocation(init.end_location ?? "");
        setFocusType(init.focus_type ?? "attraction");
        // 필요 시, 아래 주석을 풀면 뒤로가기 시 state 잔상 제거 가능
        // navigate(location.pathname, { replace: true, state: {} });
    }, [loading, location.state, navigate]);

    // 생성/조회 공통 payload
    const payload = useMemo(
        () => ({
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
        }),
        [title, query, method, startDate, endDate, startTime, endTime, startLocation, lodging, endLocation, focusType]
    );

    // 경로 생성 (Journey 페이지로 이동)
    const handleGo = (e) => {
        e.preventDefault();
        // 필수값 간단 검증
        if (!payload.title) return alert("여행 제목을 입력하세요.");
        if (!payload.query) return alert("지역(기점)을 입력하세요.");
        if (!payload.start_date || !payload.end_date) return alert("시작/종료 날짜를 선택하세요.");
        if (!payload.start_time || !payload.end_time) return alert("시작/종료 시간을 입력하세요.");
        if (!payload.start_location || !payload.end_location) return alert("시작/종료 위치를 입력하세요.");

        // ✅ Journey 페이지로 폼 값 전달
        navigate("/journey", { state: { payload } });
    };

    if (loading) return <div>로딩 중...</div>;

    const hasTitle = !!title.trim();

    return (
        <main className="jr-setting">
            {/* ⚠️ 상단헤더 없음: 헤더는 Journey.js에만 있음 */}
            <div className="jr-setting-inner">
                <h2 className="jr-step-title">여행 정보 입력</h2>

                <form onSubmit={handleGo} className="jr-form-grid">
                    <Field label="여행 제목">
                        <input
                            className="jr-input"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="예) 나의 여름 제주 여행"
                        />
                    </Field>

                    <Field label="지역(기점)">
                        <input
                            className="jr-input"
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="예) 제주시청, 서귀포, 신도림역"
                        />
                    </Field>

                    <Field label="이동 방식">
                        <div className="jr-select-wrapper">
                            <select
                                className="jr-input jr-select"
                                value={method}
                                onChange={(e) => setMethod(e.target.value)}
                            >
                                <option value="1">도보 (반경 3km)</option>
                                <option value="2">대중교통 (반경 15km)</option>
                                <option value="3">직접 운전 (반경 30km)</option>
                            </select>
                            <RiArrowDropDownLine className="jr-select-icon" />
                        </div>
                    </Field>

                    <div className="jr-grid-2">
                        <Field label="시작 날짜">
                            <input
                                className="jr-input"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </Field>
                        <Field label="종료 날짜">
                            <input
                                className="jr-input"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </Field>
                    </div>

                    <div className="jr-grid-2">
                        <Field label="시작 시간">
                            <input
                                className="jr-input"
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </Field>
                        <Field label="종료 시간">
                            <input
                                className="jr-input"
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </Field>
                    </div>

                    <Field label="시작 위치">
                        <input
                            className="jr-input"
                            type="text"
                            value={startLocation}
                            onChange={(e) => setStartLocation(e.target.value)}
                            placeholder="예) 김포공항, 제주시청"
                        />
                    </Field>

                    <Field label="숙소(옵션)">
                        <input
                            className="jr-input"
                            type="text"
                            value={lodging}
                            onChange={(e) => setLodging(e.target.value)}
                            placeholder="예) OO호텔 제주점"
                        />
                    </Field>

                    <Field label="종료 위치">
                        <input
                            className="jr-input"
                            type="text"
                            value={endLocation}
                            onChange={(e) => setEndLocation(e.target.value)}
                            placeholder="예) 제주공항, 서귀포버스터미널"
                        />
                    </Field>

                    <Field label="여행 성향">
                        <div className="jr-grid-2 gap-8">
                            <Radio
                                label="명소 중심"
                                name="focus"
                                value="attraction"
                                checked={focusType === "attraction"}
                                onChange={setFocusType}
                            />
                            <Radio
                                label="식사 중심"
                                name="focus"
                                value="food"
                                checked={focusType === "food"}
                                onChange={setFocusType}
                            />
                            <Radio
                                label="카페·빵집"
                                name="focus"
                                value="cafe"
                                checked={focusType === "cafe"}
                                onChange={setFocusType}
                            />
                            <Radio
                                label="쇼핑 중심"
                                name="focus"
                                value="shopping"
                                checked={focusType === "shopping"}
                                onChange={setFocusType}
                            />
                        </div>
                    </Field>

                    <div className="jr-hint">
                        이미 저장해둔 일정이 있다면{" "}
                        <Link
                            to="/journey"
                            state={{ loadTitle: title.trim() }}
                            className={`linklike${hasTitle ? "" : " is-disabled"}`}
                            aria-disabled={!hasTitle}
                            onClick={(e) => {
                                if (!hasTitle) {
                                    e.preventDefault();
                                    alert("여행 제목을 먼저 입력하세요.");
                                }
                            }}
                        >
                            바로 경로 보기
                        </Link>
                    </div>

                    <button type="submit" className="btn-primary_main">
                        경로 생성하기
                    </button>
                </form>
            </div>
        </main>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="jr-label">{label}</label>
            {children}
        </div>
    );
}

function Radio({ label, name, value, checked, onChange }) {
    return (
        <label className="jr-radio-set">
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={(e) => onChange(e.target.value)}
            />
            <span>{label}</span>
        </label>
    );
}
