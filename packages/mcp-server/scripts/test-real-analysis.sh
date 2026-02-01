#!/bin/bash
set -e

echo "Testing analyze_dissonance with real Phase Mirror repository"
echo ""

# Navigate to MCP server directory
cd "$(dirname "$0")/.."

# Build server
echo "Building MCP server..."
pnpm build

# Test with real Phase Mirror files
echo ""
echo "Running analysis on Phase Mirror workflow files..."
node dist/index.js << 'EOF'
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "analyze_dissonance",
    "arguments": {
      "files": [
        "../../.github/workflows/ci.yml",
        "../../.github/workflows/deploy-staging.yml"
      ],
      "repository": {
        "owner": "PhaseMirror",
        "name": "Phase-Mirror"
      },
      "mode": "pull_request",
      "context": "Testing MCP tool with real repository files",
      "includeADRs": true,
      "includeFPPatterns": false
    }
  }
}
EOF

echo ""
echo "Test complete!"
