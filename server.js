const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { uploadCsvToFirebase, downloadCsvFromFirebase, syncCsvWithFirebase, db } = require('./firebase_uploader');
const admin = require('firebase-admin');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname));

const PORT = process.env.PORT || 3000;

// === [GLOBAL QUEUES & FLAGS] ===
// 전역 큐 및 상태 플래그 (모든 소켓에서 공유)
const crawlQueue = [];
const uploadQueue = [];
let isCrawling = false;
let isUploading = false;

// JSON 요청 본문을 파싱하기 위한 미들웨어
app.use(express.json());
// 정적 파일 제공
app.use(express.static(path.join(__dirname)));
app.use('/components', express.static(path.join(__dirname, 'components')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.render('index');
});

// Health check 엔드포인트 (서버 활성 상태 유지용)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Git 커밋 정보 가져오기 엔드포인트
app.get('/git-info', (req, res) => {
  exec('git log -1 --format="%H|%ad|%s" --date=local', (error, stdout, stderr) => {
    if (error) {
      console.error('Git 정보 가져오기 실패:', error);
      res.json({
        success: false,
        error: 'Git 정보를 가져올 수 없습니다.',
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      const [hash, date, message] = stdout.trim().split('|');
      res.json({
        success: true,
        commit: {
          hash: hash,
          fullHash: hash,
          shortHash: hash.substring(0, 7),
          date: date,
          message: message,
          timestamp: new Date().toISOString()
        }
      });
    } catch (parseError) {
      console.error('Git 정보 파싱 실패:', parseError);
      res.json({
        success: false,
        error: 'Git 정보 파싱에 실패했습니다.',
        raw: stdout,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// CSV 파일 내용을 클라이언트로 전송 (Firebase 우선)
app.get('/leagues-csv', async (req, res) => {
  try {
    console.log('📥 CSV 데이터 요청 받음');
    
    // 먼저 Firebase에서 시도
    const firebaseContent = await downloadCsvFromFirebase();
    
    if (firebaseContent !== null) {
      console.log('✅ Firebase에서 CSV 데이터 로드 성공');
      res.type('text/plain').send(firebaseContent);
      return;
    }
    
    // Firebase에 데이터가 없으면 로컬 파일 사용
    console.log('📄 로컬 CSV 파일에서 데이터 로드 시도');
    const localPath = path.join(__dirname, 'leagues.csv');
    
    if (fs.existsSync(localPath)) {
      const csvData = fs.readFileSync(localPath, 'utf-8');
      console.log('✅ 로컬 CSV 파일 로드 성공');
      
      // 로컬 파일을 Firebase에 동기화
      console.log('🔄 로컬 CSV를 Firebase에 동기화 중...');
      await uploadCsvToFirebase(csvData);
      
      res.type('text/plain').send(csvData);
    } else {
      console.log('⚠️ 로컬 CSV 파일도 없음, 기본 템플릿 제공');
      const defaultCsv = 'leagueTag,regionTag,year,leagueTitle,matchIdx\n';
      res.type('text/plain').send(defaultCsv);
    }
  } catch (error) {
    console.error('❌ CSV 로드 중 오류:', error);
    res.status(500).send('Error reading leagues.csv');
  }
});

app.post('/deploy', (req, res) => {
  const secret = 'breadbro'; // 보안용 토큰
  const gitRepoPath = '/home/ubuntu/joinkfacrawler';

  const bodyToken = req.headers['x-deploy-token'];

  console.log('🔄 Deploy 요청 받음, 토큰:', bodyToken);

  if (bodyToken !== secret) {
    console.error('❌ 잘못된 토큰:', bodyToken);
    return res.status(403).send('Invalid deploy token');
  }

  console.log('✅ 토큰 검증 완료, 배포 시작...');

  // 응답을 먼저 보내고 배포 실행 (타임아웃 방지)
  res.status(200).send('✅ Deploy started...');

  // 배포 명령어 실행
  exec(`cd ${gitRepoPath} && git pull && pm2 restart all`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ 자동배포 실패:', err);
      console.error('❌ stderr:', stderr);
    } else {
      console.log('✅ 자동배포 완료:\n', stdout);
      if (stderr) {
        console.log('⚠️ stderr:', stderr);
      }
    }
  });
});

// 클라이언트로부터 받은 내용으로 CSV 파일 저장 (Firebase 우선)
app.post('/leagues-csv', async (req, res) => {
  try {
    const { content } = req.body;
    console.log('📝 CSV 저장 요청 받음, 내용 길이:', content ? content.length : 'undefined');
    
    if (typeof content !== 'string') {
      console.error('❌ Invalid content type:', typeof content);
      return res.status(400).send('Invalid content.');
    }
    
    // Firebase에 저장
    console.log('🔄 CSV 데이터를 Firebase에 저장 중...');
    const firebaseSuccess = await uploadCsvToFirebase(content);
    
    if (firebaseSuccess) {
      console.log('✅ Firebase에 CSV 저장 성공');
      
      // 로컬 파일도 백업으로 저장
      try {
        const filePath = path.join(__dirname, 'leagues.csv');
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('✅ 로컬 백업 파일도 저장 완료');
      } catch (localError) {
        console.warn('⚠️ 로컬 백업 저장 실패:', localError.message);
      }
      
      res.status(200).send('CSV file saved successfully to Firebase.');
    } else {
      // Firebase 저장 실패시 로컬에만 저장
      console.log('⚠️ Firebase 저장 실패, 로컬에만 저장');
      const filePath = path.join(__dirname, 'leagues.csv');
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('✅ 로컬 CSV 파일 저장 완료');
      
      res.status(200).send('CSV file saved locally (Firebase failed).');
    }
    
  } catch (error) {
    console.error('❌ Error saving leagues.csv:', error);
    res.status(500).send('Error saving leagues.csv');
  }
});

// 실행 중인 프로세스를 추적하기 위한 Map
const runningProcesses = new Map();

// 전역 로그 스토리지 (메모리에 최근 로그 저장)
const logHistory = [];
const MAX_LOG_HISTORY = 1000; // 최대 1000개의 로그 항목 유지

function addToLogHistory(message) {
  logHistory.push({
    timestamp: new Date().toISOString(),
    message: message
  });
  
  // 로그 히스토리 크기 제한
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }
}

// 클라이언트로부터의 연결 처리
io.on('connection', (socket) => {
  console.log('✅ A user connected');
  
  // 클라이언트별 프로세스 추적
  socket.runningProcesses = new Set();
  
  // 새로 연결된 클라이언트에게 기존 로그 히스토리 전송
  if (logHistory.length > 0) {
    socket.emit('log-history', logHistory);
  }

  // ====== 크롤링 큐 시스템 ======
  // (전역 큐/플래그를 사용하므로 별도의 지역 변수 선언 제거)

  function emitQueueStatus() {
    const runningCrawl = Array.from(runningProcesses.values()).find(p => p.type === 'crawling');
    const runningUpload = Array.from(runningProcesses.values()).find(p => p.type === 'uploading');
    io.emit('queue-status', {
      runningCrawl: runningCrawl ? runningCrawl.options : null,
      runningUpload: runningUpload ? runningUpload.options : null,
      waitingCrawl: crawlQueue.map(i => i.options),
      waitingUpload: uploadQueue.map(i => i.options)
    });
  }

  // 새로 연결된 클라이언트에게 현재 큐 상태 전달
  emitQueueStatus();

  function maybeStartNextUpload() {
    // 업로드는 크롤링이 모두 끝난 뒤 순차 진행
    if (!isCrawling && !isUploading && uploadQueue.length > 0) {
      const next = uploadQueue.shift();
      launchUploader(next.options, next.socket);
    }
  }

  async function launchCrawler(options, socket) {
    isCrawling = true;

    socket.emit('log', `🚀 크롤링을 시작합니다... (옵션: ${JSON.stringify(options)})\n`);

    try {
      // Firebase → 로컬 CSV 동기화
      socket.emit('log', `🔄 Firebase에서 최신 리그 데이터를 가져오는 중...\n`);
      const firebaseContent = await downloadCsvFromFirebase();
      if (firebaseContent !== null) {
        fs.writeFileSync(path.join(__dirname, 'leagues.csv'), firebaseContent, 'utf-8');
        socket.emit('log', `✅ 최신 리그 데이터로 업데이트 완료\n`);
      } else {
        socket.emit('log', `⚠️ Firebase에서 데이터를 가져올 수 없어 로컬 파일을 사용합니다\n`);
      }
    } catch (err) {
      console.error('CSV 동기화 실패:', err);
      socket.emit('log', `⚠️ CSV 동기화 실패, 로컬 파일을 사용합니다: ${err.message}\n`);
    }

    // 인자 배열 구성
    const args = ['meat.js'];
    if (options.year) args.push(`--year=${options.year}`);
    if (options.month) args.push(`--month=${options.month}`);
    if (options.league) args.push(`--league=${options.league}`);
    if (options.region) args.push(`--region=${options.region}`);
    if (options.matchIdx) args.push(`--matchIdx=${options.matchIdx}`);
    if (options.leagueTitle) args.push(`--leagueTitle=${options.leagueTitle}`);

    const crawler = spawn('node', args);
    const processId = `crawling-${Date.now()}`;

    runningProcesses.set(processId, { process: crawler, type: 'crawling', socket: socket.id, options: options });
    socket.runningProcesses.add(processId);
    socket.emit('process-started', { processId, type: 'crawling' });
    emitQueueStatus();

    crawler.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log(msg);
      addToLogHistory(msg);
      io.emit('log', msg);
    });

    crawler.stderr.on('data', (data) => {
      const msg = `❌ ERROR: ${data.toString()}`;
      console.error(msg);
      addToLogHistory(msg);
      io.emit('log', msg);
    });

    crawler.on('close', (code) => {
      const msg = `🏁 크롤링 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(msg);
      addToLogHistory(msg);
      io.emit('log', msg);

      const processInfo = runningProcesses.get(processId);
      finalizeProcess(processId, 'crawling', processInfo.options);
    });
  }

  // 'start-crawling' 요청을 큐에 등록
  socket.on('start-crawling', (options) => {
    console.log('📥 큐에 크롤링 요청 추가:', options);
    socket.emit('log', `📥 요청이 큐에 등록되었습니다. (옵션: ${JSON.stringify(options)})\n`);

    crawlQueue.push({ options, socket });
    if (!isCrawling) {
      const next = crawlQueue.shift();
      launchCrawler(next.options, next.socket);
    }
    emitQueueStatus();
  });

  // ===== 업로드 실행 함수 =====
  async function launchUploader(options, socket) {
    isUploading = true;
    socket.emit('log', `☁️ Firebase 업로드를 시작합니다... (옵션: ${JSON.stringify(options)})\n`);

    const args = ['firebase_uploader.js'];
    if (options.year) args.push(`--year=${options.year}`);
    if (options.month) args.push(`--month=${options.month}`);
    if (options.league) args.push(`--league=${options.league}`);
    if (options.region) args.push(`--region=${options.region}`);
    if (options.matchIdx) args.push(`--matchIdx=${options.matchIdx}`);
    if (options.leagueTitle) args.push(`--leagueTitle=${options.leagueTitle}`);

    const uploader = spawn('node', args);
    const processId = `uploading-${Date.now()}`;

    runningProcesses.set(processId, { process: uploader, type: 'uploading', socket: socket.id, options });
    socket.runningProcesses.add(processId);
    socket.emit('process-started', { processId, type: 'uploading', options });
    emitQueueStatus();

    uploader.stdout.on('data', data => {
      const msg = data.toString();
      console.log(msg);
      addToLogHistory(msg);
      io.emit('log', msg);
    });
    uploader.stderr.on('data', data => {
      const msg = `❌ ERROR: ${data.toString()}`;
      console.error(msg);
      addToLogHistory(msg);
      io.emit('log', msg);
    });
    uploader.on('close', code => {
      const msg = `🏁 업로드 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(msg);
      addToLogHistory(msg);
      io.emit('log', msg);

      const processInfo = runningProcesses.get(processId);
      finalizeProcess(processId, 'uploading', processInfo.options);
    });
  }

  // 'start-uploading' 이벤트를 받으면 firebase_uploader.js 실행
  socket.on('start-uploading', (options) => {
    console.log('📥 업로드 큐 요청 추가:', options);
    socket.emit('log', `📥 업로드 요청이 큐에 등록되었습니다. (옵션: ${JSON.stringify(options)})\n`);
    uploadQueue.push({ options, socket });
    if (!isUploading) {
      const next = uploadQueue.shift();
      launchUploader(next.options, next.socket);
    }
    emitQueueStatus();
  });

  // 프로세스 중단 이벤트
  socket.on('stop-process', (data) => {
    const { processId } = data;
    console.log(`🛑 프로세스 중단 요청: ${processId}`);
    
    if (runningProcesses.has(processId)) {
      const processInfo = runningProcesses.get(processId);
      try {
        processInfo.process.kill('SIGTERM');
        console.log(`✅ 프로세스 ${processId} 중단 신호 전송`);
        socket.emit('log', `🛑 ${processInfo.type} 프로세스를 중단합니다...\n`);
        
        // === 개선: 크롤링 중단 시 대기열도 함께 비우기 (전역 큐 사용) ===
        if (processInfo.type === 'crawling') {
          crawlQueue.length = 0;
          socket.emit('log', `🧹 크롤링 대기열을 모두 비웠습니다.\n`);
          emitQueueStatus();
          maybeStartNextUpload();
        }
        if (processInfo.type === 'uploading') {
          uploadQueue.length = 0;
          socket.emit('log', `🧹 업로드 대기열을 모두 비웠습니다.\n`);
          emitQueueStatus();
          maybeStartNextUpload();
        }
        
        // 3초 후에도 프로세스가 살아있으면 강제 종료
        setTimeout(() => {
          if (runningProcesses.has(processId)) {
            processInfo.process.kill('SIGKILL');
            console.log(`💀 프로세스 ${processId} 강제 종료`);
            socket.emit('log', `💀 프로세스가 강제 종료되었습니다.\n`);
            finalizeProcess(processId, processInfo.type, processInfo.options);
          }
        }, 3000);
        
      } catch (error) {
        console.error(`❌ 프로세스 종료 실패: ${error.message}`);
        socket.emit('log', `❌ 프로세스 종료 실패: ${error.message}\n`);
      }
    } else {
      socket.emit('log', `⚠️ 중단할 프로세스를 찾을 수 없습니다: ${processId}\n`);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected');
    
    // 연결이 끊어진 클라이언트의 모든 프로세스 정리
    if (socket.runningProcesses) {
      socket.runningProcesses.forEach(processId => {
        if (runningProcesses.has(processId)) {
          const processInfo = runningProcesses.get(processId);
          console.log(`🧹 연결 해제로 인한 프로세스 정리: ${processId}`);
          try {
            processInfo.process.kill('SIGTERM');
            setTimeout(() => {
              if (runningProcesses.has(processId)) {
                processInfo.process.kill('SIGKILL');
              }
            }, 1000);
          } catch (error) {
            console.error(`❌ 프로세스 정리 실패: ${error.message}`);
          }
          runningProcesses.delete(processId);
        }
      });
    }
  });

  // ===== 프로세스 종료 공통 처리 (소켓 범위) =====
  function finalizeProcess(processId, type, options) {
    if (!runningProcesses.has(processId)) return;

    const procInfo = runningProcesses.get(processId);
    runningProcesses.delete(processId);

    // 소켓별 추적 세트 정리
    const targetSocket = io.sockets.sockets.get(procInfo.socket);
    if (targetSocket && targetSocket.runningProcesses) {
      targetSocket.runningProcesses.delete(processId);
    }

    if (type === 'crawling') {
      isCrawling = false;
      // 크롤링이 끝났으니 대기중인 업로드 실행 시도
      maybeStartNextUpload();
    }
    if (type === 'uploading') {
      isUploading = false;
    }

    io.emit('process-ended', { processId, type, options });
    emitQueueStatus();

    // 크롤링이 끝났고 대기열에 다음 크롤링이 있으면 실행
    if (!isCrawling && crawlQueue.length > 0) {
      const next = crawlQueue.shift();
      launchCrawler(next.options, next.socket);
    }
    // 업로드도 동일하게 처리 (업로드 종료 후 다른 업로드가 남아있으면)
    if (!isUploading && uploadQueue.length > 0) {
      const next = uploadQueue.shift();
      launchUploader(next.options, next.socket);
    }
  }
});

// 자동 Keep-Alive 함수 (Render 서버 자동 종료 방지)
const keepAlive = () => {
  setInterval(() => {
    // 5분마다 자신에게 요청을 보내 활성 상태 유지
    if (process.env.NODE_ENV === 'production') {
      const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      fetch(`${url}/health`)
        .then(res => console.log(`🏓 Keep-alive ping: ${res.status} at ${new Date().toISOString()}`))
        .catch(err => console.log(`❌ Keep-alive failed: ${err.message}`));
    }
  }, 5 * 60 * 1000); // 5분마다
};

// 서버 초기화 함수 (CSV 동기화 제거)
async function initializeServer() {
  console.log('🚀 서버 초기화 중...');
  
  // Keep-Alive 시작 (프로덕션 환경에서만)
  if (process.env.NODE_ENV === 'production') {
    console.log('🏓 Keep-Alive 시스템 시작 (Render 자동 종료 방지)');
    keepAlive();
  }
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on http://0.0.0.0:${PORT}`);
    console.log('🔥 Firebase 연동 준비 완료! (사용자 요청 시에만 동작)');
    if (process.env.NODE_ENV === 'production') {
      console.log('🛡️ 서버 자동 종료 방지 시스템이 활성화되었습니다!');
    }
  });
}

// 팀명에서 지역명 분리 함수 (대분류 + 중분류)
function parseTeamName(fullTeamName) {
  if (!fullTeamName) {
    return { majorRegion: '', minorRegion: '', teamName: fullTeamName || '', fullRegion: '' };
  }

  // 대분류 지역 패턴
  const majorRegionPatterns = ['경남', '부산', '울산', '대구', '대전', '광주', '인천', '서울', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '제주'];

  // 중분류 지역 패턴 (시/군/구)
  const minorRegionPatterns = [
    // 경남 지역
    '양산시', '거제시', '김해시', '진주시', '창원시', '통영시', '사천시', '밀양시', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
    // 부산 지역  
    '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
    // 기타 주요 시/군/구
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
  ];

  let majorRegion = '';
  let remainingName = fullTeamName;

  // 대분류 지역 찾기 (지역명 뒤에 공백이 있는 경우에만 분리)
  for (const region of majorRegionPatterns) {
    const prefix = region + ' ';
    if (fullTeamName.startsWith(prefix)) {
      majorRegion = region;
      remainingName = fullTeamName.substring(prefix.length);
      break;
    }
  }

  let minorRegion = '';
  let teamName = remainingName;

  // 중분류 지역 찾기 (역시 공백이 있어야 분리)
  for (const region of minorRegionPatterns) {
    const prefix = region + ' ';
    if (remainingName.startsWith(prefix)) {
      minorRegion = region;
      teamName = remainingName.substring(prefix.length).trim();
      break;
    }
  }

  // 팀명이 비어있으면 원본 사용
  if (!teamName.trim()) {
    teamName = fullTeamName;
  }

  return {
    majorRegion,
    minorRegion,
    teamName: teamName.trim(),
    fullRegion: majorRegion + minorRegion
  };
}

// 시간 형식 변환 함수
function formatTime(timeString) {
  if (!timeString) return timeString;
  
  // 이미 형식화된 시간인지 확인
  if (timeString.includes('오전') || timeString.includes('오후')) return timeString;
  
  let hour, minute;
  
  // MATCH_CHECK_TIME1 형식: "2025-05-25 (일) 13:00"
  if (timeString.includes('(') && timeString.includes(')')) {
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      hour = timeMatch[1];
      minute = timeMatch[2];
    }
  }
  // MATCH_TIME 형식: "2025-05-25-일-13-00"
  else if (timeString.includes('-')) {
    const parts = timeString.split('-');
    if (parts.length >= 5) {
      hour = parts[parts.length - 2]; // 끝에서 두 번째가 시간
      minute = parts[parts.length - 1]; // 마지막이 분
    } else {
      // 간단한 "13-00" 형식
      const timeParts = timeString.split('-');
      if (timeParts.length === 2) {
        hour = timeParts[0];
        minute = timeParts[1];
      }
    }
  }
  // 단순 "13:00" 형식
  else if (timeString.includes(':')) {
    [hour, minute] = timeString.split(':');
  }
  // 숫자만 있는 경우
  else if (/^\d+$/.test(timeString)) {
    if (timeString.length === 4) {
      hour = timeString.substring(0, 2);
      minute = timeString.substring(2, 4);
    } else {
      hour = timeString;
      minute = '00';
    }
  }
  
  if (!hour || !minute) return timeString;
  
  const hourNum = parseInt(hour);
  const minuteNum = parseInt(minute) || 0;
  
  if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) return timeString;
  if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) return timeString;
  
  const period = hourNum < 12 ? '오전' : '오후';
  const displayHour = hourNum === 0 ? 12 : (hourNum > 12 ? hourNum - 12 : hourNum);
  
  return `${period} ${displayHour}시 ${minuteNum.toString().padStart(2, '0')}분`;
}

