#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 먼저 실행하여 puppeteer를 포함한 모든 종속성을 설치합니다.
npm install

# Puppeteer가 Chrome을 다운로드하고 압축을 풀 캐시 디렉토리를 지정하고 생성합니다.
# Render의 빌드 캐시는 /opt/render/.cache에 마운트됩니다.
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Puppeteer의 설치 스크립트(ES 모듈)를 직접 실행하여 브라우저를 다운로드합니다.
node ./node_modules/puppeteer/install.mjs 