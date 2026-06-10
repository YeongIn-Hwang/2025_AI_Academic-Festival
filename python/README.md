# 여행 경로 제작 사이트 및 종합 지원 서비스

> Google Places API와 SBERT 임베딩을 활용한 개인화 여행 경로 추천 백엔드 시스템

## 1. 프로젝트 개요

본 프로젝트는 사용자가 입력한 여행 지역, 이동 방식, 여행 기간, 선호/비선호 키워드를 바탕으로 개인화된 여행 일정을 생성하는 여행 경로 추천 서비스입니다. 기존 여행 경로 추천 서비스가 사용자의 취향과 실제 여행 경험을 충분히 반영하지 못한다는 문제를 해결하기 위해, 장소 리뷰 임베딩과 사용자 피드백 기반 추천 가중치 업데이트 구조를 적용했습니다.

사용자가 여행을 반복하고 장소별 평점을 남길수록, 거리·선호도·신뢰도·비선호도에 대한 가중치가 점진적으로 조정되어 다음 여행 경로 생성에 반영됩니다.

## 2. 담당 역할

- **역할**: Google Places API와 SBERT 임베딩을 활용한 개인화 여행 경로 추천 시스템 개발
- **인원**: 4명
- **진행 기간**: 2025.07 ~ 2025.08

### 담당 구현 범위

- Google Places API 기반 장소 후보 수집
- Google Geocoding API 기반 지역명 → 위도/경도 변환
- SBERT 기반 사용자 선호/비선호 키워드 임베딩
- SBERT 기반 장소 리뷰 및 장소명 임베딩
- 코사인 유사도 기반 장소 선호도/비선호도 점수 계산
- 평점, 리뷰 수, 최신 리뷰 여부 기반 장소 신뢰도 점수 계산
- 여행 기간, 출발지, 숙소, 도착지 기반 기본 일정표 생성
- 빈 시간대 슬롯 분할 및 추천 가능 슬롯 생성
- 운영시간, 장소 유형, 이동 거리, 사용자 선호도를 고려한 경로 추천 로직 구현
- DQN의 미래 보상 개념을 응용한 탐색형 일정 자동 배치 로직 구현
- Firebase Firestore 기반 사용자별 여행 데이터 및 여행 로그 저장
- 여행 후 평점 기반 추천 가중치 업데이트
- LightGCN 기반 사용자-장소 평점 그래프 추천 실험

## 3. 주요 기술 스택

| 구분 | 기술 |
| --- | --- |
| Backend | Python, FastAPI, Uvicorn |
| Database / Storage | Firebase Firestore, Firebase Admin SDK, Google Cloud Storage |
| External API | Google Places API, Google Geocoding API |
| NLP / Embedding | Sentence-BERT, sentence-transformers, Transformers |
| ML / Recommendation | Scikit-learn, PyTorch, LightGCN |
| Numerical Computing | NumPy, SciPy |
| Similarity | Cosine Similarity |
| Front Test | HTML, JavaScript, Naver Map test code |
| Deploy / Config | Procfile, python-dotenv, CORS, environment variables |

## 4. 기존 문제와 해결 방식

### 기존 문제

기존 여행 경로 추천 서비스는 대부분 정적인 추천 방식에 머무르며, 사용자의 취향이나 실제 여행 경험에 따라 추천 방식이 동적으로 변화하지 못하는 한계가 있습니다. 또한 장소를 단순 평점순 또는 인기순으로 추천할 경우, 사용자의 선호 테마나 비선호 요소가 충분히 반영되지 않습니다.

### 해결 방식

본 프로젝트에서는 사용자의 선호/비선호 키워드를 SBERT 임베딩 벡터로 변환하고, 장소 리뷰 및 장소명 임베딩과 비교하여 장소별 선호도와 비선호도를 계산했습니다. 또한 여행 후 사용자가 입력한 평점을 바탕으로 거리, 선호도, 신뢰도, 비선호도 가중치를 업데이트하여 추천 결과가 점진적으로 개인화되도록 설계했습니다.

즉, 사용자가 특정 테마를 중심으로 여행 일정을 생성하고 실제 경험을 축적할수록, 이후 여행 경로 생성 방식이 해당 사용자의 취향에 맞게 조정됩니다.

## 5. 전체 처리 흐름

