const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Firebase 서비스 계정 키 파일 경로
// Firebase 콘솔에서 다운로드한 JSON 파일을 프로젝트 루트에 복사하고,
// 아래 'your-service-account-key.json' 부분을 실제 파일명으로 바꾸세요.
const serviceAccount = require('./firebase-adminsdk.json');

// 2. Firebase 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
  // Firestore 데이터베이스 URL이 필요하다면 여기에 추가하세요.
  // databaseURL: "https://<DATABASE_NAME>.firebaseio.com"
});

console.log('✅ Firebase Admin SDK가 성공적으로 초기화되었습니다.');

const db = admin.firestore();

// --- 앞으로 이 아래에 업로드 코드를 추가합니다. ---

// results 폴더 내의 모든 json 파일 경로를 재귀적으로 찾는 함수
function getAllJsonFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
      arrayOfFiles = getAllJsonFiles(path.join(dirPath, file), arrayOfFiles);
    } else {
      if (path.extname(file) === '.json') {
        arrayOfFiles.push(path.join(dirPath, file));
      }
    }
  });

  return arrayOfFiles;
}

async function uploadAllMatchesToFirestore() {
  try {
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
      console.log('❌ "results" 폴더를 찾을 수 없습니다. 먼저 크롤링을 실행해주세요.');
      return;
    }

    const jsonFiles = getAllJsonFiles(resultsDir);

    if (jsonFiles.length === 0) {
      console.log('🤷‍♀️ 업로드할 JSON 파일이 없습니다.');
      return;
    }

    console.log(`총 ${jsonFiles.length}개의 JSON 파일을 Firestore에 업로드합니다.`);

    for (const filePath of jsonFiles) {
      const fileName = path.relative(__dirname, filePath);
      try {
        console.log(`\n📄 처리 중: ${fileName}`);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const matches = JSON.parse(fileContent);

        if (!Array.isArray(matches) || matches.length === 0) {
          console.log(`  └ ⚠️ 파일이 비어있거나 형식이 잘못되어 건너뜁니다.`);
          continue;
        }

        const batch = db.batch();
        let validMatchCount = 0;

        matches.forEach((match) => {
          if (match && match.matchId) {
            const docRef = db.collection('matches').doc(String(match.matchId));
            batch.set(docRef, match);
            validMatchCount++;
          } else {
            console.warn(`  └ ⚠️ 경고: matchId가 없는 데이터가 있어 건너뜁니다.`, match);
          }
        });
        
        if (validMatchCount > 0) {
            await batch.commit();
            console.log(`  └ ✅ ${validMatchCount}개의 경기 데이터를 Firestore에 업로드했습니다.`);
        } else {
            console.log(`  └ 🤷‍♀️ 업로드할 유효한 데이터가 없습니다.`);
        }

      } catch (err) {
        console.error(`  └ ❌ 파일 처리 중 오류 발생 (${fileName}):`, err.message);
      }
    }

    console.log('\n\n🚀 모든 파일 업로드 작업 완료!');
  } catch (error) {
    console.error('전체 업로드 과정에서 심각한 오류가 발생했습니다:', error);
  }
}

// 업로드 함수 실행
uploadAllMatchesToFirestore(); 