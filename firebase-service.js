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

  // 뉴스피드 데이터 조회 (날짜 범위 쿼리 활용)
  async getNewsfeed() {
    const cacheKey = 'newsfeed';
    let newsfeed = cache.get(cacheKey);
    
    if (newsfeed) {
      console.log('🚀 캐시에서 뉴스피드 조회');
      return newsfeed;
    }

    console.log('🔥 Firebase에서 뉴스피드 계산');
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // 날짜 범위로 필터링하여 조회
    const recentSnapshot = await this.db.collection('matches')
      .where('matchStatus', '==', '완료')
      .where('MATCH_DATE', '>=', oneWeekAgo.toISOString().split('T')[0])
      .where('MATCH_DATE', '<=', now.toISOString().split('T')[0])
      .orderBy('MATCH_DATE', 'desc')
      .limit(20)
      .get();
    
    const upcomingSnapshot = await this.db.collection('matches')
      .where('MATCH_DATE', '>=', now.toISOString().split('T')[0])
      .where('MATCH_DATE', '<=', oneWeekLater.toISOString().split('T')[0])
      .orderBy('MATCH_DATE', 'asc')
      .limit(20)
      .get();
    
    const recentMatches = recentSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const upcomingMatches = upcomingSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
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