// --- meat-secure.js - 보안 회피 + 성능 최적화 하이브리드 버전 ---

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

// 보안 회피 브라우저 관리자 클래스
class SecureBrowserManager {
  constructor() {
    this.requestCount = 0;
    this.maxRequestsPerBrowser = 3; // 브라우저당 최대 3개 요청 후 재시작
    this.browser = null;
    this.chromeConfig = getChromeConfig();
  }

  async getBrowser() {
    // 브라우저가 없거나 요청 한도에 도달하면 새로 생성
    if (!this.browser || this.requestCount >= this.maxRequestsPerBrowser) {
      if (this.browser) {
        await this.browser.close();
        console.log(`🔄 브라우저 재시작 (${this.requestCount}개 요청 완료)`);
      }
      
      this.browser = await this.createNewBrowser();
      this.requestCount = 0;
    }
    
    this.requestCount++;
    return this.browser;
  }

  async createNewBrowser() {
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
        // 보안 회피를 위한 추가 옵션
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-zygote',
        '--single-process',
        // 매번 다른 지문을 위한 설정
        `--user-data-dir=/tmp/chrome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      ]
    };
    
    if (this.chromeConfig && this.chromeConfig.executablePath) {
      launchOptions.executablePath = this.chromeConfig.executablePath;
    }
    
    const browser = await puppeteer.launch(launchOptions);
    
    // 브라우저 지문 우회 설정
    const pages = await browser.pages();
    if (pages.length > 0) {
      const page = pages[0];
      
      // User Agent 랜덤화
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ];
      await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
      
      // 웹드라이버 탐지 방지
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // Chrome 객체 제거
        delete window.chrome;
        
        // 플러그인 정보 위조
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });
    }
    
    return browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// 보안을 고려한 크롤링 함수
async function fetchMatchDataSecure(browserManager, league, ym) {
  let page;
  try {
    const browser = await browserManager.getBrowser();
    page = await browser.newPage();
    
    // User Agent 설정 (매번 다를 수 있음)
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ];
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // 뷰포트 랜덤화
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 }
    ];
    const viewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(viewport);
    
    const refererUrl = `https://www.joinkfa.com/service/match/matchSingle.jsp?matchIdx=${league.matchIdx}&mgctype=S`;
    
    // 페이지 로딩 (인간과 유사한 행동 패턴)
    await page.goto(refererUrl, { waitUntil: 'networkidle2', timeout: 15000 });
    
    // 랜덤 대기 시간 (100-300ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
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
    if (page) {
      await page.close();
    }
  }
}

// 보안 고려 배치 처리 (적은 수의 병렬 처리)
async function processBatchSecure(browserManager, tasks) {
  const maxConcurrency = 2; // 동시 처리 수를 낮게 설정
  const results = [];
  
  for (let i = 0; i < tasks.length; i += maxConcurrency) {
    const batch = tasks.slice(i, i + maxConcurrency);
    
    const batchPromises = batch.map(async (task) => {
      const { league, month, ym } = task;
      const monthData = await fetchMatchDataSecure(browserManager, league, ym);
      
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
          ...task,
          data: monthFlat,
          completed: mCompleted,
          upcoming: mUpcoming,
          total: monthData.length,
          success: true
        };
      }
      
      return {
        ...task,
        data: [],
        completed: 0,
        upcoming: 0,
        total: 0,
        success: true
      };
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`❌ 배치 작업 실패: ${batch[index].league.leagueTitle} ${batch[index].ym}`);
        results.push({
          ...batch[index],
          data: [],
          completed: 0,
          upcoming: 0,
          total: 0,
          success: false,
          error: result.reason
        });
      }
    });
    
    // 배치 간 휴식 시간 (보안 고려)
    if (i + maxConcurrency < tasks.length) {
      const waitTime = 1000 + Math.random() * 1000; // 1-2초 랜덤 대기
      console.log(`⏳ 서버 부하 방지를 위한 대기 중... (${(waitTime/1000).toFixed(1)}초)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  return results;
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
  const browserManager = new SecureBrowserManager();
  
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

    console.log(`🔒 보안 고려 크롤링 시작: ${LEAGUE_LIST.length}개 리그, ${MONTHS.length}개월`);
    console.log(`🛡️ 설정: 브라우저당 ${browserManager.maxRequestsPerBrowser}개 요청, 최대 2개 동시 처리`);
    
    // 리그별로 순차 처리 (보안 고려)
    for (const league of LEAGUE_LIST) {
      if (!league.leagueTag || !league.regionTag || !league.year || !league.leagueTitle || !league.matchIdx) {
        console.error('[ERROR] leagues.csv에 누락된 값이 있습니다:', league);
        continue;
      }

      console.log(`\n[${league.year}] ${league.leagueTitle} (${league.regionTag}) 크롤링 시작...`);
      
      // 월별 작업 생성
      const monthTasks = MONTHS.map(month => ({
        league,
        month,
        ym: `${league.year}-${month}`
      }));
      
      const leagueStartTime = Date.now();
      const monthResults = await processBatchSecure(browserManager, monthTasks);
      const leagueEndTime = Date.now();
      
      // 결과 정리
      let matches = [];
      let totalCompleted = 0;
      let totalUpcoming = 0;
      
      monthResults.forEach(result => {
        const { month, data, completed, upcoming, total, success } = result;
        
        matches.push(...data);
        totalCompleted += completed;
        totalUpcoming += upcoming;
        
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
      
      const leagueDuration = ((leagueEndTime - leagueStartTime) / 1000).toFixed(1);
      console.log(
        `\n${league.leagueTitle} (${league.regionTag}) 저장 완료 (${leagueDuration}초): 총 ${matches.length}경기 | 완료: ${totalCompleted}  예정: ${totalUpcoming}\n→ ${filename}`
      );
    }
    
    const endTime = Date.now();
    const totalDuration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`\n🎉 보안 고려 크롤링 완료! (총 소요시간: ${totalDuration}초)`);
    
  } catch (error) {
    console.error('❌ 크롤링 중 오류 발생:', error);
    process.exit(1);
  } finally {
    await browserManager.close();
  }
})(); 