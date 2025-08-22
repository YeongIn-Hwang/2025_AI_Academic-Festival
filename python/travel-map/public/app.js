/***** 페이지 옵션 *****/
const USER_ID = "user_001";
const TITLE   = "나의 여행";

// 날짜별 색상 팔레트 (일자 순서대로 순환)
const COLORS = ["#ef4444","#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#22c55e","#06b6d4","#eab308"];
// 일정에서 제외할 타입들 (필요 시 추가)
const EXCLUDE_TYPES = new Set(["start","end"]);

// 현재 선택 모드: 'car' | 'walk' | 'traffic' | 'bicycle'
let currentMode = "car";

/***** 일정 JSON → 일자별 장소 리스트(+색상) 변환 *****/
function buildDays(raw, userId, title) {
  const trips = raw[userId] || [];
  const trip  = trips.find(t => t.title === title);
  if (!trip) return [];
  return Object.keys(trip.table || {}).sort().map((date, di) => {
    const schedule = trip.table[date]?.schedule || [];
    const places = schedule
      .filter(s =>
        s && s.title && s.location_info &&
        typeof s.location_info.lat === "number" &&
        typeof s.location_info.lng === "number" &&
        !EXCLUDE_TYPES.has(s.type)
      )
      .map((s, i) => ({
        id: `${date}_${i}`,
        title: s.title,
        lat: s.location_info.lat,
        lng: s.location_info.lng,
      }));
    return { date, color: COLORS[di % COLORS.length], places, di };
  });
}

/***** Naver Maps 로드 대기 *****/
function ready(cb){
  if (window.naver && window.naver.maps) cb();
  else setTimeout(() => ready(cb), 50);
}

/***** 메인 *****/
ready(async () => {
  const selEl    = document.getElementById("sel");
  const openBtn  = document.getElementById("openKakao");
  const statusEl = document.getElementById("status");
  const legendEl = document.getElementById("legend");

  // JSON 로드
  let raw;
  try {
    raw = await fetch("./travel_logs.json").then(r => r.json());
  } catch (e) {
    statusEl.textContent = "JSON을 불러오지 못했습니다.";
    console.error(e);
    return;
  }
  const DAYS = buildDays(raw, USER_ID, TITLE);

  // 날짜별 색상 레전드 출력
  legendEl.innerHTML = DAYS.map(d => (
    `<span class="chip" style="background:${d.color}">${d.date}</span>`
  )).join("");

  // 네이버 지도 생성
  const map = new naver.maps.Map("mapMain", {
    center: new naver.maps.LatLng(37.5665, 126.9780),
    zoom: 12
  });
  const bounds = new naver.maps.LatLngBounds();
  let hasPoint = false;

  // FROM/TO 상태
  let FROM = null, TO = null;

  // 날짜별로 마커 뿌리기 (날짜별 색상)
  DAYS.forEach(day => {
    day.places.forEach((p, idx) => {
      const pos = new naver.maps.LatLng(p.lat, p.lng);
      bounds.extend(pos); hasPoint = true;

      const marker = new naver.maps.Marker({
        position: pos, map,
        icon: {
          content: `
            <div style="transform:translate(-50%,-50%);
                        display:flex;align-items:center;gap:6px;
                        background:${day.color};color:#fff;
                        padding:4px 8px;border-radius:12px;
                        box-shadow:0 1px 4px rgba(0,0,0,.25);
                        font-size:12px;white-space:nowrap;">
              ${idx + 1}. ${p.title}
            </div>`
        }
      });

      naver.maps.Event.addListener(marker, "click", () => {
        // 클릭 순서: FROM → TO → (다시) FROM 갱신
        if (!FROM) FROM = { ...p, color: day.color, date: day.date };
        else if (!TO) TO = { ...p, color: day.color, date: day.date };
        else { FROM = { ...p, color: day.color, date: day.date }; TO = null; }
        updateSelection();
      });
    });
  });
  if (hasPoint) map.fitBounds(bounds);

  // 선택/링크 갱신
  function updateSelection() {
    const fromTxt = FROM ? `${FROM.title} (${FROM.date})` : "없음";
    const toTxt   = TO   ? `${TO.title} (${TO.date})`   : "없음";
    selEl.innerHTML =
      `선택: FROM <span style="color:${FROM?FROM.color:'#fff'}">${fromTxt}</span>` +
      ` / TO <span style="color:${TO?TO.color:'#fff'}">${toTxt}</span>`;

    if (FROM && TO) {
      // 카카오맵 공식 링크 스펙:
      // https://map.kakao.com/link/by/{mode}/{이름,위도,경도}/{이름,위도,경도}
      const enc = s => encodeURIComponent(s);
      const fromSeg = `${enc(FROM.title)},${FROM.lat},${FROM.lng}`;
      const toSeg   = `${enc(TO.title)},${TO.lat},${TO.lng}`;
      openBtn.href  = `https://map.kakao.com/link/by/${currentMode}/${fromSeg}/${toSeg}`;
      openBtn.removeAttribute("aria-disabled");
    } else {
      openBtn.href = "#";
      openBtn.setAttribute("aria-disabled", "true");
    }
  }

  // 초기화
  document.getElementById("reset").onclick = () => {
    FROM = TO = null;
    updateSelection();
    statusEl.textContent = "선택을 초기화했습니다.";
    setTimeout(()=> statusEl.textContent="", 1200);
  };

  // 모드 버튼 토글 (자전거 추가)
  ["modeCar","modeWalk","modeTransit","modeBicycle"].forEach(id => {
    document.getElementById(id).onclick = (e) => {
      document.querySelectorAll(".seg button").forEach(b => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      currentMode = e.currentTarget.dataset.mode; // 'car' | 'walk' | 'traffic' | 'bicycle'
      if (FROM && TO) updateSelection();
    };
  });

  // 길찾기 버튼 클릭 전 유효성
  openBtn.addEventListener("click", (e) => {
    if (!FROM || !TO) {
      e.preventDefault();
      alert("먼저 지도에서 FROM과 TO를 순서대로 클릭하세요.");
    }
  });

  // 최초 라벨 렌더
  updateSelection();
});
