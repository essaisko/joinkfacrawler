const { join } = require('path');

/**
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  // 캐시 디렉토리를 프로젝트 루트 아래의 .chrome-cache 폴더로 변경합니다.
  cacheDirectory: join(__dirname, '.chrome-cache'),
}; 