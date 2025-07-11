// routes/csv.js - CSV 관련 라우터

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

// Firebase 업로더 의존성
let uploadCsvToFirebase, downloadCsvFromFirebase;

// 의존성 주입
function initializeCsvRoutes(firebaseUploader) {
  uploadCsvToFirebase = firebaseUploader.uploadCsvToFirebase;
  downloadCsvFromFirebase = firebaseUploader.downloadCsvFromFirebase;
}

// CSV 파일 내용을 클라이언트로 전송 (Firebase 우선)
router.get('/leagues-csv', async (req, res) => {
  try {
    console.log('📥 CSV 데이터 요청 받음');
    
    // 먼저 Firebase에서 시도
    const firebaseContent = await downloadCsvFromFirebase();
    
    if (firebaseContent) {
      console.log('✅ Firebase에서 CSV 로드 성공');
      res.type('text/plain').send(firebaseContent);
      return;
    }
    
    // Firebase에 데이터가 없으면 로컬 파일 사용
    console.log('📄 로컬 CSV 파일에서 데이터 로드 시도');
    const localPath = path.join(__dirname, '..', 'leagues.csv');
    
    try {
      await fs.access(localPath);
      const csvData = await fs.readFile(localPath, 'utf-8');
      console.log('✅ 로컬 CSV 파일 로드 성공');
      
      // 로컬 파일을 Firebase에 동기화
      console.log('🔄 로컬 CSV를 Firebase에 동기화 중...');
      await uploadCsvToFirebase(csvData);
      
      res.type('text/plain').send(csvData);
    } catch {
      console.log('⚠️ 로컬 CSV 파일도 없음, 기본 템플릿 제공');
      const defaultCsv = 'leagueTag,regionTag,year,leagueTitle,matchIdx\\n';
      res.type('text/plain').send(defaultCsv);
    }
  } catch (error) {
    console.error('❌ CSV 로드 중 오류:', error);
    res.status(500).send('Error reading leagues.csv');
  }
});

// CSV 파일 저장 (Firebase 우선, 로컬 백업)
router.post('/save-csv', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).send('Invalid CSV content');
    }
    
    console.log('💾 CSV 저장 요청 받음, 길이:', content.length);
    
    // Firebase에 저장
    console.log('🔄 CSV 데이터를 Firebase에 저장 중...');
    const firebaseSuccess = await uploadCsvToFirebase(content);
    
    if (firebaseSuccess) {
      console.log('✅ Firebase에 CSV 저장 성공');
      
      // 로컬 파일도 백업으로 저장
      try {
        const filePath = path.join(__dirname, '..', 'leagues.csv');
        await fs.writeFile(filePath, content, 'utf-8');
        console.log('✅ 로컬 백업 파일도 저장 완료');
      } catch (localError) {
        console.warn('⚠️ 로컬 백업 저장 실패:', localError.message);
      }
      
      res.status(200).send('CSV file saved successfully to Firebase.');
    } else {
      // Firebase 저장 실패시 로컬에만 저장
      console.log('⚠️ Firebase 저장 실패, 로컬에만 저장');
      const filePath = path.join(__dirname, '..', 'leagues.csv');
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('✅ 로컬 CSV 파일 저장 완료');
      
      res.status(200).send('CSV file saved locally (Firebase failed).');
    }
    
  } catch (error) {
    console.error('❌ CSV 저장 중 오류:', error);
    res.status(500).send('Error saving CSV file: ' + error.message);
  }
});

module.exports = { router, initializeCsvRoutes };