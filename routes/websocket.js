// routes/websocket.js - 웹소켓 관련 로직 모듈화

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// 전역 큐 및 상태 플래그
const crawlQueue = [];
const uploadQueue = [];
let isCrawling = false;
let isUploading = false;

// Firebase 의존성
let downloadCsvFromFirebase, uploadCsvToFirebase, syncCsvWithFirebase, firebaseService;

// 의존성 주입
function initializeWebSocketRoutes(firebaseUploader, fbService) {
  downloadCsvFromFirebase = firebaseUploader.downloadCsvFromFirebase;
  uploadCsvToFirebase = firebaseUploader.uploadCsvToFirebase;
  syncCsvWithFirebase = firebaseUploader.syncCsvWithFirebase;
  firebaseService = fbService;
}

// 웹소켓 연결 핸들러
function handleWebSocketConnection(socket) {
  console.log('🔗 클라이언트가 연결되었습니다:', socket.id);

  // 크롤링 요청 처리
  socket.on('start-crawl', async (options) => {
    console.log('🚀 크롤링 요청 받음:', socket.id, options);
    console.log('현재 크롤링 상태:', { isCrawling, queueLength: crawlQueue.length });
    
    if (isCrawling) {
      socket.emit('log', '⚠️ 이미 크롤링이 진행 중입니다. 잠시 후 다시 시도해주세요.\\n');
      return;
    }
    
    crawlQueue.push({ socket, options });
    
    if (crawlQueue.length === 1) {
      await processCrawlQueue();
    }
  });
  
  // 크롤링 상태 강제 리셋 (디버깅용)
  socket.on('reset-crawl-status', () => {
    console.log('🔧 크롤링 상태 강제 리셋 요청');
    isCrawling = false;
    socket.emit('log', '🔧 크롤링 상태가 리셋되었습니다.\\n');
  });

  // 업로드 요청 처리
  socket.on('start-upload', async (options) => {
    console.log('📤 업로드 요청 받음:', socket.id, options);
    
    if (isUploading) {
      socket.emit('log', '⚠️ 이미 업로드가 진행 중입니다. 잠시 후 다시 시도해주세요.\\n');
      return;
    }
    
    uploadQueue.push({ socket, options });
    
    if (uploadQueue.length === 1) {
      await processUploadQueue();
    }
  });

  // 캐시 무효화 요청
  socket.on('invalidate-cache', () => {
    console.log('🧹 캐시 무효화 요청 받음:', socket.id);
    firebaseService.invalidateCache();
    socket.emit('log', '✅ 캐시가 무효화되었습니다.\\n');
  });

  // 연결 해제 처리
  socket.on('disconnect', () => {
    console.log('🔌 클라이언트 연결 해제:', socket.id);
    
    // 큐에서 해당 소켓 제거
    const crawlIndex = crawlQueue.findIndex(item => item.socket.id === socket.id);
    if (crawlIndex > -1) {
      crawlQueue.splice(crawlIndex, 1);
    }
    
    const uploadIndex = uploadQueue.findIndex(item => item.socket.id === socket.id);
    if (uploadIndex > -1) {
      uploadQueue.splice(uploadIndex, 1);
    }
  });
}