```text
1. 사용자 선호/비선호 키워드 입력
        ↓
2. SBERT 기반 사용자 취향 벡터 생성 및 Firebase 저장
        ↓
3. 사용자 여행 지역, 이동 방식, 날짜 입력
        ↓
4. Google Geocoding API로 지역명 → 위도/경도 변환
        ↓
5. Google Places API로 주변 장소 후보 수집
        ↓
6. 장소 리뷰, 장소명, 평점, 리뷰 수, 운영시간 수집
        ↓
7. 장소 리뷰 및 장소명 SBERT 임베딩
        ↓
8. 사용자 취향 벡터와 장소 벡터 간 코사인 유사도 계산
        ↓
9. 장소 신뢰도, 선호도, 비선호도, 거리 기반 장소 점수화
        ↓
10. 여행 기간과 시간 조건을 바탕으로 기본 일정표 생성
        ↓
11. 빈 시간대를 추천 가능한 슬롯으로 분할
        ↓
12. DQN식 미래 보상 개념을 응용해 슬롯별 장소 자동 배치
        ↓
13. 완성된 여행 일정과 로그를 Firebase에 저장
        ↓
14. 여행 후 사용자 평점 기반 추천 가중치 업데이트
```

## 6. 핵심 기능 상세

### 6.1 사용자 선호/비선호 임베딩

사용자가 입력한 선호 키워드와 비선호 키워드를 SBERT로 임베딩한 뒤, 평균 벡터를 생성하여 Firebase Firestore에 저장합니다.

예시:

```text
선호 키워드: 조용한, 감성적인, 바다, 카페
비선호 키워드: 시끄러운, 붐비는, 술집
```

위 키워드는 각각 벡터 형태로 변환되어 저장되며, 이후 장소 리뷰 벡터와의 코사인 유사도 계산에 사용됩니다. 이를 통해 단순 문자열 일치가 아니라 의미적으로 유사한 장소 특성까지 반영할 수 있습니다.

관련 파일:

```text
routes/prefs.py
services/keyword_cal.py
services/emb_utils.py
```

주요 API:

```http
POST /user_keywords_embed
```

### 6.2 장소 데이터 수집 및 후보군 생성

사용자가 입력한 여행 지역을 Google Geocoding API로 위도/경도로 변환한 뒤, Google Places API를 통해 주변 장소 후보를 수집합니다.

수집 대상 장소 유형은 다음과 같습니다.

```text
tourist_attraction
cafe
bar
bakery
restaurant
shopping_mall
```

이동 방식에 따라 탐색 반경을 다르게 설정합니다.

| 이동 방식 | 설명 |
| --- | --- |
| 1 | 도보 중심 |
| 2 | 대중교통 중심 |
| 3 | 차량 이동 중심 |

장소 후보는 평점, 리뷰 수, 최신 리뷰 여부를 바탕으로 신뢰도 점수를 계산하며, 품질이 낮거나 정보가 부족한 장소는 필터링합니다.

관련 파일:

```text
routes/places.py
services/get_place.py
```

주요 API:

```http
POST /places_fetch_only
POST /places_build_save
```

### 6.3 장소 리뷰 및 장소명 임베딩

수집한 장소의 리뷰와 장소명을 SBERT로 임베딩하여 장소의 의미적 특성을 벡터화합니다.

처리 과정:

1. 리뷰 텍스트의 특수기호 및 불필요한 공백 제거
2. 장소 리뷰 임베딩
3. 장소명 임베딩
4. 리뷰 벡터와 장소명 벡터 기반 장소 표현 생성
5. 사용자 선호/비선호 벡터와 코사인 유사도 계산

이를 통해 장소별로 다음 점수를 계산합니다.

- `trust_score`: 평점, 리뷰 수, 최신 리뷰 여부 기반 신뢰도
- `hope_score`: 사용자 선호 키워드와의 의미적 유사도
- `nonhope_score`: 사용자 비선호 키워드와의 의미적 유사도
- `distance_score`: 이전 장소 대비 이동 거리 기반 점수

관련 파일:

```text
services/review_embedding.py
services/emb_utils.py
services/keyword_cal.py
```

### 6.4 장소 데이터 저장

수집 및 점수화된 장소 데이터는 Firebase Firestore에 사용자별, 여행별로 분리 저장합니다.

저장 구조 예시:

```text
user_trips/{uid}/trips/{title}/places/{place_id}
```

