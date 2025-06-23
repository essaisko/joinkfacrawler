#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 실행하면 puppeteer가 .puppeteerrc.cjs 파일을 참조하여
# 프로젝트 내부에 브라우저를 설치합니다.
npm install

# 디버깅: Chrome이 어디에 설치되었는지 확인
echo "=== Checking Chrome installation locations ==="
find /opt/render -name "chrome" -type f 2>/dev/null || echo "No chrome executable found in /opt/render"
find . -name "chrome" -type f 2>/dev/null || echo "No chrome executable found in current directory"
echo "=== End of Chrome location check ==="

# Puppeteer 캐시 디렉토리 확인
echo "=== Checking Puppeteer cache directories ==="
ls -la /opt/render/.cache/puppeteer/ 2>/dev/null || echo "No /opt/render/.cache/puppeteer/"
ls -la ./.chrome-cache/ 2>/dev/null || echo "No ./.chrome-cache/"
echo "=== End of cache directory check ===" 