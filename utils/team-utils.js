// team-utils.js - 팀명 파싱 및 지역 처리 유틸리티

// 대분류 지역 패턴 (도/광역시)
const MAJOR_REGION_PATTERNS = [
  '경남', '부산', '울산', '대구', '대전', '광주', '인천', '서울', 
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '제주'
];

// 중분류 지역 패턴 (시/군/구)
const MINOR_REGION_PATTERNS = [
  // 경남 지역
  '양산시', '거제시', '김해시', '진주시', '창원시', '통영시', '사천시', '밀양시', 
  '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
  
  // 부산 지역  
  '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', 
  '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
  
  // 기타 주요 시/군/구
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', 
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', 
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
];

/**
 * 팀명을 파싱하여 지역과 팀명을 분리하는 함수
 * @param {string} fullTeamName - 전체 팀명 (예: "경남 김해시 FC김해")
 * @returns {Object} - { majorRegion, minorRegion, teamName, fullRegion }
 */
function parseTeamName(fullTeamName) {
  if (!fullTeamName) {
    return { 
      majorRegion: '', 
      minorRegion: '', 
      teamName: fullTeamName || '', 
      fullRegion: '' 
    };
  }

  let majorRegion = '';
  let remainingName = fullTeamName;

  // 대분류 지역 찾기 (지역명 뒤에 공백이 있는 경우에만 분리)
  for (const region of MAJOR_REGION_PATTERNS) {
    const prefix = region + ' ';
    if (fullTeamName.startsWith(prefix)) {
      majorRegion = region;
      remainingName = fullTeamName.substring(prefix.length);
      break;
    }
  }

  let minorRegion = '';
  let teamName = remainingName;

  // 중분류 지역 찾기 (역시 공백이 있어야 분리)
  for (const region of MINOR_REGION_PATTERNS) {
    const prefix = region + ' ';
    if (remainingName.startsWith(prefix)) {
      minorRegion = region;
      teamName = remainingName.substring(prefix.length).trim();
      break;
    }
  }

  // 팀명이 비어있으면 원본 사용
  if (!teamName.trim()) {
    teamName = fullTeamName;
  }

  return {
    majorRegion,
    minorRegion,
    teamName: teamName.trim(),
    fullRegion: majorRegion + minorRegion
  };
}

/**
 * 리그 순서를 결정하는 함수 (K5 > K6 > K7 > 기타)
 * @param {string} league - 리그명
 * @returns {number} - 정렬 순서 (낮을수록 우선순위 높음)
 */
function getLeagueOrder(league) {
  if (!league) return 999;
  
  if (league.includes('K5')) return 1;
  if (league.includes('K6')) return 2;
  if (league.includes('K7')) return 3;
  return 4;
}

/**
 * 리그별 정렬 함수
 * @param {Array} leagues - 리그 배열
 * @returns {Array} - 정렬된 리그 배열
 */
function sortLeagues(leagues) {
  return leagues.sort((a, b) => {
    const orderA = getLeagueOrder(a);
    const orderB = getLeagueOrder(b);
    
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, 'ko-KR');
  });
}

/**
 * 지역별 정렬 함수 (한국어 가나다순)
 * @param {Array} regions - 지역 배열
 * @returns {Array} - 정렬된 지역 배열
 */
function sortRegions(regions) {
  return regions.sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

/**
 * 팀 통계 초기화 함수
 * @param {string} teamName - 팀명
 * @param {string} region - 지역
 * @param {string} league - 리그
 * @returns {Object} - 초기화된 팀 통계 객체
 */
function initializeTeamStats(teamName, region, league) {
  return {
    teamName,
    region,
    league,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  };
}

module.exports = {
  parseTeamName,
  getLeagueOrder,
  sortLeagues,
  sortRegions,
  initializeTeamStats,
  MAJOR_REGION_PATTERNS,
  MINOR_REGION_PATTERNS
};