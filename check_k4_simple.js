// check_k4_simple.js - K4 리그 데이터 단순 확인 스크립트
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Firebase 초기화
function initializeFirebase() {
  const serviceAccountPath = path.join(__dirname, 'firebase-admin-sdk.json');
  
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('❌ firebase-admin-sdk.json 파일이 필요합니다.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath))
    });
    console.log('✅ Firebase 초기화 완료');
  }
  
  return admin.firestore();
}

async function checkK4Simple() {
  const db = initializeFirebase();
  
  console.log('\n=== K4 리그 데이터 단순 확인 시작 ===\n');
  
  try {
    // 1. K4리그 (대문자) 전체 데이터 조회
    console.log('1. "K4리그" (대문자) 전체 데이터 조회 중...');
    const k4UpperSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .get();
    
    console.log(`   - 총 ${k4UpperSnapshot.size}개 문서 발견`);
    
    // 7월 데이터 필터링
    const k4Upper2025July = k4UpperSnapshot.docs.filter(doc => {
      const date = doc.data().MATCH_DATE;
      return date && date.startsWith('2025-07');
    });
    console.log(`   - 2025년 7월 데이터: ${k4Upper2025July.length}개\n`);
    
    // 2. k4리그 (소문자) 전체 데이터 조회
    console.log('2. "k4리그" (소문자) 전체 데이터 조회 중...');
    const k4LowerSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .get();
    
    console.log(`   - 총 ${k4LowerSnapshot.size}개 문서 발견`);
    
    // 7월 데이터 필터링
    const k4Lower2025July = k4LowerSnapshot.docs.filter(doc => {
      const date = doc.data().MATCH_DATE;
      return date && date.startsWith('2025-07');
    });
    console.log(`   - 2025년 7월 데이터: ${k4Lower2025July.length}개\n`);
    
    // 3. 중복 분석
    console.log('3. 2025년 7월 K4 리그 중복 분석:\n');
    
    // 경기 정보를 키로 만들어 중복 확인
    const upperMatches = new Map();
    const lowerMatches = new Map();
    const duplicates = [];
    
    k4Upper2025July.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      upperMatches.set(key, { id: doc.id, ...data });
    });
    
    k4Lower2025July.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      lowerMatches.set(key, { id: doc.id, ...data });
      
      if (upperMatches.has(key)) {
        duplicates.push({
          key,
          upper: upperMatches.get(key),
          lower: { id: doc.id, ...data }
        });
      }
    });
    
    console.log(`   📊 중복 분석 결과:`);
    console.log(`   - "K4리그" 7월 경기: ${k4Upper2025July.length}개`);
    console.log(`   - "k4리그" 7월 경기: ${k4Lower2025July.length}개`);
    console.log(`   - 중복된 경기: ${duplicates.length}개\n`);
    
    // 4. 날짜별 상세 분석
    console.log('4. 2025년 7월 날짜별 K4 리그 현황:\n');
    
    const dateMap = new Map();
    
    // 모든 7월 경기를 날짜별로 그룹화
    [...k4Upper2025July, ...k4Lower2025July].forEach(doc => {
      const data = doc.data();
      const date = data.MATCH_DATE;
      
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          K4리그: [],
          k4리그: []
        });
      }
      
      const dateData = dateMap.get(date);
      if (data.leagueTitle === 'K4리그') {
        dateData.K4리그.push({
          id: doc.id,
          home: data.TH_CLUB_NAME,
          away: data.TA_CLUB_NAME,
          status: data.matchStatus
        });
      } else {
        dateData.k4리그.push({
          id: doc.id,
          home: data.TH_CLUB_NAME,
          away: data.TA_CLUB_NAME,
          status: data.matchStatus
        });
      }
    });
    
    // 날짜별로 정렬하여 출력
    const sortedDates = Array.from(dateMap.keys()).sort();
    sortedDates.forEach(date => {
      const data = dateMap.get(date);
      console.log(`   📅 ${date}:`);
      console.log(`      K4리그: ${data.K4리그.length}개, k4리그: ${data.k4리그.length}개`);
      
      // 중복 확인
      const duplicatesOnDate = [];
      data.K4리그.forEach(upperMatch => {
        data.k4리그.forEach(lowerMatch => {
          if (upperMatch.home === lowerMatch.home && upperMatch.away === lowerMatch.away) {
            duplicatesOnDate.push({ upper: upperMatch, lower: lowerMatch });
          }
        });
      });
      
      if (duplicatesOnDate.length > 0) {
        console.log(`      ⚠️  중복 경기 ${duplicatesOnDate.length}개:`);
        duplicatesOnDate.forEach(dup => {
          console.log(`         ${dup.upper.home} vs ${dup.upper.away}`);
        });
      }
      console.log('');
    });
    
    // 5. 중복 경기 상세
    if (duplicates.length > 0) {
      console.log('5. 중복된 경기 상세 (최대 10개):\n');
      duplicates.slice(0, 10).forEach((dup, index) => {
        console.log(`   ${index + 1}. ${dup.upper.MATCH_DATE} - ${dup.upper.TH_CLUB_NAME} vs ${dup.upper.TA_CLUB_NAME}`);
        console.log(`      K4리그 ID: ${dup.upper.id}`);
        console.log(`      k4리그 ID: ${dup.lower.id}`);
        console.log(`      상태: ${dup.upper.matchStatus} / ${dup.lower.matchStatus}`);
        console.log('');
      });
    }
    
    // 6. 전체 K4 리그 연도별 통계
    console.log('6. K4 리그 전체 연도별 통계:\n');
    
    const yearStats = new Map();
    
    // 모든 K4 리그 데이터 통합
    [...k4UpperSnapshot.docs, ...k4LowerSnapshot.docs].forEach(doc => {
      const data = doc.data();
      const date = data.MATCH_DATE;
      if (date) {
        const year = date.split('-')[0];
        if (!yearStats.has(year)) {
          yearStats.set(year, {
            K4리그: 0,
            k4리그: 0,
            total: 0
          });
        }
        
        const stats = yearStats.get(year);
        if (data.leagueTitle === 'K4리그') {
          stats.K4리그++;
        } else {
          stats.k4리그++;
        }
        stats.total++;
      }
    });
    
    const sortedYears = Array.from(yearStats.keys()).sort();
    sortedYears.forEach(year => {
      const stats = yearStats.get(year);
      console.log(`   ${year}년: 총 ${stats.total}개 (K4리그: ${stats.K4리그}, k4리그: ${stats.k4리그})`);
    });
    
    // 7. 권장사항
    console.log('\n7. 분석 결과 및 권장사항:\n');
    if (duplicates.length > 0) {
      console.log('   ⚠️  중복 데이터가 발견되었습니다!');
      console.log(`   - 2025년 7월에 ${duplicates.length}개의 중복 경기가 있습니다.`);
      console.log('   - 대문자 "K4리그"와 소문자 "k4리그"가 혼재되어 있습니다.');
      console.log('   - 데이터 일관성을 위해 하나의 형식으로 통일이 필요합니다.');
      console.log('\n   💡 해결 방안:');
      console.log('   1. 하나의 리그 이름으로 통일 (예: "K4리그")');
      console.log('   2. 중복된 문서 중 하나를 삭제');
      console.log('   3. 크롤링 시 리그 이름 정규화 로직 추가');
    } else {
      console.log('   ✅ 2025년 7월 K4 리그 데이터에 중복이 없습니다.');
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
  
  console.log('\n=== K4 리그 데이터 확인 완료 ===\n');
  process.exit(0);
}

// 스크립트 실행
checkK4Simple();