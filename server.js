const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;

// Firebase 관련 imports
const { uploadCsvToFirebase, downloadCsvFromFirebase, syncCsvWithFirebase, db } = require('./firebase_uploader');
const FirebaseService = require('./firebase-service');

// 자동 스케줄러 import
const MatchScheduler = require('./services/match-scheduler');

// 유틸리티 imports
const { parseTeamName, getLeagueOrder } = require('./utils/team-utils');
const { parseFlexibleDate } = require('./utils/date-utils');
const { formatTimeKorean, calculateStandings } = require('./utils/server-utils');
const { expressErrorHandler, setupProcessHandlers } = require('./utils/error-handler');

// 라우터 imports
const { router: apiRouter, initializeApiRoutes } = require('./routes/api');
const { router: csvRouter, initializeCsvRoutes } = require('./routes/csv');
const { handleWebSocketConnection, initializeWebSocketRoutes } = require('./routes/websocket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// EJS 템플릿 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname));

const PORT = process.env.PORT || 80;
const HOST = process.env.HOST || '0.0.0.0';
const FALLBACK_PORT = 3000;

// Firebase 서비스 인스턴스 생성
const firebaseService = new FirebaseService(db);

// 자동 스케줄러 인스턴스 생성
const matchScheduler = new MatchScheduler(firebaseService);

// 전역 io 객체 설정 (스케줄러에서 사용)
global.io = io;

// 라우터 의존성 주입
initializeApiRoutes(firebaseService, { calculateStandings }, matchScheduler);
initializeCsvRoutes({ uploadCsvToFirebase, downloadCsvFromFirebase });
initializeWebSocketRoutes({ downloadCsvFromFirebase, uploadCsvToFirebase, syncCsvWithFirebase }, firebaseService);

// 강화된 CORS 및 보안 헤더 설정 (디버깅 로그 추가)
app.use((req, res, next) => {
  // 요청 로깅 (모바일 접속 진단용)
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  const requestInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    userAgent: userAgent,
    origin: req.headers.origin,
    host: req.headers.host,
    isMobile: isMobile,
    clientIP: clientIP,
    referer: req.headers.referer
  };
  
  // 모바일 요청 로깅
  if (isMobile) {
    console.log('📱 모바일 요청:', JSON.stringify(requestInfo, null, 2));
  }
  
  const allowedOrigins = [
    'http://ssurpass.com',
    'https://ssurpass.com',
    'http://www.ssurpass.com',
    'https://www.ssurpass.com',
    'http://localhost:3000',
    'http://localhost:' + PORT,
    'http://127.0.0.1:' + PORT,
    `http://${HOST}:${PORT}`
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  // 모바일 최적화 헤더
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Deploy-Token, User-Agent');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 보안 헤더
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // 모바일 전용 헤더
  if (isMobile) {
    res.setHeader('X-Mobile-Device', 'true');
    res.setHeader('Vary', 'User-Agent');
    res.setHeader('X-Mobile-Debug', `IP:${clientIP}, UA:${userAgent.substring(0, 50)}`);
  }
  
  if (req.method === 'OPTIONS') {
    console.log('🔧 OPTIONS 요청 처리:', requestInfo);
    return res.sendStatus(200);
  }
  
  next();
});

// JSON 요청 본문을 파싱하기 위한 미들웨어
app.use(express.json());

// 모바일 최적화 미들웨어
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(userAgent);
  
  if (isMobile) {
    res.setHeader('X-Mobile-Optimized', 'true');
    // 모바일 장치에 대한 추가 헤더 설정
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  req.isMobile = isMobile;
  next();
});

// 정적 파일 제공
app.use(express.static(path.join(__dirname), {
  etag: true,
  lastModified: true,
  maxAge: '1h'
}));
app.use('/components', express.static(path.join(__dirname, 'components')));

// 라우터 등록
app.use('/api', apiRouter);
app.use('/', csvRouter);

// 에러 핸들링 미들웨어 (라우터 다음에 위치)
app.use(expressErrorHandler);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.render('index');
});

