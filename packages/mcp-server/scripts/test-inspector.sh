#!/bin/bash
set -e

echo "╔════════════════════════════════════════════╗"
echo "║   Phase Mirror MCP Inspector Test Suite   ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Navigate to MCP server directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Check if server is built
if [ ! -f "dist/index.js" ]; then
    echo "❌ Server not built. Running build..."
    pnpm build
fi

echo "✅ Server built successfully"
echo ""
echo "Starting MCP Inspector..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Server command:"
echo "  node $(pwd)/dist/index.js"
echo ""
echo "Browser will open at: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop the inspector"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start inspector
npx @modelcontextprotocol/inspector node dist/index.js
