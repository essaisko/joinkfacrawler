// error-handler.js - 에러 핸들링 유틸리티

/**
 * 표준화된 에러 응답 생성
 * @param {Error} error - 에러 객체
 * @param {string} context - 에러 발생 컨텍스트
 * @returns {Object} - 표준화된 에러 응답
 */
function createErrorResponse(error, context = 'Unknown') {
  const timestamp = new Date().toISOString();
  const errorId = `${context}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.error(`❌ [${errorId}] ${context} 에러:`, error);
  
  return {
    success: false,
    error: {
      id: errorId,
      message: error.message || 'Unknown error occurred',
      context,
      timestamp,
      type: error.constructor.name
    }
  };
}

/**
 * 비동기 함수를 위한 에러 핸들링 래퍼
 * @param {Function} fn - 비동기 함수
 * @param {string} context - 에러 컨텍스트
 * @returns {Function} - 래핑된 함수
 */
function asyncErrorHandler(fn, context) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      const errorResponse = createErrorResponse(error, context);
      res.status(500).json(errorResponse);
    }
  };
}

/**
 * Express 라우터용 에러 핸들링 미들웨어
 * @param {Error} err - 에러 객체
 * @param {Object} req - Express request
 * @param {Object} res - Express response  
 * @param {Function} next - Express next function
 */
function expressErrorHandler(err, req, res, next) {
  const context = `${req.method} ${req.path}`;
  const errorResponse = createErrorResponse(err, context);
  
  // 에러 상태 코드 결정
  let statusCode = 500;
  if (err.name === 'ValidationError') statusCode = 400;
  if (err.name === 'UnauthorizedError') statusCode = 401;
  if (err.name === 'NotFoundError') statusCode = 404;
  
  res.status(statusCode).json(errorResponse);
}

/**
 * 프로세스 종료 시 정리 작업을 위한 핸들러
 */
function setupProcessHandlers() {
  // Graceful shutdown 핸들러
  const gracefulShutdown = (signal) => {
    console.log(`\\n📡 ${signal} 신호를 받았습니다. 서버를 안전하게 종료합니다...`);
    
    // 진행 중인 프로세스들 정리
    // (이 부분은 각 모듈에서 구현)
    
    setTimeout(() => {
      console.log('⚡ 강제 종료합니다.');
      process.exit(1);
    }, 10000);
  };
  
  // 신호 핸들러 등록
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // 처리되지 않은 예외 핸들러
  process.on('uncaughtException', (error) => {
    console.error('💥 처리되지 않은 예외:', error);
    console.error('스택 트레이스:', error.stack);
    
    // 로그 저장 후 종료
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // 처리되지 않은 Promise rejection 핸들러
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 처리되지 않은 Promise rejection:', reason);
    console.error('Promise:', promise);
    
    // 로그 저장 후 종료
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}

/**
 * Firebase 관련 에러 처리
 * @param {Error} error - Firebase 에러
 * @returns {Object} - 표준화된 에러 응답
 */
function handleFirebaseError(error) {
  let message = error.message;
  let statusCode = 500;
  
  // Firebase 특정 에러 코드 처리
  if (error.code) {
    switch (error.code) {
      case 'permission-denied':
        message = 'Firebase 권한이 거부되었습니다.';
        statusCode = 403;
        break;
      case 'not-found':
        message = '요청한 리소스를 찾을 수 없습니다.';
        statusCode = 404;
        break;
      case 'already-exists':
        message = '이미 존재하는 리소스입니다.';
        statusCode = 409;
        break;
      case 'resource-exhausted':
        message = 'Firebase 리소스 한도를 초과했습니다.';
        statusCode = 429;
        break;
      case 'invalid-argument':
        message = '잘못된 인수가 제공되었습니다.';
        statusCode = 400;
        break;
      default:
        message = `Firebase 오류: ${error.message}`;
    }
  }
  
  return {
    success: false,
    error: {
      message,
      code: error.code,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * 웹소켓 에러 핸들링
 * @param {Object} socket - Socket.IO 소켓
 * @param {Error} error - 에러 객체
 * @param {string} context - 에러 컨텍스트
 */
function handleSocketError(socket, error, context) {
  const errorResponse = createErrorResponse(error, context);
  
  // 클라이언트에게 에러 전송
  socket.emit('error', errorResponse);
  
  // 연결이 심각하게 손상된 경우 연결 해제
  if (error.name === 'FatalError') {
    socket.disconnect(true);
  }
}

module.exports = {
  createErrorResponse,
  asyncErrorHandler,
  expressErrorHandler,
  setupProcessHandlers,
  handleFirebaseError,
  handleSocketError
};