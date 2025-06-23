#!/usr/bin/env bash
# exit on error
set -o errexit

# npm install을 실행하면 puppeteer가 .puppeteerrc.cjs 파일을 참조하여
# 프로젝트 내부에 브라우저를 설치합니다.
npm install 