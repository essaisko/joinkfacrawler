// --- meat-turbo.js - 초고속 터보 크롤링 코드 ---

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
          if (stats.mode & parseInt('111', 8)) {
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

// 터보 브라우저 관리자 클래스
class TurboBrowserManager {
  constructor(concurrency = 5) {
    this.browsers = [];
    this.pagePool = [];
    this.concurrency = concurrency;
    this.busyPages = new Set();
    this.browserCount = Math.min(concurrency, 3); // 최대 3개 브라우저
  }

  async init() {
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
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images', // 이미지 로딩 비활성화로 속도 향상
        '--disable-javascript-harmony-shipping',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--disable-ipc-flooding-protection'
      ]
    };
    
    if (chromeConfig && chromeConfig.executablePath) {
      launchOptions.executablePath = chromeConfig.executablePath;
    }
    
    // 여러 브라우저 인스턴스 생성
    for (let i = 0; i < this.browserCount; i++) {
      const browser = await puppeteer.launch(launchOptions);
      this.browsers.push(browser);
    }
    
    // 페이지 풀 생성 (브라우저당 여러 페이지)
    const pagesPerBrowser = Math.ceil(this.concurrency / this.browserCount);
    for (const browser of this.browsers) {
      for (let i = 0; i < pagesPerBrowser; i++) {
        const page = await browser.newPage();
        
        // 성능 최적화 설정
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );
        
        // 불필요한 리소스 차단
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });
        
        this.pagePool.push(page);
      }
    }
    
    console.log(`🚀 터보 모드 초기화: ${this.browsers.length}개 브라우저, ${this.pagePool.length}개 페이지`);
  }

  async getPage() {
    // 사용 가능한 페이지 찾기
    for (const page of this.pagePool) {
      if (!this.busyPages.has(page)) {
        this.busyPages.add(page);
        return page;
      }
    }
    
    // 모든 페이지가 사용 중이면 대기 (더 빠른 폴링)
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const page of this.pagePool) {
          if (!this.busyPages.has(page)) {
            this.busyPages.add(page);
            clearInterval(checkInterval);
            resolve(page);
            return;
          }
        }
      }, 10); // 10ms로 단축
    });
  }

  releasePage(page) {
    this.busyPages.delete(page);
  }

  async close() {
    for (const browser of this.browsers) {
      await browser.close();
    }
  }
}

// 터보 크롤링 함수 - 최적화된 버전
async function fetchMatchDataTurbo(browserManager, league, ym) {
  const page = await browserManager.getPage();
  
  try {
    const refererUrl = `https://www.joinkfa.com/service/match/matchSingle.jsp?matchIdx=${league.matchIdx}&mgctype=S`;
    
    // 더 빠른 네비게이션 설정
    await page.goto(refererUrl, { 
      waitUntil: 'domcontentloaded', // networkidle2 대신 domcontentloaded 사용
      timeout: 10000 // 타임아웃 단축
    });
    
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
          
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          
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
    console.error(`[ERROR] ${league.leagueTitle} ${ym} 크롤 실패: ${err.message}`);
    return [];
  } finally {
    browserManager.releasePage(page);
  }
}

// 대량 병렬 처리로 모든 작업을 한번에 수행
async function fetchAllDataTurbo(leagues, months) {
  const browserManager = new TurboBrowserManager(8); // 동시 실행 수 증가
  
  try {
    await browserManager.init();
    
    // 모든 리그-월 조합을 생성
    const allTasks = [];
    for (const league of leagues) {
      if (!league.leagueTag || !league.regionTag || !league.year || !league.leagueTitle || !league.matchIdx) {
        console.error('[ERROR] leagues.csv에 누락된 값이 있습니다:', league);
        continue;
      }
      
      for (const month of months) {
        allTasks.push({
          league,
          month,
          ym: `${league.year}-${month}`
        });
      }
    }
    
    console.log(`🔥 터보 모드: ${allTasks.length}개 작업을 병렬 처리 시작`);
    
    // 청크 단위로 나누어 처리 (서버 부하를 고려)
    const chunkSize = 20; // 한번에 20개씩 처리
    const results = [];
    
    for (let i = 0; i < allTasks.length; i += chunkSize) {
      const chunk = allTasks.slice(i, i + chunkSize);
      const chunkStartTime = Date.now();
      
      console.log(`📦 청크 ${Math.floor(i/chunkSize) + 1}/${Math.ceil(allTasks.length/chunkSize)}: ${chunk.length}개 작업 처리 중...`);
      
      const chunkPromises = chunk.map(async (task) => {
        const monthData = await fetchMatchDataTurbo(browserManager, task.league, task.ym);
        return {
          ...task,
          data: monthData,
          success: true
        };
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`❌ 작업 실패: ${chunk[index].league.leagueTitle} ${chunk[index].ym}`);
          results.push({
            ...chunk[index],
            data: [],
            success: false,
            error: result.reason
          });
        }
      });
      
      const chunkDuration = ((Date.now() - chunkStartTime) / 1000).toFixed(1);
      console.log(`✅ 청크 완료 (${chunkDuration}초)`);
      
      // 청크 간 짧은 휴식 (서버 부하 방지)
      if (i + chunkSize < allTasks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
    
  } finally {
    await browserManager.close();
  }
}

