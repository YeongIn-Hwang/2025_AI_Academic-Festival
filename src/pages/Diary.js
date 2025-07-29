import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db, storage } from "../firebase";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addDays,
    isSameDay,
    isSameMonth,
    isAfter,
    addMonths,
    isBefore,
    startOfDay
} from "date-fns";
import "../styles/diary.css";

export default function Diary() {
    const { region } = useParams();
    const navigate = useNavigate();
    const normalizedRegion = region.replace(/\s.*구$/, "").trim();

    const [images, setImages] = useState([]);
    const [note, setNote] = useState("");
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [companions, setCompanions] = useState([]);
    const [travelStyles, setTravelStyles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const companionsList = ["혼자", "친구와", "연인과", "배우자와", "아이와", "부모님과", "기타"];
    const travelStyleList = [
        "체험·액티비티", "SNS 핫플레이스", "자연과 함께", "유명 관광지는 필수",
        "여유롭게 힐링", "문화·예술·역사", "여행지 느낌 물씬", "쇼핑은 열정적으로", "관광보다 먹방"
    ];

    const toggleTag = (tag, setter) => {
        setter((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
    };

    const handleImageChange = (e) => {
        const newFiles = Array.from(e.target.files);
        setImages((prev) => [...prev, ...newFiles]);
    };

    const getCalendarDates = (month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const calendarStart = startOfWeek(monthStart);
        const calendarEnd = endOfWeek(monthEnd);

        const dates = [];
        let day = calendarStart;
        while (day <= calendarEnd) {
            dates.push(day);
            day = addDays(day, 1);
        }
        return dates;
    };

    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
    const today = startOfDay(new Date());

    /** ✅ 과거 날짜도 선택 가능하게 수정 */
    const handleDateClick = (date) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(date);
            setEndDate(null);
        } else if (startDate && !endDate) {
            if (isAfter(date, startDate) || isSameDay(date, startDate)) {
                setEndDate(date);
            }
        }
    };

    /** ✅ 범위 포함 여부 */
    const isInRange = (date) => {
        if (!startDate || !endDate) return false;
        return (
            isSameDay(date, startDate) ||
            isSameDay(date, endDate) ||
            (isAfter(date, startDate) && isBefore(date, endDate))
        );
    };

    /** ✅ Firebase 저장 (과거 날짜도 허용) */
    const handleSave = async () => {
        if (!startDate || !endDate) {
            alert("여행 시작일과 종료일을 선택해주세요.");
            return;
        }
        if (isBefore(endDate, startDate)) {
            alert("도착일은 출발일 이전일 수 없습니다.");
            return;
        }

        setLoading(true);
        setError(null);

        const user = auth.currentUser;
        if (!user) {
            setError("로그인이 필요합니다.");
            setLoading(false);
            return;
        }

        try {
            const imageUrls = [];
            for (const img of images) {
                const safeName = `${Date.now()}_${img.name.replace(/[^\w.]+/g, "_")}`;
                const storageRef = ref(storage, `diary/${user.uid}/${normalizedRegion}/${safeName}`);
                const snapshot = await uploadBytes(storageRef, img);
                const url = await getDownloadURL(snapshot.ref);
                imageUrls.push(url);
            }

            const userRef = doc(db, "users", user.uid);
            await setDoc(userRef, {
                visitedCities: arrayUnion(normalizedRegion),
                diaryEntries: {
                    [normalizedRegion]: {
                        dateRange: { start: format(startDate, "yyyy-MM-dd"), end: format(endDate, "yyyy-MM-dd") },
                        companions,
                        travelStyles,
                        images: imageUrls,
                        note,
                        createdAt: new Date()
                    }
                }
            }, { merge: true });

            navigate(`/map?region=${encodeURIComponent(normalizedRegion)}`);
        } catch (e) {
            console.error("일기 저장 중 오류:", e);
            setError("저장 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    /** ✅ 월별 달력 UI */
    const renderMonthGrid = (monthToRender) => {
        const monthAllDates = getCalendarDates(monthToRender);

        return (
            <div className="flex-1 p-2">
                <div className="text-lg font-semibold mb-2 text-center">
                    {format(monthToRender, "M월")}
                </div>

                <div className="calendar-grid-header">
                    {weekDays.map((day, idx) => (
                        <div key={idx} className="text-gray-500 text-sm text-center">{day}</div>
                    ))}
                </div>

                <div className="calendar-grid">
                    {monthAllDates.map((date, idx) => {
                        const isSelectedStart = startDate && isSameDay(date, startDate);
                        const isSelectedEnd = endDate && isSameDay(date, endDate);
                        const isDateInRange = isInRange(date);

                        /** ✅ 비활성화 조건 → 과거 선택 가능, 단 종료일 선택 시 출발일 이전 비활성화 */
                        const isDisabled =
                            !isSameMonth(monthToRender, date) ||
                            (startDate && !endDate && isBefore(date, startDate));

                        return (
                            <button
                                key={idx}
                                onClick={() => handleDateClick(date)}
                                disabled={isDisabled}
                                className={`calendar-cell 
                                    ${!isSameMonth(monthToRender, date) ? "other-month" : ""} 
                                    ${isSelectedStart ? "start-date" : ""} 
                                    ${isSelectedEnd ? "end-date" : ""} 
                                    ${isDateInRange && !isSelectedStart && !isSelectedEnd ? "in-range" : ""} 
                                    ${isDisabled ? "disabled" : "hoverable"}`}
                            >
                                {date.getDate()}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: "20px", textAlign: "center" }}>
            <h2>{normalizedRegion} 여행 기록</h2>

            <input type="file" multiple onChange={handleImageChange} disabled={loading} />
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", margin: "10px 0" }}>
                {images.map((img, idx) => (
                    <img key={idx} src={URL.createObjectURL(img)} alt="preview" width="100" style={{ margin: "5px", borderRadius: "10px" }} />
                ))}
            </div>

            <h3>📅 여행 기간</h3>
            <div className="p-4 rounded-xl shadow-md bg-white w-[650px] mx-auto flex flex-col">
                <div className="flex justify-between items-center mb-4 px-4">
                    <button onClick={() => setCurrentMonth(prev => addMonths(prev, -1))} className="text-2xl">◀</button>
                    <div className="text-xl font-bold">{format(currentMonth, "yyyy년")}</div>
                    <button onClick={() => setCurrentMonth(prev => addMonths(prev, 1))} className="text-2xl">▶</button>
                </div>

                <div className="flex justify-between gap-4">
                    {renderMonthGrid(currentMonth)}
                    {renderMonthGrid(addMonths(currentMonth, 1))}
                </div>

                <div className="mt-4 text-base text-left px-4">
                    {startDate && !endDate && <p>출발일: {format(startDate, "yyyy-MM-dd")}</p>}
                    {startDate && endDate && <p>선택 기간: {format(startDate, "yyyy-MM-dd")} ~ {format(endDate, "yyyy-MM-dd")}</p>}
                </div>
            </div>

            <h3>👥 누구와 떠났나요?</h3>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
                {companionsList.map((c) => (
                    <button key={c} onClick={() => toggleTag(c, setCompanions)}
                            style={{
                                margin: "5px", padding: "8px 15px", borderRadius: "20px",
                                border: companions.includes(c) ? "2px solid #007bff" : "1px solid #ccc",
                                background: companions.includes(c) ? "#e6f0ff" : "white"
                            }}>{c}</button>
                ))}
            </div>

            <h3>🌎 선호하는 여행 스타일</h3>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
                {travelStyleList.map((style) => (
                    <button key={style} onClick={() => toggleTag(style, setTravelStyles)}
                            style={{
                                margin: "5px", padding: "8px 15px", borderRadius: "20px",
                                border: travelStyles.includes(style) ? "2px solid #007bff" : "1px solid #ccc",
                                background: travelStyles.includes(style) ? "#e6f0ff" : "white"
                            }}>{style}</button>
                ))}
            </div>

            <h3>📝 여행 메모</h3>
            <textarea placeholder="여행에서 느낀 점을 기록해보세요!"
                      rows={5} cols={40} value={note} onChange={(e) => setNote(e.target.value)}
                      style={{ resize: "none", padding: "10px", marginTop: "10px" }} />

            {error && <p style={{ color: "red" }}>{error}</p>}

            <div style={{ marginTop: "20px" }}>
                <button onClick={handleSave} disabled={loading} style={{
                    padding: "10px 20px", fontSize: "16px",
                    border: "1px solid #007bff", background: "white",
                    borderRadius: "5px", cursor: loading ? "not-allowed" : "pointer"
                }}>
                    {loading ? "저장 중..." : "저장하기"}
                </button>
            </div>
        </div>
    );
}
