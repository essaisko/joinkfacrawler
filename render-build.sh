#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 먼저 실행하여 puppeteer를 포함한 모든 종속성을 설치합니다.
npm install

# Puppeteer가 Chrome을 다운로드하고 압축을 풀 캐시 디렉토리를 지정하고 생성합니다.
# Render의 빌드 캐시는 /opt/render/.cache에 마운트됩니다.
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# npx의 권한 문제를 피하기 위해 node를 사용하여 puppeteer cli 스크립트를 직접 실행합니다.
node ./node_modules/puppeteer/bin/puppeteer.js browsers install chrome 