#!/usr/bin/env bash
# Update version numbers for release

set -euo pipefail

VERSION="${1:-1.0.0-mvp}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Updating Version to $VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$REPO_ROOT"

# Update package.json
echo "[1/3] Updating package.json..."
if [ -f "packages/mirror-dissonance/package.json" ]; then
  jq --arg version "$VERSION" '.version = $version' \
    packages/mirror-dissonance/package.json > packages/mirror-dissonance/package.json.tmp
  mv packages/mirror-dissonance/package.json.tmp packages/mirror-dissonance/package.json
  echo "  ✓ Updated packages/mirror-dissonance/package.json to $VERSION"
else
  echo "  ✗ package.json not found"
  exit 1
fi

# Update README
echo ""
echo "[2/3] Updating README..."
if [ -f "README.md" ]; then
  sed -i.bak "s/Version: .*/Version: $VERSION/" README.md 2>/dev/null || \
    sed -i '' "s/Version: .*/Version: $VERSION/" README.md
  rm -f README.md.bak
  echo "  ✓ Updated README.md"
fi

if [ -f "packages/mirror-dissonance/README.md" ]; then
  sed -i.bak "s/Version: .*/Version: $VERSION/" packages/mirror-dissonance/README.md 2>/dev/null || \
    sed -i '' "s/Version: .*/Version: $VERSION/" packages/mirror-dissonance/README.md
  rm -f packages/mirror-dissonance/README.md.bak
  echo "  ✓ Updated packages/mirror-dissonance/README.md"
fi

# Create version file
echo ""
echo "[3/3] Creating VERSION file..."
echo "$VERSION" > VERSION
echo "  ✓ Created VERSION file"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Version updated to $VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Changed files:"
git diff --name-only
echo ""
