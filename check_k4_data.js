// check_k4_data.js - K4 리그 데이터 확인 스크립트
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

async function checkK4Data() {
  const db = initializeFirebase();
  
  console.log('\n=== K4 리그 데이터 확인 시작 ===\n');
  
  try {
    // 1. K4 리그 관련 모든 문서 찾기
    console.log('1. K4 리그 문서 검색 중...');
    const k4Snapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'K4 리그')
      .get();
    
    console.log(`   - K4 리그 전체 문서 수: ${k4Snapshot.size}개`);
    
    // 2. 월별 데이터 분석
    console.log('\n2. 월별 K4 리그 데이터 분석:');
    const monthlyData = {};
    const duplicates = new Map();
    
    k4Snapshot.docs.forEach(doc => {
      const data = doc.data();
      const matchDate = data.MATCH_DATE;
      
      if (matchDate) {
        const [year, month] = matchDate.split('-');
        const monthKey = `${year}-${month}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = [];
        }
        monthlyData[monthKey].push({
          id: doc.id,
          date: matchDate,
          home: data.TH_CLUB_NAME,
          away: data.TA_CLUB_NAME,
          status: data.matchStatus
        });
        
        // 중복 검사를 위한 키 생성
        const duplicateKey = `${matchDate}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
        if (!duplicates.has(duplicateKey)) {
          duplicates.set(duplicateKey, []);
        }
        duplicates.get(duplicateKey).push(doc.id);
      }
    });
    
    // 월별 통계 출력
    Object.keys(monthlyData).sort().forEach(month => {
      console.log(`   ${month}: ${monthlyData[month].length}개 경기`);
    });
    
    // 3. 7월 데이터 상세 확인
    console.log('\n3. 2025년 7월 K4 리그 데이터 상세:');
    const july2025Data = monthlyData['2025-07'] || [];
    
    if (july2025Data.length > 0) {
      console.log(`   - 총 ${july2025Data.length}개 경기\n`);
      
      // 날짜별로 정렬
      july2025Data.sort((a, b) => a.date.localeCompare(b.date));
      
      july2025Data.forEach(match => {
        console.log(`   📅 ${match.date} (${match.status})`);
        console.log(`      ${match.home} vs ${match.away}`);
        console.log(`      문서 ID: ${match.id}`);
        console.log('');
      });
    } else {
      console.log('   ❌ 2025년 7월 K4 리그 데이터가 없습니다.');
    }
    
    // 4. 중복 데이터 확인
    console.log('\n4. 중복된 K4 리그 데이터 확인:');
    let duplicateCount = 0;
    
    duplicates.forEach((docIds, key) => {
      if (docIds.length > 1) {
        duplicateCount++;
        console.log(`   ⚠️  중복 발견: ${key}`);
        console.log(`      문서 IDs: ${docIds.join(', ')}`);
      }
    });
    
    if (duplicateCount === 0) {
      console.log('   ✅ 중복된 데이터가 없습니다.');
    } else {
      console.log(`\n   총 ${duplicateCount}개의 중복 경기 발견`);
    }
    
    // 5. 최근 업데이트된 K4 리그 문서 확인
    console.log('\n5. 최근 업데이트된 K4 리그 문서 (상위 10개):');
    const recentDocs = k4Snapshot.docs
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 10);
    
    recentDocs.forEach(doc => {
      const data = doc.data();
      console.log(`   📄 ${doc.id}`);
      console.log(`      날짜: ${data.MATCH_DATE}, ${data.TH_CLUB_NAME} vs ${data.TA_CLUB_NAME}`);
    });
    
    // 6. K4 리그 연도별 통계
    console.log('\n6. K4 리그 연도별 통계:');
    const yearlyStats = {};
    
    k4Snapshot.docs.forEach(doc => {
      const data = doc.data();
      const matchDate = data.MATCH_DATE;
      
      if (matchDate) {
        const year = matchDate.split('-')[0];
        if (!yearlyStats[year]) {
          yearlyStats[year] = {
            total: 0,
            completed: 0,
            scheduled: 0
          };
        }
        yearlyStats[year].total++;
        
        if (data.matchStatus === '완료') {
          yearlyStats[year].completed++;
        } else {
          yearlyStats[year].scheduled++;
        }
      }
    });
    
    Object.keys(yearlyStats).sort().forEach(year => {
      const stats = yearlyStats[year];
      console.log(`   ${year}년: 총 ${stats.total}개 (완료: ${stats.completed}, 예정: ${stats.scheduled})`);
    });
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  }
  
  console.log('\n=== K4 리그 데이터 확인 완료 ===\n');
  process.exit(0);
}

// 스크립트 실행
checkK4Data();