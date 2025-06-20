// --- meat.js 전체코드 ---

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync'); // ← 이 줄로 고쳐야 함

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

async function fetchMatchData(league, ym) {
  let browser, page;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
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
    if (browser) await browser.close();
  }
}

(async () => {
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
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
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
