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

module.exports = { router, initializeApiRoutes };