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

        async loadMatches() {
            const container = document.getElementById('matchesContainer');
            container.innerHTML = Dashboard.ui.getLoadingSpinner('경기 데이터를 불러오는 중...');

            try {
                const response = await fetch('/api/matches');
                Dashboard.state.allMatches = await response.json();
                Dashboard.ui.displayMatches(Dashboard.state.allMatches);
            } catch (error) {
                console.error('경기 목록 로드 실패:', error);
                container.innerHTML = Dashboard.ui.getErrorState('경기 데이터를 불러올 수 없습니다');
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

        displayUpcomingMatchesEnhanced(matches) {
            const container = document.getElementById('upcomingMatchesSection');
            if (!matches || !Array.isArray(matches)) {
                container.innerHTML = '<div class="empty-message">경기 데이터를 불러올 수 없습니다</div>';
                return;
            }

            const getLeagueRank = (league='') => {
                const name = league.toUpperCase();
                if (name.includes('K리그1') || name.includes('K1')) return 1;
                if (name.includes('K리그2') || name.includes('K2')) return 2;
                if (name.includes('K3')) return 3;
                if (name.includes('K4')) return 4;
                if (name.includes('K5')) return 5;
                if (name.includes('K6')) return 6;
                if (name.includes('K7')) return 7;
                return 99;
            };

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

            const renderTeamHtml = (rawTeamName, leagueRank) => {
                if (leagueRank < 5) {
                    const encoded = encodeURIComponent(rawTeamName);
                    return `<div class="team-wrapper"><a href="team.html?team=${encoded}" class="team-name-link" title="${rawTeamName}">${rawTeamName}</a></div>`;
                } else {
                    const parsed = Dashboard.utils.parseTeam(rawTeamName);
                    const teamName = parsed.teamName || rawTeamName;
                    const regionLabel = parsed.major ? `<div class="region-label">${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}</div>` : '';
                    const encoded = encodeURIComponent(teamName);
                    return `<div class="team-wrapper">${regionLabel}<a href="team.html?team=${encoded}" class="team-name-link" title="${teamName}">${teamName}</a></div>`;
                }
            };

            // 이번주 경기만 필터링
            const now = new Date();
            const thisWeekEnd = new Date(now);
            const daysToSunday = 7 - now.getDay(); // 이번주 일요일까지
            thisWeekEnd.setDate(now.getDate() + daysToSunday);

            let filteredMatches = matches
                .filter(m => {
                    const matchDate = m.MATCH_DATE || m.matchDate || m.date || m.DATE;
                    if (!matchDate) return false;
                    const d = safeParseDate(matchDate);
                    const thisWeekStart = new Date(now);
                    thisWeekStart.setDate(now.getDate() - now.getDay());
                    return d >= thisWeekStart && d <= thisWeekEnd;
                })
                .filter(m => {
                    if (!Dashboard.state.upcomingLeagueFilter) return true;
                    const leagueTitle = (m.leagueTitle || m.league || m.LEAGUE || '').replace(/k4리그/gi,'K4리그');
                    return leagueTitle === Dashboard.state.upcomingLeagueFilter;
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
                    const parsed = Dashboard.utils.parseTeam(raw);
                    const regionText = parsed.major ? `${parsed.major}${parsed.minor ? ' ' + parsed.minor : ''}` : '';
                    const teamName  = parsed.teamName || raw;
                    const encoded   = encodeURIComponent(teamName);
                    const linkHtml  = `<a href=\"team.html?team=${encoded}\" class=\"team-name-link\">${teamName}</a>`;
                    if (leagueRank <= 4) return `<a href="team.html?team=${encodeURIComponent(raw)}" class="team-name-link">${raw}</a>`;
                    const regionLabel = regionText ? `<span class=\"region-label\">${regionText}</span><br/>` : '';
                    return `${regionLabel}${linkHtml}`;
                };

                const tableRows = sortedMatches.map(match => {
                    const matchDateObj = safeParseDate(match.MATCH_DATE || match.matchDate || match.date || match.DATE);
                    const time = Dashboard.utils.parseMatchTime(
                        match.formattedTime || match.MATCH_TIME_FORMATTED || match.TIME || match.time || match.MATCH_TIME || '',
                        matchDateObj
                    );

                    let league = match.leagueTitle || match.league || match.LEAGUE || '';
                    league = league.replace(/k4리그/gi, 'K4리그');
                    const leagueRank = getLeagueRank(league);
                    const leagueClass = (leagueRank >= 1 && leagueRank <= 7) ? `k${leagueRank}` : 'other';

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

                return `
                    <div class="date-section">
                        <h4 class="date-header">${dateHeader} (${matchList.length}경기)</h4>
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
                `;
            };

            if (filteredMatches.length === 0) {
                container.innerHTML = `
                    <div class="upcoming-header">
                        <h2>⚽ 이번주 경기</h2>
                    </div>
                    <div class="empty-message">이번주 예정된 경기가 없습니다</div>
                `;
                Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
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

            const html = `
                <button class="fullscreen-toggle" onclick="Dashboard.ui.toggleFullscreen()" title="전체화면 토글">
                    <i class="fas fa-expand"></i>
                </button>
                <div class="upcoming-header">
                    <h2>⚽ 이번주 경기 (${filteredMatches.length}경기)</h2>
                </div>
                
                <div class="matches-container compact">
                    ${dateSections}
                </div>
            `;

            container.innerHTML = html;
            Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches);
        },        renderUpcomingLeagueToggle(matches) {
            const container = document.getElementById('upcomingMatchesSection');
            if(!container) return;

            container.querySelector('.league-toggle-container')?.remove();

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

            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'league-toggle-container';

            const allBtn = document.createElement('button');
            allBtn.className = 'league-toggle-btn btn-other' + (Dashboard.state.upcomingLeagueFilter === '' ? ' active' : '');
            allBtn.textContent = '전체';
            allBtn.onclick = () => {
                Dashboard.state.upcomingLeagueFilter = ''; 
                Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches); 
                Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
            };
            toggleDiv.appendChild(allBtn);

            uniqueLeagues.forEach(lg => {
                const btn = document.createElement('button');
                const colorClass = lg.includes('K5')? 'btn-k5' : lg.includes('K6')? 'btn-k6' : lg.includes('K7')? 'btn-k7' : lg.includes('K4')? 'btn-k4' : lg.includes('K3')? 'btn-k3' : lg.includes('K리그2')||lg.includes('K2')? 'btn-k2' : lg.includes('K리그1')||lg.includes('K1')? 'btn-k1' : 'btn-other';
                btn.className = 'league-toggle-btn '+colorClass + (Dashboard.state.upcomingLeagueFilter === lg ? ' active' : '');
                btn.textContent = lg;
                btn.onclick = () => {
                    Dashboard.state.upcomingLeagueFilter = lg; 
                    Dashboard.ui.renderUpcomingLeagueToggle(Dashboard.state.rawUpcomingMatches); 
                    Dashboard.ui.displayUpcomingMatchesEnhanced(Dashboard.state.rawUpcomingMatches);
                };
                toggleDiv.appendChild(btn);
            });

            const header = container.querySelector('.upcoming-header');
            if (header) {
                header.appendChild(toggleDiv);
            } else {
                container.prepend(toggleDiv);
            }
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
                        <button class="btn btn-primary btn-sm" onclick="Dashboard.api.loadNewsFeed()">다시 시도</button>
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

            let html = '';

            data.forEach(group => {
                const leagueName = group.league || group.leagueTitle || '리그';
                const teams = Array.isArray(group.standings) ? [...group.standings] : [];

                teams.sort((a, b) => {
                    if (b.points !== a.points) return b.points - a.points;
                    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
                    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
                    return a.teamName.localeCompare(b.teamName, 'ko-KR');
                });

                html += `
                    <div class="league-section">
                        <h3 class="league-title">${leagueName}</h3>
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>순위</th>
                                        <th>구단명</th>
                                        <th>경기수</th>
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
                    html += `
                        <tr>
                            <td>${idx + 1}</td>
                            <td><a href="team.html?team=${encodeURIComponent(t.teamName)}">${t.teamName}</a></td>
                            <td>${t.played}</td>
                            <td><strong>${t.points}</strong></td>
                            <td>${t.won}</td>
                            <td>${t.drawn}</td>
                            <td>${t.lost}</td>
                            <td>${t.goalsFor}</td>
                            <td>${t.goalsAgainst}</td>
                            <td>${t.goalDifference}</td>
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

        parseMatchTime(rawTime, matchDate) {
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
                            await Dashboard.api.loadNewsFeed();
                            break;
                        case '#standings':
                            console.log('순위표 탭 로딩...');
                            await Dashboard.api.loadStandings();
                            break;
                        case '#matches':
                            console.log('경기 탭 로딩...');
                            await Dashboard.api.loadMatches();
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
            
            // 초기 데이터 로드 (순서대로 로드)
            await this.api.loadNewsFeed();
            await this.api.loadRegions();
            await this.api.loadTeams();
            await this.api.loadGitInfo();
            
            console.log('✅ Dashboard 초기화 완료');
        } catch (error) {
            console.error('❌ Dashboard 초기화 실패:', error);
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
                        await Dashboard.api.loadNewsFeed();
                        break;
                    case '#standings':
                        await Dashboard.api.loadStandings();
                        break;
                    case '#matches':
                        await Dashboard.api.loadMatches();
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