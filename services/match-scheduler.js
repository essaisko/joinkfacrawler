/**
 * 경기 일정 기반 자동 크롤링 및 업로드 서비스
 * 각 경기가 끝난 후 해당 경기 데이터만 자동으로 업데이트
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const FirebaseService = require('../firebase-service');

class MatchScheduler {
    constructor(firebaseService = null) {
        // Firebase 서비스 인스턴스 설정
        this.firebaseService = firebaseService;
        this.scheduledJobs = new Map();
        this.isRunning = false;
        
        // 5분마다 경기 스케줄 체크
        this.scheduleChecker = null;
    }

    /**
     * Firebase 서비스 초기화
     */
    initializeFirebase() {
        if (!this.firebaseService) {
            this.firebaseService = new FirebaseService();
        }
    }

    /**
     * 스케줄러 시작
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ 스케줄러가 이미 실행 중입니다.');
            return;
        }

        this.isRunning = true;
        console.log('🚀 경기 스케줄러 시작됨');

        // 5분마다 경기 일정 확인
        this.scheduleChecker = cron.schedule('*/5 * * * *', () => {
            this.checkAndScheduleMatches();
        });

        // 초기 실행
        this.checkAndScheduleMatches();
    }

    /**
     * 스케줄러 중지
     */
    stop() {
        this.isRunning = false;
        
        if (this.scheduleChecker) {
            this.scheduleChecker.stop();
            this.scheduleChecker = null;
        }

        // 모든 예약된 작업 취소
        this.scheduledJobs.forEach((job, matchId) => {
            job.stop();
            console.log(`❌ 경기 ${matchId} 자동 업데이트 취소됨`);
        });
        this.scheduledJobs.clear();

        console.log('🛑 경기 스케줄러 중지됨');
    }

    /**
     * 경기 일정 확인 및 스케줄 등록
     */
    async checkAndScheduleMatches() {
        try {
            console.log('🔍 경기 일정 확인 중...');
            
            // Firebase 서비스 초기화
            this.initializeFirebase();
            
            // 오늘과 내일 경기 조회
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const todayStr = today.toISOString().split('T')[0];
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            
            const upcomingMatches = await this.getUpcomingMatches(todayStr, tomorrowStr);
            
            for (const match of upcomingMatches) {
                await this.scheduleMatchUpdate(match);
            }
            
            console.log(`✅ ${upcomingMatches.length}개 경기 스케줄 확인 완료`);
            
        } catch (error) {
            console.error('❌ 경기 일정 확인 실패:', error);
        }
    }

    /**
     * 다가오는 경기 조회
     */
    async getUpcomingMatches(startDate, endDate) {
        try {
            if (!this.firebaseService || !this.firebaseService.db) {
                console.log('Firebase 서비스가 초기화되지 않았습니다.');
                return [];
            }

            const matches = await this.firebaseService.db.collection('matches')
                .where('MATCH_DATE', '>=', startDate)
                .where('MATCH_DATE', '<=', endDate)
                .where('matchStatus', '==', '예정')
                .get();
            
            return matches.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(match => {
                // 경기 시간이 있는 경기만 처리
                return match.MATCH_TIME && match.MATCH_TIME !== '미정';
            });
        } catch (error) {
            console.error('경기 조회 실패:', error);
            return [];
        }
    }

    /**
     * 특정 경기 업데이트 스케줄 등록
     */
    async scheduleMatchUpdate(match) {
        const matchId = match.id;
        
        // 이미 스케줄된 경기는 스킵
        if (this.scheduledJobs.has(matchId)) {
            return;
        }

        try {
            // 경기 종료 예상 시간 계산
            const endTime = this.calculateMatchEndTime(match);
            
            if (!endTime || endTime <= new Date()) {
                console.log(`⏰ 경기 ${matchId} 이미 종료된 시간으로 스킵`);
                return;
            }

            // 경기 종료 후 5분 뒤에 업데이트 스케줄
            const updateTime = new Date(endTime.getTime() + 5 * 60 * 1000);
            
            // cron 표현식 생성
            const cronExpression = this.dateToCronExpression(updateTime);
            
            // 스케줄 등록
            const job = cron.schedule(cronExpression, async () => {
                console.log(`🎯 경기 ${matchId} 자동 업데이트 시작`);
                await this.updateSingleMatch(match);
                
                // 일회성 작업이므로 완료 후 제거
                this.scheduledJobs.delete(matchId);
                job.stop();
            });
            
            this.scheduledJobs.set(matchId, job);
            
            console.log(`📅 경기 ${matchId} 업데이트 스케줄됨: ${updateTime.toLocaleString('ko-KR')}`);
            console.log(`   ${match.HOME_TEAM_NAME} vs ${match.AWAY_TEAM_NAME}`);
            
        } catch (error) {
            console.error(`경기 ${matchId} 스케줄 등록 실패:`, error);
        }
    }

    /**
     * 경기 종료 예상 시간 계산
     */
    calculateMatchEndTime(match) {
        try {
            const matchDate = match.MATCH_DATE;
            const matchTime = match.MATCH_TIME;
            
            if (!matchDate || !matchTime || matchTime === '미정') {
                return null;
            }
            
            // 경기 시작 시간 파싱
            const startTime = new Date(`${matchDate}T${matchTime}:00+09:00`);
            
            // 축구 경기는 일반적으로 2시간 소요 (90분 + 하프타임 + 연장 등)
            const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
            
            return endTime;
        } catch (error) {
            console.error('경기 종료 시간 계산 실패:', error);
            return null;
        }
    }

    /**
     * Date 객체를 cron 표현식으로 변환
     */
    dateToCronExpression(date) {
        const minute = date.getMinutes();
        const hour = date.getHours();
        const day = date.getDate();
        const month = date.getMonth() + 1;
        
        return `${minute} ${hour} ${day} ${month} *`;
    }

    /**
     * 단일 경기 데이터 업데이트
     */
    async updateSingleMatch(match) {
        try {
            console.log(`🕷️ 경기 ${match.id} 크롤링 시작`);
            
            // 해당 경기만 크롤링
            const crawlResult = await this.crawlSingleMatch(match);
            
            if (crawlResult.success) {
                console.log(`📤 경기 ${match.id} 업로드 시작`);
                
                // 해당 경기만 업로드
                const uploadResult = await this.uploadSingleMatch(match);
                
                if (uploadResult.success) {
                    // 캐시 무효화
                    this.firebaseService.invalidateCache();
                    
                    console.log(`✅ 경기 ${match.id} 자동 업데이트 완료`);
                    console.log(`   ${match.HOME_TEAM_NAME} vs ${match.AWAY_TEAM_NAME}`);
                    
                    // 웹소켓으로 클라이언트에 업데이트 알림 (옵션)
                    this.notifyClients(match);
                } else {
                    console.error(`❌ 경기 ${match.id} 업로드 실패`);
                }
            } else {
                console.error(`❌ 경기 ${match.id} 크롤링 실패`);
            }
            
        } catch (error) {
            console.error(`경기 ${match.id} 업데이트 실패:`, error);
        }
    }

    /**
     * 단일 경기 크롤링
     */
    async crawlSingleMatch(match) {
        return new Promise((resolve, reject) => {
            const crawlProcess = spawn('node', [
                'meat.js',
                `--year=${match.year || new Date().getFullYear()}`,
                `--month=${match.MATCH_DATE.split('-')[1]}`,
                `--matchIdx=${match.matchIdx}`,
                `--mode=single`
            ], {
                cwd: process.cwd(),
                stdio: 'pipe'
            });
            
            let output = '';
            let errorOutput = '';
            
            crawlProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            crawlProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            crawlProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output });
                } else {
                    reject(new Error(`크롤링 실패: ${errorOutput}`));
                }
            });
            
            // 타임아웃 설정 (30초)
            setTimeout(() => {
                crawlProcess.kill();
                reject(new Error('크롤링 타임아웃'));
            }, 30000);
        });
    }

    /**
     * 단일 경기 업로드
     */
    async uploadSingleMatch(match) {
        return new Promise((resolve, reject) => {
            const uploadProcess = spawn('node', [
                'firebase_uploader.js',
                `--year=${match.year || new Date().getFullYear()}`,
                `--month=${match.MATCH_DATE.split('-')[1]}`,
                `--matchIdx=${match.matchIdx}`,
                `--mode=single`
            ], {
                cwd: process.cwd(),
                stdio: 'pipe'
            });
            
            let output = '';
            let errorOutput = '';
            
            uploadProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            uploadProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            uploadProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output });
                } else {
                    reject(new Error(`업로드 실패: ${errorOutput}`));
                }
            });
            
            // 타임아웃 설정 (30초)
            setTimeout(() => {
                uploadProcess.kill();
                reject(new Error('업로드 타임아웃'));
            }, 30000);
        });
    }

    /**
     * 클라이언트에 업데이트 알림 (웹소켓)
     */
    notifyClients(match) {
        try {
            // 웹소켓 연결이 있다면 클라이언트에 알림
            if (global.io) {
                global.io.emit('match-updated', {
                    matchId: match.id,
                    homeTeam: match.HOME_TEAM_NAME,
                    awayTeam: match.AWAY_TEAM_NAME,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('클라이언트 알림 실패:', error);
        }
    }

    /**
     * 스케줄러 상태 조회
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            scheduledJobs: Array.from(this.scheduledJobs.keys()),
            totalJobs: this.scheduledJobs.size
        };
    }
}

module.exports = MatchScheduler;