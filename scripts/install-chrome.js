#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Installing Chrome for Puppeteer...');

try {
  // Chrome을 설치할 디렉토리 생성
  const chromeDir = path.join(__dirname, '..', 'chrome');
  if (!fs.existsSync(chromeDir)) {
    fs.mkdirSync(chromeDir, { recursive: true });
  }

  // 환경 변수 설정
  process.env.PUPPETEER_CACHE_DIR = chromeDir;
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'false';

  console.log(`📁 Chrome will be installed to: ${chromeDir}`);

  // Puppeteer의 브라우저 설치 명령 실행
  try {
    console.log('⬇️ Downloading Chrome...');
    execSync('npx puppeteer browsers install chrome', { 
      stdio: 'inherit',
      env: { ...process.env, PUPPETEER_CACHE_DIR: chromeDir }
    });
    console.log('✅ Chrome installation completed successfully!');
  } catch (npxError) {
    console.log('⚠️ npx failed, trying alternative method...');
    
    // npx가 실패하면 node로 직접 실행
    const puppeteerPath = path.join(__dirname, '..', 'node_modules', 'puppeteer');
    const installScript = path.join(puppeteerPath, 'install.mjs');
    
    if (fs.existsSync(installScript)) {
      execSync(`node ${installScript}`, { 
        stdio: 'inherit',
        env: { ...process.env, PUPPETEER_CACHE_DIR: chromeDir }
      });
      console.log('✅ Chrome installation completed via install script!');
    } else {
      console.log('⚠️ Install script not found, Chrome may not be available');
    }
  }

  // 설치된 Chrome 경로 확인
  const findChrome = (dir) => {
    if (!fs.existsSync(dir)) return null;
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const result = findChrome(fullPath);
        if (result) return result;
      } else if (item.name === 'chrome' && fs.statSync(fullPath).mode & parseInt('111', 8)) {
        return fullPath;
      }
    }
    return null;
  };

  const chromePath = findChrome(chromeDir);
  if (chromePath) {
    console.log(`🎯 Chrome found at: ${chromePath}`);
    
    // Chrome 경로를 파일로 저장
    const configPath = path.join(__dirname, '..', 'chrome-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ 
      executablePath: chromePath,
      cacheDir: chromeDir 
    }, null, 2));
    console.log(`📝 Chrome config saved to: ${configPath}`);
  } else {
    console.log('⚠️ Chrome executable not found after installation');
  }

} catch (error) {
  console.error('❌ Chrome installation failed:', error.message);
  console.log('🔄 The application will try to use system Chrome if available');
} 