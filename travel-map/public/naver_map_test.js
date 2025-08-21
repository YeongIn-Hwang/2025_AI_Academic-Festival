// public/navermap-test.js
/* 네이버 지도 SDK 단독 테스트: http://localhost:3000/test 또는 /test/ 에서 사용 */
(function () {
  // 0) 경로 감지 ( /test, /test/, /test?cid=.. 모두 허용 )
  var path = location.pathname || "/";
  var isTest = path === "/test" || path === "/test/" || path.startsWith("/test?");
  // 테스트 페이지가 아니어도 실행되긴 하지만, 알림만 띄우고 종료
  if (!isTest) {
    console.info("[TEST] navermap-test.js loaded on non-test path:", path);
    return;
  }

  // 1) 화면 세팅
  document.title = "Naver Maps Test";
  var style = document.createElement("style");
  style.textContent = `
    html,body{height:100%;margin:0}
    #root{display:none!important}
    #map{width:100%;height:100%}
    .note{position:fixed;top:8px;left:8px;background:#111;color:#fff;
          padding:6px 10px;border-radius:8px;font:12px/1.4 system-ui;z-index:9999}
  `;
  document.head.appendChild(style);

  // 노트 유틸
  function addNote(msg, isErr) {
    var el = document.createElement("div");
    el.className = "note";
    el.style.background = isErr ? "#b91c1c" : "#111";
    el.textContent = msg;
    document.body.appendChild(el);
    return el;
  }

  // 즉시 배지: 스크립트가 실행됨을 보장
  addNote("🔎 [TEST] script loaded");

  // 2) 지도 컨테이너
  var mapDiv = document.createElement("div");
  mapDiv.id = "map";
  document.body.appendChild(mapDiv);

  // 3) Client ID 결정 (URL에서 ?cid= 로도 오버라이드 가능)
  function getParam(name){
    var m = new RegExp("[?&]"+name+"=([^&]+)").exec(location.search);
    return m && decodeURIComponent(m[1]);
  }
  var CLIENT_ID = getParam("cid") || "1rbwnf4uze"; // 필요시 ?cid=새ID

  // 4) 훅들
  window.navermap_authFailure = function () {
    addNote("❌ navermap_authFailure (Client ID / Web URL 등록 확인)", true);
    console.error("[TEST] navermap_authFailure");
  };

  window.__onNaverMapTestLoaded = function () {
    var ok = !!(window.naver && window.naver.maps);
    if (!ok) {
      addNote("❌ SDK loaded but naver.maps 없음", true);
      console.error("[TEST] SDK loaded but namespace missing");
      return;
    }
    new naver.maps.Map("map", {
      center: new naver.maps.LatLng(37.5665, 126.9780),
      zoom: 11,
      mapDataControl: false,
      zoomControl: true
    });
    addNote("✅ Naver Maps SDK OK");
    console.log("[TEST] map initialized");
  };

  // 5) SDK 로드 (중복 로드 방지: 이미 있으면 바로 콜백)
  if (window.naver && window.naver.maps) {
    addNote("ℹ️ SDK already present → init");
    window.__onNaverMapTestLoaded();
    return;
  }

  var s = document.createElement("script");
  s.src = "https://openapi.map.naver.com/openapi/v3/maps.js"
        + "?ncpClientId=" + encodeURIComponent(CLIENT_ID)
        + "&callback=__onNaverMapTestLoaded";
  s.defer = true;
  s.onerror = function (e) {
    addNote("❌ maps.js 로드 오류", true);
    console.error("[TEST] maps.js load error", e);
  };
  document.head.appendChild(s);

  // 6) 타임아웃 안전장치: 4초 내 콜백이 없으면 경고
  setTimeout(function(){
    if (!(window.naver && window.naver.maps)) {
      addNote("⏱️ SDK 대기 중… 콜백 지연/차단 가능성", true);
      console.warn("[TEST] SDK not ready after timeout");
    }
  }, 4000);
})();
