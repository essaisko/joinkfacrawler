#!/usr/bin/env bash
# exit on error
set -o errexit

# Puppeteer가 Chrome을 Render의 빌드 캐시에 다운로드하도록 설정
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# npm install 실행 (Puppeteer가 Chrome을 다운로드함)
npm install

# Chrome을 프로젝트 디렉토리로 복사하여 런타임에서 사용할 수 있도록 함
echo "=== Copying Chrome to project directory ==="
mkdir -p ./chrome-bin
if [ -d "/opt/render/.cache/puppeteer" ]; then
  # Chrome 실행 파일을 찾아서 복사
  find /opt/render/.cache/puppeteer -name "chrome" -type f -executable | head -1 | while read chrome_path; do
    if [ -n "$chrome_path" ]; then
      echo "Found Chrome at: $chrome_path"
      # Chrome과 관련 파일들을 모두 복사
      chrome_dir=$(dirname "$chrome_path")
      cp -r "$chrome_dir" ./chrome-bin/
      echo "Chrome copied to ./chrome-bin/"
    fi
  done
else
  echo "Puppeteer cache directory not found"
fi
echo "=== Chrome copy completed ==="

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