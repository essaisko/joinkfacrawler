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

    // 1. "K4리그"로 시작하는 matchIdx 조회
    console.log('1. "K4리그"로 시작하는 matchIdx 조회:');
    const k4UpperQuery = await db.collection('matches')
      .where('matchIdx', '>=', 'K4리그')
      .where('matchIdx', '<', 'K4리그\uf8ff')
      .get();
    
    const k4UpperMatches = {};
    k4UpperQuery.forEach(doc => {
      const data = doc.data();
      const monthKey = `${data.year}-${data.month}`;
      if (!k4UpperMatches[monthKey]) {
        k4UpperMatches[monthKey] = [];
      }
      k4UpperMatches[monthKey].push(data.matchIdx);
    });

    console.log(`  - 총 ${k4UpperQuery.size}개의 경기 발견`);
    Object.entries(k4UpperMatches).forEach(([monthKey, matchIdxList]) => {
      console.log(`  - ${monthKey}: ${matchIdxList.length}개 경기`);
      console.log(`    예시: ${matchIdxList.slice(0, 3).join(', ')}${matchIdxList.length > 3 ? '...' : ''}`);
    });

    // 2. "k4리그"로 시작하는 matchIdx 조회
    console.log('\n2. "k4리그"로 시작하는 matchIdx 조회:');
    const k4LowerQuery = await db.collection('matches')
      .where('matchIdx', '>=', 'k4리그')
      .where('matchIdx', '<', 'k4리그\uf8ff')
      .get();
    
    const k4LowerMatches = {};
    k4LowerQuery.forEach(doc => {
      const data = doc.data();
      const monthKey = `${data.year}-${data.month}`;
      if (!k4LowerMatches[monthKey]) {
        k4LowerMatches[monthKey] = [];
      }
      k4LowerMatches[monthKey].push(data.matchIdx);
    });

    console.log(`  - 총 ${k4LowerQuery.size}개의 경기 발견`);
    Object.entries(k4LowerMatches).forEach(([monthKey, matchIdxList]) => {
      console.log(`  - ${monthKey}: ${matchIdxList.length}개 경기`);
      console.log(`    예시: ${matchIdxList.slice(0, 3).join(', ')}${matchIdxList.length > 3 ? '...' : ''}`);
    });

    // 3. 7월 데이터 확인
    console.log('\n3. 7월 데이터 확인:');
    
    // K4리그 7월 데이터
    const k4Upper7Query = await db.collection('matches')
      .where('matchIdx', '>=', 'K4리그')
      .where('matchIdx', '<', 'K4리그\uf8ff')
      .where('month', '==', '07')
      .get();
    
    console.log(`  - "K4리그" 7월 데이터: ${k4Upper7Query.size}개`);
    if (k4Upper7Query.size > 0) {
      const sample = k4Upper7Query.docs[0].data();
      console.log(`    첫 번째 경기: ${sample.date} ${sample.homeTeam} vs ${sample.awayTeam}`);
    }

    // k4리그 7월 데이터
    const k4Lower7Query = await db.collection('matches')
      .where('matchIdx', '>=', 'k4리그')
      .where('matchIdx', '<', 'k4리그\uf8ff')
      .where('month', '==', '07')
      .get();
    
    console.log(`  - "k4리그" 7월 데이터: ${k4Lower7Query.size}개`);
    if (k4Lower7Query.size > 0) {
      const sample = k4Lower7Query.docs[0].data();
      console.log(`    첫 번째 경기: ${sample.date} ${sample.homeTeam} vs ${sample.awayTeam}`);
    }

    // 4. 모든 고유한 matchIdx 패턴 확인
    console.log('\n4. 고유한 matchIdx 패턴:');
    const allMatchIdxSet = new Set();
    
    k4UpperQuery.forEach(doc => {
      allMatchIdxSet.add(doc.data().matchIdx);
    });
    k4LowerQuery.forEach(doc => {
      allMatchIdxSet.add(doc.data().matchIdx);
    });

    const uniquePatterns = Array.from(allMatchIdxSet);
    console.log(`  - 총 ${uniquePatterns.length}개의 고유한 matchIdx 패턴`);
    uniquePatterns.slice(0, 10).forEach(pattern => {
      console.log(`    - ${pattern}`);
    });
    if (uniquePatterns.length > 10) {
      console.log(`    ... 외 ${uniquePatterns.length - 10}개`);
    }

    // 5. 최근 업데이트된 K4 리그 경기 확인
    console.log('\n5. 최근 업데이트된 K4 리그 경기 (상위 5개):');
    const recentK4Query = await db.collection('matches')
      .where('matchIdx', '>=', 'K4')
      .where('matchIdx', '<', 'K5')
      .orderBy('matchIdx')
      .orderBy('date', 'desc')
      .limit(5)
      .get();

    recentK4Query.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.date} ${data.homeTeam} vs ${data.awayTeam} (${data.matchIdx})`);
    });

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    // Firebase 연결 종료
    await admin.app().delete();
    console.log('\n✅ 확인 완료');
  }
}

checkK4Data();