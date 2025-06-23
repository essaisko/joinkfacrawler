#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 먼저 실행하여 puppeteer를 포함한 모든 종속성을 설치합니다.
npm install

# Puppeteer가 Chrome을 다운로드하고 압축을 풀 캐시 디렉토리를 지정하고 생성합니다.
# Render의 빌드 캐시는 /opt/render/.cache에 마운트됩니다.
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Puppeteer가 browser를 설치하도록 합니다.
# PUPPETEER_CACHE_DIR를 설정했기 때문에 여기에 설치됩니다.
# 이 명령은 Chrome이 이미 캐시 디렉토리에 있는 경우 아무 작업도 수행하지 않으므로 실행해도 안전합니다.
npx puppeteer browsers install chrome 