#!/bin/bash
set -e
echo "=== Installing dependencies ==="
npm install
echo "=== Building React app ==="
npm run build
echo "=== Build complete, starting server ==="
npm run serve
