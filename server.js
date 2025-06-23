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
    if (typeof content !== 'string') {
      return res.status(400).send('Invalid content.');
    }
    fs.writeFileSync(path.join(__dirname, 'leagues.csv'), content, 'utf-8');
    res.status(200).send('CSV file saved successfully.');
  } catch (error) {
    console.error('Error saving leagues.csv:', error);
    res.status(500).send('Error saving leagues.csv');
  }
});

// 클라이언트로부터의 연결 처리
io.on('connection', (socket) => {
  console.log('✅ A user connected');

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
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`🌍 Web server running at http://localhost:${PORT}`);
}); 