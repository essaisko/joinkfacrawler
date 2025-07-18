#!/usr/bin/env bash
# exit on error
set -o errexit

echo "🚀 Starting build process..."

# npm install will trigger the postinstall script which handles Chrome installation
npm install

echo "✅ Build process completed!"
echo "📋 Chrome installation details should be visible above" 