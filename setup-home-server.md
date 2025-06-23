# 집 컴퓨터를 크롤링 서버로 활용하기

## 🏠 집 컴퓨터 서버 설정 (최고 성능, 무료)

### 장점
- **완전 무료** (전기비 제외)
- **최고 성능** (전용 리소스)
- **무제한 사용** (시간/트래픽 제한 없음)
- **즉시 설정 가능**

### 필요한 것
- Windows/Mac/Linux 컴퓨터
- 안정적인 인터넷 연결
- 24시간 켜둘 수 있는 환경

## 🔧 설정 방법

### 1단계: 프로젝트 설정
```bash
# 프로젝트 다운로드
git clone <your-repo-url>
cd joinkfacrawler

# 의존성 설치
npm install

# 로컬에서 테스트
npm start
```

### 2단계: ngrok 설정 (외부 접속용)
```bash
# ngrok 설치 (https://ngrok.com/)
# 1. ngrok 계정 생성 (무료)
# 2. ngrok 다운로드
# 3. 인증 토큰 설정
ngrok config add-authtoken <your-token>

# 서버 터널 생성
ngrok http 3000
```

### 3단계: PM2로 안정화
```bash
# PM2 설치 (프로세스 관리)
npm install -g pm2

# 서버 실행
pm2 start server.js --name "kfa-crawler"

# 자동 시작 설정
pm2 startup
pm2 save

# 상태 확인
pm2 status
pm2 logs kfa-crawler
```

### 4단계: 자동 실행 설정

#### Windows
1. 작업 스케줄러 열기
2. 새 작업 만들기
3. 트리거: 시스템 시작 시
4. 동작: `pm2 resurrect` 실행

#### Mac
```bash
# LaunchAgent 생성
cat > ~/Library/LaunchAgents/com.kfa.crawler.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kfa.crawler</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/pm2</string>
        <string>resurrect</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

# 서비스 등록
launchctl load ~/Library/LaunchAgents/com.kfa.crawler.plist
```

## 📊 성능 비교

| 서버 위치 | 응답 시간 | 크롤링 속도 | 월 비용 |
|-----------|-----------|-------------|---------|
| Render (해외) | 15-25초 | 느림 | 무료 |
| 집 컴퓨터 | **2-5초** | **매우 빠름** | **전기비만** |
| Oracle Cloud (서울) | 5-10초 | 빠름 | 무료 |
| AWS (서울) | 5-10초 | 빠름 | 무료(1년) |

## 🛡️ 보안 설정

### 방화벽 설정
```bash
# Ubuntu 방화벽 설정
sudo ufw enable
sudo ufw allow 3000/tcp
sudo ufw allow ssh

# 특정 IP만 허용 (선택사항)
sudo ufw allow from <your-ip> to any port 3000
```

### 환경 변수 보안
```bash
# .env 파일 생성
echo "NODE_ENV=production" > .env
echo "PORT=3000" >> .env

# Firebase 키 파일 권한 설정
chmod 600 firebase-adminsdk.json
```

## 🔄 자동 업데이트 스크립트

```bash
#!/bin/bash
# update-crawler.sh

cd /path/to/joinkfacrawler
git pull origin main
npm install
pm2 restart kfa-crawler
echo "크롤러가 업데이트되었습니다!"
```

## 📱 모니터링 설정

### PM2 모니터링
```bash
# PM2 Plus 무료 모니터링
pm2 plus
```

### 디스코드 알림 (선택사항)
```javascript
// discord-notification.js
const axios = require('axios');

async function sendDiscordNotification(message) {
  const webhookUrl = 'YOUR_DISCORD_WEBHOOK_URL';
  await axios.post(webhookUrl, {
    content: `🤖 KFA 크롤러: ${message}`
  });
}

module.exports = { sendDiscordNotification };
```

## 💡 최적화 팁

1. **SSD 사용**: 크롤링 결과 저장 속도 향상
2. **메모리 16GB+**: 여러 브라우저 동시 실행
3. **유선 인터넷**: Wi-Fi보다 안정적
4. **UPS**: 정전 시 안전한 종료

## 🆘 문제 해결

### 자주 발생하는 문제들

1. **포트 충돌**
```bash
# 포트 3000 사용 중인 프로세스 확인
lsof -i :3000
# 프로세스 종료
kill -9 <PID>
```

2. **ngrok 터널 끊김**
```bash
# ngrok 재시작 스크립트
while true; do
  ngrok http 3000
  sleep 5
done
```

3. **메모리 부족**
```bash
# 메모리 사용량 확인
pm2 monit

# 메모리 제한 설정
pm2 start server.js --max-memory-restart 1G
```

## 📞 24시간 접속 유지

### Wake-on-LAN 설정
1. BIOS에서 WOL 활성화
2. 네트워크 어댑터 설정에서 WOL 활성화
3. 원격 접속 시 WOL 패킷 전송

### 전력 절약 모드 비활성화
- 윈도우: 제어판 > 전원 옵션 > 고성능
- Mac: 시스템 환경설정 > 에너지 절약

이 방법으로 집 컴퓨터를 24시간 서버로 활용하면 최고의 성능과 완전한 무료 사용이 가능합니다! 