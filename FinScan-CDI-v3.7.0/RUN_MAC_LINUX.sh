#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing FinScan Corporate Decision Intelligence dependencies..."
npm ci

echo "Building the application..."
npm run build

echo "Starting FinScan Corporate Decision Intelligence on http://localhost:3000"
npm start
