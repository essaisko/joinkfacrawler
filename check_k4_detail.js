const admin = require('firebase-admin');
const serviceAccount = require('./firebase-admin-sdk.json');

// Firebase 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkK4Detail() {
  try {
    console.log('🔍 K4 리그 데이터 상세 확인 중...\n');

    // 1. K4리그 7월 데이터 상세 확인
    console.log('1. "K4리그" 7월 데이터 상세:');
    const k4July = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .where('month', '==', '07')
      .limit(3)
      .get();

    k4July.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n  경기 ${index + 1}:`);
      console.log(`    - matchId: ${data.matchId}`);
      console.log(`    - MATCH_DATE: ${data.MATCH_DATE}`);
      console.log(`    - TH_CLUB_NAME: ${data.TH_CLUB_NAME}`);
      console.log(`    - TA_CLUB_NAME: ${data.TA_CLUB_NAME}`);
      console.log(`    - matchStatus: ${data.matchStatus}`);
      console.log(`    - leagueTitle: ${data.leagueTitle}`);
      console.log(`    - leagueTag: ${data.leagueTag}`);
    });

    // 2. k4리그 7월 데이터 상세 확인
    console.log('\n\n2. "k4리그" 7월 데이터 상세:');
    const k4LowerJuly = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .where('month', '==', '07')
      .limit(3)
      .get();

    k4LowerJuly.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n  경기 ${index + 1}:`);
      console.log(`    - matchId: ${data.matchId}`);
      console.log(`    - MATCH_DATE: ${data.MATCH_DATE}`);
      console.log(`    - TH_CLUB_NAME: ${data.TH_CLUB_NAME}`);
      console.log(`    - TA_CLUB_NAME: ${data.TA_CLUB_NAME}`);
      console.log(`    - matchStatus: ${data.matchStatus}`);
      console.log(`    - leagueTitle: ${data.leagueTitle}`);
      console.log(`    - leagueTag: ${data.leagueTag}`);
    });

    // 3. 전체 K4 리그 통계
    console.log('\n\n3. K4 리그 전체 통계:');
    
    // 대문자 K4리그 전체
    const k4UpperAll = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .get();
    
    // 소문자 k4리그 전체
    const k4LowerAll = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .get();

    console.log(`  - "K4리그" 총 경기 수: ${k4UpperAll.size}개`);
    console.log(`  - "k4리그" 총 경기 수: ${k4LowerAll.size}개`);
    console.log(`  - 전체 K4 리그 경기 수: ${k4UpperAll.size + k4LowerAll.size}개`);

    // 월별 분포
    const monthStats = {};
    [...k4UpperAll.docs, ...k4LowerAll.docs].forEach(doc => {
      const data = doc.data();
      const key = `${data.year}-${data.month}`;
      if (!monthStats[key]) {
        monthStats[key] = { upper: 0, lower: 0 };
      }
      if (data.leagueTitle === 'K4리그') {
        monthStats[key].upper++;
      } else {
        monthStats[key].lower++;
      }
    });

    console.log('\n  월별 분포:');
    Object.entries(monthStats).sort().forEach(([month, stats]) => {
      console.log(`    - ${month}: K4리그 ${stats.upper}개, k4리그 ${stats.lower}개`);
    });

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    // Firebase 연결 종료
    await admin.app().delete();
    console.log('\n✅ 확인 완료');
  }
}

checkK4Detail();