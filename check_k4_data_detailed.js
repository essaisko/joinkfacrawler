// check_k4_data_detailed.js - K4 리그 데이터 상세 확인 스크립트
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

async function checkK4DataDetailed() {
  const db = initializeFirebase();
  
  console.log('\n=== K4 리그 데이터 상세 확인 시작 ===\n');
  
  try {
    // 1. 모든 리그 타이틀 확인
    console.log('1. 모든 리그 타이틀 확인 중...');
    const allMatchesSnapshot = await db.collection('matches')
      .select('leagueTitle')
      .limit(1000)
      .get();
    
    const leagueTitles = new Set();
    allMatchesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.leagueTitle) {
        leagueTitles.add(data.leagueTitle);
      }
    });
    
    console.log('\n   발견된 리그 타이틀:');
    const sortedLeagues = Array.from(leagueTitles).sort();
    sortedLeagues.forEach(league => {
      console.log(`   - ${league}`);
      // K4 관련 문자열 찾기
      if (league.toLowerCase().includes('k4') || league.includes('K4') || league.includes('4부')) {
        console.log(`     ⭐ K4 관련 리그 발견!`);
      }
    });
    
    // 2. 문서 ID에서 K4 찾기
    console.log('\n2. 문서 ID에서 K4 관련 데이터 찾기...');
    const k4DocsByIdSnapshot = await db.collection('matches')
      .orderBy('__name__')
      .startAt('K4')
      .endAt('K4\uf8ff')
      .get();
    
    console.log(`   - 문서 ID에 'K4'가 포함된 문서 수: ${k4DocsByIdSnapshot.size}개`);
    
    if (k4DocsByIdSnapshot.size > 0) {
      console.log('\n   K4 문서 ID 샘플 (상위 5개):');
      k4DocsByIdSnapshot.docs.slice(0, 5).forEach(doc => {
        const data = doc.data();
        console.log(`   📄 ID: ${doc.id}`);
        console.log(`      리그: ${data.leagueTitle}, 날짜: ${data.MATCH_DATE}`);
        console.log(`      경기: ${data.TH_CLUB_NAME} vs ${data.TA_CLUB_NAME}`);
      });
    }
    
    // 3. 2025년 7월 전체 데이터 확인
    console.log('\n3. 2025년 7월 전체 경기 데이터 확인...');
    const july2025Snapshot = await db.collection('matches')
      .where('MATCH_DATE', '>=', '2025-07-01')
      .where('MATCH_DATE', '<=', '2025-07-31')
      .get();
    
    console.log(`   - 2025년 7월 전체 경기 수: ${july2025Snapshot.size}개`);
    
    if (july2025Snapshot.size > 0) {
      const leagueCount = {};
      july2025Snapshot.docs.forEach(doc => {
        const league = doc.data().leagueTitle || '미분류';
        leagueCount[league] = (leagueCount[league] || 0) + 1;
      });
      
      console.log('\n   2025년 7월 리그별 경기 수:');
      Object.entries(leagueCount)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([league, count]) => {
          console.log(`   - ${league}: ${count}개`);
        });
    }
    
    // 4. 문서 ID 패턴 분석
    console.log('\n4. 문서 ID 패턴 분석...');
    const sampleDocs = await db.collection('matches')
      .limit(20)
      .get();
    
    console.log('   문서 ID 샘플:');
    sampleDocs.docs.forEach(doc => {
      console.log(`   - ${doc.id} (리그: ${doc.data().leagueTitle})`);
    });
    
    // 5. K4 리그 가능성이 있는 다양한 패턴으로 검색
    console.log('\n5. K4 리그 가능성이 있는 패턴 검색...');
    const possiblePatterns = ['K4', 'k4', 'K-4', 'K 4', '4부', 'K4리그', 'K4 리그'];
    
    for (const pattern of possiblePatterns) {
      const patternSnapshot = await db.collection('matches')
        .where('leagueTitle', '==', pattern)
        .limit(5)
        .get();
      
      if (patternSnapshot.size > 0) {
        console.log(`   ✅ "${pattern}" 패턴으로 ${patternSnapshot.size}개 문서 발견!`);
      }
    }
    
    // 6. 최근 문서 ID 확인 (K4 관련 추정)
    console.log('\n6. 최근 추가된 문서 확인 (K4 관련 가능성)...');
    const recentSnapshot = await db.collection('matches')
      .orderBy('__name__', 'desc')
      .limit(50)
      .get();
    
    const k4RelatedDocs = recentSnapshot.docs.filter(doc => {
      const id = doc.id;
      const data = doc.data();
      return id.includes('K4') || id.includes('k4') || 
             (data.leagueTitle && (data.leagueTitle.includes('K4') || data.leagueTitle.includes('4부')));
    });
    
    if (k4RelatedDocs.length > 0) {
      console.log(`\n   K4 관련 가능성이 있는 최근 문서 ${k4RelatedDocs.length}개 발견:`);
      k4RelatedDocs.slice(0, 10).forEach(doc => {
        const data = doc.data();
        console.log(`   📄 ID: ${doc.id}`);
        console.log(`      리그: ${data.leagueTitle}`);
        console.log(`      날짜: ${data.MATCH_DATE}`);
        console.log(`      경기: ${data.TH_CLUB_NAME} vs ${data.TA_CLUB_NAME}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
  
  console.log('\n=== K4 리그 데이터 상세 확인 완료 ===\n');
  process.exit(0);
}

// 스크립트 실행
checkK4DataDetailed();