// 크롤링 큐 처리
async function processCrawlQueue() {
  while (crawlQueue.length > 0) {
    const { socket, options } = crawlQueue.shift();
    
    if (!socket.connected) {
      console.log('⚠️ 소켓이 연결되지 않음, 크롤링 건너뜀');
      continue;
    }
    
    isCrawling = true;

    socket.emit('log', `🚀 크롤링을 시작합니다... (옵션: ${JSON.stringify(options)})\\n`);

    try {
      // Firebase → 로컬 CSV 동기화
      socket.emit('log', `🔄 Firebase에서 최신 리그 데이터를 가져오는 중...\\n`);
      const firebaseContent = await downloadCsvFromFirebase();
      if (firebaseContent !== null) {
        await fs.writeFile(path.join(__dirname, '..', 'leagues.csv'), firebaseContent, 'utf-8');
        socket.emit('log', `✅ 최신 리그 데이터로 업데이트 완료\\n`);
      } else {
        socket.emit('log', `⚠️ Firebase에서 데이터를 가져올 수 없어 로컬 파일을 사용합니다\\n`);
      }
    } catch (err) {
      console.error('CSV 동기화 실패:', err);
      socket.emit('log', `⚠️ CSV 동기화 실패, 로컬 파일을 사용합니다: ${err.message}\\n`);
    }

    // meat.js 실행
    const crawlProcess = spawn('node', ['meat.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, CRAWL_OPTIONS: JSON.stringify(options) }
    });

    crawlProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[CRAWL STDOUT]', output);
      socket.emit('log', output);
    });

    crawlProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error('[CRAWL STDERR]', output);
      socket.emit('log', `❌ ${output}`);
    });

    crawlProcess.on('close', (code) => {
      console.log(`크롤링 프로세스 종료, 코드: ${code}`);
      
      if (code === 0) {
        socket.emit('log', '\\n✅ 크롤링이 성공적으로 완료되었습니다!\\n');
        socket.emit('crawl-complete', { success: true, message: '크롤링 완료', options });
        
        // 크롤링 완료 시간 업데이트 이벤트 발송
        socket.emit('crawl-timestamp-update', {
          options,
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('log', `\\n❌ 크롤링이 실패했습니다 (종료 코드: ${code})\\n`);
        socket.emit('crawl-complete', { success: false, message: `크롤링 실패 (코드: ${code})` });
      }
      
      isCrawling = false;
      
      // 다음 크롤링 처리
      if (crawlQueue.length > 0) {
        setImmediate(() => processCrawlQueue());
      }
    });

    crawlProcess.on('error', (error) => {
      console.error('크롤링 프로세스 에러:', error);
      socket.emit('log', `❌ 크롤링 프로세스 에러: ${error.message}\\n`);
      socket.emit('crawl-complete', { success: false, message: error.message });
      isCrawling = false;
      
      // 에러 발생 시에도 다음 크롤링 처리
      if (crawlQueue.length > 0) {
        setImmediate(() => processCrawlQueue());
      }
    });

    // 이 크롤링이 완료될 때까지 기다림
    await new Promise((resolve) => {
      crawlProcess.on('close', resolve);
      crawlProcess.on('error', resolve);
    });
  }
}

// 업로드 큐 처리
async function processUploadQueue() {
  while (uploadQueue.length > 0) {
    const { socket, options } = uploadQueue.shift();
    
    if (!socket.connected) {
      console.log('⚠️ 소켓이 연결되지 않음, 업로드 건너뜀');
      continue;
    }
    
    isUploading = true;

    socket.emit('log', `📤 Firebase 업로드를 시작합니다... (옵션: ${JSON.stringify(options)})\\n`);

    try {
      await syncCsvWithFirebase();
      
      // 업로드 프로세스 실행 - firebase_uploader.js를 직접 실행
      const args = ['firebase_uploader.js'];
      
      // 옵션이 있으면 명령줄 인자로 추가
      if (options) {
        if (options.year) args.push(`--year=${options.year}`);
        if (options.month) args.push(`--month=${options.month}`);
        if (options.league) args.push(`--league=${options.league}`);
        if (options.region) args.push(`--region=${options.region}`);
        if (options.matchIdx) args.push(`--matchIdx=${options.matchIdx}`);
      }
      
      const uploadProcess = spawn('node', args, {
        cwd: path.join(__dirname, '..')
      });

      uploadProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[UPLOAD STDOUT]', output);
        socket.emit('log', output);
      });

      uploadProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[UPLOAD STDERR]', output);
        socket.emit('log', `❌ ${output}`);
      });

      await new Promise((resolve) => {
        uploadProcess.on('close', (code) => {
          console.log(`업로드 프로세스 종료, 코드: ${code}`);
          
          if (code === 0) {
            socket.emit('log', '\\n✅ 업로드가 성공적으로 완료되었습니다!\\n');
            socket.emit('upload-complete', { success: true, message: '업로드 완료' });
            
            // 업로드 완료 후 캐시 무효화
            firebaseService.invalidateCache();
            socket.emit('log', '🧹 캐시 무효화 완료\\n');
          } else {
            socket.emit('log', `\\n❌ 업로드가 실패했습니다 (종료 코드: ${code})\\n`);
            socket.emit('upload-complete', { success: false, message: `업로드 실패 (코드: ${code})` });
          }
          
          isUploading = false;
          resolve();
        });

        uploadProcess.on('error', (error) => {
          console.error('업로드 프로세스 에러:', error);
          socket.emit('upload-log', `❌ 업로드 프로세스 에러: ${error.message}\\n`);
          socket.emit('upload-complete', { success: false, message: error.message });
          isUploading = false;
          resolve();
        });
      });

    } catch (error) {
      console.error('업로드 중 오류:', error);
      socket.emit('upload-log', `❌ 업로드 중 오류: ${error.message}\\n`);
      socket.emit('upload-complete', { success: false, message: error.message });
      isUploading = false;
    }
  }
}

module.exports = {
  handleWebSocketConnection,
  initializeWebSocketRoutes,
  getCrawlStatus: () => ({ isCrawling, isUploading, crawlQueueSize: crawlQueue.length, uploadQueueSize: uploadQueue.length })
};