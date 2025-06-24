자동배포테스트

# Korean Football Association Crawler

한국축구협회(KFA) 경기 데이터를 크롤링하고 Firebase에 업로드하는 웹 애플리케이션입니다.

## 주요 기능

- 🏈 KFA 경기 데이터 실시간 크롤링
- 🔥 Firebase Firestore 자동 업로드
- 🌐 웹 인터페이스를 통한 크롤링 제어
- 📊 실시간 진행 상황 모니터링
- 📋 **Firebase 연동 CSV 관리** - 로컬 서버 없이도 언제나 웹에서 직접 편집 가능
- 🚀 선택적 크롤링 및 업로드 (년도, 월, 리그별 필터링)
- 🛑 실시간 프로세스 제어 (크롤링/업로드 중단 기능)
- 🔄 **다중 필터 크롤링** - 여러 조건을 동시에 설정하여 순차 실행

## 기술 스택

- **Backend**: Node.js, Express.js
- **Frontend**: HTML, CSS, JavaScript
- **Scraping**: Puppeteer
- **Database**: Firebase Firestore
- **Real-time**: Socket.IO
- **Deployment**: Oracle Cloud Infrastructure (OCI)

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

### Oracle Cloud Infrastructure (OCI) 배포

1. **서버 환경**:
   - **도메인**: `ssurpass.com`
   - **서버**: Ubuntu 22.04 LTS (Oracle Cloud)
   - **웹서버**: nginx (프록시 서버)
   - **프로세스 관리**: PM2

2. **배포 설정**:
   - **자동 배포**: GitHub Webhook을 통한 자동 배포 지원
   - **배포 엔드포인트**: `POST /deploy` (토큰 인증)
   - **포트**: 3000 (내부), 80/443 (외부)

3. **Chrome 설치**: 
   - `npm install` 실행 시 postinstall 스크립트가 자동으로 Chrome을 설치합니다
   - Chrome 경로는 `chrome-config.json`에 저장됩니다

4. **현재 상태**: 
   - ⚠️ **502 Bad Gateway 오류 해결 중**
   - 서버 구축 완료, nginx 설정 완료
   - Node.js 애플리케이션 실행 상태 점검 중

## 파일 구조

```
joinkfacrawler/
├── server.js              # Express 서버 + Socket.IO + Firebase CSV 연동
├── meat.js                # 최적화된 크롤링 로직 (속도 개선)
├── firebase_uploader.js   # Firebase 업로드 + CSV 관리 로직
├── index.html            # 웹 인터페이스 (다중 필터 지원)
├── leagues.csv           # 리그 설정 파일 (Firebase 백업)
├── firebase-adminsdk.json # Firebase 서비스 계정 키
├── scripts/
│   └── install-chrome.js  # Chrome 설치 스크립트
├── render-build.sh       # 빌드 스크립트 (Render/Oracle Cloud 호환)
├── debug-server.sh       # 서버 디버깅 스크립트
└── results/              # 크롤링 결과 저장
```

## 사용 방법

### 🔄 다중 필터 크롤링 (NEW!)

여러 개의 크롤링 조건을 동시에 설정하여 순차적으로 실행할 수 있습니다!

1. **다중 크롤링 설정**: 
   - ➕ 필터 추가 버튼으로 여러 조건 생성
   - 각 조건별로 년도/월/리그 설정
   - 한 번에 모든 조건 순차 실행

2. **다중 업로드 설정**:
   - 크롤링 조건과 별도로 업로드 조건 설정
   - "크롤링 필터 복사" 버튼으로 쉽게 복사

3. **성능 최적화**:
   - 대기시간 최적화 (100-200ms → 50-150ms, 동적 조정)
   - 페이지 로딩 최적화 (`domcontentloaded` 사용)
   - 불필요한 리소스 차단 (이미지, CSS 등)
   - 재시도 로직 추가 (최대 3번 시도)
   - 동적 타임아웃 (15→25→35초)

### 🔥 Firebase 연동 CSV 관리

`leagues.csv` 파일이 Firebase와 연동되어 **로컬 서버 실행 없이도** 언제나 웹에서 직접 편집하고 저장할 수 있습니다!

1. **기본 웹 인터페이스 접속**: 
   - 로컬: `http://localhost:3000`
   - 배포된 서버: `http://ssurpass.com` (현재 502 오류 해결 중)
   
2. **리그 설정 편집**: 
   - 웹 페이지의 CSV 에디터에서 직접 편집
   - "Firebase에 저장" 버튼으로 즉시 저장
   - 🔄 새로고침 버튼으로 최신 데이터 불러오기
   
3. **Firebase 업로드**: 
   - 업로드 필터 설정 (선택적 업로드)
   - "Firestore에 업로드" 버튼 클릭
   - "크롤링 필터 복사" 버튼으로 필터 조건 쉽게 복사

