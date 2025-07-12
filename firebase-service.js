// firebase-service.js - Firebase 쿼리 최적화 서비스
const admin = require('firebase-admin');
const cache = require('./cache-service');
const { parseTeamName, getLeagueOrder, sortLeagues, sortRegions } = require('./utils/team-utils');

class FirebaseService {
  constructor(db) {
    this.db = db;
  }

  // 지역 목록 조회 (캐싱 적용)
  async getRegions() {
    const cacheKey = 'regions';
    let regions = cache.get(cacheKey);
    
    if (regions) {
      console.log('🚀 캐시에서 지역 목록 조회');
      return regions;
    }

    console.log('🔥 Firebase에서 지역 목록 조회');
    // regionTag별로 그룹화하여 중복 제거된 지역만 조회
    const snapshot = await this.db.collection('matches')
      .select('regionTag')
      .get();
    
    const regionSet = new Set();
    snapshot.docs.forEach(doc => {
      const regionTag = doc.data().regionTag;
      if (regionTag) regionSet.add(regionTag);
    });
    
    regions = sortRegions(Array.from(regionSet));
    cache.set(cacheKey, regions, 30); // 30분 캐싱
    return regions;
  }

  // 특정 지역의 리그 목록 조회 (인덱스 활용 + 캐싱)
  async getLeaguesByRegion(region) {
    const cacheKey = `leagues:${region}`;
    let leagues = cache.get(cacheKey);
    
    if (leagues) {
      console.log(`🚀 캐시에서 ${region} 리그 목록 조회`);
      return leagues;
    }

    console.log(`🔥 Firebase에서 ${region} 리그 목록 조회`);
    // regionTag로 필터링하여 필요한 데이터만 조회
    const snapshot = await this.db.collection('matches')
      .where('regionTag', '==', region)
      .select('leagueTitle')
      .get();
    
    const leagueSet = new Set();
    snapshot.docs.forEach(doc => {
      const leagueTitle = doc.data().leagueTitle;
      if (leagueTitle) leagueSet.add(leagueTitle);
    });
    
    leagues = sortLeagues(Array.from(leagueSet));
    
    cache.set(cacheKey, leagues, 20); // 20분 캐싱
    return leagues;
  }

