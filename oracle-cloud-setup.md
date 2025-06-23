# Oracle Cloud 무료 서버 설정 가이드

## 🌟 Oracle Cloud 무료 서버 (평생 무료!)

### 🎯 장점
- **평생 무료** (Always Free 계층)
- **서울 리전** 사용 가능
- **높은 성능** (AMD EPYC 프로세서)
- **200GB 블록 스토리지**
- **월 10TB 아웃바운드 전송**

### 📋 무료 제공 내용
- **2개 VM 인스턴스** (각각 1GB RAM, 1/8 OCPU)
- **ARM 기반 VM** 4개 (총 24GB RAM, 4 OCPU)
- **200GB 블록 스토리지**
- **로드 밸런서** 1개

## 🚀 설정 단계별 가이드

### 1단계: 계정 생성
1. [Oracle Cloud 가입](https://cloud.oracle.com/free) 
2. 한국 전화번호 인증 필요
3. 신용카드 등록 (무료 계층 사용 시 과금 없음)
4. 이메일 인증 완료

### 2단계: 컴퓨트 인스턴스 생성

#### 인스턴스 생성 설정
```
1. 메뉴 > 컴퓨트 > 인스턴스
2. "인스턴스 생성" 클릭

기본 설정:
- 이름: kfa-crawler
- 구획: 기본값 유지

이미지 및 모양:
- 이미지: Ubuntu 22.04 (Always Free 적격)
- 모양: VM.Standard.E2.1.Micro (Always Free)

네트워킹:
- VCN: 기본값 또는 새로 생성
- 서브넷: 공용 서브넷
- 공용 IP 주소 할당: 체크
```

#### SSH 키 설정
```bash
# 로컬에서 SSH 키 생성
ssh-keygen -t rsa -b 4096 -f ~/.ssh/oracle-cloud-key

# 공개 키 업로드
# oracle-cloud-key.pub 내용을 Oracle Cloud 콘솔에 입력
```

### 3단계: 방화벽 설정

#### 보안 목록 설정
```
1. 메뉴 > 네트워킹 > 가상 클라우드 네트워크
2. VCN 선택 > 보안 목록 선택
3. 인그레스 규칙 추가:
   - 소스 유형: CIDR
   - 소스 CIDR: 0.0.0.0/0
   - IP 프로토콜: TCP
   - 대상 포트 범위: 3000
```

#### 인스턴스 내부 방화벽 설정
```bash
# SSH 접속 후 실행
sudo ufw allow 3000/tcp
sudo ufw allow ssh
sudo ufw enable
```

### 4단계: 서버 환경 설정

#### Node.js 설치
```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 18.x 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
```

#### 필요한 패키지 설치
```bash
# Chrome 의존성 설치
sudo apt-get install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxi6 libxrandr2 \
  libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation \
  libappindicator1 libnss3 lsb-release xdg-utils wget

# PM2 설치 (프로세스 관리)
sudo npm install -g pm2
```

### 5단계: 프로젝트 배포

#### 코드 업로드
```bash
# Git 설치
sudo apt install -y git

# 프로젝트 클론
git clone <https://github.com/essaisko/joinkfacrawler>
cd joinkfacrawler

# 의존성 설치
npm install
```

#### PM2로 서버 실행
```bash
# 서버 시작
pm2 start server.js --name "kfa-crawler"

# 자동 재시작 설정
pm2 startup
pm2 save

# 상태 확인
pm2 status
pm2 logs kfa-crawler
```

### 6단계: 도메인 설정 (선택사항)

#### 무료 도메인 사용
```bash
# Duck DNS 사용 예시
# 1. https://www.duckdns.org/ 가입
# 2. 서브도메인 생성 (예: kfa-crawler.duckdns.org)
# 3. IP 주소 설정

# 자동 IP 업데이트 스크립트
echo 'curl "https://www.duckdns.org/update?domains=your-domain&token=your-token&ip="' > ~/update-ip.sh
chmod +x ~/update-ip.sh

# 크론탭에 등록 (5분마다 IP 업데이트)
crontab -e
# 추가: */5 * * * * ~/update-ip.sh
```

## 🔧 성능 최적화

### 1. 스왑 파일 설정 (메모리 부족 방지)
```bash
# 2GB 스왑 파일 생성
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구적으로 활성화
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. 시스템 리소스 모니터링
```bash
# 시스템 상태 확인
htop              # CPU, 메모리 사용량
df -h             # 디스크 사용량
free -h           # 메모리 상태
pm2 monit         # Node.js 프로세스 모니터링
```

### 3. 로그 관리
```bash
# 로그 로테이션 설정
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 🛡️ 보안 강화

### SSH 보안
```bash
# SSH 키 전용 로그인 설정
sudo nano /etc/ssh/sshd_config

# 다음 설정 변경:
PasswordAuthentication no
PermitRootLogin no
Port 2222  # 기본 포트 변경

# SSH 재시작
sudo systemctl restart sshd
```

### 자동 업데이트 설정
```bash
# 보안 업데이트 자동 설치
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 📊 성능 벤치마크

### 예상 성능 개선
```
Render (미국) vs Oracle Cloud (서울)

크롤링 응답 시간:
- Render: 15-25초
- Oracle: 3-8초 (3-5배 빠름)

네트워크 지연:
- Render: 200-300ms
- Oracle: 10-30ms (10배 빠름)

안정성:
- Render: 자동 종료 문제
- Oracle: 24시간 안정 운영
```

## 🔄 자동 배포 설정

### GitHub Actions 설정
```yaml
# .github/workflows/deploy.yml
name: Deploy to Oracle Cloud

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to server
      uses: appleboy/ssh-action@v0.1.4
      with:
        host: ${{ secrets.HOST }}
        username: ubuntu
        key: ${{ secrets.PRIVATE_KEY }}
        script: |
          cd /home/ubuntu/joinkfacrawler
          git pull origin main
          npm install
          pm2 restart kfa-crawler
```

## 🆘 문제 해결

### 자주 발생하는 문제들

#### 1. Chrome 실행 오류
```bash
# Chrome 수동 설치
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update
sudo apt install -y google-chrome-stable
```

#### 2. 메모리 부족
```bash
# 메모리 사용량 확인
free -h

# 프로세스별 메모리 사용량
ps aux --sort=-%mem | head -10

# PM2 메모리 제한 설정
pm2 delete kfa-crawler
pm2 start server.js --name "kfa-crawler" --max-memory-restart 800M
```

#### 3. 포트 접근 불가
```bash
# 포트 상태 확인
sudo netstat -tlnp | grep :3000

# 방화벽 상태 확인
sudo ufw status

# Oracle Cloud 보안 목록 재확인 필요
```

## 💰 비용 관리

### Always Free 한도 모니터링
```bash
# 리소스 사용량 확인 스크립트
#!/bin/bash
echo "=== Oracle Cloud 리소스 사용량 ==="
echo "CPU 사용량:"
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}'

echo "메모리 사용량:"
free | grep Mem | awk '{printf("%.2f%%\n", $3*100/$2)}'

echo "디스크 사용량:"
df -h / | awk 'NR==2{print $5}'
```

### 알림 설정
```bash
# 디스코드 알림 스크립트
#!/bin/bash
WEBHOOK_URL="YOUR_DISCORD_WEBHOOK"
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

if [ $USAGE -gt 80 ]; then
  curl -X POST -H 'Content-type: application/json' \
    --data '{"content":"⚠️ Oracle Cloud 디스크 사용량이 80%를 초과했습니다!"}' \
    $WEBHOOK_URL
fi
```

이제 Oracle Cloud에서 완전 무료로 국내 서버를 운영하면서 **3-5배 빠른 크롤링 성능**을 얻을 수 있습니다! 