// date-utils.js - 날짜 및 시간 처리 유틸리티

/**
 * 시간을 HH:MM 형식으로 포맷팅하는 함수
 * @param {string} timeString - 시간 문자열 (다양한 형식 지원)
 * @returns {string} - HH:MM 형식의 시간 또는 원본 문자열
 */
function formatTime(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    return timeString || '';
  }

  // 공백 제거
  const cleanTime = timeString.trim();
  
  // 이미 HH:MM 형식인지 확인
  if (/^\d{1,2}:\d{2}$/.test(cleanTime)) {
    const [hours, minutes] = cleanTime.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // HHMM 형식 (예: "1430" -> "14:30")
  if (/^\d{4}$/.test(cleanTime)) {
    const hours = cleanTime.substring(0, 2);
    const minutes = cleanTime.substring(2, 4);
    return `${hours}:${minutes}`;
  }
  
  // H:MM 형식 (예: "9:30" -> "09:30")
  if (/^\d:\d{2}$/.test(cleanTime)) {
    return `0${cleanTime}`;
  }
  
  // 다른 구분자 처리 (예: "14.30", "14-30")
  const separatorMatch = cleanTime.match(/^(\d{1,2})[\.\-](\d{2})$/);
  if (separatorMatch) {
    const [, hours, minutes] = separatorMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // 텍스트가 포함된 경우 시간 부분만 추출
  const timeMatch = cleanTime.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const [, hours, minutes] = timeMatch;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  
  // 변환할 수 없는 경우 원본 반환
  return cleanTime;
}

/**
 * 유연한 날짜 파싱 함수 (다양한 형식 지원)
 * @param {string} dateString - 날짜 문자열
 * @returns {Date|null} - 파싱된 Date 객체 또는 null
 */
function parseFlexibleDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const cleanDate = dateString.trim();
  
  // ISO 형식 (YYYY-MM-DD)
  const isoMatch = cleanDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // 한국식 형식 (YYYY.MM.DD, YYYY/MM/DD)
  const koreanMatch = cleanDate.match(/^(\d{4})[\./](\d{1,2})[\./](\d{1,2})$/);
  if (koreanMatch) {
    const [, year, month, day] = koreanMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  // 기본 Date 생성자 시도
  const attemptDate = new Date(cleanDate);
  if (!isNaN(attemptDate.getTime())) {
    return attemptDate;
  }
  
  return null;
}

/**
 * 날짜를 요일과 함께 포맷팅하는 함수
 * @param {Date|string} date - Date 객체 또는 날짜 문자열
 * @returns {string} - "MM.DD (요일)" 형식의 문자열
 */
function formatDateWithWeekday(date) {
  let dateObj;
  
  if (typeof date === 'string') {
    dateObj = parseFlexibleDate(date);
    if (!dateObj) return date;
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }
  
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  const weekday = weekdays[dateObj.getDay()];
  
  return `${month}.${day} (${weekday})`;
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷팅하는 함수
 * @param {Date|string} date - Date 객체 또는 날짜 문자열
 * @returns {string} - YYYY-MM-DD 형식의 문자열
 */
function formatDateISO(date) {
  let dateObj;
  
  if (typeof date === 'string') {
    dateObj = parseFlexibleDate(date);
    if (!dateObj) return date;
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    return '';
  }
  
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 안전한 날짜 파싱 함수 (에러 방지)
 * @param {string} dateString - 날짜 문자열
 * @returns {Date} - 파싱된 Date 객체 또는 현재 날짜
 */
function safeParseDate(dateString) {
  const parsed = parseFlexibleDate(dateString);
  return parsed || new Date();
}

/**
 * 날짜 범위 생성 함수
 * @param {Date} baseDate - 기준 날짜
 * @param {number} daysBefore - 이전 일수
 * @param {number} daysAfter - 이후 일수
 * @returns {Object} - { start, end } 형태의 날짜 범위
 */
function createDateRange(baseDate = new Date(), daysBefore = 7, daysAfter = 7) {
  const start = new Date(baseDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  const end = new Date(baseDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
  
  return {
    start,
    end,
    startISO: formatDateISO(start),
    endISO: formatDateISO(end)
  };
}

/**
 * 경기 시간 파싱 함수 (프론트엔드용)
 * @param {string} timeString - 시간 문자열
 * @returns {string} - 포맷된 시간 문자열
 */
function parseMatchTime(timeString) {
  if (!timeString) return '';
  
  // 기본 시간 포맷팅 적용
  const formatted = formatTime(timeString);
  
  // 특별한 경우 처리 (예: "TBD", "연기" 등)
  if (formatted === timeString && !/^\d{1,2}:\d{2}$/.test(formatted)) {
    return timeString; // 원본 그대로 반환
  }
  
  return formatted;
}

module.exports = {
  formatTime,
  parseFlexibleDate,
  formatDateWithWeekday,
  formatDateISO,
  safeParseDate,
  createDateRange,
  parseMatchTime
};