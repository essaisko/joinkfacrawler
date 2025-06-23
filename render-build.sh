#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 먼저 실행하여 puppeteer를 포함한 모든 종속성을 설치합니다.
npm install

# 디버깅: puppeteer 디렉토리 내용 확인
echo "--- Checking contents of node_modules/puppeteer ---"
ls -la ./node_modules/puppeteer || echo "puppeteer directory not found"
echo "------------------------------------------------"

# Puppeteer가 Chrome을 다운로드하고 압축을 풀 캐시 디렉토리를 지정하고 생성합니다.
# Render의 빌드 캐시는 /opt/render/.cache에 마운트됩니다.
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Puppeteer의 설치 스크립트를 직접 실행하여 브라우저를 다운로드합니다.
# 이것은 npm postinstall과 유사하게 작동하지만 명시적으로 실행됩니다.
node ./node_modules/puppeteer/install.js 