// 결과 처리 및 저장
function processAndSaveResults(results, leagues) {
  const leagueMap = new Map();
  
  // 리그별로 결과 정리
  results.forEach(result => {
    const { league, month, ym, data, success } = result;
    const leagueKey = `${league.matchIdx}-${league.year}`;
    
    if (!leagueMap.has(leagueKey)) {
      leagueMap.set(leagueKey, {
        league,
        matches: [],
        monthResults: [],
        totalCompleted: 0,
        totalUpcoming: 0
      });
    }
    
    const leagueData = leagueMap.get(leagueKey);
    
    if (success && data.length > 0) {
      const monthFlat = data.map((match, idx) => {
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
      
      leagueData.matches.push(...monthFlat);
      leagueData.totalCompleted += mCompleted;
      leagueData.totalUpcoming += mUpcoming;
      leagueData.monthResults.push({
        month,
        total: data.length,
        completed: mCompleted,
        upcoming: mUpcoming,
        success: true
      });
    } else {
      leagueData.monthResults.push({
        month,
        total: 0,
        completed: 0,
        upcoming: 0,
        success: false
      });
    }
  });
  
  // 파일 저장 및 결과 출력
  leagueMap.forEach((leagueData, leagueKey) => {
    const { league, matches, monthResults, totalCompleted, totalUpcoming } = leagueData;
    
    console.log(`\n[${league.year}] ${league.leagueTitle} (${league.regionTag}) 결과:`);
    
    // 월별 결과 출력
    monthResults.forEach(({ month, total, completed, upcoming, success }) => {
      const colorGreen = '\x1b[32m';
      const colorCyan = '\x1b[36m';
      const colorYellow = '\x1b[33m';
      const colorReset = '\x1b[0m';
      const colorGray = '\x1b[90m';
      const colorRed = '\x1b[31m';
      
      if (success && total > 0) {
        console.log(`  - [${league.year}-${month}] ${colorGreen}✔ ${total}경기 (${colorCyan}완료: ${completed}${colorReset}, ${colorYellow}예정: ${upcoming}${colorReset})`);
      } else if (success) {
        console.log(`  - [${league.year}-${month}] ${colorGray}─ 경기 없음${colorReset}`);
      } else {
        console.log(`  - [${league.year}-${month}] ${colorRed}❌ 실패${colorReset}`);
      }
    });
    
    // 파일 저장
    const dir = path.join('results', league.leagueTag, league.regionTag);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const filename = path.join(
      dir,
      `matches_${league.year}_${safeFilename(league.leagueTitle)}.json`
    );
    
    fs.writeFileSync(filename, JSON.stringify(matches, null, 2), 'utf-8');
    
    console.log(
      `\n${league.leagueTitle} (${league.regionTag}) 저장 완료: 총 ${matches.length}경기 | 완료: ${totalCompleted}  예정: ${totalUpcoming}\n→ ${filename}`
    );
  });
}

// 유틸리티 함수들
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

function safeFilename(str) {
  return str.replace(/[\/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
}

// 메인 실행 함수
(async () => {
  const startTime = Date.now();
  
  try {
    const cliArgs = parseArgs();
    const { year: filterYear, month: filterMonth, league: filterLeague } = cliArgs;

    const csv = fs.readFileSync('leagues.csv', 'utf-8').replace(/^\uFEFF/, '');
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

    console.log(`🚀 터보 크롤링 시작: ${LEAGUE_LIST.length}개 리그, ${MONTHS.length}개월`);
    console.log(`⚡ 설정: 최대 8개 동시 작업, 20개씩 청크 처리`);
    
    const results = await fetchAllDataTurbo(LEAGUE_LIST, MONTHS);
    processAndSaveResults(results, LEAGUE_LIST);
    
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`\n🎉 터보 크롤링 완료! (총 소요시간: ${totalDuration}초)`);
    console.log(`📊 처리 속도: ${(results.length / (totalDuration / 60)).toFixed(1)} 작업/분`);
    
  } catch (error) {
    console.error('❌ 터보 크롤링 중 오류 발생:', error);
    process.exit(1);
  }
})(); 