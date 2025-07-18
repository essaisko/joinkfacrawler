const admin = require('firebase-admin');
const serviceAccount = require('./firebase-admin-sdk.json');

// Firebase 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkK4Data() {
  try {
    console.log('🔍 Firebase에서 K4 리그 데이터 확인 중...\n');

    // 1. leagueTitle 필드로 K4 리그 조회
    console.log('1. leagueTitle 필드로 K4 리그 검색:');
    const k4LeagueQuery = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .limit(50)
      .get();
    
    console.log(`  - leagueTitle="K4리그": ${k4LeagueQuery.size}개 경기 발견`);
    
    const k4LowerLeagueQuery = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .limit(50)
      .get();
    
    console.log(`  - leagueTitle="k4리그": ${k4LowerLeagueQuery.size}개 경기 발견`);

    // 2. 월별 데이터 확인
    console.log('\n2. K4리그 월별 데이터 분포:');
    const monthData = {};
    
    k4LeagueQuery.forEach(doc => {
      const data = doc.data();
      const monthKey = `${data.year}-${data.month}`;
      if (!monthData[monthKey]) {
        monthData[monthKey] = 0;
      }
      monthData[monthKey]++;
    });
    
    k4LowerLeagueQuery.forEach(doc => {
      const data = doc.data();
      const monthKey = `${data.year}-${data.month}`;
      if (!monthData[monthKey]) {
        monthData[monthKey] = 0;
      }
      monthData[monthKey]++;
    });
    
    Object.entries(monthData).sort().forEach(([month, count]) => {
      console.log(`  - ${month}: ${count}개`);
    });

    // 3. 샘플 데이터 확인
    console.log('\n3. K4 리그 샘플 데이터:');
    
    if (k4LeagueQuery.size > 0) {
      console.log('  대문자 "K4리그" 샘플:');
      const sample = k4LeagueQuery.docs[0].data();
      console.log(`    - matchId: ${sample.matchId}`);
      console.log(`    - matchIdx: ${sample.matchIdx}`);
      console.log(`    - date: ${sample.date}`);
      console.log(`    - ${sample.homeTeam} vs ${sample.awayTeam}`);
      console.log(`    - league: ${sample.league}`);
      console.log(`    - leagueTitle: ${sample.leagueTitle}`);
      console.log(`    - leagueTag: ${sample.leagueTag}`);
    }
    
    if (k4LowerLeagueQuery.size > 0) {
      console.log('\n  소문자 "k4리그" 샘플:');
      const sample = k4LowerLeagueQuery.docs[0].data();
      console.log(`    - matchId: ${sample.matchId}`);
      console.log(`    - matchIdx: ${sample.matchIdx}`);
      console.log(`    - date: ${sample.date}`);
      console.log(`    - ${sample.homeTeam} vs ${sample.awayTeam}`);
      console.log(`    - league: ${sample.league}`);
      console.log(`    - leagueTitle: ${sample.leagueTitle}`);
      console.log(`    - leagueTag: ${sample.leagueTag}`);
    }

    // 4. 전체 리그 목록 확인
    console.log('\n4. 전체 리그 목록 확인:');
    const allMatches = await db.collection('matches')
      .limit(1000)
      .get();
    
    const leagues = new Set();
    const matchIdxPatterns = new Set();
    
    allMatches.forEach(doc => {
      const data = doc.data();
      if (data.leagueTitle) {
        leagues.add(data.leagueTitle);
      }
      if (data.matchIdx && (data.matchIdx.includes('K4') || data.matchIdx.includes('k4'))) {
        matchIdxPatterns.add(data.matchIdx);
      }
    });
    
    console.log(`  - 총 ${leagues.size}개의 리그 발견:`);
    Array.from(leagues).sort().forEach(league => {
      if (league.toLowerCase().includes('k4')) {
        console.log(`    - ${league} (K4 관련)`);
      }
    });
    
    console.log(`\n  - K4 관련 matchIdx 패턴 ${matchIdxPatterns.size}개:`);
    Array.from(matchIdxPatterns).slice(0, 10).forEach(pattern => {
      console.log(`    - ${pattern}`);
    });

    // 5. 7월 데이터 직접 확인
    console.log('\n5. 7월 데이터 확인:');
    const julyQuery = await db.collection('matches')
      .where('month', '==', '07')
      .limit(200)
      .get();
    
    let k4JulyCount = 0;
    julyQuery.forEach(doc => {
      const data = doc.data();
      if (data.leagueTitle && data.leagueTitle.toLowerCase().includes('k4')) {
        k4JulyCount++;
      }
    });
    
    console.log(`  - 전체 7월 데이터 중 K4 리그: ${k4JulyCount}개`);

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    // Firebase 연결 종료
    await admin.app().delete();
    console.log('\n✅ 확인 완료');
  }
}

checkK4Data();