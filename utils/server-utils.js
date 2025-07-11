// server-utils.js - 서버 전용 유틸리티 함수들

/**
 * 서버에서 사용하는 시간 형식 변환 함수 (한국어 형식)
 * @param {string} timeString - 시간 문자열
 * @returns {string} - "오전/오후 X시 XX분" 형식의 문자열
 */
function formatTimeKorean(timeString) {
  if (!timeString) return timeString;
  
  // 이미 형식화된 시간인지 확인
  if (timeString.includes('오전') || timeString.includes('오후')) return timeString;
  
  let hour, minute;
  
  // MATCH_CHECK_TIME1 형식: "2025-05-25 (일) 13:00"
  if (timeString.includes('(') && timeString.includes(')')) {
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      hour = timeMatch[1];
      minute = timeMatch[2];
    }
  }
  // MATCH_TIME 형식: "2025-05-25-일-13-00"
  else if (timeString.includes('-')) {
    const parts = timeString.split('-');
    if (parts.length >= 5) {
      hour = parts[parts.length - 2]; // 끝에서 두 번째가 시간
      minute = parts[parts.length - 1]; // 마지막이 분
    } else {
      // 간단한 "13-00" 형식
      const timeParts = timeString.split('-');
      if (timeParts.length === 2) {
        hour = timeParts[0];
        minute = timeParts[1];
      }
    }
  }
  // 단순 "13:00" 형식
  else if (timeString.includes(':')) {
    [hour, minute] = timeString.split(':');
  }
  // 숫자만 있는 경우
  else if (/^\d+$/.test(timeString)) {
    if (timeString.length === 4) {
      hour = timeString.substring(0, 2);
      minute = timeString.substring(2, 4);
    } else {
      hour = timeString;
      minute = '00';
    }
  }
  
  if (!hour || !minute) return timeString;
  
  const hourNum = parseInt(hour);
  const minuteNum = parseInt(minute) || 0;
  
  if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) return timeString;
  if (isNaN(minuteNum) || minuteNum < 0 || minuteNum > 59) return timeString;
  
  const period = hourNum < 12 ? '오전' : '오후';
  const displayHour = hourNum === 0 ? 12 : (hourNum > 12 ? hourNum - 12 : hourNum);
  
  return `${period} ${displayHour}시 ${minuteNum.toString().padStart(2, '0')}분`;
}

/**
 * 순위표 계산 함수
 * @param {Array} matches - 경기 데이터 배열
 * @param {string} leagueFilter - 리그 필터 (선택적)
 * @returns {Array} - 정렬된 순위표 배열
 */
function calculateStandings(matches, leagueFilter = null) {
  const { parseTeamName, initializeTeamStats } = require('./team-utils');
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
    
    // 홈팀 통계 초기화 (없는 경우)
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
    
    // 어웨이팀 통계 초기화 (없는 경우)
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
  
  // 순위표 정렬 (승점 > 골득실 > 득점 > 팀명순)
  return Array.from(standings.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

module.exports = {
  formatTimeKorean,
  calculateStandings
};