같은 사용자가 여러 여행을 생성하더라도 여행 제목별로 장소 후보군과 추천 결과가 독립적으로 관리됩니다.

관련 파일:

```text
services/save_embedding_place.py
```

### 6.5 기본 일정표 생성

사용자의 여행 기간, 출발지, 숙소, 도착지, 하루 시작/종료 시간을 바탕으로 날짜별 기본 일정표를 생성합니다.

주요 기능:

- 여행 날짜별 일정 테이블 생성
- 출발지, 숙소, 도착지 위치 정보 검색 및 반영
- 일정 사이의 빈 시간대 탐색
- 빈 시간대를 추천 가능한 슬롯으로 분할
- 사용자 수정 사항 반영
  - 삭제
  - 분할
  - 병합
  - 고정 일정
  - 프론트에서 수정된 타임라인

관련 파일:

```text
routes/prepare.py
services/making_table.py
```

주요 API:

```http
POST /routes/prepare_basic
POST /routes/prepare_dqn
POST /routes/prepare
```

### 6.6 DQN식 미래 보상 개념을 응용한 경로 추천

프로젝트의 핵심 추천 로직입니다. 실제 딥러닝 기반 DQN 모델을 학습한 것은 아니며, DQN의 미래 보상 개념을 응용하여 현재 슬롯뿐 아니라 이후 일정에서 얻을 수 있는 기대 보상까지 함께 고려하는 탐색형 추천 알고리즘으로 구현했습니다.

추천 과정:

1. Firebase에서 해당 여행의 장소 후보군을 불러옵니다.
2. 현재 슬롯에 들어갈 수 있는 장소 타입을 규칙 기반으로 결정합니다.
   - 예: 식당 연속 방문 제한
   - 예: 여행 스타일에 따른 관광지/카페/쇼핑 비중 조정
3. 장소 운영시간을 확인하여 현재 슬롯 시간에 방문 가능한 장소만 필터링합니다.
4. 이미 일정에 포함된 장소는 후보에서 제외합니다.
5. 현재 위치와 후보 장소 간 이동 거리를 계산합니다.
6. 거리, 선호도, 비선호도, 신뢰도를 종합해 현재 슬롯의 장소 점수를 계산합니다.
7. 현재 선택이 이후 일정에 미치는 영향을 고려하기 위해 다음 슬롯들의 기대 보상까지 계산합니다.
8. 현재 점수와 미래 보상을 종합해 최적의 장소를 선택합니다.

최종 점수는 다음 요소를 기반으로 계산됩니다.

```text
최종 점수 =
거리 점수 × w_dist
+ 선호 점수 × w_cluster
+ 신뢰도 점수 × w_trust
- 비선호 점수 × w_nonhope
```

관련 파일:

```text
services/dqn_table_making.py
```

### 6.7 여행 로그 저장

생성된 여행 일정은 Firebase에 여행 로그 형태로 저장합니다. 사용자는 추천된 일정을 수정할 수 있으며, 수정된 일정 역시 저장 구조에 반영됩니다.

저장되는 주요 정보:

- 날짜
- 일정 제목
- 시작 시간
- 종료 시간
- 장소 타입
- 위도/경도
- 사용자 평점
- 일정 순서

저장 구조 예시:

```text
user_trips/{uid}/trips_log/{title}/days/{date}
```

관련 파일:

```text
routes/travel_log.py
services/save_travel_log.py
```

주요 API:

```http
POST /save_travel_log
GET /trips/{uid}/{title}/timeline
```

### 6.8 사용자 피드백 기반 개인화 업데이트

사용자가 여행 후 장소별 평점을 입력하면, 해당 평점 데이터를 기반으로 추천 가중치를 업데이트합니다.

업데이트 대상:

- `w_dist`: 거리 가중치
- `w_cluster`: 선호도 가중치
- `w_trust`: 장소 신뢰도 가중치
- `w_nonhope`: 비선호도 가중치

평점 데이터를 기반으로 각 요소가 만족도에 얼마나 영향을 주었는지 계산하고, 기존 사용자 파라미터와 새로 학습한 파라미터를 EMA 방식으로 결합합니다. 또한 가중치가 과도하게 변하지 않도록 범위를 제한합니다.

관련 파일:

```text
routes/update_user_params.py
```

주요 API:

```http
POST /api/user_params/update_from_log
```

### 6.9 LightGCN 기반 추천 실험

