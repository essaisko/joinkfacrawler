// --- meat.js 전체코드 ---

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Chrome 설정을 가져오는 함수
function getChromeConfig() {
  try {
    const configPath = path.join(__dirname, 'chrome-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`🎯 Using Chrome from config: ${config.executablePath}`);
      return config;
    }
  } catch (error) {
    console.log('⚠️ Chrome config file not found or invalid');
  }

  // 설정 파일이 없으면 Chrome을 찾아보기
  const possiblePaths = [
    path.join(__dirname, 'chrome'),
    path.join(__dirname, 'chrome-bin'),
    '/opt/render/.cache/puppeteer'
  ];

  for (const basePath of possiblePaths) {
    const chromePath = findChromeInDirectory(basePath);
    if (chromePath) {
      console.log(`🔍 Found Chrome at: ${chromePath}`);
      return { executablePath: chromePath };
    }
  }

  console.log('🌐 Using system Chrome (if available)');
  return null;
}

// 디렉토리에서 Chrome 실행 파일을 재귀적으로 찾는 함수
function findChromeInDirectory(dir) {
  if (!fs.existsSync(dir)) return null;
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const result = findChromeInDirectory(fullPath);
        if (result) return result;
      } else if (item.name === 'chrome') {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.mode & parseInt('111', 8)) { // 실행 가능한 파일인지 확인
            return fullPath;
          }
        } catch (e) {
          // 파일 접근 실패 시 무시
        }
      }
    }
  } catch (error) {
    // 디렉토리 읽기 실패 시 무시
  }
  
  return null;
}

// 인자 파싱을 위한 간단한 함수
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const match = arg.match(/^--([^=]+)=(.+)/);
    if (match) {
      args[match[1]] = match[2];
    }
  });
  return args;
}

const cliArgs = parseArgs();
const { year: filterYear, month: filterMonth, league: filterLeague } = cliArgs;

const csv = fs.readFileSync('leagues.csv', 'utf-8').replace(/^\uFEFF/, '');
console.log(csv.split('\n'));

let LEAGUE_LIST = parse(csv, {
  columns: true,
  skip_empty_lines: true
});

// 인자에 따라 리그 목록 필터링
if (filterYear) {
    LEAGUE_LIST = LEAGUE_LIST.filter(l => l.year === filterYear);
}
if (filterLeague) {
    LEAGUE_LIST = LEAGUE_LIST.filter(l => l.leagueTitle.includes(filterLeague));
}

// 인자에 따라 월 목록 필터링
const ALL_MONTHS = Array.from({ length: 10 }, (_, i) => String(i + 3).padStart(2, '0'));
const MONTHS = filterMonth ? [filterMonth.padStart(2, '0')] : ALL_MONTHS;

// 터미널 환경이 아닐 경우(웹페이지에서 실행 등) 컬러 코드 비활성화
const isTTY = process.stdout.isTTY;
const colorGreen = isTTY ? '\x1b[32m' : '';
const colorCyan = isTTY ? '\x1b[36m' : '';
const colorYellow = isTTY ? '\x1b[33m' : '';
const colorReset = isTTY ? '\x1b[0m' : '';
const colorGray = isTTY ? '\x1b[90m' : '';

function safeFilename(str) {
  return str.replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
}

