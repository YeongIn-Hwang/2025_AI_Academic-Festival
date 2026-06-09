# Boyage - 여행 경로 제작 및 종합 지원 서비스

Boyage는 사용자의 여행 취향과 일정 조건을 바탕으로 여행 경로를 생성하고, 여행 기록과 관련 콘텐츠를 함께 관리할 수 있는 종합 여행 지원 서비스입니다.

## 배포 및 시연

- 서비스 URL: https://2025-ai-academic-festival.vercel.app/home
- 시연 영상: https://youtu.be/PbYFP3JsDlk?si=YYnOXaN3DmufMrNp

## 주요 기능

- **회원 관리**: Firebase 기반 로그인, 회원가입, 사용자 프로필 관리
- **취향 설정**: 사용자의 선호/비선호 여행 키워드 입력 및 저장
- **여행 경로 생성**: 지역, 이동 방식, 날짜, 숙소, 출발지, 도착지를 기반으로 일정 생성
- **장소 추천**: Google Places API와 장소 리뷰 정보를 활용한 후보 장소 수집 및 추천
- **일정 편집**: 추천된 여행 일정을 사용자가 직접 수정하고 저장
- **여행 기록**: 저장된 여행 일정과 다이어리 형태의 여행 기록 관리
- **지도 연동**: 여행 장소와 경로를 지도 기반으로 확인
- **여행 콘텐츠**: 여행 뉴스 및 매거진 형태의 콘텐츠 제공

## 기술 스택

### Frontend

- React
- React Router
- Axios
- Firebase SDK
- React Icons
- Framer Motion
- Google Maps / Naver Map 연동

### Backend / AI Server

- Python
- FastAPI
- Firebase Admin SDK
- Google Places API
- Google Geocoding API
- SBERT / sentence-transformers
- Scikit-learn
- PyTorch

### Database / Infra

- Firebase Authentication
- Firebase Firestore
- Vercel
- Uvicorn

## 프로젝트 구조

```text
2025_AI_Academic-Festival/
├── src/                  # React 프론트엔드
│   ├── pages/            # 주요 페이지
│   ├── components/       # 공통 컴포넌트
│   ├── styles/           # CSS 스타일
│   ├── api/              # 외부 API 연동
│   └── routes/           # 라우팅 설정
│
├── public/               # 정적 리소스
│
├── python/               # FastAPI 기반 추천 서버
│   ├── main.py           # 서버 진입점
│   ├── routes/           # API 라우터
│   ├── services/         # 장소 수집, 추천, 일정 생성 로직
│   ├── core/             # Firebase, SBERT, 환경 설정
│   └── AI/               # 추천 실험 및 데이터 파일
│
├── app/                  # Android 프로토타입
├── package.json          # 프론트엔드 의존성
└── README.md
```

## 실행 방법

### 1. Frontend 실행

```bash
npm install
npm start
```

기본 실행 주소는 다음과 같습니다.

```text
http://localhost:3000
```

### 2. Backend 실행

```bash
cd python
pip install -r requirements.txt
uvicorn main:app --reload
```

기본 실행 주소는 다음과 같습니다.

```text
http://localhost:8000
```

## 환경 변수

실행을 위해 Firebase와 외부 API 키 설정이 필요합니다.

```env
GOOGLE_API_KEY=your_google_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY=your_private_key
```

프론트엔드에서는 Firebase 설정과 지도 API 키가 필요합니다.

## 핵심 흐름

```text
사용자 로그인
→ 여행 취향 입력
→ 여행 지역 및 일정 조건 입력
→ 장소 후보 수집
→ 사용자 취향 기반 장소 추천
→ 날짜별 여행 일정 생성
→ 지도 및 일정표에서 확인
→ 사용자가 일정 수정 및 저장
→ 여행 기록/다이어리 관리
```

## 팀 프로젝트 정보

- 프로젝트명: Boyage
- 주제: 여행 경로 제작 사이트 및 종합 지원 서비스
- 개발 기간: 2025.07 ~ 2025.08
- 개발 인원: 4명

## 비고

이 저장소는 학술제 프로젝트용으로 제작된 웹 기반 여행 지원 서비스입니다. 추천 서버, 프론트엔드 웹앱, Android 프로토타입 코드가 함께 포함되어 있습니다.
