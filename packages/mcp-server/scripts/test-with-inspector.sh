#!/bin/bash
set -e

echo "Building MCP server..."
cd "$(dirname "$0")/.."
pnpm build

echo ""
echo "Starting MCP Inspector..."
echo "Open http://localhost:5173 in your browser"
echo ""
echo "Server command: node $(pwd)/dist/index.js"
echo ""

npx @modelcontextprotocol/inspector node dist/index.js
