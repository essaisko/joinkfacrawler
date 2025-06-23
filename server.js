const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

// CSV 파일 내용을 클라이언트로 전송
app.get('/leagues-csv', (req, res) => {
  try {
    const csvData = fs.readFileSync(path.join(__dirname, 'leagues.csv'), 'utf-8');
    res.type('text/plain').send(csvData);
  } catch (error) {
    console.error('Error reading leagues.csv:', error);
    res.status(500).send('Error reading leagues.csv');
  }
});

// 클라이언트로부터 받은 내용으로 CSV 파일 저장
app.post('/leagues-csv', (req, res) => {
  try {
    const { content } = req.body;
    console.log('📝 CSV 저장 요청 받음, 내용 길이:', content ? content.length : 'undefined');
    
    if (typeof content !== 'string') {
      console.error('❌ Invalid content type:', typeof content);
      return res.status(400).send('Invalid content.');
    }
    
    const filePath = path.join(__dirname, 'leagues.csv');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ CSV 파일 저장 완료:', filePath);
    
    // 저장 후 파일 내용 확인
    const savedContent = fs.readFileSync(filePath, 'utf-8');
    console.log('📄 저장된 파일 내용 확인 (첫 100자):', savedContent.substring(0, 100));
    
    res.status(200).send('CSV file saved successfully.');
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
            runningProcesses.delete(processId);
          } catch (error) {
            console.error(`❌ 프로세스 정리 실패: ${error.message}`);
          }
        }
      });
      socket.runningProcesses.clear();
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌍 Web server running at http://localhost:${PORT}`);
}); 