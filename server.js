const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { uploadCsvToFirebase, downloadCsvFromFirebase, syncCsvWithFirebase } = require('./firebase_uploader');

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

app.get('/crawler-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'crawler-dashboard.html'));
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

// 클라이언트로부터의 연결 처리
io.on('connection', (socket) => {
  console.log('✅ A user connected');
  
  // 클라이언트별 프로세스 추적
  socket.runningProcesses = new Set();

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
      socket.emit('log', logMessage);
    });

    crawler.stderr.on('data', (data) => {
      const logMessage = `❌ ERROR: ${data.toString()}`;
      console.error(logMessage);
      socket.emit('log', logMessage);
    });

    crawler.on('close', (code) => {
      const logMessage = `🏁 크롤링 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(logMessage);
      socket.emit('log', logMessage);
      
      // 프로세스 추적에서 제거
      runningProcesses.delete(processId);
      socket.runningProcesses.delete(processId);
      socket.emit('process-ended', { processId, type: 'crawling' });
    });
  });

  // 'start-crawling-version' 이벤트를 받으면 선택된 버전의 크롤러 실행
  socket.on('start-crawling-version', (options) => {
    const selectedVersion = options.version || 'meat.js';
    console.log(`🚀 Crawling process started with version: ${selectedVersion}`, options);
    socket.emit('log', `🚀 ${selectedVersion} 크롤링을 시작합니다...\n`);
    socket.emit('log', `📋 필터 옵션: ${JSON.stringify({
      year: options.year || '전체',
      month: options.month || '전체', 
      league: options.league || '전체'
    })}\n`);
    
    // 옵션을 인자로 넘겨주기 위해 배열 생성
    const args = [selectedVersion];
    if (options.year) args.push(`--year=${options.year}`);
    if (options.month) args.push(`--month=${options.month}`);
    if (options.league) args.push(`--league=${options.league}`);

    const crawler = spawn('node', args);
    const processId = `crawling-version-${Date.now()}`;
    
    // 프로세스 추적에 추가
    runningProcesses.set(processId, { 
      process: crawler, 
      type: 'crawling-version', 
      version: selectedVersion,
      socket: socket.id 
    });
    socket.runningProcesses.add(processId);
    
    // 클라이언트에 프로세스 ID 전송
    socket.emit('process-started', { processId, type: 'crawling-version', version: selectedVersion });

    crawler.stdout.on('data', (data) => {
      const logMessage = data.toString();
      console.log(logMessage);
      socket.emit('log', logMessage);
    });

    crawler.stderr.on('data', (data) => {
      const logMessage = `❌ ERROR: ${data.toString()}`;
      console.error(logMessage);
      socket.emit('log', logMessage);
    });

    crawler.on('close', (code) => {
      const logMessage = `🏁 ${selectedVersion} 크롤링 프로세스가 종료되었습니다 (Code: ${code}).\n`;
      console.log(logMessage);
      socket.emit('log', logMessage);
      
      // 성공 여부에 따른 메시지
      if (code === 0) {
        socket.emit('log', `✅ 크롤링이 성공적으로 완료되었습니다! 🎉\n`);
        socket.emit('log', `📁 결과 파일을 results/ 폴더에서 확인하세요.\n`);
      } else {
        socket.emit('log', `⚠️ 크롤링이 종료되었습니다. 에러 코드: ${code}\n`);
      }
      
      // 프로세스 추적에서 제거
      runningProcesses.delete(processId);
      socket.runningProcesses.delete(processId);
      socket.emit('process-ended', { processId, type: 'crawling-version', version: selectedVersion });
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
      socket.emit('log', logMessage);
    });

    uploader.stderr.on('data', (data) => {
      const logMessage = `❌ ERROR: ${data.toString()}`;
      console.error(logMessage);
      socket.emit('log', logMessage);
    });

    uploader.on('close', (code) => {
      const logMessage = `🏁 업로드 프로세스가 종료되었습니다 (Code: ${code}).`;
      console.log(logMessage);
      socket.emit('log', logMessage);
      
      // 프로세스 추적에서 제거
      runningProcesses.delete(processId);
      socket.runningProcesses.delete(processId);
      socket.emit('process-ended', { processId, type: 'uploading' });
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

// 서버 시작시 로컬 CSV를 Firebase에 동기화
async function initializeServer() {
  console.log('🚀 서버 초기화 중...');
  
  try {
    // 로컬 CSV 파일이 있으면 Firebase에 동기화
    const localCsvPath = path.join(__dirname, 'leagues.csv');
    if (fs.existsSync(localCsvPath)) {
      console.log('🔄 서버 시작시 로컬 CSV를 Firebase에 동기화...');
      await syncCsvWithFirebase();
    }
  } catch (error) {
    console.warn('⚠️ 서버 초기화 중 CSV 동기화 실패:', error.message);
  }
  
  server.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log('🔥 Firebase CSV 연동이 활성화되었습니다!');
  });
}

// 서버 초기화 실행
initializeServer(); 