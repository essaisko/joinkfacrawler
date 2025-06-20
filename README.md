# JoinKFA Crawler System

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Flutter App   │    │  Firebase DB    │    │  Node.js Server │
│                 │◄───┤                 │◄───┤   (Puppeteer)   │
│  - Records Tab  │    │ - Match Data    │    │  - Web Scraping │
│  - Real-time UI │    │ - Sync Status   │    │  - Anti-bot      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 Key Features

### Server (Node.js + Puppeteer)
- **Real Browser Automation**: Chrome browser with full session management
- **Anti-bot Bypass**: Cookie/header/payload exact replication
- **Incremental Sync**: Smart data synchronization with error recovery
- **Firebase Integration**: Real-time data storage and updates

### Flutter Client
- **Real-time Updates**: Live data sync from Firebase
- **Offline Support**: Local caching for match records
- **Clean Architecture**: Repository pattern with dependency injection

### Infrastructure
- **Docker Support**: Containerized deployment
- **Cloud Run Ready**: Google Cloud Platform integration
- **Monitoring**: Comprehensive logging and error tracking

## 🚀 Quick Start

### Server Setup
```bash
cd server
npm install
npm run dev
```

### Flutter Setup
```bash
cd flutter
flutter pub get
flutter run
```

### Deploy to Cloud
```bash
npm run deploy
```

## 📁 Project Structure

```
joinkfacrawler/
├── server/                 # Node.js Puppeteer Crawler
│   ├── src/
│   │   ├── crawlers/      # Web scraping logic
│   │   ├── services/      # Business logic
│   │   ├── models/        # Data models
│   │   └── utils/         # Helper functions
│   ├── config/            # Configuration files
│   └── deploy/            # Deployment scripts
├── flutter/               # Flutter Mobile App
│   ├── lib/
│   │   ├── features/      # Feature modules
│   │   ├── core/          # Core utilities
│   │   └── shared/        # Shared components
└── docs/                  # Documentation
```

## 🔧 Configuration

### Environment Variables
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
JOINKFA_BASE_URL=https://joinkfa.com
CRAWLER_INTERVAL=300000  # 5 minutes
```

## 📊 Data Flow

1. **Browser Automation**: Puppeteer opens Chrome, navigates to JoinKFA
2. **Session Acquisition**: Extract cookies, headers, and authentication tokens
3. **API Replication**: Execute identical POST requests to fetch match data
4. **Data Processing**: Parse and normalize K5/K6/K7 match records
5. **Firebase Sync**: Store data with incremental updates
6. **Flutter Updates**: Real-time UI refresh via Firebase listeners

## 🛡️ Anti-bot Strategy

- **User Agent Rotation**: Dynamic browser fingerprinting
- **Request Timing**: Human-like interaction patterns
- **Session Persistence**: Long-lived browser sessions
- **Error Recovery**: Automatic retry with backoff strategy

## 🚢 Deployment Options

- **Google Cloud Run**: Serverless container deployment
- **Docker**: Self-hosted container solution
- **PM2**: Process management for Node.js
- **GitHub Actions**: CI/CD pipeline automation 