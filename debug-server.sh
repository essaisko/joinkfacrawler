#!/bin/bash

echo "=== 서버 디버깅 스크립트 ==="
echo "현재 시간: $(date)"
echo

echo "1. nginx 상태 확인:"
sudo systemctl status nginx --no-pager
echo

echo "2. Node.js 프로세스 확인:"
ps aux | grep node
echo

echo "3. 포트 3000 사용 현황:"
sudo netstat -tlnp | grep :3000
echo

echo "4. PM2 상태 확인:"
pm2 status
echo

echo "5. 애플리케이션 로그 확인 (최근 20줄):"
pm2 logs --lines 20
echo

echo "6. nginx 오류 로그 확인 (최근 10줄):"
sudo tail -10 /var/log/nginx/error.log
echo

echo "7. 프로젝트 디렉토리 확인:"
ls -la /home/ubuntu/joinkfacrawler/
echo

echo "8. 수동으로 서버 실행 테스트:"
echo "cd /home/ubuntu/joinkfacrawler && node server.js 명령어로 수동 실행 가능한지 확인해보세요." 