사용자-장소 평점 로그를 활용해 LightGCN 기반 그래프 추천 구조를 실험했습니다. 사용자와 장소를 그래프의 노드로 구성하고, 사용자의 장소 평점 데이터를 edge로 활용하여 유사 사용자 및 유사 장소 관계를 학습하는 방식입니다.

이 기능은 메인 추천 로직이라기보다, 사용자 경험이 누적되었을 때 유사 사용자 기반 장소 추천으로 확장하기 위한 실험적 구조입니다.

관련 파일:

```text
routes/lightgcn.py
AI/user_item_ratings.txt
```

주요 API:

```http
POST /build_from_log
POST /warm_start
GET /status
POST /score
```

## 7. 프로젝트 구조

```text
.
├── main.py                         # FastAPI 앱 진입점, 라우터 등록, CORS, SBERT 로딩
├── Procfile                        # 배포 실행 명령
├── requirements.txt                # Python 의존성
├── core/
│   ├── config.py                   # 환경변수 및 기본 설정
│   ├── firebase.py                 # Firebase Admin / Firestore 초기화
│   └── sbert.py                    # SBERT 모델 로딩
├── routes/
│   ├── user.py                     # 사용자 기본 파라미터 초기화
│   ├── prefs.py                    # 선호/비선호 키워드 임베딩 API
│   ├── places.py                   # 장소 후보 수집, 임베딩, 저장 API
│   ├── prepare.py                  # 기본 일정표 생성 및 DQN식 추천 API
│   ├── travel_log.py               # 여행 로그 저장 및 조회 API
│   ├── update_user_params.py       # 사용자 평점 기반 추천 가중치 업데이트 API
│   ├── lightgcn.py                 # LightGCN 기반 그래프 추천 실험 API
│   └── geocode.py                  # 주소/지역명 기반 행정구역 조회 API
├── services/
│   ├── get_place.py                # Google Places API 기반 장소 수집
│   ├── review_embedding.py         # 장소 리뷰/장소명 임베딩
│   ├── emb_utils.py                # 임베딩 및 텍스트 전처리 유틸
│   ├── keyword_cal.py              # 선호/비선호 점수 계산
│   ├── making_table.py             # 기본 일정표 생성 및 빈 슬롯 분할
│   ├── dqn_table_making.py         # DQN식 미래 보상 탐색 기반 경로 추천
│   ├── save_embedding_place.py     # 장소 후보 Firestore 저장
│   ├── save_travel_log.py          # 여행 로그 저장
│   └── User_Profile_init.py        # 사용자 기본 파라미터 초기화
├── AI/
│   ├── AI_MainCode.ipynb           # 초기 실험 노트북
│   ├── all_places.json             # 장소 데이터 예시
│   ├── all_places_embedding.json   # 임베딩 장소 데이터 예시
│   ├── travel_logs.json            # 여행 로그 예시
│   ├── user_params.json            # 사용자 파라미터 예시
│   └── user_item_ratings.txt       # LightGCN 입력용 사용자-장소 평점 데이터
└── travel-map/
    └── public/
        ├── index.html              # 지도 테스트 페이지
        ├── app.js                  # 프론트 API 연동 테스트
        └── naver_map_test.js       # Naver Map 테스트 코드
```

## 8. 실행 방법

### 8.1 의존성 설치

```bash
pip install -r requirements.txt
```

