# Chrome Dependency Issue Resolution

## Problem
The crawling system is failing because Chrome requires system libraries that are not installed:
- `libnss3.so` - Network Security Services library
- Other Chrome dependencies may also be missing

## Error Message
```
Failed to launch the browser process!
chrome: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory
```

## Solution Options

### Option 1: Install Required System Dependencies (Recommended)
```bash
# For Ubuntu/Debian systems
sudo apt-get update
sudo apt-get install -y \
    libnss3-dev \
    libatk-bridge2.0-dev \
    libdrm-dev \
    libxkbcommon-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libgbm-dev \
    libxss-dev \
    libasound2-dev \
    libatspi2.0-0 \
    libgtk-3-0

# Test if crawling works after installation
node meat.js --year=2025 --month=06 --mode=test
```

### Option 2: Use Docker (Alternative)
If you cannot install system dependencies, consider running the crawler in Docker:
```bash
# Create a Dockerfile with proper Chrome dependencies
# This would require setting up a Docker environment
```

### Option 3: Remote Headless Chrome (Alternative)
Use a remote Chrome instance or headless browser service instead of local Chrome.

## Current Status
✅ Chrome is properly installed via Puppeteer
✅ Results folder exists
✅ Server is running on port 8080
❌ System dependencies missing for Chrome execution

## Next Steps
1. Install the system dependencies listed in Option 1
2. Test the crawling functionality
3. If successful, the dashboard crawling buttons should work properly
4. The automatic match scheduler should also function correctly

## Files Modified
- `/home/essaisko/joinkfacrawler_backup/chrome-config.json` - Updated Chrome path
- `/home/essaisko/joinkfacrawler_backup/results/` - Directory created for crawling results