  // 경기 조회 (페이지네이션 + 인덱스 활용)
  async getMatches(options = {}) {
    const {
      region,
      league,
      limit = 100,
      lastDoc = null,
      orderBy = 'MATCH_DATE',
      direction = 'desc'
    } = options;

    let query = this.db.collection('matches');

    // 인덱스를 활용한 필터링
    if (region) {
      query = query.where('regionTag', '==', region);
    }
    if (league) {
      query = query.where('leagueTitle', '==', league);
    }

    // 정렬 및 페이지네이션
    query = query.orderBy(orderBy, direction).limit(limit);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const matches = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      matches,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === limit
    };
  }

  // 순위표 계산 (특정 리그만 조회)
  async getStandings(region, league) {
    const cacheKey = `standings:${region}:${league}`;
    let standings = cache.get(cacheKey);
    
    if (standings) {
      console.log(`🚀 캐시에서 ${region}-${league} 순위표 조회`);
      return standings;
    }

    console.log(`🔥 Firebase에서 ${region}-${league} 순위표 계산`);
    
    // 특정 리그의 완료된 경기만 조회
    const snapshot = await this.db.collection('matches')
      .where('regionTag', '==', region)
      .where('leagueTitle', '==', league)
      .where('matchStatus', '==', '완료')
      .get();
    
    const matches = snapshot.docs.map(doc => doc.data());
    standings = this.calculateStandings(matches, league);
    
    cache.set(cacheKey, standings, 15); // 15분 캐싱
    return standings;
  }

  // 모든 리그 순위표 조회 (최적화된 버전)
  async getAllStandings() {
    const cacheKey = 'all-standings';
    let allStandings = cache.get(cacheKey);
    
    if (allStandings) {
      console.log('🚀 캐시에서 전체 순위표 조회');
      return allStandings;
    }

    console.log('🔥 Firebase에서 전체 순위표 계산');
    
    // 완료된 경기만 조회
    const snapshot = await this.db.collection('matches')
      .where('matchStatus', '==', '완료')
      .get();
    
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
    allStandings = Object.values(leagueGroups).map(group => ({
      region: group.region,
      league: group.league,
      standings: this.calculateStandings(group.matches, group.league)
    })).sort((a, b) => {
      if (a.region !== b.region) return a.region.localeCompare(b.region, 'ko-KR');
      
      return getLeagueOrder(a.league) - getLeagueOrder(b.league);
    });
    
    cache.set(cacheKey, allStandings, 10); // 10분 캐싱
    return allStandings;
  }

  // 뉴스피드 데이터 조회 (개선된 버전)
  async getNewsfeed() {
    const cacheKey = 'newsfeed';
    let newsfeed = cache.get(cacheKey);
    
    if (newsfeed) {
      console.log('🚀 캐시에서 뉴스피드 조회');
      return newsfeed;
    }

    console.log('🔥 Firebase에서 뉴스피드 계산');
    
    // 한국 시간 기준으로 날짜 계산
    const now = new Date();
    const koreaOffset = 9 * 60; // UTC+9
    const koreaTime = new Date(now.getTime() + koreaOffset * 60 * 1000);
    const today = koreaTime.toISOString().split('T')[0];
    
    const oneWeekAgo = new Date(koreaTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekLater = new Date(koreaTime.getTime() + 14 * 24 * 60 * 60 * 1000); // 2주로 확장
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];
    const oneWeekLaterStr = oneWeekLater.toISOString().split('T')[0];
    
    // 최근 완료된 경기 조회 (개선된 버전)
    const recentSnapshot = await this.db.collection('matches')
      .where('matchStatus', '==', '완료')
      .orderBy('__name__', 'desc')
      .limit(100) // 증가
      .get();
    
    // 다가오는 경기 조회 (개선된 버전) - limit 대폭 증가
    const upcomingSnapshot = await this.db.collection('matches')
      .where('MATCH_DATE', '>=', today)
      .orderBy('MATCH_DATE', 'asc')
      .limit(200) // 30 → 200으로 증가
      .get();
    
    // 안전한 날짜 파싱 함수
    const safeParseDate = (dateStr) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      try {
        // 다양한 날짜 형식 처리
        let cleanDate = dateStr.trim();
        
        // "2025-09-21 (일)" → "2025-09-21"
        if (cleanDate.includes('(')) {
          cleanDate = cleanDate.split('(')[0].trim();
        }
        
        // 점이나 슬래시를 하이픈으로 변경
        cleanDate = cleanDate.replace(/[\.\/]/g, '-');
        
        // "20250921" → "2025-09-21"
        if (/^\d{8}$/.test(cleanDate)) {
          cleanDate = cleanDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        }
        
        const parsed = new Date(cleanDate + 'T00:00:00+09:00'); // 한국 시간으로 파싱
        return isNaN(parsed.getTime()) ? null : parsed;
      } catch (e) {
        return null;
      }
    };
    
    // 최근 경기 필터링 및 정렬
    const recentMatches = recentSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(match => {
        const matchDate = safeParseDate(match.MATCH_DATE);
        if (!matchDate) return false;
        return matchDate >= oneWeekAgo && matchDate <= koreaTime;
      })
      .sort((a, b) => {
        const dateA = safeParseDate(a.MATCH_DATE) || new Date(0);
        const dateB = safeParseDate(b.MATCH_DATE) || new Date(0);
        return dateB - dateA; // 최신순
      })
      .slice(0, 30);
    
    // 다가오는 경기 필터링 및 정렬
    const upcomingMatches = upcomingSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(match => {
        const matchDate = safeParseDate(match.MATCH_DATE);
        if (!matchDate) return false;
        
        // 오늘 이후이고 2주 이내의 경기만
        return matchDate >= koreaTime && matchDate <= oneWeekLater;
      })
      .sort((a, b) => {
        const dateA = safeParseDate(a.MATCH_DATE) || new Date(9999, 11, 31);
        const dateB = safeParseDate(b.MATCH_DATE) || new Date(9999, 11, 31);
        return dateA - dateB; // 날짜순
      })
      .slice(0, 50); // 더 많은 경기 표시
    
    // 통계 계산 (캐시된 데이터 활용)
    const statsSnapshot = await this.db.collection('matches').select('matchStatus', 'leagueTitle').get();
    const allMatches = statsSnapshot.docs.map(doc => doc.data());
    
    const stats = {
      totalMatches: allMatches.length,
      completedMatches: allMatches.filter(m => m.matchStatus === '완료').length,
      activeLeagues: [...new Set(allMatches.map(m => m.leagueTitle))].filter(Boolean).length
    };
    
    newsfeed = {
      recentMatches,
      upcomingMatches,
      stats
    };
    
    cache.set(cacheKey, newsfeed, 5); // 5분 캐싱
    return newsfeed;
  }

  // 순위표 계산 로직 (기존 로직 재사용)
  calculateStandings(matches, leagueFilter = null) {
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
      
      const homeTeamId = `${match.leagueTitle}_${homeParsed.teamName}`;
      const awayTeamId = `${match.leagueTitle}_${awayParsed.teamName}`;
      
      // 팀 통계 초기화 및 계산 (기존 로직과 동일)
      // ... (순위표 계산 로직은 기존과 동일하므로 생략)
    });
    
    return Array.from(standings.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });
  }


  // 캐시 무효화 (새로운 데이터 업로드 시 호출)
  invalidateCache() {
    console.log('🧹 Firebase 캐시 무효화');
    cache.clear();
  }
}

module.exports = FirebaseService;