### 8.2 환경변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 필요한 값을 설정합니다.

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-service-account.json
FIRESTORE_PROJECT_ID=your-firebase-project-id
FIREBASE_BUCKET=your-firebase-bucket
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
SBERT_NAME=snunlp/KR-SBERT-V40K-klueNLI-augSTS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
LIGHTGCN_WARM=1
```

필수 환경변수:

| 변수명 | 설명 |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Firebase 서비스 계정 JSON 절대경로 |
| `FIRESTORE_PROJECT_ID` | Firebase 프로젝트 ID |
| `GOOGLE_MAPS_API_KEY` | Google Places / Geocoding API Key |
| `SBERT_NAME` | 사용할 SBERT 모델명 |

선택 환경변수:

| 변수명 | 설명 |
| --- | --- |
| `FIREBASE_BUCKET` | Firebase Storage 버킷 |
| `CORS_ORIGINS` | 허용할 프론트엔드 origin 목록 |
| `LIGHTGCN_WARM` | 서버 시작 시 LightGCN warm start 실행 여부 |
| `DISABLE_PLACES_FETCH` | 1로 설정 시 Google Places fetch 비활성화 |

### 8.3 서버 실행

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

서버 상태 확인:

```http
GET /healthz
GET /test_sbert
```

## 9. 주요 API 요약

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/` | 서비스 기본 상태 확인 |
| `GET` | `/healthz` | 서버 및 SBERT 설정 상태 확인 |
| `GET` | `/test_sbert` | SBERT 모델 로딩 확인 |
| `POST` | `/user_param_init` | 사용자 기본 추천 파라미터 초기화 |
| `POST` | `/user_keywords_embed` | 선호/비선호 키워드 임베딩 및 저장 |
| `POST` | `/places_fetch_only` | Google Places API 기반 장소 후보 수집 |
| `POST` | `/places_build_save` | 장소 수집, 임베딩, 점수화, Firestore 저장 |
| `POST` | `/routes/prepare_basic` | 기본 일정표 생성 |
| `POST` | `/routes/prepare_dqn` | DQN식 탐색 기반 추천 일정 생성 |
| `POST` | `/routes/prepare` | 호환용 추천 일정 생성 API |
| `POST` | `/save_travel_log` | 여행 로그 저장 |
| `GET` | `/trips/{uid}/{title}/timeline` | 저장된 여행 타임라인 조회 |
| `POST` | `/api/user_params/update_from_log` | 여행 후 평점 기반 추천 가중치 업데이트 |
| `GET` | `/api/geocode/query_district` | 지역명 기반 행정구역 조회 |
| `POST` | `/build_from_log` | LightGCN 학습 데이터 구성 및 학습 |
| `POST` | `/warm_start` | LightGCN warm start |
| `GET` | `/status` | LightGCN 상태 확인 |
| `POST` | `/score` | LightGCN 기반 장소 점수 조회 |

## 10. 주요 성과 및 차별점

- 단순 인기순/평점순 추천이 아니라 사용자 선호/비선호 키워드를 의미 기반으로 반영했습니다.
- 장소 리뷰와 장소명을 SBERT로 임베딩하여 장소 특성을 벡터화했습니다.
- 평점, 리뷰 수, 최신 리뷰 여부를 활용해 장소 신뢰도를 계산했습니다.
- 여행 기간과 시간 조건을 반영해 날짜별 일정표와 빈 슬롯을 자동 생성했습니다.
- 운영시간, 장소 유형, 중복 방문 여부, 이동 거리, 사용자 선호도를 종합적으로 고려해 장소를 자동 배치했습니다.
- DQN의 미래 보상 개념을 응용해 현재 선택이 이후 일정에 미치는 영향까지 고려했습니다.
- 여행 후 평점 데이터를 기반으로 추천 가중치를 업데이트하여 추천 방식이 점진적으로 개인화되도록 했습니다.
- 사용자-장소 평점 로그 기반 LightGCN 추천 구조를 실험하여 유사 사용자 기반 추천 가능성을 검토했습니다.

## 11. 주의사항

- `DQN`이라는 명칭은 코드상 함수명과 설명에 사용되지만, 실제 딥러닝 기반 DQN 모델을 학습하는 구조는 아닙니다. 본 프로젝트에서는 DQN의 미래 보상 개념을 응용한 휴리스틱 기반 탐색형 추천 알고리즘으로 구현했습니다.
- Google Places API 호출에는 API Key가 필요하며, 사용량에 따라 비용이 발생할 수 있습니다.
- Firebase 서비스 계정 JSON 파일은 보안상 Git에 업로드하지 않아야 합니다.
- SBERT 모델 로딩은 실행 환경에 따라 시간이 걸릴 수 있습니다.
- LightGCN 기능은 메인 추천 로직이 아니라 개인화 추천 확장을 위한 실험 기능입니다.

## 12. 포트폴리오 요약

본 프로젝트에서 Google Places API 기반 장소 후보 수집, SBERT 기반 리뷰/키워드 임베딩, 장소 점수화, 일정표 생성, DQN식 미래 보상 탐색 기반 경로 추천, 사용자 피드백 기반 개인화 업데이트 로직을 구현했습니다. 이를 통해 사용자의 선호와 여행 경험이 반복적으로 반영되는 개인화 여행 경로 추천 백엔드 시스템을 개발했습니다.
