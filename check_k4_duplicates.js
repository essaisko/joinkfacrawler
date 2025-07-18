// check_k4_duplicates.js - K4 리그 중복 데이터 확인 스크립트
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

async function checkK4Duplicates() {
  const db = initializeFirebase();
  
  console.log('\n=== K4 리그 중복 데이터 확인 시작 ===\n');
  
  try {
    // 1. "K4리그" 데이터 조회
    console.log('1. "K4리그" (대문자) 데이터 조회 중...');
    const k4UpperSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .where('MATCH_DATE', '>=', '2025-07-01')
      .where('MATCH_DATE', '<=', '2025-07-31')
      .get();
    
    console.log(`   - 총 ${k4UpperSnapshot.size}개 문서 발견\n`);
    
    // 2. "k4리그" 데이터 조회
    console.log('2. "k4리그" (소문자) 데이터 조회 중...');
    const k4LowerSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .where('MATCH_DATE', '>=', '2025-07-01')
      .where('MATCH_DATE', '<=', '2025-07-31')
      .get();
    
    console.log(`   - 총 ${k4LowerSnapshot.size}개 문서 발견\n`);
    
    // 3. 중복 분석
    console.log('3. 중복 데이터 분석 중...\n');
    
    // 대문자 K4리그 데이터를 맵으로 저장
    const upperCaseMatches = new Map();
    k4UpperSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      upperCaseMatches.set(key, {
        id: doc.id,
        ...data
      });
    });
    
    // 소문자 k4리그 데이터와 비교
    const duplicates = [];
    const lowerCaseMatches = new Map();
    
    k4LowerSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      
      if (upperCaseMatches.has(key)) {
        duplicates.push({
          upperCase: upperCaseMatches.get(key),
          lowerCase: { id: doc.id, ...data }
        });
      }
      
      lowerCaseMatches.set(key, {
        id: doc.id,
        ...data
      });
    });
    
    console.log(`   📊 중복 분석 결과:`);
    console.log(`   - "K4리그" (대문자): ${k4UpperSnapshot.size}개`);
    console.log(`   - "k4리그" (소문자): ${k4LowerSnapshot.size}개`);
    console.log(`   - 중복된 경기: ${duplicates.length}개\n`);
    
    // 4. 중복 데이터 상세 출력
    if (duplicates.length > 0) {
      console.log('4. 중복된 경기 상세:\n');
      duplicates.slice(0, 5).forEach((dup, index) => {
        console.log(`   ${index + 1}. ${dup.upperCase.MATCH_DATE} - ${dup.upperCase.TH_CLUB_NAME} vs ${dup.upperCase.TA_CLUB_NAME}`);
        console.log(`      - K4리그 문서 ID: ${dup.upperCase.id}`);
        console.log(`      - k4리그 문서 ID: ${dup.lowerCase.id}`);
        console.log('');
      });
      
      if (duplicates.length > 5) {
        console.log(`   ... 그 외 ${duplicates.length - 5}개 중복 경기 더 있음\n`);
      }
    }
    
    // 5. 각 버전의 고유 경기 확인
    console.log('5. 각 버전의 고유 경기 확인:\n');
    
    let upperUnique = 0;
    let lowerUnique = 0;
    
    upperCaseMatches.forEach((match, key) => {
      if (!lowerCaseMatches.has(key)) {
        upperUnique++;
      }
    });
    
    lowerCaseMatches.forEach((match, key) => {
      if (!upperCaseMatches.has(key)) {
        lowerUnique++;
      }
    });
    
    console.log(`   - "K4리그"에만 있는 경기: ${upperUnique}개`);
    console.log(`   - "k4리그"에만 있는 경기: ${lowerUnique}개\n`);
    
    // 6. 날짜별 중복 현황
    console.log('6. 날짜별 K4 리그 현황:\n');
    const dateAnalysis = new Map();
    
    // 모든 경기를 날짜별로 그룹화
    [...k4UpperSnapshot.docs, ...k4LowerSnapshot.docs].forEach(doc => {
      const data = doc.data();
      const date = data.MATCH_DATE;
      
      if (!dateAnalysis.has(date)) {
        dateAnalysis.set(date, {
          K4리그: 0,
          k4리그: 0,
          matches: []
        });
      }
      
      const dateData = dateAnalysis.get(date);
      if (data.leagueTitle === 'K4리그') {
        dateData.K4리그++;
      } else {
        dateData.k4리그++;
      }
      
      dateData.matches.push({
        league: data.leagueTitle,
        home: data.TH_CLUB_NAME,
        away: data.TA_CLUB_NAME,
        id: doc.id
      });
    });
    
    // 날짜별로 정렬하여 출력
    const sortedDates = Array.from(dateAnalysis.keys()).sort();
    sortedDates.forEach(date => {
      const data = dateAnalysis.get(date);
      console.log(`   📅 ${date}:`);
      console.log(`      - K4리그: ${data.K4리그}개, k4리그: ${data.k4리그}개`);
      
      // 해당 날짜의 경기 샘플 출력
      if (data.matches.length <= 4) {
        data.matches.forEach(match => {
          console.log(`      - [${match.league}] ${match.home} vs ${match.away}`);
        });
      } else {
        console.log(`      - 총 ${data.matches.length}개 경기`);
      }
      console.log('');
    });
    
    // 7. 권장사항
    console.log('7. 권장사항:\n');
    if (duplicates.length > 0) {
      console.log('   ⚠️  중복 데이터가 발견되었습니다.');
      console.log('   - 하나의 통일된 리그 이름(예: "K4리그")을 사용하는 것을 권장합니다.');
      console.log('   - 중복된 문서 중 하나를 삭제하여 데이터 일관성을 유지하세요.');
    } else {
      console.log('   ✅ 중복 데이터가 없습니다.');
    }
    
    console.log('\n   💡 데이터 일관성을 위해 리그 이름을 통일하는 것이 좋습니다.');
    console.log('      예: "K4리그" 또는 "K4 리그" 중 하나로 통일\n');
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
  
  console.log('=== K4 리그 중복 데이터 확인 완료 ===\n');
  process.exit(0);
}

// 스크립트 실행
checkK4Duplicates();