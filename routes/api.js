// routes/api.js - API 라우터 모듈화

const express = require('express');
const router = express.Router();

// Firebase 서비스와 유틸리티 import는 각 라우터에서 처리
let firebaseService, calculateStandings;

// Firebase 서비스 의존성 주입
function initializeApiRoutes(fbService, utils) {
  firebaseService = fbService;
  calculateStandings = utils.calculateStandings;
}

// 지역 목록 조회 (최적화됨 - 캐싱 적용)
router.get('/regions', async (req, res) => {
  try {
    const regions = await firebaseService.getRegions();
    res.json(regions);
  } catch (error) {
    console.error('❌ 지역 목록 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 지역의 리그 목록 조회 (최적화됨 - 인덱스 활용 + 캐싱)
router.get('/regions/:region/leagues', async (req, res) => {
  try {
    const { region } = req.params;
    const leagues = await firebaseService.getLeaguesByRegion(region);
    res.json(leagues);
  } catch (error) {
    console.error('❌ 리그 목록 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 경기 목록 조회 (최적화됨 - 페이지네이션 + 인덱스 활용)
router.get('/matches', async (req, res) => {
  try {
    const { region, league, limit = 100, page = 1 } = req.query;
    
    const options = {
      region,
      league,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    };
    
    const result = await firebaseService.getMatches(options);
    res.json(result);
  } catch (error) {
    console.error('❌ 경기 목록 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 순위표 조회 (최적화됨 - 캐싱 적용)
router.get('/standings', async (req, res) => {
  try {
    const { region, league } = req.query;
    
    if (region && league) {
      // 특정 리그 순위표
      const standings = await firebaseService.getStandings(region, league);
      res.json(standings);
    } else {
      // 전체 순위표
      const allStandings = await firebaseService.getAllStandings();
      res.json(allStandings);
    }
  } catch (error) {
    console.error('❌ 순위표 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 뉴스피드 조회 (최적화됨 - 날짜 범위 쿼리 + 캐싱)
router.get('/newsfeed', async (req, res) => {
  try {
    const newsfeed = await firebaseService.getNewsfeed();
    res.json(newsfeed);
  } catch (error) {
    console.error('❌ 뉴스피드 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 모든 경기 데이터 그룹화 조회
router.get('/matches/grouped', async (req, res) => {
  try {
    const groupedMatches = await firebaseService.getAllMatchesGrouped();
    res.json(groupedMatches);
  } catch (error) {
    console.error('❌ 그룹화된 경기 데이터 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 분석 데이터 조회
router.get('/analytics', async (req, res) => {
  try {
    // 이 부분은 기존 server.js의 analytics 로직을 가져와야 함
    res.json({ message: 'Analytics endpoint - to be implemented' });
  } catch (error) {
    console.error('❌ 분석 데이터 조회 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 캐시 무효화
router.post('/cache/invalidate', async (req, res) => {
  try {
    // Firebase 서비스 캐시 무효화
    firebaseService.invalidateCache();
    
    console.log('✅ 캐시가 무효화되었습니다.');
    res.json({ 
      success: true, 
      message: '캐시가 성공적으로 무효화되었습니다.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 캐시 무효화 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스마트 크롤링 (현재 월 + 다음 월)
router.post('/smart-crawl', async (req, res) => {
  try {
    const { year, month, mode } = req.body;
    
    console.log(`🕷️ 스마트 크롤링 시작: ${year}-${month} (모드: ${mode})`);
    
    // 실제 크롤링 로직은 기존 meat.js 활용
    const { spawn } = require('child_process');
    const crawlProcess = spawn('node', ['meat.js', `--year=${year}`, `--month=${month}`, `--mode=${mode}`], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    let output = '';
    let errorOutput = '';
    
    crawlProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    crawlProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // 프로세스 완료 대기
    await new Promise((resolve, reject) => {
      crawlProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`크롤링 프로세스 실패: ${code}`));
        }
      });
    });
    
    console.log(`✅ 스마트 크롤링 완료: ${year}-${month}`);
    res.json({
      success: true,
      message: `${year}-${month} 크롤링 완료`,
      output: output.slice(-1000), // 마지막 1000자만 반환
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 스마트 크롤링 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 스마트 업로드 (최근 데이터만)
router.post('/smart-upload', async (req, res) => {
  try {
    const { mode } = req.body;
    
    console.log(`📤 스마트 업로드 시작 (모드: ${mode})`);
    
    // 실제 업로드 로직은 기존 firebase_uploader.js 활용
    const { spawn } = require('child_process');
    const uploadProcess = spawn('node', ['firebase_uploader.js', `--mode=${mode}`], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    let output = '';
    let errorOutput = '';
    
    uploadProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    uploadProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // 프로세스 완료 대기
    await new Promise((resolve, reject) => {
      uploadProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`업로드 프로세스 실패: ${code}`));
        }
      });
    });
    
    // 업로드 완료 후 Firebase 캐시 무효화
    firebaseService.invalidateCache();
    
    console.log(`✅ 스마트 업로드 완료`);
    res.json({
      success: true,
      message: '파이어스토어 업로드 완료',
      output: output.slice(-1000),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 스마트 업로드 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initializeApiRoutes };