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

const PORT = process.env.PORT || 3000;




// JSON 요청 본문을 파싱하기 위한 미들웨어
app.use(express.json());
// 정적 파일(index.html) 제공
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Health check 엔드포인트 (서버 활성 상태 유지용)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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

  // 'start-crawling' 이벤트를 받으면 meat.js 실행
  socket.on('start-crawling', (options) => {
    console.log('🚀 Crawling process started with options:', options);
    socket.emit('log', `🚀 크롤링을 시작합니다... (옵션: ${JSON.stringify(options)})\n`);
    
    // 옵션을 인자로 넘겨주기 위해 배열 생성
    const args = ['meat.js'];
    if (options.year) args.push(`--year=${options.year}`);
    if (options.month) args.push(`--month=${options.month}`);
    if (options.league) args.push(`--league=${options.league}`);

    const crawler = spawn('node', args);
    const processId = `crawling-${Date.now()}`;
    
    // 프로세스 추적에 추가
    runningProcesses.set(processId, { process: crawler, type: 'crawling', socket: socket.id });
    socket.runningProcesses.add(processId);
    
    // 클라이언트에 프로세스 ID 전송
    socket.emit('process-started', { processId, type: 'crawling' });

    crawler.stdout.on('data', (data) => {
      const logMessage = data.toString();
      console.log(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
    });

    crawler.stderr.on('data', (data) => {
      const logMessage = `❌ ERROR: ${data.toString()}`;
      console.error(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
    });

    crawler.on('close', (code) => {
      const logMessage = `🏁 크롤링 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
      
      // 프로세스 추적에서 제거
      runningProcesses.delete(processId);
      socket.runningProcesses.delete(processId);
      io.emit('process-ended', { processId, type: 'crawling' });
    });
  });



  // 'start-uploading' 이벤트를 받으면 firebase_uploader.js 실행
  socket.on('start-uploading', (options) => {
    console.log('🚀 Uploading process started with options:', options);
    socket.emit('log', `🚀 Firestore 업로드를 시작합니다... (옵션: ${JSON.stringify(options)})\n`);
    
    // 옵션을 인자로 넘겨주기 위해 배열 생성
    const args = ['firebase_uploader.js'];
    if (options.year) args.push(`--year=${options.year}`);
    if (options.month) args.push(`--month=${options.month}`);
    if (options.league) args.push(`--league=${options.league}`);

    const uploader = spawn('node', args);
    const processId = `uploading-${Date.now()}`;
    
    // 프로세스 추적에 추가
    runningProcesses.set(processId, { process: uploader, type: 'uploading', socket: socket.id });
    socket.runningProcesses.add(processId);
    
    // 클라이언트에 프로세스 ID 전송
    socket.emit('process-started', { processId, type: 'uploading' });

    uploader.stdout.on('data', (data) => {
      const logMessage = data.toString();
      console.log(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
    });

    uploader.stderr.on('data', (data) => {
      const logMessage = `❌ ERROR: ${data.toString()}`;
      console.error(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
    });

    uploader.on('close', (code) => {
      const logMessage = `🏁 업로드 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(logMessage);
      addToLogHistory(logMessage);
      io.emit('log', logMessage); // 모든 클라이언트에게 브로드캐스트
      
      // 프로세스 추적에서 제거
      runningProcesses.delete(processId);
      socket.runningProcesses.delete(processId);
      io.emit('process-ended', { processId, type: 'uploading' });
    });
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
        
        // 3초 후에도 프로세스가 살아있으면 강제 종료
        setTimeout(() => {
          if (runningProcesses.has(processId)) {
            processInfo.process.kill('SIGKILL');
            console.log(`💀 프로세스 ${processId} 강제 종료`);
            socket.emit('log', `💀 프로세스가 강제 종료되었습니다.\n`);
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
  if (!fullTeamName) return { majorRegion: '', minorRegion: '', teamName: fullTeamName || '', fullRegion: '' };
  
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
  
  // 대분류 지역 찾기
  for (const region of majorRegionPatterns) {
    if (fullTeamName.startsWith(region)) {
      majorRegion = region;
      remainingName = fullTeamName.substring(region.length);
      break;
    }
  }
  
  let minorRegion = '';
  let teamName = remainingName;
  
  // 중분류 지역 찾기
  for (const region of minorRegionPatterns) {
    if (remainingName.startsWith(region)) {
      minorRegion = region;
      teamName = remainingName.substring(region.length).trim();
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
  
  // 다양한 시간 형식 처리
  let hour, minute;
  
  if (timeString.includes(':')) {
    // "10:30" 형식
    [hour, minute] = timeString.split(':');
  } else if (timeString.includes('-')) {
    // "10-30" 형식
    [hour, minute] = timeString.split('-');
  } else {
    // 숫자만 있는 경우 시간으로 처리
    hour = timeString;
    minute = '00';
  }
  
  const hourNum = parseInt(hour);
  const minuteNum = parseInt(minute) || 0;
  
  if (isNaN(hourNum)) return timeString;
  
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
    
    const regions = [...new Set(matches.map(m => m.regionTag))].filter(Boolean).sort();
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
      return a.localeCompare(b);
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
      if (a.region !== b.region) return a.region.localeCompare(b.region);
      
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
      
      // 시간 형식 변환
      const rawTime = data.MATCH_TIME || data.TIME || data.KICK_OFF || '';
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

// 분석 데이터 조회
app.get('/api/analytics', async (req, res) => {
  try {
    const snapshot = await db.collection('matches').get();
    const matches = snapshot.docs.map(doc => doc.data());
    const completedMatches = matches.filter(m => m.matchStatus === '완료' && m.TH_SCORE_FINAL && m.TA_SCORE_FINAL);
    
    let totalGoals = 0;
    let maxScore = 0;
    const leagueActivity = new Map();
    
    completedMatches.forEach(match => {
      const homeScore = parseInt(match.TH_SCORE_FINAL) || 0;
      const awayScore = parseInt(match.TA_SCORE_FINAL) || 0;
      const totalMatchGoals = homeScore + awayScore;
      
      totalGoals += totalMatchGoals;
      maxScore = Math.max(maxScore, Math.max(homeScore, awayScore));
      
      const league = match.leagueTitle;
      leagueActivity.set(league, (leagueActivity.get(league) || 0) + 1);
    });
    
    const avgGoals = completedMatches.length > 0 ? (totalGoals / completedMatches.length).toFixed(1) : 0;
    const mostActiveLeague = leagueActivity.size > 0 ? 
      [...leagueActivity.entries()].sort((a, b) => b[1] - a[1])[0][0] : '-';
    
    const analytics = {
      avgGoals,
      highestScore: maxScore,
      mostActiveLeague,
      recentActivity: new Date().toLocaleDateString()
    };
    
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 초기화 실행
initializeServer(); 