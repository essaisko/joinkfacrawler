// fix_k4_complete.js - K4/k4 리그 데이터 완전 통합 스크립트

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Firebase 초기화
let db;
try {
  const serviceAccount = JSON.parse(fs.readFileSync('./firebase-admin-sdk.json', 'utf8'));
  
  initializeApp({
    credential: require('firebase-admin').credential.cert(serviceAccount)
  });
  
  db = getFirestore();
  console.log('✅ Firebase Admin SDK가 성공적으로 초기화되었습니다.');
} catch (error) {
  console.error('Firebase 초기화 실패:', error);
  process.exit(1);
}

async function fixK4Complete() {
  console.log('🔄 K4/k4 리그 데이터 완전 통합 시작...\n');

  try {
    // 1. 모든 K4 관련 데이터 조회
    console.log('📊 K4 리그 관련 모든 데이터 조회 중...');
    
    // 대문자 K4리그
    const upperCaseSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .get();
    
    // 소문자 k4리그
    const lowerCaseSnapshot = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .get();
    
    console.log(`- 대문자 "K4리그": ${upperCaseSnapshot.size}개 문서`);
    console.log(`- 소문자 "k4리그": ${lowerCaseSnapshot.size}개 문서`);
    
    // 2. 모든 경기를 날짜별로 그룹화하여 중복 확인
    const matchesByKey = new Map();
    
    // 대문자 K4리그 데이터 처리
    upperCaseSnapshot.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      
      if (!matchesByKey.has(key)) {
        matchesByKey.set(key, {
          docId: doc.id,
          data: data,
          source: 'K4리그',
          hasScore: (data.TH_SCORE_FINAL !== null && data.TH_SCORE_FINAL !== undefined && data.TH_SCORE_FINAL !== '')
        });
      } else {
        // 중복인 경우, 점수가 있는 데이터 우선
        const existing = matchesByKey.get(key);
        const newHasScore = (data.TH_SCORE_FINAL !== null && data.TH_SCORE_FINAL !== undefined && data.TH_SCORE_FINAL !== '');
        
        if (newHasScore && !existing.hasScore) {
          matchesByKey.set(key, {
            docId: doc.id,
            data: data,
            source: 'K4리그',
            hasScore: newHasScore
          });
        }
      }
    });
    
    // 소문자 k4리그 데이터 처리
    lowerCaseSnapshot.forEach(doc => {
      const data = doc.data();
      const key = `${data.MATCH_DATE}_${data.TH_CLUB_NAME}_${data.TA_CLUB_NAME}`;
      
      // 소문자 데이터는 대문자로 변환
      data.leagueTitle = 'K4리그';
      data.leagueTag = 'k4';
      
      if (!matchesByKey.has(key)) {
        matchesByKey.set(key, {
          docId: doc.id,
          data: data,
          source: 'k4리그',
          hasScore: (data.TH_SCORE_FINAL !== null && data.TH_SCORE_FINAL !== undefined && data.TH_SCORE_FINAL !== '')
        });
      } else {
        // 중복인 경우, 점수가 있는 데이터 우선
        const existing = matchesByKey.get(key);
        const newHasScore = (data.TH_SCORE_FINAL !== null && data.TH_SCORE_FINAL !== undefined && data.TH_SCORE_FINAL !== '');
        
        if (newHasScore && !existing.hasScore) {
          matchesByKey.set(key, {
            docId: doc.id,
            data: data,
            source: 'k4리그',
            hasScore: newHasScore
          });
        } else if (!existing.hasScore && !newHasScore) {
          // 둘 다 점수가 없으면 더 많은 정보를 가진 것 선택
          const existingFields = Object.keys(existing.data).filter(k => existing.data[k] !== null && existing.data[k] !== '').length;
          const newFields = Object.keys(data).filter(k => data[k] !== null && data[k] !== '').length;
          
          if (newFields > existingFields) {
            matchesByKey.set(key, {
              docId: doc.id,
              data: data,
              source: 'k4리그',
              hasScore: newHasScore
            });
          }
        }
      }
    });
    
    console.log(`\n📋 중복 제거 후: ${matchesByKey.size}개의 고유 경기`);
    
    // 3. 삭제할 문서 식별
    const docsToDelete = [];
    const docsToUpdate = [];
    const keepDocs = new Set();
    
    matchesByKey.forEach(match => {
      keepDocs.add(match.docId);
      if (match.source === 'k4리그') {
        docsToUpdate.push(match.docId);
      }
    });
    
    // 삭제 대상 문서 찾기
    upperCaseSnapshot.forEach(doc => {
      if (!keepDocs.has(doc.id)) {
        docsToDelete.push({ id: doc.id, title: 'K4리그' });
      }
    });
    
    lowerCaseSnapshot.forEach(doc => {
      if (!keepDocs.has(doc.id)) {
        docsToDelete.push({ id: doc.id, title: 'k4리그' });
      }
    });
    
    console.log(`\n🗑️ 삭제 예정: ${docsToDelete.length}개 문서`);
    console.log(`✏️ 업데이트 예정: ${docsToUpdate.length}개 문서 (k4리그 → K4리그)`);
    
    // 4. 통계 출력
    let scoreCount = 0;
    let noScoreCount = 0;
    matchesByKey.forEach(match => {
      if (match.hasScore) scoreCount++;
      else noScoreCount++;
    });
    
    console.log(`\n📊 경기 통계:`);
    console.log(`- 점수가 있는 경기: ${scoreCount}개`);
    console.log(`- 점수가 없는 경기: ${noScoreCount}개`);
    
    // 5. 백업 생성
    console.log('\n💾 백업 생성 중...');
    const backup = {
      timestamp: new Date().toISOString(),
      uppercase: [],
      lowercase: [],
      finalData: Array.from(matchesByKey.values())
    };
    
    upperCaseSnapshot.forEach(doc => {
      backup.uppercase.push({ id: doc.id, data: doc.data() });
    });
    
    lowerCaseSnapshot.forEach(doc => {
      backup.lowercase.push({ id: doc.id, data: doc.data() });
    });
    
    const backupPath = `k4_complete_backup_${Date.now()}.json`;
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`✅ 백업 저장: ${backupPath}`);
    
    // 6. 실제 작업 수행
    if (docsToDelete.length > 0 || docsToUpdate.length > 0) {
      console.log('\n🚀 데이터베이스 업데이트 시작...');
      
      const batch = db.batch();
      
      // 업데이트 작업
      for (const docId of docsToUpdate) {
        const docRef = db.collection('matches').doc(docId);
        batch.update(docRef, { 
          leagueTitle: 'K4리그',
          leagueTag: 'k4'
        });
      }
      
      // 삭제 작업
      for (const doc of docsToDelete) {
        const docRef = db.collection('matches').doc(doc.id);
        batch.delete(docRef);
      }
      
      await batch.commit();
      
      console.log(`\n✅ 작업 완료!`);
      console.log(`- ${docsToUpdate.length}개 문서 업데이트`);
      console.log(`- ${docsToDelete.length}개 중복 문서 삭제`);
    } else {
      console.log('\n✅ 이미 데이터가 정리되어 있습니다.');
    }
    
    // 7. 최종 확인
    const finalCheck = await db.collection('matches')
      .where('leagueTitle', '==', 'K4리그')
      .get();
    
    const k4Check = await db.collection('matches')
      .where('leagueTitle', '==', 'k4리그')
      .get();
    
    console.log(`\n🎉 최종 결과:`);
    console.log(`- K4리그: ${finalCheck.size}개`);
    console.log(`- k4리그: ${k4Check.size}개 (0이어야 함)`);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
fixK4Complete();