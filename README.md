# Korean Football Association Crawler

한국축구협회(KFA) 경기 데이터를 크롤링하고 Firebase에 업로드하는 웹 애플리케이션입니다.

## 주요 기능

- 🏈 KFA 경기 데이터 실시간 크롤링
- 🔥 Firebase Firestore 자동 업로드
- 🌐 웹 인터페이스를 통한 크롤링 제어
- 📊 실시간 진행 상황 모니터링
- 📋 CSV 기반 리그 설정 관리

## 기술 스택

- **Backend**: Node.js, Express.js
- **Frontend**: HTML, CSS, JavaScript
- **Scraping**: Puppeteer
- **Database**: Firebase Firestore
- **Real-time**: Socket.IO
- **Deployment**: Render.com

## 설치 및 실행

### 로컬 환경

```bash
# 저장소 클론
git clone <repository-url>
cd joinkfacrawler

# 의존성 설치 (Chrome 자동 설치 포함)
npm install

# 서버 실행
npm start
```

### Render.com 배포

1. **Render 설정**:
   - Build Command: `./render-build.sh`
   - Start Command: `npm start`

2. **환경 변수**: 필요 시 Firebase 관련 환경 변수 설정

3. **Chrome 설치**: 
   - `npm install` 실행 시 postinstall 스크립트가 자동으로 Chrome을 설치합니다
   - Chrome 경로는 `chrome-config.json`에 저장됩니다

## 파일 구조

```
joinkfacrawler/
├── server.js              # Express 서버 + Socket.IO
├── meat.js                # 메인 크롤링 로직
├── firebase_uploader.js   # Firebase 업로드 로직
├── index.html            # 웹 인터페이스
├── leagues.csv           # 리그 설정 파일
├── scripts/
│   └── install-chrome.js  # Chrome 설치 스크립트
├── render-build.sh       # Render 빌드 스크립트
└── results/              # 크롤링 결과 저장
```

## 사용 방법

1. **웹 인터페이스 접속**: `http://localhost:3000`
2. **리그 설정**: CSV 에디터에서 크롤링할 리그 설정
3. **크롤링 시작**: 옵션 선택 후 "크롤링 시작" 버튼 클릭
4. **결과 확인**: 실시간 로그 모니터링 및 결과 파일 확인
5. **Firebase 업로드**: "Firestore 업로드" 버튼으로 데이터 업로드

## Chrome 설치 문제 해결

### Render.com 배포 시 Chrome 관련 오류

이 프로젝트는 Render.com의 환경 제약을 고려하여 Chrome 설치를 자동화합니다:

1. **자동 설치**: `npm install` 시 Chrome이 자동으로 설치됩니다
2. **동적 경로 찾기**: 여러 위치에서 Chrome을 찾아 사용합니다
3. **설정 파일**: Chrome 경로를 `chrome-config.json`에 저장합니다

### 수동 Chrome 설치 (필요 시)

```bash
# Chrome 설치 스크립트 실행
node scripts/install-chrome.js
```

### Chrome 경로 확인

```bash
# 설치된 Chrome 위치 확인
find . -name "chrome" -type f -executable
```

## 환경 변수

- `PORT`: 서버 포트 (기본값: 3000)
- `PUPPETEER_CACHE_DIR`: Chrome 설치 디렉토리 (선택사항)

## 개발 및 디버깅

### 로그 확인
- 웹 인터페이스에서 실시간 로그 확인
- 서버 콘솔에서 상세 로그 확인

### Chrome 설치 상태 확인
```bash
# Chrome 설정 파일 확인
cat chrome-config.json

# Chrome 실행 테스트
node -e "const puppeteer = require('puppeteer'); puppeteer.launch().then(b => { console.log('Chrome OK'); b.close(); })"
```

## 문제 해결

### 일반적인 문제들

1. **Chrome not found 오류**:
   - `npm install` 재실행
   - `node scripts/install-chrome.js` 수동 실행

2. **Permission denied 오류**:
   - `chmod +x render-build.sh` 실행
   - 파일 권한 확인

3. **Firebase 연결 오류**:
   - `firebase-adminsdk.json` 파일 확인
   - Firebase 프로젝트 설정 확인

## 라이선스

MIT License 