// Health check 엔드포인트 (서버 활성 상태 유지용)
app.get('/health', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  
  console.log(`🏥 Health check 요청: ${isMobile ? '📱 모바일' : '💻 데스크톱'} - IP: ${clientIP}`);
  
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mobile: isMobile,
    clientIP: clientIP,
    userAgent: userAgent,
    port: PORT,
    host: HOST,
    server: 'K-League Crawler'
  });
});

// 모바일 진단 전용 엔드포인트
app.get('/mobile-debug', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  
  console.log('🔍 모바일 디버그 요청:', {
    userAgent,
    isMobile,
    clientIP,
    headers: req.headers
  });
  
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server: {
      port: PORT,
      host: HOST,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform
    },
    client: {
      userAgent,
      isMobile,
      clientIP,
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer,
      connection: req.headers.connection,
      acceptLanguage: req.headers['accept-language']
    },
    network: {}
  };
  
  // 네트워크 인터페이스 정보 추가
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((network) => {
      if (network.family === 'IPv4' && !network.internal) {
        debugInfo.network[interfaceName] = network.address;
      }
    });
  });
  
  res.json(debugInfo);
});

// Git 커밋 정보 가져오기 엔드포인트
app.get('/git-info', (req, res) => {
  exec('git log -1 --format="%H|%ad|%s" --date=local', (error, stdout) => {
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

    try {
      await fs.access(localPath);
      const csvData = await fs.readFile(localPath, 'utf-8');
      console.log('✅ 로컬 CSV 파일 로드 성공');

      // 로컬 파일을 Firebase에 동기화
      console.log('🔄 로컬 CSV를 Firebase에 동기화 중...');
      await uploadCsvToFirebase(csvData);

      res.type('text/plain').send(csvData);
    } catch {
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
  const githubEvent = req.headers['x-github-event'];
  const userAgent = req.headers['user-agent'];

  console.log('🔄 Deploy 요청 받음');
  console.log('🔄 토큰:', bodyToken);
  console.log('🔄 GitHub Event:', githubEvent);
  console.log('🔄 User Agent:', userAgent);

  // GitHub webhook인지 확인 (User-Agent에 GitHub-Hookshot이 포함됨)
  const isGitHubWebhook = userAgent && userAgent.includes('GitHub-Hookshot');
  
  if (isGitHubWebhook) {
    console.log('🐙 GitHub webhook 감지됨');
    if (githubEvent === 'push') {
      console.log('📤 Push 이벤트, 자동 배포 시작...');
      
      res.status(200).send('✅ GitHub webhook received, deploying...');
      
      // 배포 실행
      const deployCommand = `cd ${gitRepoPath} && git fetch origin && git reset --hard origin/main && pm2 restart all`;
      
      exec(deployCommand, (err, stdout, stderr) => {
        if (err) {
          console.error('❌ Webhook 배포 실패:', err);
          console.error('❌ stderr:', stderr);
        } else {
          console.log('✅ Webhook 배포 완료:\n', stdout);
          if (stderr) {
            console.log('⚠️ stderr:', stderr);
          }
        }
      });
      return;
    } else {
      console.log('ℹ️ GitHub webhook이지만 push 이벤트가 아님');
      return res.status(200).send('Webhook received, but not a push event');
    }
  }

  // 일반 배포 요청 (토큰 필요)
  if (bodyToken !== secret) {
    console.error('❌ 잘못된 토큰:', bodyToken);
    return res.status(403).send('Invalid deploy token');
  }

  console.log('✅ 토큰 검증 완료, 배포 시작...');

  // 응답을 먼저 보내고 배포 실행 (타임아웃 방지)
  res.status(200).send('✅ Deploy started...');

  // 배포 명령어 실행 (충돌 해결 포함)
  const deployCommand = `cd ${gitRepoPath} && echo "Current directory: $(pwd)" && git fetch origin && git reset --hard origin/main && echo "Git update completed" && pm2 restart all`;
  
  exec(deployCommand, (err, stdout, stderr) => {
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

// GitHub Webhook 엔드포인트 (토큰 없이도 작동)
app.post('/webhook/github', (req, res) => {
  const gitRepoPath = '/home/ubuntu/joinkfacrawler';
  
  console.log('🐙 GitHub webhook 받음');
  console.log('📦 이벤트:', req.headers['x-github-event']);
  
  // push 이벤트만 처리
  if (req.headers['x-github-event'] === 'push') {
    console.log('📤 Push 이벤트 감지, 자동 배포 시작...');
    
    res.status(200).send('Webhook received, deploying...');
    
    // 배포 실행
    const deployCommand = `cd ${gitRepoPath} && git fetch origin && git reset --hard origin/main && pm2 restart all`;
    
    exec(deployCommand, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Webhook 배포 실패:', err);
        console.error('❌ stderr:', stderr);
      } else {
        console.log('✅ Webhook 배포 완료:\n', stdout);
        if (stderr) {
          console.log('⚠️ stderr:', stderr);
        }
      }
    });
  } else {
    res.status(200).send('Webhook received, but not a push event');
  }
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
        await fs.writeFile(filePath, content, 'utf-8');
        console.log('✅ 로컬 백업 파일도 저장 완료');
      } catch (localError) {
        console.warn('⚠️ 로컬 백업 저장 실패:', localError.message);
      }

      res.status(200).send('CSV file saved successfully to Firebase.');
    } else {
      // Firebase 저장 실패시 로컬에만 저장
      console.log('⚠️ Firebase 저장 실패, 로컬에만 저장');
      const filePath = path.join(__dirname, 'leagues.csv');
      await fs.writeFile(filePath, content, 'utf-8');
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

// 큐 시스템 전역 변수
const crawlQueue = [];
const uploadQueue = [];
let isCrawling = false;
let isUploading = false;

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

// 웹소켓 연결 처리 (모듈화된 핸들러 사용)
io.on('connection', handleWebSocketConnection);

// WebSocket 연결 시 로그 히스토리는 handleWebSocketConnection에서 처리됨

// WebSocket functionality is handled in routes/websocket.js



// WebSocket 이벤트 핸들러들은 routes/websocket.js에서 처리됨

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
  // emitQueueStatus(); // 웹소켓에서 처리

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

    // 업로드 성공 시 캐시 무효화
    if (code === 0) {
      console.log('🧹 업로드 완료로 인한 캐시 무효화');
      firebaseService.invalidateCache();
      io.emit('log', '🧹 캐시가 무효화되었습니다. 새로운 데이터로 업데이트됩니다.\n');
    }

    const processInfo = runningProcesses.get(processId);
    finalizeProcess(processId, 'uploading', processInfo.options);
  });
}

// 업로드 이벤트 핸들러는 routes/websocket.js에서 처리됨

// 프로세스 중단 이벤트 핸들러는 routes/websocket.js에서 처리됨

// disconnect 이벤트 핸들러는 routes/websocket.js에서 처리됨

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
    // maybeStartNextUpload(); // 웹소켓에서 처리
  }
  if (type === 'uploading') {
    isUploading = false;
  }

  io.emit('process-ended', { processId, type, options });
  // emitQueueStatus(); // 웹소켓에서 처리

  // 크롤링이 끝났고 대기열에 다음 크롤링이 있으면 실행
  // if (!isCrawling && crawlQueue.length > 0) {
  //   const next = crawlQueue.shift();
  //   launchCrawler(next.options, next.socket); // 웹소켓에서 처리
  // }
  // 업로드도 동일하게 처리 (업로드 종료 후 다른 업로드가 남아있으면)
  if (!isUploading && uploadQueue.length > 0) {
    const next = uploadQueue.shift();
    launchUploader(next.options, next.socket);
  }
}
;

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

// 서버 초기화 함수
async function initializeServer() {
  console.log('🚀 서버 초기화 중...');

  // 프로세스 핸들러 설정
  setupProcessHandlers();
  console.log('✅ 프로세스 핸들러 설정 완료');

  // Keep-Alive 시작 (프로덕션 환경에서만)
  if (process.env.NODE_ENV === 'production') {
    console.log('🏓 Keep-Alive 시스템 시작 (Render 자동 종료 방지)');
    keepAlive();
  }

  // 서버 시작 시 더 안정적인 방식 사용
  const startServer = () => {
    const server_instance = server.listen(PORT, HOST, () => {
      const address = server_instance.address();
      console.log(`✅ Server is running on http://${HOST}:${PORT}`);
      console.log('🔥 Firebase 연동 준비 완료! (사용자 요청 시에만 동작)');
      console.log('📱 모바일 최적화 미들웨어 활성화됨');
      
      // 서버 설정 정보 출력
      console.log('🌐 서버 접속 정보:');
      console.log(`   - 로컬: http://localhost:${PORT}`);
      console.log(`   - 네트워크: http://${HOST}:${PORT}`);
      console.log(`   - 실제 주소: ${address.address}:${address.port}`);
      console.log(`   - 도메인: http://ssurpass.com${PORT !== 80 ? ':' + PORT : ''}`);
      console.log(`   - HTTPS 도메인: https://ssurpass.com`);
      
      // 네트워크 인터페이스 정보 출력
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      console.log('📡 사용 가능한 네트워크 주소:');
      
      Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((network) => {
          if (network.family === 'IPv4' && !network.internal) {
            console.log(`   - ${interfaceName}: http://${network.address}:${PORT}`);
          }
        });
      });
      
      // 모바일 접속 테스트 URL 안내
      console.log('📱 모바일 테스트 URL:');
      console.log(`   - Health Check: http://ssurpass.com/health`);
      console.log(`   - Mobile Debug: http://ssurpass.com/mobile-debug`);
      console.log(`   - Dashboard: http://ssurpass.com/dashboard`);
      
      // 자동 스케줄러 시작
      try {
        matchScheduler.start();
        console.log('⚡ 자동 경기 업데이트 스케줄러 시작됨');
      } catch (error) {
        console.error('❌ 스케줄러 시작 실패:', error);
      }
      
      if (process.env.NODE_ENV === 'production') {
        console.log('🛡️ 서버 자동 종료 방지 시스템이 활성화되었습니다!');
      }
      
      // 초기 서버 상태 로그
      console.log('🚀 서버 초기화 완료 - 모바일 접속 대기 중...');
    });

    server_instance.on('error', (err) => {
      console.error('❌ 서버 시작 실패:', err);
      if (err.code === 'EADDRINUSE') {
        if (PORT === 80) {
          console.log(`포트 80이 사용 중입니다. 포트 ${FALLBACK_PORT}으로 재시도합니다...`);
          server.listen(FALLBACK_PORT, HOST, () => {
            console.log(`✅ Server is running on http://${HOST}:${FALLBACK_PORT} (fallback port)`);
            console.log('📱 모바일 최적화 미들웨어 활성화됨');
            console.log(`🌐 접속 주소: http://ssurpass.com:${FALLBACK_PORT}`);
          });
        } else {
          console.log(`포트 ${PORT}가 이미 사용 중입니다. 5초 후 재시도합니다...`);
          setTimeout(startServer, 5000);
        }
      } else if (err.code === 'EACCES') {
        if (PORT === 80) {
          console.log(`포트 80에 접근 권한이 없습니다. 포트 ${FALLBACK_PORT}으로 재시도합니다...`);
          server.listen(FALLBACK_PORT, HOST, () => {
            console.log(`✅ Server is running on http://${HOST}:${FALLBACK_PORT} (fallback port)`);
            console.log('📱 모바일 최적화 미들웨어 활성화됨');
            console.log(`🌐 접속 주소: http://ssurpass.com:${FALLBACK_PORT}`);
          });
        } else {
          console.log(`포트 ${PORT}에 접근 권한이 없습니다.`);
          process.exit(1);
        }
      } else {
        console.log('예기치 못한 오류가 발생했습니다:', err.message);
        process.exit(1);
      }
    });

    return server_instance;
  };

  startServer();
}