### 📊 성능 개선 사항

| 항목 | 이전 | 현재 | 개선율 |
|------|------|------|--------|
| 요청 대기시간 | 100-200ms | 50-150ms (동적 조정) | 최대 50% 단축 |
| 페이지 로딩 | networkidle2 (15초) | domcontentloaded (15초) | 안정성 향상 |
| 리소스 로딩 | 모든 리소스 | 필수만 로딩 | 이미지/CSS 차단 |
| 필터 처리 | 단일 조건 | 다중 조건 순차 처리 | 배치 처리 지원 |
| 안정성 | 단일 시도 | 최대 3번 시도 | 재시도 로직 추가 |
| 타임아웃 전략 | 고정 시간 | 동적 증가 (15→25→35초) | 네트워크 상태 대응 |

### 주요 개선사항

- ✅ **Firebase 자동 동기화**: CSV 편집 시 Firebase에 자동 저장
- ✅ **웹 전용 편집**: 로컬 서버 없이도 어디서나 CSV 편집 가능
- ✅ **실시간 상태 표시**: Firebase 연동 상태 실시간 확인
- ✅ **자동 백업**: Firebase 저장 시 로컬 파일도 자동 백업

## 배포 및 서버 관리

### Oracle Cloud 배포 상태

**현재 상황** (2025년 기준):
- ✅ **서버 구축 완료**: Oracle Cloud Infrastructure에 Ubuntu 22.04 서버 구축
- ✅ **도메인 연결 완료**: `ssurpass.com` 도메인 연결
- ✅ **nginx 설정 완료**: 리버스 프록시 설정
- ⚠️ **502 Bad Gateway 오류**: Node.js 애플리케이션 실행 상태 점검 중
- 🔧 **디버깅 진행 중**: `debug-server.sh` 스크립트로 문제 진단

### 자동 배포 시스템

```bash
# GitHub에서 자동 배포 트리거
curl -X POST http://ssurpass.com/deploy -H "x-deploy-token: breadbro"
```

### Chrome 설치 문제 해결

### Oracle Cloud 환경에서의 Chrome 관련 오류

이 프로젝트는 Oracle Cloud의 환경 제약을 고려하여 Chrome 설치를 자동화합니다:

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

### 서버 배포 관련 문제들

1. **502 Bad Gateway 오류** (현재 해결 중):
   ```bash
   # 서버 상태 진단
   ./debug-server.sh
   
   # PM2 프로세스 재시작
   pm2 restart all
   
   # Node.js 애플리케이션 수동 실행 테스트
   cd /home/ubuntu/joinkfacrawler
   node server.js
   ```

2. **자동 배포 실패**:
   ```bash
   # 수동 배포
   cd /home/ubuntu/joinkfacrawler
   git pull
   npm install
   pm2 restart all
   ```

3. **nginx 관련 문제**:
   ```bash
   # nginx 상태 확인
   sudo systemctl status nginx
   
   # nginx 설정 테스트
   sudo nginx -t
   
   # nginx 재시작
   sudo systemctl restart nginx
   ```

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

4. **CSV 편집이 반영되지 않는 경우**:
   - 이제 Firebase 연동으로 해결됨!
   - 웹에서 직접 편집하고 "Firebase에 저장" 클릭
   - 🔄 새로고침 버튼으로 최신 데이터 확인

### Firebase CSV 관리 명령어

```bash
# 로컬 CSV를 Firebase에 동기화
node firebase_uploader.js sync-csv

# Firebase에서 CSV 다운로드
node firebase_uploader.js download-csv

# CSV 내용을 Firebase에 업로드
node firebase_uploader.js upload-csv "CSV내용"
```

## 프로젝트 현황 및 로드맵

### 완료된 작업 ✅
- KFA 데이터 크롤링 시스템 구축
- Firebase 연동 및 실시간 업로드
- 웹 인터페이스 개발 (다중 필터링 지원)
- Oracle Cloud Infrastructure 서버 구축
- 도메인 연결 및 nginx 설정
- 자동 배포 시스템 구축
- Chrome 자동 설치 시스템

### 진행 중인 작업 🔧
- **502 Bad Gateway 오류 해결**: Node.js 애플리케이션 실행 상태 점검
- 서버 안정성 최적화
- 모니터링 시스템 구축

### 향후 계획 📋
- SSL 인증서 설정 (HTTPS 지원)
- 로그 모니터링 시스템
- 성능 최적화 (캐싱, CDN)
- 백업 및 복구 시스템

## 기술 지원

- **GitHub Repository**: [joinkfacrawler](https://github.com/essaisko/joinkfacrawler)
- **서버 도메인**: `ssurpass.com`
- **이슈 리포트**: GitHub Issues 활용

## 라이선스

MIT License 