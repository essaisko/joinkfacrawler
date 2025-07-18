/**
 * K-League Dashboard JavaScript
 * 리팩토링된 모듈화 스크립트
 */

const Dashboard = {
    // === 전역 상태 관리 ===
    state: {
        allStandings: [],
        allMatches: [],
        regions: [],
        leagues: [],
        allLeaguesByCategory: {},
        allTeams: [],
        filteredTeams: [],
        upcomingLeagueFilter: '',
        rawUpcomingMatches: [],
        isFullscreen: false,
        matchRegionFilter: null,
        matchLeagueFilter: null
    },

    // === API 관련 함수들 ===
    api: {
        async loadNewsFeed() {
            try {
                const response = await fetch('/api/newsfeed');
                if (!response.ok) throw new Error(`newsfeed API error: ${response.status}`);
                
                const data = await response.json();
                console.log('API 응답 데이터:', data);
                
                if (data.stats) {
                    Dashboard.ui.updateStatCard('totalMatchesStat', data.stats.totalMatches, '⚽', 'primary');
                    Dashboard.ui.updateStatCard('completedMatchesStat', data.stats.completedMatches, '✅', 'success');
                    Dashboard.ui.updateStatCard('activeLeaguesStat', data.stats.activeLeagues, '🏆', 'warning');
                    Dashboard.ui.updateStatCard('activeTeamsStat', data.stats.activeTeams, '👥', 'info');
                }
                
                Dashboard.ui.displayEnhancedNewsFeed(data);
                
            } catch (error) {
                console.error('뉴스 피드 로드 실패:', error);
                try {
                    console.log('🔄 /api/matches 로 폴백 시도...');
                    const resp2 = await fetch('/api/matches');
                    if (!resp2.ok) throw new Error(`matches API error: ${resp2.status}`);
                    
                    const matchesData = await resp2.json();
                    const now = new Date();
                    const rangeEnd = new Date(now);
                    rangeEnd.setDate(now.getDate() + 28);
                    
                    const upcomingMatches = matchesData.filter(m => {
                        const dateStr = m.MATCH_DATE || m.matchDate || m.date || m.DATE;
                        if (!dateStr) return false;
                        const d = new Date(dateStr);
                        return d >= now && d <= rangeEnd;
                    });
                    
                    Dashboard.ui.displayEnhancedNewsFeed({ upcomingMatches });
                } catch (fallbackErr) {
                    console.error('폴백 로드 실패:', fallbackErr);
                    Dashboard.ui.showErrorMessage('upcomingMatchesSection', '데이터 로딩 실패');
                }
            }
        },

        async loadGroupedMatches() {
            try {
                const response = await fetch('/api/matches/grouped');
                if (!response.ok) throw new Error(`grouped matches API error: ${response.status}`);
                
                const data = await response.json();
                console.log('그룹화된 경기 데이터:', data);
                
                // 통계 업데이트
                if (data.stats) {
                    Dashboard.ui.updateStatCard('totalMatchesStat', data.stats.totalMatches, '⚽', 'primary');
                    Dashboard.ui.updateStatCard('upcomingMatchesStat', data.stats.upcomingMatches, '📅', 'info');
                    Dashboard.ui.updateStatCard('pastMatchesStat', data.stats.pastMatches, '📊', 'secondary');
                    Dashboard.ui.updateStatCard('activeLeaguesStat', data.stats.activeLeagues, '🏆', 'warning');
                }
                
                // 월별/날짜별 경기 데이터 표시
                Dashboard.ui.displayGroupedMatches(data);
                
                return data;
            } catch (error) {
                console.error('그룹화된 경기 데이터 로드 실패:', error);
                Dashboard.ui.showErrorMessage('upcomingMatchesSection', '그룹화된 경기 데이터 로딩 실패');
                throw error;
            }
        },

        async loadStandings() {
            const container = document.getElementById('standingsContainer');
            container.innerHTML = Dashboard.ui.getLoadingSpinner('순위표를 불러오는 중...');

            try {
                const response = await fetch('/api/standings');
                Dashboard.state.allStandings = await response.json();
                Dashboard.ui.displayStandings(Dashboard.state.allStandings);
            } catch (error) {
                console.error('순위표 로드 실패:', error);
                container.innerHTML = Dashboard.ui.getErrorState('순위표를 불러올 수 없습니다');
            }
        },


        async loadRegions() {
            try {
                const response = await fetch('/api/regions');
                Dashboard.state.regions = await response.json();
                Dashboard.ui.updateRegionFilterButtons();
            } catch (error) {
                console.error('지역 목록 로드 실패:', error);
            }
        },

        async loadTeams() {
            try {
                const response = await fetch('/api/teams');
                const teams = await response.json();
                Dashboard.state.allTeams = Dashboard.utils.sortTeams(teams);
                Dashboard.state.filteredTeams = [...Dashboard.state.allTeams];
                Dashboard.ui.updateTeamFilterButtons();
            } catch (error) {
                console.error('팀 목록 로드 실패:', error);
            }
        },

        async loadAnalytics() {
            try {
                const response = await fetch('/api/analytics');
                const analytics = await response.json();
                Dashboard.ui.updateAnalyticsDisplay(analytics);
            } catch (error) {
                console.error('통계 분석 로드 실패:', error);
                Dashboard.ui.showAnalyticsError();
            }
        },

        async loadStats() {
            try {
                const response = await fetch('/api/matches/stats');
                const stats = await response.json();
                document.getElementById('totalMatches').textContent = stats.total;
                document.getElementById('completedMatches').textContent = stats.completed;
            } catch (error) {
                console.error('데이터 통계 로드 실패:', error);
            }
        },

        async loadGitInfo() {
            try {
                const response = await fetch('/git-info');
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('gitCommitHashDashboard').textContent = data.commit.shortHash;
                    document.getElementById('gitCommitDateDashboard').textContent = data.commit.date;
                    document.getElementById('gitCommitMessageDashboard').textContent = data.commit.message;
                    document.getElementById('gitCommitHashDashboard').title = `전체 해시: ${data.commit.fullHash}`;
                } else {
                    Dashboard.ui.showGitError(data.error);
                }
            } catch (error) {
                Dashboard.ui.showGitError('서버 연결에 실패했습니다.');
            }
        }
    },    // === UI 관련 함수들 ===
    ui: {
        updateStatCard(elementId, value, icon, color) {
            const element = document.getElementById(elementId);
            if (element) {
                element.innerHTML = `
                    <div class="stat-card-enhanced">
                        <span class="stat-icon text-${color}">${icon}</span>
                        <span class="stat-value">${value}</span>
                    </div>
                `;
            }
        },

        displayEnhancedNewsFeed(data) {
            let upcomingMatches = data.upcomingMatches || data.matches || data.upcoming || [];
            if (!Array.isArray(upcomingMatches)) {
                console.warn('upcomingMatches가 배열이 아닙니다:', upcomingMatches);
                upcomingMatches = [];
            }
            
            Dashboard.state.rawUpcomingMatches = upcomingMatches;
            Dashboard.ui.displayUpcomingMatchesEnhanced(upcomingMatches);
            Dashboard.ui.renderUpcomingLeagueToggle(upcomingMatches);
        },

        displayGroupedMatches(data) {
            const container = document.getElementById('upcomingMatchesSection');
            if (!container) return;
            
            const { byMonth, upcoming, past } = data;
            
            // 월별 필터 버튼 생성 (1월부터 12월까지 오름차순)
            const monthKeys = Object.keys(byMonth).sort();
            const monthButtons = monthKeys.map(month => {
                const [year, monthNum] = month.split('-');
                const monthName = new Date(year, monthNum - 1).toLocaleDateString('ko-KR', { month: 'short' });
                return `<button class="btn btn-outline-primary btn-sm me-1 mb-1 month-filter-btn" data-month="${month}">${monthName} (${byMonth[month].length})</button>`;
            }).join('');
            
            // 리그 필터 버튼 생성 (K1부터 K7까지 내림차순)
            const leagues = [...new Set(upcoming.concat(past).map(m => m.leagueTitle).filter(Boolean))];
            const sortedLeagues = this.sortLeagues(leagues);
            const leagueButtons = sortedLeagues.map(league => 
                `<button class="btn btn-outline-secondary btn-sm me-1 mb-1 league-filter-btn" data-league="${league}">${league}</button>`
            ).join('');
            
            container.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h6>📅 경기 일정 관리</h6>
                        
                        <!-- 팀 검색 필드 및 새로고침 버튼 -->
                        <div class="row mt-2">
                            <div class="col-md-6">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text">🔍</span>
                                    <input type="text" id="teamSearchInput" class="form-control" placeholder="팀명으로 검색...">
                                    <button class="btn btn-outline-secondary" type="button" id="clearTeamSearch">초기화</button>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="d-flex gap-2 justify-content-end align-items-center">
                                    <small class="text-muted">
                                        <span id="schedulerStatus">자동 업데이트: 확인 중...</span>
                                    </small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 월별 필터 -->
                        <div class="mt-3">
                            <h6 class="mb-2">📅 월별 필터</h6>
                            <div class="filter-buttons">
                                <button class="btn btn-primary btn-sm me-1 mb-1 month-filter-btn active" data-month="">전체</button>
                                ${monthButtons}
                            </div>
                        </div>
                        
                        <!-- 리그 필터 -->
                        <div class="mt-3">
                            <h6 class="mb-2">🏆 리그 필터</h6>
                            <div class="filter-buttons">
                                <button class="btn btn-secondary btn-sm me-1 mb-1 league-filter-btn active" data-league="">전체</button>
                                ${leagueButtons}
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div id="matchesDisplay">
                            ${this.renderMatchesTable(upcoming.concat(past))}
                        </div>
                    </div>
                </div>
            `;
            
            // 필터 이벤트 리스너
            this.attachGroupedMatchesFilters(data);
        },

        getLeagueOptions(matches) {
            const leagues = [...new Set(matches.map(m => m.leagueTitle).filter(Boolean))];
            return leagues.map(league => `<option value="${league}">${league}</option>`).join('');
        },

        renderMatchesTable(matches) {
            if (!matches || matches.length === 0) {
                return `<div class="alert alert-info m-3">표시할 경기가 없습니다.</div>`;
            }
            
            // 날짜별 그룹화
            const groupedByDate = {};
            matches.forEach(match => {
                const date = match.MATCH_DATE;
                if (!groupedByDate[date]) {
                    groupedByDate[date] = [];
                }
                groupedByDate[date].push(match);
            });
            
            const sortedDates = Object.keys(groupedByDate).sort();
            
            return `
                <div class="table-responsive" style="max-height: 70vh; overflow-y: auto;">
                    <table class="table table-sm mb-0">
                        <thead class="table-dark sticky-top">
                            <tr>
                                <th style="min-width: 120px;">날짜</th>
                                <th style="min-width: 60px;">시간</th>
                                <th style="min-width: 150px;">홈팀</th>
                                <th style="min-width: 80px;">결과</th>
                                <th style="min-width: 150px;">원정팀</th>
                                <th style="min-width: 120px;">경기장</th>
                                <th style="min-width: 100px;">리그</th>
                                <th style="min-width: 60px;">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedDates.map(date => this.renderDateRows(date, groupedByDate[date])).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        },

        renderDateRows(date, dateMatches) {
            const formattedDate = new Date(date).toLocaleDateString('ko-KR', { 
                month: 'short', 
                day: 'numeric',
                weekday: 'short'
            });
            
            return dateMatches.map((match, index) => {
                const homeTeamRaw = match.HOME_TEAM_NAME || match.TH_CLUB_NAME || '홈팀';
                const awayTeamRaw = match.AWAY_TEAM_NAME || match.TA_CLUB_NAME || '원정팀';
                const stadium = this.shortenStadiumName(match.STADIUM || '미정');
                const time = Dashboard.utils.formatMatchTime(
                    match.MATCH_TIME, 
                    match.MATCH_TIME_FORMATTED, 
                    match.TIME, 
                    match.time,
                    match.formattedTime,
                    match.경기시간,
                    match.match_time
                );
                const league = this.shortenLeagueName(match.leagueTitle || '미정');
                const status = match.matchStatus || match.MATCH_STATUS || '예정';
                
                const leagueRank = Dashboard.utils.getLeagueRank(match.leagueTitle || '');
                const leagueClass = Dashboard.utils.getLeagueClass(match.leagueTitle || '');
                
                // 팀명 처리 함수
                const buildTeamHtml = (raw, leagueRank) => {
                    if (leagueRank >= 5 && leagueRank <= 7) {
                        const parsed = Dashboard.utils.parseTeam(raw);
                        const regionText = parsed.major ? `${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}` : '';
                        const teamName = parsed.teamName || raw;
                        const shortenedTeamName = this.shortenTeamName(teamName);
                        const regionLabel = regionText ? `<span class="region-label">${regionText}</span> ` : '';
                        const teamLink = `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${shortenedTeamName}</a>`;
                        return `${regionLabel}${teamLink}`;
                    } else {
                        const shortenedTeamName = this.shortenTeamName(raw);
                        return `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${shortenedTeamName}</a>`;
                    }
                };
                
                const homeTeam = buildTeamHtml(homeTeamRaw, leagueRank);
                const awayTeam = buildTeamHtml(awayTeamRaw, leagueRank);
                
                // leagueClass는 이미 위에서 정의됨
                
                const isCompleted = status === '완료';
                const homeScore = isCompleted ? (match.TH_SCORE_FINAL || '0') : '';
                const awayScore = isCompleted ? (match.TA_SCORE_FINAL || '0') : '';
                
                const resultDisplay = isCompleted ? 
                    `<span class="completed-score">${homeScore} - ${awayScore}</span>` : 
                    '<span class="text-muted">vs</span>';
                const rowClass = isCompleted ? 'completed-match-row' : '';
                
                const statusBadge = isCompleted ? 
                    '<span class="badge bg-secondary">완료</span>' : 
                    '<span class="badge bg-primary">예정</span>';
                
                return `
                    <tr class="match-row ${rowClass}" data-date="${date}">
                        <td>${index === 0 ? formattedDate : ''}</td>
                        <td class="text-muted">${time}</td>
                        <td class="fw-bold" title="${homeTeamRaw}">${homeTeam}</td>
                        <td class="text-center">${resultDisplay}</td>
                        <td class="fw-bold" title="${awayTeamRaw}">${awayTeam}</td>
                        <td class="text-muted" title="${match.STADIUM || '미정'}">${stadium}</td>
                        <td><span class="league-badge ${leagueClass}" title="${match.leagueTitle || '미정'}">${league}</span></td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        },

        shortenTeamName(teamName) {
            if (!teamName) return '';
            
            // 팀명 줄임 규칙
            const shortcuts = {
                '울산 현대': '울산',
                '포항 스틸러스': '포항',
                '대구 FC': '대구',
                '수원 삼성': '수원삼성',
                '수원 FC': '수원FC',
                '서울 이랜드': '서울이랜드',
                '부천 FC': '부천',
                '김포 FC': '김포',
                '안산 그리너스': '안산',
                '천안 시티': '천안',
                '전남 드래곤즈': '전남',
                '경남 FC': '경남',
                '충남 아산': '충남아산',
                '부산 아이파크': '부산',
                '제주 유나이티드': '제주',
                '강원 FC': '강원',
                '전북 현대': '전북',
                '광주 FC': '광주',
                '대전 하나': '대전',
                '인천 유나이티드': '인천'
            };
            
            // 정확한 매칭 우선
            if (shortcuts[teamName]) {
                return shortcuts[teamName];
            }
            
            // 부분 매칭
            for (const [full, short] of Object.entries(shortcuts)) {
                if (teamName.includes(full)) {
                    return short;
                }
            }
            
            // 기본 줄임 규칙: 15자 이상이면 줄임
            if (teamName.length > 15) {
                return teamName.substring(0, 12) + '...';
            }
            
            return teamName;
        },

        shortenStadiumName(stadium) {
            if (!stadium) return '';
            
            // 경기장명 줄임 규칙
            const shortcuts = {
                '울산문수월드컵경기장': '문수경기장',
                '포항스틸야드': '스틸야드',
                '대구FC파크': 'DGB파크',
                '수원월드컵경기장': '수원WC',
                '서울월드컵경기장': '서울WC',
                '잠실종합운동장': '잠실',
                '고양종합운동장': '고양',
                '김포FC경기장': '김포',
                '안산와스타디움': '안산',
                '천안종합운동장': '천안',
                '광양전용구장': '광양',
                '창원축구센터': '창원',
                '이천종합운동장': '이천',
                '부산아시아드경기장': '부산아시아드',
                '제주월드컵경기장': '제주WC',
                '춘천송암스포츠타운': '춘천',
                '전주월드컵경기장': '전주WC',
                '광주월드컵경기장': '광주WC',
                '대전월드컵경기장': '대전WC',
                '인천축구전용경기장': '인천전용'
            };
            
            // 정확한 매칭 우선
            if (shortcuts[stadium]) {
                return shortcuts[stadium];
            }
            
            // 부분 매칭
            for (const [full, short] of Object.entries(shortcuts)) {
                if (stadium.includes(full)) {
                    return short;
                }
            }
            
            // 기본 줄임 규칙
            if (stadium.length > 12) {
                return stadium.substring(0, 10) + '...';
            }
            
            return stadium;
        },

        shortenLeagueName(league) {
            if (!league) return '';
            
            // K5-K7 리그는 simplifyLeagueName 함수 사용
            if (league.includes('K5') || league.includes('K6') || league.includes('K7')) {
                return Dashboard.utils.simplifyLeagueName(league);
            }
            
            const shortcuts = {
                'K리그1': 'K1',
                'K리그2': 'K2',
                'K리그3': 'K3',
                'K3리그': 'K3',
                'K4리그': 'K4',
                'FA컵': 'FA컵',
                'AFC 챔피언스리그': 'AFC CL',
                'AFC컵': 'AFC컵'
            };
            
            if (shortcuts[league]) {
                return shortcuts[league];
            }
            
            // K7 리그는 지역명까지 표시하므로 길이 제한을 늘림
            if (league.includes('K7')) {
                return league.length > 15 ? league.substring(0, 12) + '...' : league;
            }
            
            if (league.length > 10) {
                return league.substring(0, 8) + '...';
            }
            
            return league;
        },

        sortLeagues(leagues) {
            // 리그 우선순위 정의 (K1부터 K7까지 내림차순)
            const leaguePriority = {
                'K리그1': 1,
                'K리그2': 2,
                'K리그3': 3,
                'K3리그': 3,
                'K4리그': 4,
                'K5리그': 5,
                'K6리그': 6,
                'K7리그': 7,
                'FA컵': 8,
                'AFC 챔피언스리그': 9,
                'AFC컵': 10
            };
            
            return leagues.sort((a, b) => {
                const priorityA = leaguePriority[a] || 999;
                const priorityB = leaguePriority[b] || 999;
                
                if (priorityA !== priorityB) {
                    return priorityA - priorityB; // 낮은 숫자가 우선순위 높음
                }
                
                return a.localeCompare(b); // 우선순위가 같으면 알파벳순
            });
        },

        renderMatchCard(match) {
            const homeTeamRaw = match.HOME_TEAM_NAME || match.TH_CLUB_NAME || '홈팀';
            const awayTeamRaw = match.AWAY_TEAM_NAME || match.TA_CLUB_NAME || '원정팀';
            const stadium = match.STADIUM || '미정';
            const time = Dashboard.utils.formatMatchTime(
                match.MATCH_TIME, 
                match.MATCH_TIME_FORMATTED, 
                match.TIME, 
                match.time,
                match.formattedTime,
                match.경기시간,
                match.match_time
            );
            const league = match.leagueTitle || '미정';
            const status = match.matchStatus || match.MATCH_STATUS || '예정';
            
            const leagueRank = Dashboard.utils.getLeagueRank(league);
            const leagueClass = Dashboard.utils.getLeagueClass(league);
            
            // 팀명 처리 함수
            const buildTeamHtml = (raw, leagueRank) => {
                if (leagueRank >= 5 && leagueRank <= 7) {
                    const parsed = Dashboard.utils.parseTeam(raw);
                    const regionText = parsed.major ? `${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}` : '';
                    const teamName = parsed.teamName || raw;
                    const regionLabel = regionText ? `<span class="region-label">${regionText}</span> ` : '';
                    const teamLink = `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${teamName}</a>`;
                    return `${regionLabel}${teamLink}`;
                } else {
                    return `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${raw}</a>`;
                }
            };
            
            const homeTeam = buildTeamHtml(homeTeamRaw, leagueRank);
            const awayTeam = buildTeamHtml(awayTeamRaw, leagueRank);
            
            const isCompleted = status === '완료';
            const homeScore = isCompleted ? (match.TH_SCORE_FINAL || '0') : '';
            const awayScore = isCompleted ? (match.TA_SCORE_FINAL || '0') : '';
            
            return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card h-100 ${isCompleted ? '' : 'border-primary'}">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="badge ${isCompleted ? 'bg-secondary' : 'bg-primary'}">${status}</span>
                                <small class="text-muted">${time}</small>
                            </div>
                            <div class="text-center mb-2">
                                <div class="fw-bold">${homeTeam}</div>
                                <div class="text-muted">vs</div>
                                <div class="fw-bold">${awayTeam}</div>
                                ${isCompleted ? `<div class="h5 completed-score mt-2">${homeScore} - ${awayScore}</div>` : ''}
                            </div>
                            <div class="text-center">
                                <small class="text-muted d-block">${stadium}</small>
                                <span class="league-badge ${leagueClass}">${league}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        attachGroupedMatchesFilters(data) {
            const { byMonth, upcoming, past } = data;
            const allMatches = upcoming.concat(past);
            
            const display = document.getElementById('matchesDisplay');
            const teamSearchInput = document.getElementById('teamSearchInput');
            const clearTeamSearchBtn = document.getElementById('clearTeamSearch');
            
            let currentSelectedMonth = '';
            let currentSelectedLeague = '';
            let currentSearchTerm = '';
            
            const updateDisplay = () => {
                let matches = allMatches;
                
                // 월별 필터 적용
                if (currentSelectedMonth) {
                    matches = byMonth[currentSelectedMonth] || [];
                }
                
                // 리그 필터 적용
                if (currentSelectedLeague) {
                    matches = matches.filter(m => m.leagueTitle === currentSelectedLeague);
                }
                
                // 팀 검색 필터 적용
                if (currentSearchTerm) {
                    matches = matches.filter(m => {
                        const homeTeam = (m.HOME_TEAM_NAME || m.TH_CLUB_NAME || '').toLowerCase();
                        const awayTeam = (m.AWAY_TEAM_NAME || m.TA_CLUB_NAME || '').toLowerCase();
                        const searchLower = currentSearchTerm.toLowerCase();
                        return homeTeam.includes(searchLower) || awayTeam.includes(searchLower);
                    });
                }
                
                display.innerHTML = this.renderMatchesTable(matches);
            };
            
            // 월별 필터 버튼 이벤트
            document.querySelectorAll('.month-filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // 활성 버튼 업데이트
                    document.querySelectorAll('.month-filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    currentSelectedMonth = e.target.dataset.month;
                    updateDisplay();
                });
            });
            
            // 리그 필터 버튼 이벤트
            document.querySelectorAll('.league-filter-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // 활성 버튼 업데이트
                    document.querySelectorAll('.league-filter-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    currentSelectedLeague = e.target.dataset.league;
                    updateDisplay();
                });
            });
            
            // 팀 검색 이벤트
            teamSearchInput.addEventListener('input', (e) => {
                currentSearchTerm = e.target.value.trim();
                updateDisplay();
            });
            
            // 검색 초기화 버튼
            clearTeamSearchBtn.addEventListener('click', () => {
                teamSearchInput.value = '';
                currentSearchTerm = '';
                updateDisplay();
            });
            
            // 스마트 업데이트 및 캐시 새로고침 버튼 제거됨
            
            // 초기 표시
            updateDisplay();
            
            // 오늘 일정으로 자동 스크롤
            this.scrollToToday();
            
            // 스케줄러 상태 확인
            this.checkSchedulerStatus();
        },

        scrollToToday() {
            setTimeout(() => {
                const today = new Date().toISOString().split('T')[0];
                const todayRow = document.querySelector(`tr[data-date="${today}"]`);
                
                if (todayRow) {
                    todayRow.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                    // 오늘 경기 하이라이트
                    todayRow.classList.add('table-warning');
                    setTimeout(() => {
                        todayRow.classList.remove('table-warning');
                    }, 3000);
                }
            }, 500);
        },

        // 스마트 업데이트 기능 제거됨

        async executeSmartCrawling() {
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
            
            // 현재 월과 다음 월 크롤링 (경기 결과 업데이트를 위해)
            const months = [currentMonth];
            if (currentMonth === '12') {
                months.push('01'); // 다음 년도 1월
            } else {
                months.push(String(today.getMonth() + 2).padStart(2, '0'));
            }
            
            for (const month of months) {
                const crawlYear = month === '01' && currentMonth === '12' ? currentYear + 1 : currentYear;
                
                const response = await fetch('/api/smart-crawl', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        year: crawlYear,
                        month: month,
                        mode: 'update' // 업데이트 모드로 크롤링
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`크롤링 실패: ${response.status}`);
                }
                
                const result = await response.json();
                console.log(`${crawlYear}-${month} 크롤링 완료:`, result);
            }
        },

        async executeFirestoreUpload() {
            const response = await fetch('/api/smart-upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mode: 'recent' // 최근 데이터만 업로드
                })
            });
            
            if (!response.ok) {
                throw new Error(`업로드 실패: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('파이어스토어 업로드 완료:', result);
        },

        async refreshMatchesData() {
            const refreshBtn = document.getElementById('refreshMatchesBtn');
            const refreshSpinner = document.getElementById('refreshSpinner');
            
            // 현재 필터 상태 저장
            const currentFilters = this.getCurrentFilters();
            
            try {
                // 버튼 비활성화 및 스피너 표시
                refreshBtn.disabled = true;
                refreshSpinner.classList.remove('d-none');
                refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 새로고침 중...';
                
                // 캐시 무효화
                await this.invalidateMatchesCache();
                
                // 데이터 새로고침
                await Dashboard.api.loadGroupedMatches();
                
                // 필터 상태 복원
                this.restoreFilters(currentFilters);
                
                // 성공 메시지 표시
                this.showRefreshMessage('success', '데이터가 성공적으로 새로고침되었습니다.');
                
            } catch (error) {
                console.error('데이터 새로고침 실패:', error);
                this.showRefreshMessage('error', '데이터 새로고침에 실패했습니다.');
            } finally {
                // 버튼 복원
                refreshBtn.disabled = false;
                refreshSpinner.classList.add('d-none');
                refreshBtn.innerHTML = '🔄 데이터 새로고침';
            }
        },

        getCurrentFilters() {
            const activeMonthBtn = document.querySelector('.month-filter-btn.active');
            const activeLeagueBtn = document.querySelector('.league-filter-btn.active');
            const teamSearchInput = document.getElementById('teamSearchInput');
            
            return {
                month: activeMonthBtn ? activeMonthBtn.dataset.month : '',
                league: activeLeagueBtn ? activeLeagueBtn.dataset.league : '',
                searchTerm: teamSearchInput ? teamSearchInput.value : ''
            };
        },

        restoreFilters(filters) {
            // 월별 필터 복원
            document.querySelectorAll('.month-filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.month === filters.month) {
                    btn.classList.add('active');
                }
            });
            
            // 리그 필터 복원
            document.querySelectorAll('.league-filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.league === filters.league) {
                    btn.classList.add('active');
                }
            });
            
            // 검색어 복원
            const teamSearchInput = document.getElementById('teamSearchInput');
            if (teamSearchInput) {
                teamSearchInput.value = filters.searchTerm;
            }
            
            // 필터 적용
            if (teamSearchInput) {
                teamSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        },

        async invalidateMatchesCache() {
            try {
                // 서버 캐시 무효화 요청
                await fetch('/api/cache/invalidate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                console.warn('캐시 무효화 실패:', error);
            }
        },

        showRefreshMessage(type, message) {
            const container = document.getElementById('upcomingMatchesSection');
            const existingAlert = container.querySelector('.refresh-alert');
            
            // 기존 메시지 제거
            if (existingAlert) {
                existingAlert.remove();
            }
            
            // 새 메시지 추가
            const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
            const alertHtml = `
                <div class="alert ${alertClass} alert-dismissible fade show refresh-alert" role="alert">
                    ${message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
            
            container.insertAdjacentHTML('afterbegin', alertHtml);
            
            // 3초 후 자동 제거
            setTimeout(() => {
                const alert = container.querySelector('.refresh-alert');
                if (alert) {
                    alert.remove();
                }
            }, 3000);
        },

        async checkSchedulerStatus() {
            try {
                const response = await fetch('/api/scheduler/status');
                const data = await response.json();
                
                const statusElement = document.getElementById('schedulerStatus');
                if (statusElement) {
                    if (data.success && data.isRunning) {
                        statusElement.innerHTML = `
                            <span class="text-success">
                                ⚡ 자동 업데이트 활성 (${data.totalJobs}개 예약됨)
                            </span>
                        `;
                    } else {
                        statusElement.innerHTML = `
                            <span class="text-warning">
                                ⏸️ 자동 업데이트 비활성
                            </span>
                        `;
                    }
                }
            } catch (error) {
                console.error('스케줄러 상태 확인 실패:', error);
                const statusElement = document.getElementById('schedulerStatus');
                if (statusElement) {
                    statusElement.innerHTML = `
                        <span class="text-muted">
                            ❓ 자동 업데이트 상태 불명
                        </span>
                    `;
                }
            }
        },

        displayUpcomingMatchesEnhanced(matches) {
            const container = document.getElementById('upcomingMatchesSection');
            if (!matches || !Array.isArray(matches)) {
                container.innerHTML = '<div class="empty-message">경기 데이터를 불러올 수 없습니다</div>';
                return;
            }

            // 사용하지 않는 함수 제거됨

            // 현재 선택된 월 상태 관리
            if (!Dashboard.state.selectedMonth) {
                Dashboard.state.selectedMonth = new Date().getMonth();
            }
            if (!Dashboard.state.selectedYear) {
                Dashboard.state.selectedYear = new Date().getFullYear();
            }
            
            // 팀 검색 필터 상태 관리
            if (!Dashboard.state.teamSearchFilter) {
                Dashboard.state.teamSearchFilter = '';
            }

            const safeParseDate = (str) => {
                if (!str) return new Date('2100-01-01');

                // Non-string inputs (Date, number) – fall back to native constructor
                if (typeof str !== 'string') return new Date(str);

                let s = str.trim();

                // Remove any text following "(" such as "2025-09-28 (일) 13:00"
                if (s.includes('(')) {
                    s = s.split('(')[0].trim();
                }

                // Normalise separators
                s = s.replace(/[\.\/]/g, '-');

                // Handle cases like "20250928" → YYYY-MM-DD
                if (/^\d{8}$/.test(s)) {
                    s = s.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
                }

                // Handle strings that include weekday / time e.g. "2025-09-28-일-13-50"
                const numericParts = s.split('-').filter(p => /^\d+$/.test(p));
                if (numericParts.length >= 3) {
                    const [y, m, d] = numericParts;
                    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                }

                // Handle MM-DD (current year implied)
                if (/^\d{1,2}-\d{1,2}$/.test(s)) {
                    const [mon, day] = s.split('-').map(Number);
                    const y = new Date().getFullYear();
                    return new Date(y, mon - 1, day);
                }

                // Fallback to browser Date parser
                return new Date(s);
            };

            // 사용하지 않는 함수 제거됨

            // 월별 경기 필터링
            const selectedMonth = Dashboard.state.selectedMonth;
            const selectedYear = Dashboard.state.selectedYear;
            
            // 선택된 월의 시작일과 마지막일 계산
            const monthStart = new Date(selectedYear, selectedMonth, 1);
            const monthEnd = new Date(selectedYear, selectedMonth + 1, 0);

            let filteredMatches = matches
                .filter(m => {
                    const matchDate = m.MATCH_DATE || m.matchDate || m.date || m.DATE;
                    if (!matchDate) return false;
                    const d = safeParseDate(matchDate);
                    return d >= monthStart && d <= monthEnd;
                })
                .filter(m => {
                    if (!Dashboard.state.upcomingLeagueFilter) return true;
                    const leagueTitle = (m.leagueTitle || m.league || m.LEAGUE || '').replace(/k4리그/gi,'K4리그');
                    return leagueTitle === Dashboard.state.upcomingLeagueFilter;
                })
                .filter(m => {
                    if (!Dashboard.state.teamSearchFilter) return true;
                    const searchFilter = Dashboard.state.teamSearchFilter.toLowerCase();
                    const homeTeam = (m.homeTeam?.teamName || m.HOME_TEAM_NAME || m.HOME_TEAM || m.홈팀 || 
                                     m.homeTeam || m.home_team || m.HOME || m.TH_CLUB_NAME || m.TEAM_HOME || '').toLowerCase();
                    const awayTeam = (m.awayTeam?.teamName || m.AWAY_TEAM_NAME || m.AWAY_TEAM || m.원정팀 || 
                                     m.awayTeam || m.away_team || m.AWAY || m.TA_CLUB_NAME || m.TEAM_AWAY || '').toLowerCase();
                    return homeTeam.includes(searchFilter) || awayTeam.includes(searchFilter);
                })
                .sort((a,b) => {
                    const dateA = safeParseDate(a.MATCH_DATE || a.matchDate || a.date || a.DATE);
                    const dateB = safeParseDate(b.MATCH_DATE || b.matchDate || b.date || b.DATE);
                    
                    if (dateA.getTime() !== dateB.getTime()) return dateA - dateB;
                    
                    const timeA = Dashboard.utils.parseMatchTime(a.formattedTime || a.MATCH_TIME_FORMATTED || a.TIME || a.time || '');
                    const timeB = Dashboard.utils.parseMatchTime(b.formattedTime || b.MATCH_TIME_FORMATTED || b.TIME || b.time || '');
                    return timeA.localeCompare(timeB);
                });

            if (filteredMatches.length === 0) {
                container.innerHTML = `
                    <div class="upcoming-header">
                        <h2>⚽ 다가오는 경기</h2>
                    </div>
                    <div class="empty-message">예정된 경기가 없습니다</div>
                `;
                Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
                return;
            }
            
            // 날짜별로 그룹핑
            const matchesByDate = {};
            filteredMatches.forEach(match => {
                const matchDateField = match.MATCH_DATE || match.matchDate || match.date || match.DATE;
                const matchDate = safeParseDate(matchDateField);
                const dateKey = matchDate.toLocaleDateString('ko-KR', { 
                    year: 'numeric',
                    month: '2-digit', 
                    day: '2-digit',
                    weekday: 'short'
                });
                
                if (!matchesByDate[dateKey]) {
                    matchesByDate[dateKey] = [];
                }
                matchesByDate[dateKey].push(match);
            });

            const renderCompactMatchTable = (matchList, dateHeader) => {
                if (!matchList || matchList.length === 0) return '';

                // 정렬: K리그1 → K리그7, 같은 리그는 시간 오름차순
                const getLeagueRank = (lg='') => {
                    const u = lg.toUpperCase();
                    if (u.includes('K리그1') || u.includes('K1')) return 1;
                    if (u.includes('K리그2') || u.includes('K2')) return 2;
                    if (u.includes('K3')) return 3;
                    if (u.includes('K4')) return 4;
                    if (u.includes('K5')) return 5;
                    if (u.includes('K6')) return 6;
                    if (u.includes('K7')) return 7;
                    return 99;
                };

                const timeToMinutes = (t='') => {
                    if (!t || t === '시간미정') return 24 * 60 + 1;
                    const [h, m] = t.split(':').map(n => parseInt(n));
                    return (h || 0) * 60 + (m || 0);
                };

                const sortedMatches = [...matchList].sort((a, b) => {
                    const leagueA = a.leagueTitle || a.league || a.LEAGUE || '';
                    const leagueB = b.leagueTitle || b.league || a.LEAGUE || '';
                    const rankA = getLeagueRank(leagueA);
                    const rankB = getLeagueRank(leagueB);
                    if (rankA !== rankB) return rankA - rankB; // K리그1 우선

                    const timeA = Dashboard.utils.parseMatchTime(
                        a.formattedTime || a.MATCH_TIME_FORMATTED || a.TIME || a.time || '',
                        null
                    );
                    const timeB = Dashboard.utils.parseMatchTime(
                        b.formattedTime || b.MATCH_TIME_FORMATTED || b.TIME || b.time || '',
                        null
                    );
                    return timeToMinutes(timeA) - timeToMinutes(timeB);
                });

                const buildTeamHtml = (raw, leagueRank) => {
                    // K5~K7 리그에서만 지역 라벨 표시
                    if (leagueRank >= 5 && leagueRank <= 7) {
                        const parsed = Dashboard.utils.parseTeam(raw);
                        const regionText = parsed.major ? `${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}` : '';
                        const teamName = parsed.teamName || raw;
                        const encoded = encodeURIComponent(teamName);
                        const linkHtml = `<a href="team.html?team=${encoded}" class="team-name-link">${teamName}</a>`;
                        const regionLabel = regionText ? `<span class="region-label">${regionText}</span> ` : '';
                        return `${regionLabel}${linkHtml}`;
                    } else {
                        // K1~K4 리그는 원본 그대로 표시
                        return `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${raw}</a>`;
                    }
                };

                const tableRows = sortedMatches.map(match => {
                    const matchDateObj = safeParseDate(match.MATCH_DATE || match.matchDate || match.date || match.DATE);
                    const time = Dashboard.utils.formatMatchTime(
                        match.formattedTime,
                        match.MATCH_TIME_FORMATTED,
                        match.TIME,
                        match.time,
                        match.MATCH_TIME,
                        match.경기시간,
                        match.match_time
                    );

                    let league = match.leagueTitle || match.league || match.LEAGUE || '';
                    league = league.replace(/k4리그/gi, 'K4리그');
                    const leagueRank = Dashboard.utils.getLeagueRank(league);
                    const leagueClass = Dashboard.utils.getLeagueClass(league);

                    const venue = match.VENUE || match.STADIUM || match.경기장 || match.venue || match.stadium || '경기장미정';

                    const homeRaw = match.homeTeam?.teamName || match.HOME_TEAM_NAME || match.HOME_TEAM || match.홈팀 ||
                                    match.homeTeam || match.home_team || match.HOME || match.TH_CLUB_NAME || match.TEAM_HOME || '홈팀';
                    const awayRaw = match.awayTeam?.teamName || match.AWAY_TEAM_NAME || match.AWAY_TEAM || match.원정팀 ||
                                    match.awayTeam || match.away_team || match.AWAY || match.TA_CLUB_NAME || match.TEAM_AWAY || '원정팀';

                    const homeTeamHtml = buildTeamHtml(homeRaw, leagueRank);
                    const awayTeamHtml = buildTeamHtml(awayRaw, leagueRank);

                    return `
                        <tr class="match-row">
                            <td class="time-col">${time}</td>
                            <td class="home-team">${homeTeamHtml}</td>
                            <td class="vs-col">vs</td>
                            <td class="away-team">${awayTeamHtml}</td>
                            <td class="venue-col">${venue}</td>
                            <td class="league-col ${leagueClass}">${league}</td>
                        </tr>
                    `;
                }).join('');

                const dateId = dateHeader.replace(/[^0-9]/g, '');
                return `
                    <div class="date-section">
                        <h4 class="date-header clickable" onclick="Dashboard.ui.toggleDateExpansion('${dateId}')">
                            <i class="fas fa-chevron-down expand-icon" id="icon-${dateId}"></i>
                            ${dateHeader} (${matchList.length}경기)
                        </h4>
                        <div class="date-matches-container" id="matches-${dateId}" style="display: block;">
                            <table class="matches-table">
                                <thead>
                                    <tr>
                                        <th>시간</th>
                                        <th>홈팀</th>
                                        <th></th>
                                        <th>원정팀</th>
                                        <th>경기장</th>
                                        <th>리그</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            };

            if (filteredMatches.length === 0) {
                const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
                container.innerHTML = `
                    <div class="upcoming-header">
                        <h2>⚽ ${selectedYear}년 ${monthNames[selectedMonth]} 경기</h2>
                    </div>
                    <div class="empty-message">해당 월에 예정된 경기가 없습니다</div>
                `;
                Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
                Dashboard.ui.renderMonthNavigation();
                return;
            }

            // 날짜별 섹션 생성
            const dateSections = Object.entries(matchesByDate)
                .sort(([dateA], [dateB]) => {
                    // 날짜 문자열에서 날짜 부분만 추출하여 정렬
                    const parseDate = (dateStr) => {
                        const parts = dateStr.match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
                        return parts ? new Date(parts[1], parts[2] - 1, parts[3]) : new Date();
                    };
                    return parseDate(dateA) - parseDate(dateB);
                })
                .map(([dateKey, matches]) => renderCompactMatchTable(matches, dateKey))
                .join('');

            const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
            const html = `
                <button class="fullscreen-toggle" onclick="Dashboard.ui.toggleFullscreen()" title="전체화면 토글">
                    <i class="fas fa-expand"></i>
                </button>
                <div class="upcoming-header">
                    <h2>⚽ ${selectedYear}년 ${monthNames[selectedMonth]} 경기 (${filteredMatches.length}경기)</h2>
                </div>
                
                <div class="matches-container compact">
                    ${dateSections}
                </div>
            `;

            container.innerHTML = html;
            Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
            Dashboard.ui.renderMonthNavigation();
            Dashboard.ui.renderTeamSearchBox();
        },

        renderMonthNavigation() {
            const container = document.getElementById('upcomingMatchesSection');
            if (!container) return;

            // 기존 네비게이션 제거
            container.querySelector('.month-navigation')?.remove();

            const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
            const currentMonth = Dashboard.state.selectedMonth;
            const currentYear = Dashboard.state.selectedYear;
            
            const navHtml = `
                <div class="month-navigation">
                    <div class="month-nav-controls">
                        <button class="nav-btn prev-year" onclick="Dashboard.ui.changeYear(-1)" title="이전 연도">
                            <i class="fas fa-angle-double-left"></i>
                        </button>
                        <button class="nav-btn prev-month" onclick="Dashboard.ui.changeMonth(-1)" title="이전 달">
                            <i class="fas fa-angle-left"></i>
                        </button>
                        <div class="current-month-year">
                            <span class="year">${currentYear}년</span>
                            <span class="month">${monthNames[currentMonth]}</span>
                        </div>
                        <button class="nav-btn next-month" onclick="Dashboard.ui.changeMonth(1)" title="다음 달">
                            <i class="fas fa-angle-right"></i>
                        </button>
                        <button class="nav-btn next-year" onclick="Dashboard.ui.changeYear(1)" title="다음 연도">
                            <i class="fas fa-angle-double-right"></i>
                        </button>
                    </div>
                    <div class="month-grid">
                        ${monthNames.map((month, index) => 
                            `<button class="month-btn ${index === currentMonth ? 'active' : ''}" 
                                    onclick="Dashboard.ui.selectMonth(${index})" 
                                    title="${currentYear}년 ${month}">
                                ${month}
                            </button>`
                        ).join('')}
                    </div>
                </div>
            `;

            const header = container.querySelector('.upcoming-header');
            if (header) {
                header.insertAdjacentHTML('afterend', navHtml);
            }
        },

        changeMonth(direction) {
            const newMonth = Dashboard.state.selectedMonth + direction;
            if (newMonth < 0) {
                Dashboard.state.selectedMonth = 11;
                Dashboard.state.selectedYear--;
            } else if (newMonth > 11) {
                Dashboard.state.selectedMonth = 0;
                Dashboard.state.selectedYear++;
            } else {
                Dashboard.state.selectedMonth = newMonth;
            }
            Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
        },

        changeYear(direction) {
            Dashboard.state.selectedYear += direction;
            Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
        },

        selectMonth(monthIndex) {
            Dashboard.state.selectedMonth = monthIndex;
            Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
        },

        toggleDateExpansion(dateId) {
            const container = document.getElementById(`matches-${dateId}`);
            const icon = document.getElementById(`icon-${dateId}`);
            
            if (!container || !icon) return;
            
            const isExpanded = container.style.display === 'block';
            
            if (isExpanded) {
                container.style.display = 'none';
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-right');
            } else {
                container.style.display = 'block';
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-down');
            }
        },

        renderTeamSearchBox() {
            const container = document.getElementById('upcomingMatchesSection');
            if (!container) return;

            // 기존 검색창 제거
            container.querySelector('.team-search-container')?.remove();

            const searchHtml = `
                <div class="team-search-container">
                    <div class="search-input-wrapper">
                        <i class="fas fa-search search-icon"></i>
                        <input type="text" 
                               id="teamSearchInput" 
                               placeholder="팀 이름으로 검색 (예: 서울, 부산, FC서울)"
                               value="${Dashboard.state.teamSearchFilter}"
                               onkeyup="Dashboard.ui.handleTeamSearch(this.value)"
                               oninput="Dashboard.ui.handleTeamSearch(this.value)">
                        <button class="clear-search-btn" onclick="Dashboard.ui.clearTeamSearch()" title="검색 초기화">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;

            const monthNavigation = container.querySelector('.month-navigation');
            if (monthNavigation) {
                monthNavigation.insertAdjacentHTML('afterend', searchHtml);
            } else {
                const header = container.querySelector('.upcoming-header');
                if (header) {
                    header.insertAdjacentHTML('afterend', searchHtml);
                }
            }
        },

        handleTeamSearch(searchTerm) {
            Dashboard.state.teamSearchFilter = searchTerm;
            Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
        },

        clearTeamSearch() {
            Dashboard.state.teamSearchFilter = '';
            const searchInput = document.getElementById('teamSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
            Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
        },        renderUpcomingLeagueToggle(matches) {
            const filterContainer = document.getElementById('upcomingMatchesLeagueFilter');
            if (!filterContainer) return;
            
            const buttonsContainer = filterContainer.querySelector('.league-filter-buttons');
            if (!buttonsContainer) return;

            // 기존 버튼들 제거 (전체 버튼 제외)
            const existingButtons = buttonsContainer.querySelectorAll('.league-filter-btn:not([data-league=""])');
            existingButtons.forEach(btn => btn.remove());

            const uniqueLeagues = [...new Set(matches.map(m => (m.leagueTitle || m.league || m.LEAGUE || '').replace(/k4리그/gi,'K4리그')))].filter(Boolean).sort((a,b) => {
                const getRank = l => {
                    if(!l) return 99;
                    const u=l.toUpperCase();
                    if(u.includes('K리그1')||u.includes('K1')) return 1;
                    if(u.includes('K리그2')||u.includes('K2')) return 2;
                    if(u.includes('K3')) return 3;
                    if(u.includes('K4')) return 4;
                    if(u.includes('K5')) return 5;
                    if(u.includes('K6')) return 6;
                    if(u.includes('K7')) return 7;
                    return 99;
                };
                return getRank(a)-getRank(b);
            });

            if (uniqueLeagues.length === 0) return;

            // 전체 버튼 상태 업데이트
            const allBtn = buttonsContainer.querySelector('.league-filter-btn[data-league=""]');
            if (allBtn) {
                allBtn.className = 'league-filter-btn' + (Dashboard.state.upcomingLeagueFilter === '' ? ' active' : '');
                allBtn.onclick = () => {
                    Dashboard.state.upcomingLeagueFilter = '';
                    Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
                    Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
                };
            }

            uniqueLeagues.forEach(lg => {
                const btn = document.createElement('button');
                btn.className = 'league-filter-btn' + (Dashboard.state.upcomingLeagueFilter === lg ? ' active' : '');
                btn.setAttribute('data-league', lg);
                btn.textContent = lg;
                btn.onclick = () => {
                    Dashboard.state.upcomingLeagueFilter = lg;
                    Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
                    Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
                };
                buttonsContainer.appendChild(btn);
            });
        },

        toggleFullscreen() {
            const newsfeedTab = document.getElementById('newsfeed');
            const toggleBtn = document.querySelector('.fullscreen-toggle i');
            
            if (!Dashboard.state.isFullscreen) {
                newsfeedTab.classList.add('fullscreen-mode');
                document.body.style.overflow = 'hidden';
                if (toggleBtn) toggleBtn.className = 'fas fa-compress';
                Dashboard.state.isFullscreen = true;
            } else {
                newsfeedTab.classList.remove('fullscreen-mode');
                document.body.style.overflow = 'auto';
                if (toggleBtn) toggleBtn.className = 'fas fa-expand';
                Dashboard.state.isFullscreen = false;
            }
        },

        getLoadingSpinner(message = '로딩 중...') {
            return `
                <div class="loading-spinner">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-3">${message}</p>
                </div>
            `;
        },

        getErrorState(message) {
            return `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h5>${message}</h5>
                    <p>잠시 후 다시 시도해주세요.</p>
                </div>
            `;
        },

        showErrorMessage(containerId, message) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div class="error-message text-center p-4">
                        <h5 class="text-danger">${message}</h5>
                        <p class="text-muted">경기 정보를 불러오는 중 오류가 발생했습니다.</p>
                        <button class="btn btn-primary btn-sm" onclick="Dashboard.api.loadGroupedMatches().catch(() => Dashboard.api.loadNewsFeed())">다시 시도</button>
                    </div>
                `;
            }
        },

        showGitError(error) {
            document.getElementById('gitCommitHashDashboard').textContent = '오류';
            document.getElementById('gitCommitDateDashboard').textContent = '정보 없음';
            document.getElementById('gitCommitMessageDashboard').textContent = error || 'Git 정보를 가져올 수 없습니다.';
        },

        displayStandings(data) {
            const container = document.getElementById('standingsContainer');
            if (!container) return;

            if (!Array.isArray(data) || data.length === 0) {
                container.innerHTML = '<div class="empty-message">순위표 데이터가 없습니다</div>';
                return;
            }

            // 필터 버튼 업데이트
            this.updateStandingFilters(data);

            // 현재 필터 상태 가져오기
            const activeRegion = document.querySelector('#standingRegionFilterButtons .filter-btn.active')?.dataset.value || '';
            const activeLeague = document.querySelector('#standingLeagueFilterButtons .filter-btn.active')?.dataset.value || '';

            // 필터링된 데이터
            const filteredData = data.filter(group => {
                const matchesRegion = !activeRegion || group.region === activeRegion;
                const matchesLeague = !activeLeague || group.league === activeLeague;
                return matchesRegion && matchesLeague;
            });

            if (filteredData.length === 0) {
                container.innerHTML = '<div class="empty-message">선택한 조건에 맞는 순위표가 없습니다</div>';
                return;
            }

            let html = '';

            filteredData.forEach(group => {
                const leagueName = group.league || group.leagueTitle || '리그';
                const regionName = group.region || '';
                const displayName = regionName ? `${leagueName} (${regionName})` : leagueName;
                const teams = Array.isArray(group.standings) ? [...group.standings] : [];

                teams.sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points;
                    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                    return a.teamName.localeCompare(b.teamName, 'ko-KR');
                });

                // 리그 등급 결정
                const getLeagueClass = (league) => {
                    if (league.includes('K리그1')) return 'k1';
                    if (league.includes('K리그2')) return 'k2';
                    if (league.includes('K3')) return 'k3';
                    if (league.includes('K4')) return 'k4';
                    if (league.includes('K5')) return 'k5';
                    if (league.includes('K6')) return 'k6';
                    if (league.includes('K7')) return 'k7';
                    return 'other';
                };

                const leagueClass = getLeagueClass(leagueName);

                html += `
                    <div class="standings-card-modern ${leagueClass}">
                        <div class="standings-header-modern">
                            <div class="league-badge-modern ${leagueClass}">
                                <i class="fas fa-trophy"></i>
                                <span>${displayName}</span>
                            </div>
                            <div class="team-count">
                                <i class="fas fa-users"></i>
                                <span>${teams.length}개 팀</span>
                            </div>
                        </div>
                        <div class="standings-table-container">
                            <table class="standings-table-modern">
                                <thead>
                                    <tr>
                                        <th>순위</th>
                                        <th>팀명</th>
                                        <th>경기</th>
                                        <th>승점</th>
                                        <th>승</th>
                                        <th>무</th>
                                        <th>패</th>
                                        <th>득점</th>
                                        <th>실점</th>
                                        <th>득실차</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                teams.forEach((t, idx) => {
                    const position = idx + 1;
                    const isChampion = position === 1;
                    const isRelegation = position === teams.length;
                    const isTop3 = position <= 3;
                    
                    let positionClass = '';
                    if (isChampion) positionClass = 'champion';
                    else if (isTop3) positionClass = 'top3';
                    else if (isRelegation) positionClass = 'relegation';

                    const teamLogo = t.teamName.charAt(0).toUpperCase();
                    const goalDiff = t.goalDifference >= 0 ? `+${t.goalDifference}` : t.goalDifference;

                    // K5-K7 리그 팀명에 지역 라벨 추가
                    const buildTeamName = (teamName, leagueClass) => {
                        if (leagueClass === 'k5' || leagueClass === 'k6' || leagueClass === 'k7') {
                            const parsed = Dashboard.utils.parseTeam(teamName);
                            const regionText = parsed.major ? `${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}` : '';
                            const cleanTeamName = parsed.teamName || teamName;
                            const regionLabel = regionText ? `<span class="region-label">${regionText}</span> ` : '';
                            return `${regionLabel}<a href="team.html?team=${encodeURIComponent(teamName)}" class="team-name-link">${cleanTeamName}</a>`;
                        } else {
                            return `<a href="team.html?team=${encodeURIComponent(teamName)}" class="team-name-link">${teamName}</a>`;
                        }
                    };

                    html += `
                        <tr class="team-row-modern ${positionClass}">
                            <td class="position-cell">
                                <div class="position-display">
                                    <span class="position-number ${positionClass}">${position}</span>
                                    ${isChampion ? '<i class="fas fa-crown champion-icon"></i>' : ''}
                                </div>
                            </td>
                            <td class="team-cell">
                                <div class="team-info-display">
                                    <div class="team-logo-small">${teamLogo}</div>
                                    <div class="team-name-container">
                                        ${buildTeamName(t.teamName, leagueClass)}
                                    </div>
                                </div>
                            </td>
                            <td class="stat-cell">${t.played}</td>
                            <td class="points-cell">
                                <span class="points-highlight">${t.points}</span>
                            </td>
                            <td class="stat-cell win-cell">${t.won}</td>
                            <td class="stat-cell draw-cell">${t.drawn}</td>
                            <td class="stat-cell loss-cell">${t.lost}</td>
                            <td class="stat-cell goals-for-cell">${t.goalsFor}</td>
                            <td class="stat-cell goals-against-cell">${t.goalsAgainst}</td>
                            <td class="stat-cell goal-diff-cell">
                                <span class="goal-diff ${t.goalDifference >= 0 ? 'positive' : 'negative'}">${goalDiff}</span>
                            </td>
                        </tr>
                    `;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        },

        updateStandingFilters(data) {
            // 지역 필터 업데이트
            const regionContainer = document.getElementById('standingRegionFilterButtons');
            const leagueContainer = document.getElementById('standingLeagueFilterButtons');
            
            if (!regionContainer || !leagueContainer) return;

            // 고유 지역과 리그 추출
            const regions = [...new Set(data.map(g => g.region || ''))].filter(Boolean).sort();
            const leagues = [...new Set(data.map(g => g.league || ''))].sort((a, b) => {
                const getRank = (l) => {
                    if (l.includes('K리그1')) return 1;
                    if (l.includes('K리그2')) return 2;
                    if (l.includes('K3')) return 3;
                    if (l.includes('K4')) return 4;
                    if (l.includes('K5')) return 5;
                    if (l.includes('K6')) return 6;
                    if (l.includes('K7')) return 7;
                    return 99;
                };
                return getRank(a) - getRank(b);
            });

            // 초기 "모든 지역" 버튼에 클릭 핸들러 추가
            const allRegionBtn = regionContainer.querySelector('.filter-btn[data-value=""]');
            if (allRegionBtn && !allRegionBtn.onclick) {
                allRegionBtn.onclick = () => {
                    document.querySelectorAll('#standingRegionFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
                    allRegionBtn.classList.add('active');
                    Dashboard.ui.displayStandings(Dashboard.state.allStandings);
                };
            }

            // 초기 "모든 리그" 버튼에 클릭 핸들러 추가
            const allLeagueBtn = leagueContainer.querySelector('.filter-btn[data-value=""]');
            if (allLeagueBtn && !allLeagueBtn.onclick) {
                allLeagueBtn.onclick = () => {
                    document.querySelectorAll('#standingLeagueFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
                    allLeagueBtn.classList.add('active');
                    Dashboard.ui.displayStandings(Dashboard.state.allStandings);
                };
            }

            // 지역 필터 버튼 생성
            if (regionContainer.children.length === 1) { // 전체 버튼만 있을 때
                regions.forEach(region => {
                    const btn = document.createElement('button');
                    btn.className = 'filter-btn';
                    btn.dataset.value = region;
                    btn.textContent = region || '전국';
                    btn.onclick = () => {
                        document.querySelectorAll('#standingRegionFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        Dashboard.ui.displayStandings(Dashboard.state.allStandings);
                    };
                    regionContainer.appendChild(btn);
                });
            }

            // 리그 필터 버튼 생성
            if (leagueContainer.children.length === 1) { // 전체 버튼만 있을 때
                leagues.forEach(league => {
                    const btn = document.createElement('button');
                    btn.className = 'filter-btn';
                    btn.dataset.value = league;
                    btn.textContent = league;
                    btn.onclick = () => {
                        document.querySelectorAll('#standingLeagueFilterButtons .filter-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        Dashboard.ui.displayStandings(Dashboard.state.allStandings);
                    };
                    leagueContainer.appendChild(btn);
                });
            }
        },

        displayMatches(allMatches) {
            const container = document.getElementById('matchesContainer');
            if (!container) return;

            if (!allMatches || allMatches.length === 0) {
                container.innerHTML = '<div class="empty-message">경기 데이터가 없습니다</div>';
                return;
            }

            // --- 필터 UI (최초 1회 렌더) ---
            if (!document.getElementById('matchFilterSection')) {
                const filterHtml = `
                    <div id="matchFilterSection" class="d-flex gap-2 flex-wrap mb-3">
                        <select id="matchRegionFilter" class="form-select form-select-sm" style="max-width: 160px"></select>
                        <select id="matchLeagueFilter" class="form-select form-select-sm" style="max-width: 160px"></select>
                    </div>`;
                container.insertAdjacentHTML('beforebegin', filterHtml);

                document.getElementById('matchRegionFilter').addEventListener('change', () => {
                    Dashboard.state.matchRegionFilter = event.target.value || null;
                    Dashboard.ui.displayMatches(Dashboard.state.allMatches);
                });
                document.getElementById('matchLeagueFilter').addEventListener('change', () => {
                    Dashboard.state.matchLeagueFilter = event.target.value || null;
                    Dashboard.ui.displayMatches(Dashboard.state.allMatches);
                });

                // 옵션 채우기
                const regions = [...new Set(allMatches.map(m => m.regionTag || ''))].filter(Boolean).sort();
                const leagues = [...new Set(allMatches.map(m => m.leagueTitle || m.league || ''))].filter(Boolean).sort();
                const regionSel = document.getElementById('matchRegionFilter');
                const leagueSel = document.getElementById('matchLeagueFilter');
                regionSel.innerHTML = '<option value="">지역 전체</option>' + regions.map(r=>`<option value="${r}">${r}</option>`).join('');
                leagueSel.innerHTML = '<option value="">리그 전체</option>' + leagues.map(l=>`<option value="${l}">${l}</option>`).join('');
            }

            // --- 필터 적용 ---
            let matches = [...allMatches];
            const { matchRegionFilter, matchLeagueFilter } = Dashboard.state;
            if (matchRegionFilter) matches = matches.filter(m => (m.regionTag||'') === matchRegionFilter);
            if (matchLeagueFilter) matches = matches.filter(m => (m.leagueTitle||m.league||'') === matchLeagueFilter);

            // 월별로 그룹화
            const monthGroups = {};
            matches.forEach(m => {
                const dateStr = m.MATCH_DATE || m.matchDate || m.date || '';
                const d = dateStr ? new Date(dateStr) : new Date(NaN);
                if (isNaN(d)) return;
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (!monthGroups[key]) monthGroups[key] = [];
                monthGroups[key].push(m);
            });

            let html = '';
            Object.keys(monthGroups).sort().forEach(monKey => {
                const list = monthGroups[monKey];
                const [y,m] = monKey.split('-');
                html += `<h4 class="mt-4 mb-2">${y}년 ${m}월 (${list.length}경기)</h4>`;

                // 리그별 그룹화
                const grouped = {};
                list.forEach(match => {
                    const league = match.leagueTitle || match.league || '기타';
                    if (!grouped[league]) grouped[league] = [];
                    grouped[league].push(match);
                });

                for (const [league, leagueMatches] of Object.entries(grouped)) {
                    html += `<div class="league-section"><h5 class="league-title">${league}</h5><div class="matches-grid">`;

                    leagueMatches.forEach(match => {
                        const homeTeam = match.HOME_TEAM_NAME || match.homeTeam || match.TEAM_HOME || '';
                        const awayTeam = match.AWAY_TEAM_NAME || match.awayTeam || match.TEAM_AWAY || '';
                        const matchDate = match.MATCH_DATE || match.matchDate || match.date || '';
                        const matchTime = match.MATCH_TIME_FORMATTED || match.matchTime || match.time || '';
                        const homeScore = match.TH_SCORE_FINAL || match.homeScore || '';
                        const awayScore = match.TA_SCORE_FINAL || match.awayScore || '';
                        const status = match.MATCH_STATUS || match.matchStatus || '예정';
                        const stadium = match.STADIUM || match.stadium || match.MATCH_AREA || '경기장 미정';

                        html += `<div class="match-card"><div class="match-header"><div class="match-date">${matchDate}</div><div class="match-time">${matchTime}</div><div class="match-status">${status}</div></div><div class="match-teams"><div class="team home-team"><a href="team.html?team=${encodeURIComponent(homeTeam)}" class="team-name-link">${homeTeam}</a>${homeScore?`<span class="score">${homeScore}</span>`:''}</div><div class="vs">VS</div><div class="team away-team"><a href="team.html?team=${encodeURIComponent(awayTeam)}" class="team-name-link">${awayTeam}</a>${awayScore?`<span class="score">${awayScore}</span>`:''}</div></div><div class="match-venue">${stadium}</div></div>`;
                    });
                    html += `</div></div>`;
                }
            });

            container.innerHTML = html || '<div class="empty-message">조건에 맞는 경기가 없습니다</div>';
        },

        updateAnalyticsDisplay(analytics) {
            const container = document.getElementById('analyticsContainer');
            if (!container) return;

            if (!analytics) {
                container.innerHTML = '<div class="empty-message">통계 데이터가 없습니다</div>';
                return;
            }

            const html = `
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h4>경기 통계</h4>
                        <div class="stat-item">
                            <span class="stat-label">총 경기 수:</span>
                            <span class="stat-value">${analytics.totalMatches || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">완료된 경기:</span>
                            <span class="stat-value">${analytics.completedMatches || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">총 득점:</span>
                            <span class="stat-value">${analytics.totalGoals || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">경기당 평균 득점:</span>
                            <span class="stat-value">${analytics.avgGoals || 0}</span>
                        </div>
                    </div>

                    <div class="analytics-card">
                        <h4>리그 활동</h4>
                        <div class="stat-item">
                            <span class="stat-label">가장 활발한 리그:</span>
                            <span class="stat-value">${analytics.mostActiveLeague || '-'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">최고 득점 경기:</span>
                            <span class="stat-value">${analytics.maxGoalMatch ? `${analytics.maxGoalMatch.homeTeam} vs ${analytics.maxGoalMatch.awayTeam} (${analytics.maxScore}골)` : '-'}</span>
                        </div>
                    </div>

                    <div class="analytics-card">
                        <h4>팀 기록</h4>
                        <div class="stat-item">
                            <span class="stat-label">최다 득점팀:</span>
                            <span class="stat-value">${analytics.topScorer ? `${analytics.topScorer.name} (${analytics.topScorer.goals}골)` : '-'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">최소 실점팀:</span>
                            <span class="stat-value">${analytics.bestDefense ? `${analytics.bestDefense.name} (${analytics.bestDefense.conceded}실점)` : '-'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">최다 승리팀:</span>
                            <span class="stat-value">${analytics.mostWins ? `${analytics.mostWins.name} (${analytics.mostWins.wins}승)` : '-'}</span>
                        </div>
                    </div>
                </div>
            `;

            container.innerHTML = html;
        },

        showAnalyticsError() {
            const container = document.getElementById('analyticsContainer');
            if (container) {
                container.innerHTML = '<div class="error-message">통계 데이터를 불러올 수 없습니다</div>';
            }
        },

        showTeamSuggestions(searchTerm) {
            // TODO: 팀 검색 자동완성 구현
        },

        hideTeamSuggestions() {
            // TODO: 팀 검색 자동완성 숨기기 구현
        }
    },

    // === 유틸리티 함수들 ===
    utils: {
        formatDateWithWeekday(dateString) {
            if (!dateString) return '날짜 미정';
            
            const date = new Date(dateString);
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            const weekday = weekdays[date.getDay()];
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            return `${year}-${month}-${day} (${weekday})`;
        },

        parseMatchTime(rawTime) {
            if (!rawTime) return '시간미정';
            
            if (rawTime.includes('오전') || rawTime.includes('오후')) {
                const timeMatch = rawTime.match(/(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분/);
                if (timeMatch) {
                    const period = timeMatch[1];
                    let hour = parseInt(timeMatch[2]);
                    const minute = parseInt(timeMatch[3]);
                    
                    if (period === '오후' && hour !== 12) hour += 12;
                    if (period === '오전' && hour === 12) hour = 0;
                    
                    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                }
            }
            
            if (/^\d{4}$/.test(rawTime)) {
                return rawTime.slice(0,2) + ':' + rawTime.slice(2);
            } else if (/^\d{1,2}:\d{2}$/.test(rawTime)) {
                return rawTime;
            } else if (/^\d{1,2}$/.test(rawTime)) {
                return rawTime.padStart(2, '0') + ':00';
            }
            
            return '시간미정';
        },

        formatMatchTime(...timeFields) {
            // 다양한 시간 필드 시도
            const validFields = timeFields.filter(t => t && t !== '미정' && t !== '' && t !== null && t !== undefined);
            
            for (const timeField of validFields) {
                const result = this.parseTimeField(timeField);
                if (result && result !== '미정') {
                    return result;
                }
            }
            
            return '미정';
        },

        parseTimeField(rawTime) {
            if (!rawTime || rawTime === '미정' || rawTime === '' || rawTime === null || rawTime === undefined) return '미정';
            
            // 문자열로 변환
            const timeStr = String(rawTime).trim();
            
            // 이미 HH:MM 형식이면 그대로 반환
            if (/^\d{2}:\d{2}$/.test(timeStr)) {
                return timeStr;
            }
            
            // 오전/오후 형식 처리
            if (timeStr.includes('오전') || timeStr.includes('오후')) {
                const timeMatch = timeStr.match(/(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분/);
                if (timeMatch) {
                    const period = timeMatch[1];
                    let hour = parseInt(timeMatch[2]);
                    const minute = parseInt(timeMatch[3]);
                    
                    if (period === '오후' && hour !== 12) hour += 12;
                    if (period === '오전' && hour === 12) hour = 0;
                    
                    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                }
            }
            
            // HHMM 형식 처리
            if (/^\d{4}$/.test(timeStr)) {
                return timeStr.slice(0,2) + ':' + timeStr.slice(2);
            }
            
            // H:MM 또는 HH:MM 형식 처리
            if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
                const parts = timeStr.split(':');
                return `${parts[0].padStart(2, '0')}:${parts[1]}`;
            }
            
            // 시간만 있는 경우
            if (/^\d{1,2}$/.test(timeStr)) {
                return timeStr.padStart(2, '0') + ':00';
            }
            
            // 날짜와 시간이 포함된 경우 (예: "2024-01-01 14:30", "2024-01-01T14:30")
            const dateTimeMatch = timeStr.match(/\d{4}-\d{2}-\d{2}[T\s](\d{1,2}):(\d{2})/);
            if (dateTimeMatch) {
                return `${dateTimeMatch[1].padStart(2, '0')}:${dateTimeMatch[2]}`;
            }
            
            // 한국어 시간 표기 (예: "14시30분", "오후 2시 30분")
            const koreanTimeMatch = timeStr.match(/(\d{1,2})시\s*(\d{1,2})분/);
            if (koreanTimeMatch) {
                return `${koreanTimeMatch[1].padStart(2, '0')}:${koreanTimeMatch[2]}`;
            }
            
            // 일반적인 시간 패턴 추출
            const timeOnly = timeStr.match(/(\d{1,2}):(\d{2})/);
            if (timeOnly) {
                return `${timeOnly[1].padStart(2, '0')}:${timeOnly[2]}`;
            }
            
            // 숫자만 있는 경우 (예: "1430" -> "14:30")
            const numericMatch = timeStr.match(/^(\d{3,4})$/);
            if (numericMatch) {
                const num = numericMatch[1];
                if (num.length === 3) {
                    return `0${num.charAt(0)}:${num.slice(1)}`;
                } else if (num.length === 4) {
                    return `${num.slice(0,2)}:${num.slice(2)}`;
                }
            }
            
            return '미정';
        },

        parseTeam(str) {
            if(!str) return {teamName:'',major:'',minor:''};
            const majors = ['경남','부산','울산','대구','대전','광주','인천','서울','경기','강원','충북','충남','전북','전남','경북','제주'];
            
            const tokens = str.trim().split(' ');
            if(tokens.length>1 && majors.includes(tokens[0])){
                const major = tokens[0];
                const minor = tokens[1].match(/(시|군|구)$/) ? tokens[1] : '';
                const teamName = (minor ? tokens.slice(2) : tokens.slice(1)).join(' ');
                return {teamName, major, minor};
            }
            
            for(const mj of majors){
                if(str.startsWith(mj)){
                    let remain = str.slice(mj.length);
                    let minor = '';
                    const minorMatch = remain.match(/^(.*?(시|군|구))/);
                    if(minorMatch){
                        minor = minorMatch[1];
                        remain = remain.slice(minor.length);
                    }
                    const teamName = remain.trim();
                    return {teamName, major: mj, minor};
                }
            }
            
            return {teamName:str.trim(), major:'', minor:''};
        },

        sortTeams(teams) {
            return teams.sort((a, b) => {
                const getLeagueLevel = (leagueTitle) => {
                    if (!leagueTitle) return 999;
                    if (leagueTitle.includes('K리그1') || leagueTitle.includes('K1')) return 1;
                    if (leagueTitle.includes('K5')) return 5;
                    if (leagueTitle.includes('K6')) return 6;
                    if (leagueTitle.includes('K7')) return 7;
                    return 999;
                };
                
                const levelA = getLeagueLevel(a.leagueTitle);
                const levelB = getLeagueLevel(b.leagueTitle);
                
                if (levelA !== levelB) {
                    return levelA - levelB;
                }
                
                return (a.teamName || '').localeCompare(b.teamName || '', 'ko');
            });
        },

        getLeagueRank(leagueTitle) {
            if (!leagueTitle) return 0;
            const title = leagueTitle.toUpperCase();
            if (title.includes('K리그1') || title.includes('K1리그') || title === 'K1') return 1;
            if (title.includes('K리그2') || title.includes('K2리그') || title === 'K2') return 2;
            if (title.includes('K3') || title.includes('K3리그')) return 3;
            if (title.includes('K4') || title.includes('K4리그')) return 4;
            if (title.includes('K5') || title.includes('K5리그')) return 5;
            if (title.includes('K6') || title.includes('K6리그')) return 6;
            if (title.includes('K7') || title.includes('K7리그')) return 7;
            return 0;
        },

        getLeagueClass(leagueTitle) {
            const rank = this.getLeagueRank(leagueTitle);
            return rank >= 1 && rank <= 7 ? `k${rank}` : 'other';
        },

        simplifyLeagueName(leagueTitle) {
            if (!leagueTitle) return leagueTitle;
            
            // K5-K7 리그명 단순화 및 지역명 추출
            if (leagueTitle.includes('K5')) {
                // "K5리그 경남" -> "K5 경남", "K5리그 경남창원" -> "K5 경남"
                const regionMatches = [
                    leagueTitle.match(/K5.*?(경남|부산|울산|대구|대전|광주|인천|서울|경기|강원|충북|충남|전북|전남|경북|제주)/),
                    leagueTitle.match(/K5.*?([가-힣]+)/),
                ];
                
                for (const match of regionMatches) {
                    if (match) {
                        return `K5 ${match[1]}`;
                    }
                }
                return 'K5';
            }
            
            if (leagueTitle.includes('K6')) {
                const regionMatches = [
                    leagueTitle.match(/K6.*?(경남|부산|울산|대구|대전|광주|인천|서울|경기|강원|충북|충남|전북|전남|경북|제주)/),
                    leagueTitle.match(/K6.*?([가-힣]+)/),
                ];
                
                for (const match of regionMatches) {
                    if (match) {
                        return `K6 ${match[1]}`;
                    }
                }
                return 'K6';
            }
            
            if (leagueTitle.includes('K7')) {
                // K7은 더 상세한 지역 정보 포함
                const detailedMatches = [
                    // 전체 문자열에서 상세 지역명 추출
                    leagueTitle.match(/K7.*?([가-힣]+[A-Za-z]?)/),
                    leagueTitle.match(/K7.*?(양산|창원|김해|밀양|거제|통영|마산|진주|사천|거창|합천)/),
                ];
                
                for (const match of detailedMatches) {
                    if (match) {
                        let region = match[1];
                        // "김해A", "김해B" 등의 경우 대문자를 소문자로 변경
                        if (/[A-Z]$/.test(region)) {
                            region = region.slice(0, -1) + region.slice(-1).toLowerCase();
                        }
                        return `K7 ${region}`;
                    }
                }
                return 'K7';
            }
            
            // 기타 리그는 그대로 반환
            return leagueTitle;
        }
    },

    // === 이벤트 리스너 설정 ===
    events: {
        setupEventListeners() {
            // Bootstrap 탭 이벤트 처리 (다양한 방식으로 시도)
            const handleTabSwitch = async (targetId) => {
                console.log('탭 전환:', targetId);
                
                try {
                    switch (targetId) {
                        case '#newsfeed':
                            console.log('뉴스피드 탭 로딩...');
                            try {
                                await Dashboard.api.loadGroupedMatches();
                            } catch (error) {
                                console.log('그룹화된 경기 로드 실패, 기본 뉴스피드로 폴백:', error);
                                await Dashboard.api.loadNewsFeed();
                            }
                            break;
                        case '#standings':
                            console.log('순위표 탭 로딩...');
                            await Dashboard.api.loadStandings();
                            break;
                        case '#analytics':
                            console.log('분석 탭 로딩...');
                            await Dashboard.api.loadAnalytics();
                            break;
                        case '#management':
                            console.log('관리 탭 로딩...');
                            await Dashboard.management.loadStats();
                            break;
                    }
                } catch (error) {
                    console.error('탭 로딩 실패:', error);
                }
            };

            // 1. Bootstrap 5 이벤트
            document.addEventListener('shown.bs.tab', async (e) => {
                const targetId = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
                await handleTabSwitch(targetId);
            });

            // 2. 클릭 이벤트로도 처리
            document.querySelectorAll('[data-bs-toggle="tab"], .nav-link').forEach(tab => {
                tab.addEventListener('click', async (e) => {
                    setTimeout(async () => {
                        const targetId = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
                        if (targetId) {
                            await handleTabSwitch(targetId);
                        }
                    }, 100);
                });
            });
            
            // Git 정보 새로고침 버튼
            const gitRefreshBtn = document.getElementById('refreshGitInfoDashboard');
            if (gitRefreshBtn) {
                gitRefreshBtn.addEventListener('click', async () => {
                    const originalText = gitRefreshBtn.textContent;
                    gitRefreshBtn.textContent = '⏳ 로딩...';
                    gitRefreshBtn.disabled = true;
                    
                    await Dashboard.api.loadGitInfo();
                    
                    setTimeout(() => {
                        gitRefreshBtn.textContent = originalText;
                        gitRefreshBtn.disabled = false;
                    }, 500);
                });
            }

            // 헤더 팀 검색
            const searchInput = document.getElementById('teamSearchHeader');
            if (searchInput) {
                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        Dashboard.events.searchTeamFromHeader();
                    }
                });
                
                searchInput.addEventListener('input', function() {
                    const searchTerm = this.value.toLowerCase().trim();
                    if (searchTerm.length >= 2) {
                        Dashboard.ui.showTeamSuggestions(searchTerm);
                    } else {
                        Dashboard.ui.hideTeamSuggestions();
                    }
                });
            }

            // 팀 검색 버튼
            const searchBtn = document.querySelector('.team-search-btn-header');
            if (searchBtn) {
                searchBtn.addEventListener('click', Dashboard.events.searchTeamFromHeader);
            }

            // 오늘로 이동 버튼
            const goToTodayBtn = document.getElementById('goToTodayBtn');
            if (goToTodayBtn) {
                goToTodayBtn.addEventListener('click', this.goToToday.bind(this));
            }
        },

        searchTeamFromHeader() {
            const searchInput = document.getElementById('teamSearchHeader');
            const teamName = searchInput.value.trim();
            
            if (!teamName) {
                alert('팀명을 입력해주세요.');
                return;
            }
            
            const foundTeam = Dashboard.state.allTeams.find(team => 
                team.teamName.toLowerCase().includes(teamName.toLowerCase())
            );
            
            if (foundTeam) {
                window.open(`team.html?team=${encodeURIComponent(foundTeam.teamName)}`, '_blank');
                searchInput.value = '';
            } else {
                window.open(`team.html?team=${encodeURIComponent(teamName)}`, '_blank');
                searchInput.value = '';
            }
        },

        goToToday() {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD 형식
            
            // 오늘 날짜의 경기 섹션으로 스크롤
            const dateHeaders = document.querySelectorAll('.date-header');
            let targetElement = null;
            
            for (const header of dateHeaders) {
                if (header.textContent.includes(todayStr) || 
                    header.id === `date-${todayStr}` ||
                    header.dataset.date === todayStr) {
                    targetElement = header;
                    break;
                }
            }
            
            // 오늘 날짜가 없으면 현재 날짜와 가장 가까운 미래 날짜 찾기
            if (!targetElement) {
                const currentDate = today.getTime();
                let closestElement = null;
                let minDiff = Infinity;
                
                for (const header of dateHeaders) {
                    const dateText = header.textContent || header.dataset.date;
                    if (dateText) {
                        const headerDate = new Date(dateText.match(/\d{4}-\d{2}-\d{2}/)?.[0] || dateText);
                        const diff = headerDate.getTime() - currentDate;
                        
                        if (diff >= 0 && diff < minDiff) {
                            minDiff = diff;
                            closestElement = header;
                        }
                    }
                }
                targetElement = closestElement;
            }
            
            if (targetElement) {
                targetElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
                
                // 시각적 강조 효과
                targetElement.style.backgroundColor = '#e3f2fd';
                setTimeout(() => {
                    targetElement.style.backgroundColor = '';
                }, 2000);
            } else {
                // 오늘 경기가 없는 경우 알림
                Dashboard.ui.showRefreshMessage('info', '📅 오늘 예정된 경기가 없습니다.');
            }
        },

        managementTab() {
            const managementTab = document.getElementById('management-tab');
            if (managementTab) {
                managementTab.addEventListener('shown.bs.tab', async () => {
                    await Dashboard.management.loadStats();
                });
            }
        }
    },

    // === 초기화 함수 ===
    async init() {
        console.log('🚀 Dashboard 초기화 시작');
        
        try {
            // 이벤트 리스너 설정
            this.events.setupEventListeners();
            
            // 웹소켓 연결 설정
            this.setupWebSocket();
            
            // 초기 데이터 로드 (순서대로 로드)
            try {
                await this.api.loadGroupedMatches();
            } catch (error) {
                console.log('초기 그룹화된 경기 로드 실패, 기본 뉴스피드로 폴백:', error);
                await this.api.loadNewsFeed();
            }
            await this.api.loadRegions();
            await this.api.loadTeams();
            await this.api.loadGitInfo();
            
            console.log('✅ Dashboard 초기화 완료');
        } catch (error) {
            console.error('❌ Dashboard 초기화 실패:', error);
        }
    },

    setupWebSocket() {
        try {
            // Socket.IO 연결
            if (typeof io !== 'undefined') {
                const socket = io();
                
                // 경기 업데이트 알림 수신
                socket.on('match-updated', (data) => {
                    console.log('🔔 경기 업데이트 알림:', data);
                    Dashboard.ui.showRefreshMessage('info', 
                        `✅ ${data.homeTeam} vs ${data.awayTeam} 경기 결과가 업데이트되었습니다!`);
                    
                    // 자동 데이터 새로고침 비활성화됨
                    // setTimeout(() => {
                    //     Dashboard.ui.refreshMatchesData();
                    // }, 2000);
                });
                
                // 스케줄러 상태 변경 알림 수신
                socket.on('scheduler-status', (data) => {
                    console.log('📅 스케줄러 상태 변경:', data);
                    Dashboard.ui.checkSchedulerStatus();
                });
                
                console.log('🔗 웹소켓 연결 설정 완료');
            } else {
                console.log('⚠️ Socket.IO 라이브러리를 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('❌ 웹소켓 설정 실패:', error);
        }
    }
};

// === 전역 함수들 (하위 호환성을 위해 유지) ===
window.toggleFullscreen = () => Dashboard.ui.toggleFullscreen();
window.searchTeamFromHeader = () => Dashboard.events.searchTeamFromHeader();
window.refreshAllData = () => Dashboard.init();
window.exportData = () => {
    const data = {
        standings: Dashboard.state.allStandings,
        matches: Dashboard.state.allMatches,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `k-league-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// === DOM 로드 완료 시 초기화 ===
document.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});

// ===== Management Functions =====

// 전체 데이터 새로고침
Dashboard.management = {
    refreshAllData: async function() {
        try {
            // 모든 데이터 초기화
            Dashboard.state.allStandings = [];
            Dashboard.state.allMatches = [];
            Dashboard.state.allAnalytics = null;
            Dashboard.state.rawUpcomingMatches = [];
            
            // 현재 활성 탭 확인
            const activeTab = document.querySelector('.nav-tabs .nav-link.active');
            if (activeTab) {
                const tabId = activeTab.getAttribute('data-bs-target');
                switch (tabId) {
                    case '#newsfeed':
                        try {
                            await Dashboard.api.loadGroupedMatches();
                        } catch (error) {
                            console.log('그룹화된 경기 로드 실패, 기본 뉴스피드로 폴백:', error);
                            await Dashboard.api.loadNewsFeed();
                        }
                        break;
                    case '#standings':
                        await Dashboard.api.loadStandings();
                        break;
                    case '#analytics':
                        await Dashboard.api.loadAnalytics();
                        break;
                }
            }
            
            // 통계 업데이트
            await Dashboard.management.loadStats();
            
            alert('모든 데이터가 새로고침되었습니다.');
        } catch (error) {
            console.error('데이터 새로고침 실패:', error);
            alert('데이터 새로고침 중 오류가 발생했습니다.');
        }
    },

    exportData: function() {
        const data = {
            standings: Dashboard.state.allStandings,
            matches: Dashboard.state.allMatches,
            analytics: Dashboard.state.allAnalytics,
            exportDate: new Date().toISOString(),
            exportBy: 'K-League Dashboard'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `k-league-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    loadStats: async function() {
        try {
            // 기존 데이터가 있으면 사용, 없으면 API 호출
            let matches = Dashboard.state.allMatches;
            if (!matches || matches.length === 0) {
                const response = await fetch('/api/matches');
                matches = await response.json();
            }

            const totalMatches = matches.length;
            const completedMatches = matches.filter(m => 
                m.MATCH_STATUS === '완료' || m.matchStatus === '완료'
            ).length;
            const activeLeagues = [...new Set(matches.map(m => 
                m.leagueTitle || m.league
            ).filter(Boolean))].length;
            const activeTeams = [...new Set([
                ...matches.map(m => m.HOME_TEAM_NAME).filter(Boolean),
                ...matches.map(m => m.AWAY_TEAM_NAME).filter(Boolean)
            ])].length;

            // UI 업데이트
            const totalEl = document.getElementById('totalMatches');
            const completedEl = document.getElementById('completedMatches');
            const leaguesEl = document.getElementById('activeLeagues');
            const teamsEl = document.getElementById('activeTeams');

            if (totalEl) totalEl.textContent = totalMatches;
            if (completedEl) completedEl.textContent = completedMatches;
            if (leaguesEl) leaguesEl.textContent = activeLeagues;
            if (teamsEl) teamsEl.textContent = activeTeams;

        } catch (error) {
            console.error('통계 로드 실패:', error);
        }
    }
};

// 전역 함수들 (하위 호환성)
window.refreshAllData = Dashboard.management.refreshAllData;
window.exportData = Dashboard.management.exportData;

// Management 탭 활성화 시 통계 로드
Dashboard.events.managementTab = function() {
    const managementTab = document.getElementById('management-tab');
    if (managementTab) {
        managementTab.addEventListener('shown.bs.tab', async () => {
            await Dashboard.management.loadStats();
        });
    }
};

// Management 이벤트 리스너를 기존 이벤트에 추가
const originalFirebaseEvents = Dashboard.events.firebase;
Dashboard.events.firebase = function() {
    originalFirebaseEvents();
    Dashboard.events.managementTab();
};

// === Bulk Delete Function ===
window.bulkDeleteDocuments = async function () {
  const league = document.getElementById('deleteLeagueInput')?.value.trim();
  const startDate = document.getElementById('deleteStartDate')?.value;
  const endDate   = document.getElementById('deleteEndDate')?.value;
  const matchStatus = document.getElementById('deleteStatus')?.value;
  const matchIdx = document.getElementById('deleteMatchIdx')?.value.trim();
  const leagueTag = document.getElementById('deleteLeagueTag')?.value.trim();
  const year = document.getElementById('deleteYear')?.value.trim();

  if (!league && !startDate && !endDate && !matchStatus && !matchIdx && !leagueTag && !year) {
    alert('하나 이상의 조건을 입력해야 합니다.');
    return;
  }

  const confirmMsg = `선택한 조건에 해당하는 문서를 삭제하시겠습니까?\n`+
    `리그: ${league || '전체'} / 상태: ${matchStatus || '전체'}\n`+
    `matchIdx: ${matchIdx || '미지정'} / leagueTag: ${leagueTag || '미지정'} / year: ${year || '미지정'}\n`+
    `기간: ${startDate || '제한 없음'} ~ ${endDate || '제한 없음'}\n`+
    `※ 삭제한 데이터는 복구할 수 없습니다.`;
  if (!confirm(confirmMsg)) return;

  try {
    document.getElementById('deleteResult').textContent = '삭제 중...';

    const resp = await fetch('/api/matches/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagueTitle: league || undefined, startDate: startDate || undefined, endDate: endDate || undefined, matchStatus: matchStatus || undefined, matchIdx: matchIdx || undefined, leagueTag: leagueTag || undefined, year: year || undefined })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '삭제 실패');

    document.getElementById('deleteResult').textContent = `✅ ${data.deletedCount}건 삭제 완료`;

    // 데이터 통계 갱신
    await Dashboard.management.loadStats();
    // 필요 시 다른 캐시 데이터 초기화
    Dashboard.state.allMatches = Dashboard.state.allMatches.filter(m => {
      if (league && m.leagueTitle !== league) return true;
      if (matchStatus && (m.matchStatus || m.MATCH_STATUS) !== matchStatus) return true;
      if (startDate || endDate) {
        const dateStr = m.MATCH_DATE || m.matchDate || m.date || m.DATE;
        const d = new Date(dateStr);
        if (startDate && d < new Date(startDate)) return true;
        if (endDate && d > new Date(endDate)) return true;
      }
      return false; // 삭제 대상
    });
  } catch (err) {
    console.error(err);
    document.getElementById('deleteResult').textContent = `❌ 오류: ${err.message}`;
  }
};