// Firebase API 엔드포인트들
// 지역 목록 조회 (최적화됨 - 캐싱 적용)
app.get('/api/regions', async (req, res) => {
  try {
    const regions = await firebaseService.getRegions();
    res.json(regions);
  } catch (error) {
    console.error('❌ 지역 목록 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 지역의 리그 목록 조회 (최적화됨 - 인덱스 활용 + 캐싱)
app.get('/api/leagues/:region', async (req, res) => {
  try {
    const { region } = req.params;
    const leagues = await firebaseService.getLeaguesByRegion(region);
    res.json(leagues);
  } catch (error) {
    console.error(`❌ ${region} 리그 목록 조회 실패:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 모든 리그 순위표 조회 (최적화됨 - 완료된 경기만 조회 + 캐싱)
app.get('/api/standings', async (req, res) => {
  try {
    const allStandings = await firebaseService.getAllStandings();
    res.json(allStandings);
  } catch (error) {
    console.error('❌ 전체 순위표 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 리그 순위표 조회 (최적화됨 - 인덱스 활용 + 캐싱)
app.get('/api/standings/:region/:league', async (req, res) => {
  try {
    const { region, league } = req.params;
    const standings = await firebaseService.getStandings(region, league);

    res.json({
      region,
      league,
      standings
    });
  } catch (error) {
    console.error(`❌ ${region}-${league} 순위표 조회 실패:`, error);
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
      const formattedTime = formatTimeKorean(rawTime);

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
// 뉴스피드 데이터 조회 (최적화됨 - 날짜 범위 쿼리 + 캐싱)
app.get('/api/newsfeed', async (req, res) => {
  try {
    const newsfeed = await firebaseService.getNewsfeed();
    res.json(newsfeed);
  } catch (error) {
    console.error('❌ 뉴스피드 조회 실패:', error);
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
        const formattedTime = formatTimeKorean(rawTime);

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


// 서버 초기화 실행
initializeServer();

app.post('/api/matches/bulk-delete', async (req, res) => {
  /*
    Request body 예시 {
      leagueTitle: 'K3리그',        // 선택 (정확히 일치)
      matchStatus: '예정',          // 선택 ('예정' | '완료')
      startDate: '2025-07-01',      // 선택 (YYYY-MM-DD)
      endDate:   '2025-07-31'       // 선택 (YYYY-MM-DD)
    }
  */
  try {
    const { leagueTitle, matchStatus, startDate, endDate, matchIdx, leagueTag, year } = req.body || {};
    let query = db.collection('matches');
    if (leagueTitle) query = query.where('leagueTitle', '==', leagueTitle);
    if (matchStatus) query = query.where('matchStatus', '==', matchStatus);
    if (matchIdx) query = query.where('matchIdx', '==', matchIdx);
    if (leagueTag) query = query.where('leagueTag', '==', leagueTag);
    if (year) query = query.where('year', '==', year);

    // ① Firestore에서 1차 필터링
    const snapshot = await query.get();
    let docs = snapshot.docs;

    // ② 날짜 범위 필터링 (메모리 내)
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end   = endDate   ? new Date(endDate)   : null;
      docs = docs.filter(doc => {
        const data = doc.data();
        const dateStr = data.MATCH_DATE || data.MATCH_CHECK_TIME2 || data.matchDate || data.date || data.DATE;
        if (!dateStr) return false;
        const d = parseFlexibleDate(dateStr);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    if (docs.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: '조건에 해당하는 문서가 없습니다.' });
    }

    // ③ 배치 삭제 (500개 제한)
    const batchSize = 500;
    let deletedCount = 0;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedCount += Math.min(batchSize, docs.length - i);
    }

    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('🔥 일괄 삭제 실패:', error);
    res.status(500).json({ error: error.message });
  }});
