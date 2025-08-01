import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addMonths, format } from "date-fns";
import Calendar from "./CalendarComponent"; // ✅ 캘린더 UI를 별도 컴포넌트로 추출

export default function CalendarPage() {
    const navigate = useNavigate();
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const handleSelect = (start, end) => {
        setStartDate(start);
        setEndDate(end);
    };

    const handleNext = () => {
        if (!startDate || !endDate) {
            alert("여행 기간을 선택하세요!");
            return;
        }
        navigate("/diary", { state: { startDate, endDate } });
    };

    return (
        <div style={{ padding: "20px", textAlign: "center" }}>
            <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-lg font-semibold">📅 여행 기간 선택</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="nav-btn">◀</button>
                <span>{format(currentMonth, "yyyy년 M월")}</span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="nav-btn">▶</button>
            </div>

            <Calendar currentMonth={currentMonth} startDate={startDate} endDate={endDate} onSelect={handleSelect} />

            <div className="mt-4">
                {startDate && endDate && <p>선택 기간: {format(startDate, "yyyy-MM-dd")} ~ {format(endDate, "yyyy-MM-dd")}</p>}
                <button onClick={handleNext} className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg">다음</button>
            </div>
        </div>
    );
}
