// --- meat-optimized.js - 최적화된 크롤링 코드 ---

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Chrome 설정을 가져오는 함수 (기존과 동일)
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

// 브라우저 관리자 클래스
class BrowserManager {
  constructor(concurrency = 3) {
    this.browser = null;
    this.pagePool = [];
    this.concurrency = concurrency;
    this.busyPages = new Set();
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
        '--disable-features=VizDisplayCompositor'
      ]
    };
    
    if (chromeConfig && chromeConfig.executablePath) {
      launchOptions.executablePath = chromeConfig.executablePath;
    }
    
    this.browser = await puppeteer.launch(launchOptions);
    
    // 페이지 풀 생성
    for (let i = 0; i < this.concurrency; i++) {
      const page = await this.browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );
      this.pagePool.push(page);
    }
  }

  async getPage() {
    // 사용 가능한 페이지 찾기
    for (const page of this.pagePool) {
      if (!this.busyPages.has(page)) {
        this.busyPages.add(page);
        return page;
      }
    }
    
    // 모든 페이지가 사용 중이면 대기
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
      }, 50);
    });
  }

  releasePage(page) {
    this.busyPages.delete(page);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// 개선된 크롤링 함수 - 페이지 재사용
async function fetchMatchDataOptimized(browserManager, league, ym) {
  const page = await browserManager.getPage();
  
  try {
    const refererUrl = `https://www.joinkfa.com/service/match/matchSingle.jsp?matchIdx=${league.matchIdx}&mgctype=S`;
    await page.goto(refererUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    
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
    console.error(`[ERROR] ${league.leagueTitle} ${ym} 크롤 실패: ${err.message}`);
    return [];
  } finally {
    browserManager.releasePage(page);
  }
}

// 병렬 처리로 월별 데이터 수집
async function fetchLeagueDataParallel(browserManager, league, months) {
  const tasks = months.map(async (month) => {
    const ym = `${league.year}-${month}`;
    const monthData = await fetchMatchDataOptimized(browserManager, league, ym);
    
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
      
      return {
        month,
        data: monthFlat,
        completed: mCompleted,
        upcoming: mUpcoming,
        total: monthData.length
      };
    }
    
    return {
      month,
      data: [],
      completed: 0,
      upcoming: 0,
      total: 0
    };
  });

  return await Promise.allSettled(tasks);
}

// 여러 리그를 병렬로 처리
async function processLeaguesParallel(leagues, months, maxConcurrency = 2) {
  const semaphore = new Array(maxConcurrency).fill(null);
  let currentIndex = 0;
  
  const processLeague = async () => {
    while (currentIndex < leagues.length) {
      const leagueIndex = currentIndex++;
      const league = leagues[leagueIndex];
      
      if (!league.leagueTag || !league.regionTag || !league.year || !league.leagueTitle || !league.matchIdx) {
        console.error('[ERROR] leagues.csv에 누락된 값이 있습니다:', league);
        continue;
      }

      const browserManager = new BrowserManager(3);
      
      try {
        await browserManager.init();
        console.log(`\n[${league.year}] ${league.leagueTitle} (${league.regionTag}) 크롤링 시작...`);
        
        const startTime = Date.now();
        const results = await fetchLeagueDataParallel(browserManager, league, months);
        const endTime = Date.now();
        
        let matches = [];
        let totalCompleted = 0;
        let totalUpcoming = 0;
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const { month, data, completed, upcoming, total } = result.value;
            matches.push(...data);
            totalCompleted += completed;
            totalUpcoming += upcoming;
            
            const colorGreen = '\x1b[32m';
            const colorCyan = '\x1b[36m';
            const colorYellow = '\x1b[33m';
            const colorReset = '\x1b[0m';
            const colorGray = '\x1b[90m';
            
            if (total > 0) {
              console.log(`  - [${league.year}-${month}] ${colorGreen}✔ ${total}경기 (${colorCyan}완료: ${completed}${colorReset}, ${colorYellow}예정: ${upcoming}${colorReset})`);
            } else {
              console.log(`  - [${league.year}-${month}] ${colorGray}─ 경기 없음${colorReset}`);
            }
          } else {
            console.error(`  - [${league.year}-${months[index]}] ❌ 실패: ${result.reason}`);
          }
        });
        
        // 결과 저장
        const dir = path.join('results', league.leagueTag, league.regionTag);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const filename = path.join(
          dir,
          `matches_${league.year}_${safeFilename(league.leagueTitle)}.json`
        );
        
        fs.writeFileSync(filename, JSON.stringify(matches, null, 2), 'utf-8');
        
        const duration = ((endTime - startTime) / 1000).toFixed(1);
        console.log(
          `\n${league.leagueTitle} (${league.regionTag}) 저장 완료 (${duration}초): 총 ${matches.length}경기 | 완료: ${totalCompleted}  예정: ${totalUpcoming}\n→ ${filename}`
        );
        
      } catch (error) {
        console.error(`[ERROR] ${league.leagueTitle} 처리 실패:`, error.message);
      } finally {
        await browserManager.close();
      }
    }
  };

  // 병렬로 리그 처리
  const workers = semaphore.map(() => processLeague());
  await Promise.all(workers);
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

    console.log(`🚀 최적화된 크롤링 시작: ${LEAGUE_LIST.length}개 리그, ${MONTHS.length}개월`);
    console.log(`📊 설정: 리그당 동시 페이지 3개, 리그 병렬 처리 2개`);
    
    await processLeaguesParallel(LEAGUE_LIST, MONTHS, 2);
    
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`\n🎉 모든 리그 크롤링 완료! (총 소요시간: ${totalDuration}초)`);
    
  } catch (error) {
    console.error('❌ 크롤링 중 오류 발생:', error);
    process.exit(1);
  }
})(); 