// 순위표 계산 함수
function calculateStandings(matches, leagueFilter = null) {
  const standings = new Map();
  
  matches.forEach(match => {
    if (leagueFilter && match.leagueTitle !== leagueFilter) return;
    if (match.matchStatus !== '완료') return;
    
    const homeTeamFull = match.TH_CLUB_NAME || match.TEAM_HOME || '홈팀';
    const awayTeamFull = match.TA_CLUB_NAME || match.TEAM_AWAY || '어웨이팀';
    
    // 팀명 파싱
    const homeParsed = parseTeamName(homeTeamFull);
    const awayParsed = parseTeamName(awayTeamFull);
    const homeScore = parseInt(match.TH_SCORE_FINAL) || 0;
    const awayScore = parseInt(match.TA_SCORE_FINAL) || 0;
    
    // 리그별로 팀을 구분하기 위해 고유 식별자 생성
    const homeTeamId = `${match.leagueTitle}_${homeParsed.teamName}`;
    const awayTeamId = `${match.leagueTitle}_${awayParsed.teamName}`;
    
    // 팀 통계 초기화
    if (!standings.has(homeTeamId)) {
      standings.set(homeTeamId, {
        teamName: homeParsed.teamName,
        fullTeamName: homeTeamFull,
        majorRegion: homeParsed.majorRegion,
        minorRegion: homeParsed.minorRegion,
        fullRegion: homeParsed.fullRegion,
        league: match.leagueTitle,
        region: match.regionTag,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    }
    
    if (!standings.has(awayTeamId)) {
      standings.set(awayTeamId, {
        teamName: awayParsed.teamName,
        fullTeamName: awayTeamFull,
        majorRegion: awayParsed.majorRegion,
        minorRegion: awayParsed.minorRegion,
        fullRegion: awayParsed.fullRegion,
        league: match.leagueTitle,
        region: match.regionTag,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      });
    }
    
    const homeStats = standings.get(homeTeamId);
    const awayStats = standings.get(awayTeamId);
    
    // 경기 수 증가
    homeStats.played++;
    awayStats.played++;
    
    // 득점/실점 기록
    homeStats.goalsFor += homeScore;
    homeStats.goalsAgainst += awayScore;
    awayStats.goalsFor += awayScore;
    awayStats.goalsAgainst += homeScore;
    
    // 승부 결과 처리
    if (homeScore > awayScore) {
      homeStats.won++;
      homeStats.points += 3;
      awayStats.lost++;
    } else if (homeScore < awayScore) {
      awayStats.won++;
      awayStats.points += 3;
      homeStats.lost++;
    } else {
      homeStats.drawn++;
      homeStats.points += 1;
      awayStats.drawn++;
      awayStats.points += 1;
    }
    
    // 골득실 계산
    homeStats.goalDifference = homeStats.goalsFor - homeStats.goalsAgainst;
    awayStats.goalDifference = awayStats.goalsFor - awayStats.goalsAgainst;
  });
  
  // 순위표 정렬 (승점 > 골득실 > 득점 > 팀명)
  return Array.from(standings.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

// Firebase API 엔드포인트들
// 지역 목록 조회
app.get('/api/regions', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const regions = [...new Set(matches.map(m => m.regionTag))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko-KR'));
    res.json(regions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 지역의 리그 목록 조회
app.get('/api/leagues/:region', async (req, res) => {
  try {
    const { region } = req.params;
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const leagues = [...new Set(
      matches
        .filter(m => m.regionTag === region)
        .map(m => m.leagueTitle)
    )].filter(Boolean).sort((a, b) => {
      // K5, K6, K7 순서로 정렬 후 가나다순
      const getLeagueOrder = (league) => {
        if (league.includes('K5')) return 1;
        if (league.includes('K6')) return 2;
        if (league.includes('K7')) return 3;
        return 4;
      };
      
      const orderA = getLeagueOrder(a);
      const orderB = getLeagueOrder(b);
      
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b, 'ko-KR');
    });
    
    res.json(leagues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 모든 리그 순위표 조회
app.get('/api/standings', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    // 리그별로 그룹화
    const leagueGroups = {};
    matches.forEach(match => {
      const key = `${match.regionTag}_${match.leagueTitle}`;
      if (!leagueGroups[key]) {
        leagueGroups[key] = {
          region: match.regionTag,
          league: match.leagueTitle,
          matches: []
        };
      }
      leagueGroups[key].matches.push(match);
    });
    
    // 각 리그별 순위표 계산
    const allStandings = Object.values(leagueGroups).map(group => ({
      region: group.region,
      league: group.league,
      standings: calculateStandings(group.matches, group.league)
    })).sort((a, b) => {
      // 지역별, 리그별 정렬
      if (a.region !== b.region) return a.region.localeCompare(b.region, 'ko-KR');
      
      const getLeagueOrder = (league) => {
        if (league.includes('K5')) return 1;
        if (league.includes('K6')) return 2;
        if (league.includes('K7')) return 3;
        return 4;
      };
      
      return getLeagueOrder(a.league) - getLeagueOrder(b.league);
    });
    
    res.json(allStandings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 리그 순위표 조회
app.get('/api/standings/:region/:league', async (req, res) => {
  try {
    const { region, league } = req.params;
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const filteredMatches = matches.filter(m => 
      m.regionTag === region && m.leagueTitle === league
    );
    
    const standings = calculateStandings(filteredMatches, league);
    
    res.json({
      region,
      league,
      standings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 경기 통계 조회
app.get('/api/matches/stats', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const stats = {
      total: matches.length,
      completed: matches.filter(m => m.matchStatus === '완료').length,
      upcoming: matches.filter(m => m.matchStatus === '예정').length,
      leagues: [...new Set(matches.map(m => m.leagueTitle))].length
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 모든 경기 조회 (개선된 버전)
app.get('/api/matches', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').limit(2000).get();
    const matches = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // 팀명 정보 보강
      const homeTeamFull = data.TH_CLUB_NAME || data.TEAM_HOME || data.HOME_TEAM || data.TH_NAME || '홈팀';
      const awayTeamFull = data.TA_CLUB_NAME || data.TEAM_AWAY || data.AWAY_TEAM || data.TA_NAME || '어웨이팀';
      
      // 팀명에서 지역 분리
      const homeParsed = parseTeamName(homeTeamFull);
      const awayParsed = parseTeamName(awayTeamFull);
      
      // 시간 형식 변환 (우선순위: MATCH_CHECK_TIME1 > TIME > MATCH_TIME)
      const rawTime = data.MATCH_CHECK_TIME1 || data.TIME || data.MATCH_TIME || data.KICK_OFF || '';
      const formattedTime = formatTime(rawTime);
      
      return { 
        id: doc.id, 
        ...data,
        // 기존 팀명 (호환성)
        TH_CLUB_NAME: homeTeamFull,
        TA_CLUB_NAME: awayTeamFull,
        // 파싱된 팀명 정보 (새로운 구조)
        HOME_TEAM_MAJOR_REGION: homeParsed.majorRegion,
        HOME_TEAM_MINOR_REGION: homeParsed.minorRegion,
        HOME_TEAM_FULL_REGION: homeParsed.fullRegion,
        HOME_TEAM_NAME: homeParsed.teamName,
        AWAY_TEAM_MAJOR_REGION: awayParsed.majorRegion,
        AWAY_TEAM_MINOR_REGION: awayParsed.minorRegion,
        AWAY_TEAM_FULL_REGION: awayParsed.fullRegion,
        AWAY_TEAM_NAME: awayParsed.teamName,
        // 경기장 정보 보강  
        STADIUM: data.STADIUM || data.MATCH_AREA || data.GROUND || data.PLACE || data.VENUE || '',
        // 시간 정보 보강
        MATCH_TIME: rawTime,
        MATCH_TIME_FORMATTED: formattedTime,
        // 날짜 정보 보강
        MATCH_DATE: data.MATCH_DATE || data.MATCH_CHECK_TIME2 || data.DATE || '',
        // 경기 상태
        MATCH_STATUS: data.matchStatus || '예정'
      };
    });
    
    // 날짜/시간순 오름차순 정렬 (과거 → 현재 → 미래)
    matches.sort((a, b) => {
      const dateA = new Date(a.MATCH_DATE || '9999-12-31');
      const dateB = new Date(b.MATCH_DATE || '9999-12-31');
      return dateA - dateB;
    });
    
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 경기 수정
app.put('/api/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    await db.collection('matches').doc(id).update(updateData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 경기 삭제
app.delete('/api/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('matches').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 전체 리그 목록 조회 (K5~K7 분류 포함)
app.get('/api/leagues/all', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const leaguesByCategory = {
      K5: [],
      K6: [],
      K7: [],
      기타: []
    };
    
    const leagueSet = new Set();
    matches.forEach(match => {
      if (match.leagueTitle && !leagueSet.has(match.leagueTitle)) {
        leagueSet.add(match.leagueTitle);
        
        if (match.leagueTitle.includes('K5')) {
          leaguesByCategory.K5.push(match.leagueTitle);
        } else if (match.leagueTitle.includes('K6')) {
          leaguesByCategory.K6.push(match.leagueTitle);
        } else if (match.leagueTitle.includes('K7')) {
          leaguesByCategory.K7.push(match.leagueTitle);
        } else {
          leaguesByCategory.기타.push(match.leagueTitle);
        }
      }
    });
    
    // 각 카테고리 내에서 정렬
    Object.keys(leaguesByCategory).forEach(category => {
      leaguesByCategory[category].sort((a, b) => a.localeCompare(b, 'ko-KR'));
    });
    
    res.json(leaguesByCategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 뉴스 피드 데이터 조회 (최근 경기 결과 + 예정 경기)
app.get('/api/newsfeed', async (req, res) => {
  try {
    // 모든 경기 문서를 가져와야 주간 범위에 포함되는 최근·예정 경기를 완전히 포착할 수 있다.
    // limit(1000) 으로 인해 1,000번째 이후에 저장된 경기(예: 최근 크롤링된 K3 경기)가 누락되는 문제가 발생하므로 제거한다.
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // 최근 완료된 경기 (지난 주)
    const recentMatches = matches
      .filter(m => {
        const matchDate = new Date(m.MATCH_DATE || m.MATCH_CHECK_TIME2 || '1970-01-01');
        return m.matchStatus === '완료' && matchDate >= oneWeekAgo && matchDate <= now;
      })
      .map(m => ({
        ...m,
        homeTeam: parseTeamName(m.TH_CLUB_NAME || m.TEAM_HOME || '홈팀'),
        awayTeam: parseTeamName(m.TA_CLUB_NAME || m.TEAM_AWAY || '어웨이팀'),
        homeScore: m.TH_SCORE_FINAL || 0,
        awayScore: m.TA_SCORE_FINAL || 0,
        formattedTime: formatTime(m.MATCH_CHECK_TIME1 || m.TIME || ''),
        stadium: m.STADIUM || m.MATCH_AREA || '경기장 미정'
      }))
      .sort((a, b) => new Date(b.MATCH_DATE || '1970-01-01') - new Date(a.MATCH_DATE || '1970-01-01'))
      .slice(0, 10);
    
    // 예정된 경기 (이번주)
    const thisWeekEnd = new Date(now);
    const daysToSunday = 7 - now.getDay(); // 이번주 일요일까지
    thisWeekEnd.setDate(now.getDate() + daysToSunday);
    
    const upcomingMatches = matches
      .filter(m => {
        // 여러 날짜 필드 시도
        const dateStr = m.MATCH_DATE || m.MATCH_CHECK_TIME2 || m.matchDate || m.date || m.DATE;
        if (!dateStr) return false;
        
        // 다양한 날짜 형식 처리
        const matchDate = parseFlexibleDate(dateStr);
        if(!matchDate){
          console.warn('날짜 파싱 실패:', dateStr);
          return false;
        }
        
        if (isNaN(matchDate.getTime())) return false;
        
        // 이번주 모든 경기 (완료/예정 포함)
        const isUpcoming = (m.matchStatus === '예정' || !m.matchStatus || 
                           (m.TH_SCORE_FINAL === null && m.TA_SCORE_FINAL === null) ||
                           (!m.homeScore && !m.awayScore));
        
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(now.getDate() - now.getDay());
        return matchDate >= thisWeekStart && matchDate <= thisWeekEnd;
      })
      .map(m => ({
        ...m,
        homeTeam: parseTeamName(m.TH_CLUB_NAME || m.TEAM_HOME || m.homeTeam || '홈팀'),
        awayTeam: parseTeamName(m.TA_CLUB_NAME || m.TEAM_AWAY || m.awayTeam || '어웨이팀'),
        formattedTime: formatTime(m.MATCH_CHECK_TIME1 || m.MATCH_TIME || m.TIME || m.time || ''),
        stadium: m.STADIUM || m.MATCH_AREA || m.venue || m.stadium || '경기장 미정',
        matchDate: m.MATCH_DATE || m.MATCH_CHECK_TIME2 || m.matchDate || m.date || m.DATE
      }))
      .sort((a, b) => {
        const dateA = new Date(a.matchDate || '2099-12-31');
        const dateB = new Date(b.matchDate || '2099-12-31');
        return dateA - dateB;
      })
             // .slice(0, 20) 제거 - 모든 경기 표시
    
    // 주요 통계
    const totalMatches = matches.length;
    const completedMatches = matches.filter(m => m.matchStatus === '완료').length;
    const activeLeagues = [...new Set(matches.map(m => m.leagueTitle))].filter(Boolean).length;
    const activeTeams = new Set();
    matches.forEach(m => {
      if (m.TH_CLUB_NAME || m.TEAM_HOME) activeTeams.add(m.TH_CLUB_NAME || m.TEAM_HOME);
      if (m.TA_CLUB_NAME || m.TEAM_AWAY) activeTeams.add(m.TA_CLUB_NAME || m.TEAM_AWAY);
    });
    
    // 이주의 하이라이트 (최고 득점 경기)
    const highlight = recentMatches.reduce((max, match) => {
      const totalGoals = (match.homeScore || 0) + (match.awayScore || 0);
      const maxGoals = (max?.homeScore || 0) + (max?.awayScore || 0);
      return totalGoals > maxGoals ? match : max;
    }, null);
    
    res.json({
      recentMatches,
      upcomingMatches,
      highlight,
      stats: {
        totalMatches,
        completedMatches,
        activeLeagues,
        activeTeams: activeTeams.size
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 리그 목록 조회
app.get('/api/leagues', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const leagueMap = new Map();
    matches.forEach(match => {
      const key = `${match.leagueTitle}-${match.year}-${match.regionTag}`;
      if (!leagueMap.has(key)) {
        leagueMap.set(key, {
          leagueTitle: match.leagueTitle,
          regionTag: match.regionTag,
          year: match.year,
          leagueTag: match.leagueTag,
          matchIdx: match.matchIdx,
          matchCount: 0
        });
      }
      leagueMap.get(key).matchCount++;
    });
    
    res.json(Array.from(leagueMap.values()));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 팀 목록 조회 (K5~K7별, 지역별 정렬)
app.get('/api/teams', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    const teams = new Set();
    
    matches.forEach(match => {
      if (match.TEAM_HOME) {
        const homeParsed = parseTeamName(match.TEAM_HOME);
        teams.add(JSON.stringify({
          fullName: match.TEAM_HOME,
          teamName: homeParsed.teamName,
          majorRegion: homeParsed.majorRegion,
          minorRegion: homeParsed.minorRegion,
          leagueTitle: match.leagueTitle || ''
        }));
      }
      if (match.TEAM_AWAY) {
        const awayParsed = parseTeamName(match.TEAM_AWAY);
        teams.add(JSON.stringify({
          fullName: match.TEAM_AWAY,
          teamName: awayParsed.teamName,
          majorRegion: awayParsed.majorRegion,
          minorRegion: awayParsed.minorRegion,
          leagueTitle: match.leagueTitle || ''
        }));
      }
    });
    
    const teamList = Array.from(teams).map(team => JSON.parse(team));
    
    // K5~K7별, 지역별, 팀명순으로 정렬
    teamList.sort((a, b) => {
      // 1. K5, K6, K7 순서로 정렬
      const getLeagueOrder = (league) => {
        if (league.includes('K5')) return 1;
        if (league.includes('K6')) return 2;
        if (league.includes('K7')) return 3;
        return 4;
      };
      
      const orderA = getLeagueOrder(a.leagueTitle);
      const orderB = getLeagueOrder(b.leagueTitle);
      
      if (orderA !== orderB) return orderA - orderB;
      
      // 2. 대분류 지역별 정렬
      if (a.majorRegion !== b.majorRegion) {
        return (a.majorRegion || '').localeCompare(b.majorRegion || '');
      }
      
      // 3. 소분류 지역별 정렬
      if (a.minorRegion !== b.minorRegion) {
        return (a.minorRegion || '').localeCompare(b.minorRegion || '');
      }
      
      // 4. 팀명순 정렬
      return a.teamName.localeCompare(b.teamName);
    });
    
    res.json(teamList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 팀 정보 조회
app.get('/api/teams/:teamName', async (req, res) => {
  try {
    const teamName = req.params.teamName;
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    
    const teamMatches = matches.filter(match => {
      const homeParsed = parseTeamName(match.TEAM_HOME || '');
      const awayParsed = parseTeamName(match.TEAM_AWAY || '');
      return homeParsed.teamName === teamName || awayParsed.teamName === teamName;
    });
    
    // 팀 통계 계산
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    const completedMatches = teamMatches.filter(m => m.matchStatus === '완료' && m.TH_SCORE_FINAL && m.TA_SCORE_FINAL);
    
    completedMatches.forEach(match => {
      const homeParsed = parseTeamName(match.TEAM_HOME || '');
      const awayParsed = parseTeamName(match.TEAM_AWAY || '');
      const homeScore = parseInt(match.TH_SCORE_FINAL) || 0;
      const awayScore = parseInt(match.TA_SCORE_FINAL) || 0;
      
      if (homeParsed.teamName === teamName) {
        // 홈팀인 경우
        goalsFor += homeScore;
        goalsAgainst += awayScore;
        if (homeScore > awayScore) wins++;
        else if (homeScore === awayScore) draws++;
        else losses++;
      } else if (awayParsed.teamName === teamName) {
        // 어웨이팀인 경우
        goalsFor += awayScore;
        goalsAgainst += homeScore;
        if (awayScore > homeScore) wins++;
        else if (awayScore === homeScore) draws++;
        else losses++;
      }
    });
    
    const teamInfo = {
      teamName,
      totalMatches: teamMatches.length,
      completedMatches: completedMatches.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: wins * 3 + draws,
      matches: teamMatches.map(match => {
        const homeParsed = parseTeamName(match.TEAM_HOME || '');
        const awayParsed = parseTeamName(match.TEAM_AWAY || '');
        const rawTime = match.MATCH_CHECK_TIME1 || match.TIME || match.MATCH_TIME || match.KICK_OFF || '';
        const formattedTime = formatTime(rawTime);
        
        return {
          ...match,
          HOME_TEAM_NAME: homeParsed.teamName,
          HOME_TEAM_MAJOR_REGION: homeParsed.majorRegion,
          HOME_TEAM_MINOR_REGION: homeParsed.minorRegion,
          AWAY_TEAM_NAME: awayParsed.teamName,
          AWAY_TEAM_MAJOR_REGION: awayParsed.majorRegion,
          AWAY_TEAM_MINOR_REGION: awayParsed.minorRegion,
          MATCH_TIME_FORMATTED: formattedTime,
          STADIUM: match.MATCH_AREA || match.STADIUM || '경기장 미정'
        };
      }).sort((a, b) => new Date(a.MATCH_DATE || 0) - new Date(b.MATCH_DATE || 0))
    };
    
    res.json(teamInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 분석 데이터 조회 (확장된 축구 통계)
app.get('/api/analytics', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    const completedMatches = matches.filter(m => m.matchStatus === '완료' && m.TH_SCORE_FINAL && m.TA_SCORE_FINAL);
    
    let totalGoals = 0;
    let maxScore = 0;
    let maxGoalMatch = null;
    const leagueActivity = new Map();
    const teamStats = new Map();
    
    completedMatches.forEach(match => {
      const homeScore = parseInt(match.TH_SCORE_FINAL) || 0;
      const awayScore = parseInt(match.TA_SCORE_FINAL) || 0;
      const totalMatchGoals = homeScore + awayScore;
      
      totalGoals += totalMatchGoals;
      
      // 최고 득점 경기 기록
      if (Math.max(homeScore, awayScore) > maxScore) {
        maxScore = Math.max(homeScore, awayScore);
        maxGoalMatch = {
          homeTeam: match.TEAM_HOME || '홈팀',
          awayTeam: match.TEAM_AWAY || '어웨이팀',
          homeScore,
          awayScore,
          date: match.MATCH_CHECK_TIME2 || match.MATCH_DATE
        };
      }
      
      const league = match.leagueTitle;
      leagueActivity.set(league, (leagueActivity.get(league) || 0) + 1);
      
      // 팀별 통계 계산
      const homeTeamFull = match.TEAM_HOME || '홈팀';
      const awayTeamFull = match.TEAM_AWAY || '어웨이팀';
      const homeParsed = parseTeamName(homeTeamFull);
      const awayParsed = parseTeamName(awayTeamFull);
      
      // 홈팀 통계
      if (!teamStats.has(homeParsed.teamName)) {
        teamStats.set(homeParsed.teamName, {
          teamName: homeParsed.teamName,
          majorRegion: homeParsed.majorRegion,
          minorRegion: homeParsed.minorRegion,
          goals: 0,
          conceded: 0,
          wins: 0,
          matches: 0
        });
      }
      const homeStats = teamStats.get(homeParsed.teamName);
      homeStats.goals += homeScore;
      homeStats.conceded += awayScore;
      homeStats.matches++;
      if (homeScore > awayScore) homeStats.wins++;
      
      // 어웨이팀 통계
      if (!teamStats.has(awayParsed.teamName)) {
        teamStats.set(awayParsed.teamName, {
          teamName: awayParsed.teamName,
          majorRegion: awayParsed.majorRegion,
          minorRegion: awayParsed.minorRegion,
          goals: 0,
          conceded: 0,
          wins: 0,
          matches: 0
        });
      }
      const awayStats = teamStats.get(awayParsed.teamName);
      awayStats.goals += awayScore;
      awayStats.conceded += homeScore;
      awayStats.matches++;
      if (awayScore > homeScore) awayStats.wins++;
    });
    
    const teams = Array.from(teamStats.values());
    
    // 각종 기록 계산
    const avgGoals = completedMatches.length > 0 ? (totalGoals / completedMatches.length).toFixed(1) : 0;
    const mostActiveLeague = leagueActivity.size > 0 ? 
      [...leagueActivity.entries()].sort((a, b) => b[1] - a[1])[0][0] : '-';
    
    // 최다 득점팀
    const topScorer = teams.length > 0 ? 
      teams.reduce((max, team) => team.goals > max.goals ? team : max) : null;
    
    // 최소 실점팀 (최소 3경기 이상)
    const bestDefense = teams.length > 0 ? 
      teams.filter(t => t.matches >= 3).reduce((min, team) => 
        team.conceded < min.conceded ? team : min, { conceded: Infinity }) : null;
    
    // 최다 승리팀
    const mostWins = teams.length > 0 ? 
      teams.reduce((max, team) => team.wins > max.wins ? team : max) : null;
    
    // 평균 득점이 높은 팀 (최소 3경기 이상)
    const bestAttack = teams.length > 0 ? 
      teams.filter(t => t.matches >= 3).reduce((max, team) => {
        const avgGoals = team.goals / team.matches;
        const maxAvgGoals = max.goals / max.matches;
        return avgGoals > maxAvgGoals ? team : max;
      }, { goals: 0, matches: 1 }) : null;
    
    const analytics = {
      avgGoals,
      highestScore: maxScore,
      maxGoalMatch,
      mostActiveLeague,
      recentActivity: new Date().toLocaleDateString(),
      topScorer: topScorer ? {
        ...topScorer,
        avgGoals: (topScorer.goals / topScorer.matches).toFixed(1)
      } : null,
      bestDefense: bestDefense && bestDefense.conceded !== Infinity ? {
        ...bestDefense,
        avgConceded: (bestDefense.conceded / bestDefense.matches).toFixed(1)
      } : null,
      mostWins,
      bestAttack: bestAttack && bestAttack.matches > 1 ? {
        ...bestAttack,
        avgGoals: (bestAttack.goals / bestAttack.matches).toFixed(1)
      } : null,
      totalMatches: completedMatches.length,
      totalTeams: teams.length
    };
    
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to parse various date formats into Date obj
function parseFlexibleDate(str){
  if(!str) return null;
  // If already Date object (or timestamp)
  if(typeof str !== 'string') return new Date(str);
  // Trim and normalize
  let s = str.trim();
  // Remove time portion if present after whitespace
  if(s.includes(' ')) s = s.split(' ')[0];
  // Remove anything in parentheses e.g., "2024-07-05(금)" or "2024.07.05(토)"
  s = s.split('(')[0];
  // Remove trailing Korean weekday characters without parentheses (월,화,수,목,금,토,일)
  s = s.replace(/[월화수목금토일]$/, '');
  // Remove trailing dot if any
  s = s.replace(/\.$/, '');
  // Replace separators with '-'
  s = s.replace(/[\.\/]/g, '-');
  // Remove duplicate '--'
  s = s.replace(/-+/g, '-');
  // If format is yyyymmdd
  if(/^\d{8}$/.test(s)){
    s = s.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
  }
  // If format is mm-dd without year
  if(/^\d{2}-\d{2}$/.test(s)){
    const y = new Date().getFullYear();
    s = `${y}-${s}`;
  }
  // Final attempt: extract first YYYY-MM-DD pattern if exists
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){
    s = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  }
  const d = new Date(s);
  if(isNaN(d)) return null;
  return d;
}

// 서버 초기화 실행
initializeServer(); 