 Problem :지도 지역 id 피그마에서 디자인 변환 하면 id 사라짐
 Solution: 파이썬을 통한 지도 배경 및 외곽선 디자인
 Problem : 지역명 인식 x-> 색칠 불가
 Solution:
  //  한글 디코딩 함수 (\uXXXX → UTF-8)
    const decodeId = (raw) => {
        if (!raw) return "";
        try {
            return JSON.parse(`"${raw}"`);
        } catch {
            return raw;
        }
    };
