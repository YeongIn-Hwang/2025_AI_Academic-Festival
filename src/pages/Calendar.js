import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addDays,
    isSameDay,
    isSameMonth,
    addMonths,
    isBefore,
    isAfter
} from "date-fns";
import "../styles/calendar.css";

export default function Calendar() {
    const { region } = useParams();
    const navigate = useNavigate();

    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

    // ✅ 날짜 클릭 핸들러
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

    // ✅ 선택된 날짜 범위 체크
    const isInRange = (date) => {
        if (!startDate || !endDate) return false;
        return (
            isSameDay(date, startDate) ||
            isSameDay(date, endDate) ||
            (isAfter(date, startDate) && isBefore(date, endDate))
        );
    };

    // ✅ 월별 날짜 생성
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

    // ✅ UI: 월별 달력 렌더링
    const renderMonthGrid = (monthToRender) => {
        const monthAllDates = getCalendarDates(monthToRender);
        return (
            <div className="flex-1 p-2">
                <div className="calendar-title2">{format(monthToRender, "M월")}</div>
                <div className="calendar-grid-header">
                    {weekDays.map((day, idx) => (
                        <div key={idx}>{day}</div>
                    ))}
                </div>
                <div className="calendar-grid">
                    {monthAllDates.map((date, idx) => {
                        const isSelectedStart = startDate && isSameDay(date, startDate);
                        const isSelectedEnd = endDate && isSameDay(date, endDate);
                        const isDateInRange = isInRange(date);
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

    // ✅ 다음 버튼 → Diary 이동
    const handleNext = () => {
        if (!startDate || !endDate) {
            alert("출발일과 종료일을 선택해주세요.");
            return;
        }
        navigate(`/diary/${encodeURIComponent(region)}?start=${format(startDate, "yyyy-MM-dd")}&end=${format(endDate, "yyyy-MM-dd")}`);
    };

    return (
        <div style={{ padding: "20px", textAlign: "center" }}>

            {/* ✅ 네비게이션 UI */}
            <div className="calendar-nav">
                <button className="nav-btn" onClick={() => setCurrentMonth(prev => addMonths(prev, -1))}>◀</button>
                <span className="calendar-title1">{format(currentMonth, "yyyy년 M월")}</span>
                <button className="nav-btn" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>▶</button>
            </div>

            {/* ✅ 달력 UI (현재월)*/}
            <div className="p-4 rounded-xl shadow-md bg-white w-[650px] mx-auto flex flex-col">
                <div className="flex justify-between gap-4">
                    {renderMonthGrid(currentMonth)}
                </div>
            </div>

            <div className="calendar-date-info">
                {startDate && !endDate && <p>출발일: {format(startDate, "yyyy-MM-dd")}</p>}
                {startDate && endDate && <p>선택 기간: {format(startDate, "yyyy-MM-dd")} ~ {format(endDate, "yyyy-MM-dd")}</p>}
            </div>

            {/* ✅ 예쁜 Pill 버튼 */}
            <button className="calendar-next-btn" onClick={handleNext}>
                다이어리 작성하기
            </button>
        </div>
    );
}