async function fetchMatchData(league, ym, retryCount = 0) {
  const maxRetries = 2; // 최대 2번 재시도
  let browser, page;
  
  try {
    // Chrome 설정 가져오기
    const chromeConfig = getChromeConfig();
    
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images'
      ]
    };
    
    // Chrome 설정이 있으면 적용
    if (chromeConfig && chromeConfig.executablePath) {
      launchOptions.executablePath = chromeConfig.executablePath;
    }
    
    browser = await puppeteer.launch(launchOptions);
    
    page = await browser.newPage();
    
    // 모든 불필요한 리소스 차단 (속도 대폭 향상)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    
    const refererUrl = `https://www.joinkfa.com/service/match/matchSingle.jsp?matchIdx=${league.matchIdx}&mgctype=S`;
    
    // Render 서버 환경에 맞는 충분한 대기 시간
    const timeout = 15000 + (retryCount * 5000); // 15초, 20초, 25초
    await page.goto(refererUrl, { waitUntil: 'domcontentloaded', timeout });
    
    // 페이지 로딩 완료 후 즉시 API 호출 (대기 시간 제거)
    const apiUrl = 'https://www.joinkfa.com/portal/mat/getMatchSingleList.do';
    const payload = {
      v_CURPAGENUM: '1',
      v_MATCH_IDX: league.matchIdx,
      v_ORDERBY: '',
      v_ROWCOUNTPERPAGE: '1000',
      v_TEAMID: '',
      v_USER_ID: '',
      v_YEAR_MONTH: ym
    };
    
    const response = await page.evaluate(
      async (url, payload, referer) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Accept: 'application/json, text/javascript, */*; q=0.01',
              'Content-Type': 'application/json; charset=UTF-8',
              Origin: 'https://www.joinkfa.com',
              Referer: referer,
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload)
          });
          return await res.json();
        } catch (e) {
          return { error: e.message };
        }
      },
      apiUrl,
      payload,
      refererUrl
    );
    
    return response && response.singleList ? response.singleList : [];
    
  } catch (err) {
    console.error(`[ERROR] ${league.leagueTitle} ${ym} 크롤 실패 (시도 ${retryCount + 1}/${maxRetries + 1}): ${err.message}`);
    
    // 재시도 로직 (서버 안정성 고려)
    if (retryCount < maxRetries && (err.message.includes('timeout') || err.message.includes('Navigation'))) {
      const waitTime = (retryCount + 1) * 5; // 5초, 10초 대기
      console.log(`🔄 [RETRY] ${league.leagueTitle} ${ym} - ${retryCount + 1}번째 재시도 (${waitTime}초 대기)`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      return await fetchMatchData(league, ym, retryCount + 1);
    }
    
    return [];
  } finally {
    // 메모리 누수 방지를 위한 철저한 정리
    try {
      if (page) {
        await page.removeAllListeners();
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
    } catch (cleanupError) {
      console.warn(`⚠️ 정리 중 오류 (무시됨): ${cleanupError.message}`);
    }
  }
}

(async () => {
  console.log('🚀 안정화된 고성능 크롤링 시스템 시작!');
  console.log('✨ 개선사항: 리소스 차단, 안정적 재시도, 메모리 최적화');
  console.log('⏱️ 타임아웃: 15초 → 20초 → 25초 (Render 서버 최적화)');
  console.log('🔄 최대 3번 시도, 재시도 간격 5-10초');
  console.log('🚫 이미지/CSS/폰트 차단으로 네트워크 효율성 향상');
  console.log('🛡️ 메모리 누수 방지 및 서버 안정성 강화');
  console.log('');
  
  for (const league of LEAGUE_LIST) {
    // 방어 코드 추가
    if (!league.leagueTag || !league.regionTag || !league.year || !league.leagueTitle || !league.matchIdx) {
      console.error('[ERROR] leagues.csv에 누락된 값이 있습니다:', league);
      continue;
    }
    let matches = [];
    let completedCount = 0;
    let upcomingCount = 0;
    console.log(`\n[${league.year}] ${league.leagueTitle} (${league.regionTag}) 크롤링 시작...`);
    for (const month of MONTHS) {
      const ym = `${league.year}-${month}`;
      process.stdout.write(`  - [${ym}] 요청 중... `);
      const monthData = await fetchMatchData(league, ym);
      if (monthData.length > 0) {
        const monthFlat = monthData.map((match, idx) => {
          const isUpcoming = match.TA_SCORE_FINAL === null && match.TH_SCORE_FINAL === null;
          return {
            ...match,
            matchId: `${league.matchIdx}-${ym}-${match.NO || idx + 1}`,
            leagueTag: league.leagueTag,
            regionTag: league.regionTag,
            year: league.year,
            month,
            leagueTitle: league.leagueTitle,
            matchIdx: league.matchIdx,
            matchStatus: isUpcoming ? '예정' : '완료'
          };
        });
        const mUpcoming = monthFlat.filter((m) => m.matchStatus === '예정').length;
        const mCompleted = monthFlat.filter((m) => m.matchStatus === '완료').length;
        completedCount += mCompleted;
        upcomingCount += mUpcoming;
        matches.push(...monthFlat);
        
        console.log(
          `${colorGreen}✔ ${monthData.length}경기 (${colorCyan}완료: ${mCompleted}${colorReset}, ${colorYellow}예정: ${mUpcoming}${colorReset}) | 누적: ${colorCyan}${completedCount}${colorReset}/${colorYellow}${upcomingCount}${colorReset}`
        );
      } else {
        console.log(`${colorGray}─ 경기 없음${colorReset}`);
      }
      // 서버 안정성을 위한 충분한 대기 시간
      const baseDelay = monthData.length > 0 ? 100 : 200; // 데이터가 있으면 0.1초, 없으면 0.2초
      const randomDelay = Math.random() * 100;
      await new Promise((r) => setTimeout(r, baseDelay + randomDelay));
    }
    const dir = path.join('results', league.leagueTag, league.regionTag);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(
      dir,
      `matches_${league.year}_${safeFilename(league.leagueTitle)}.json`
    );
    fs.writeFileSync(filename, JSON.stringify(matches, null, 2), 'utf-8');
    console.log(
      `\n${league.leagueTitle} (${league.regionTag}) 저장 완료: 총 ${matches.length}경기 | 완료: ${completedCount}  예정: ${upcomingCount}\n→ ${filename}`
    );
  }
  console.log('\n🚀 모든 리그 크롤링 완료!');
})();
