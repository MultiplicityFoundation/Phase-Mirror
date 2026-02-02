#!/usr/bin/env bash
# Build release artifacts for v1.0.0-mvp

set -euo pipefail

VERSION="${1:-1.0.0-mvp}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ARTIFACTS_DIR="$REPO_ROOT/release-artifacts"
BUILD_DIR="$ARTIFACTS_DIR/build"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Building Release Artifacts for $VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Clean and create directories
rm -rf "$ARTIFACTS_DIR"
mkdir -p "$BUILD_DIR"

cd "$REPO_ROOT"

#############################################
# 1. BUILD PACKAGE
#############################################

echo "[1/5] Building mirror-dissonance package..."
cd packages/mirror-dissonance

pnpm install --frozen-lockfile
pnpm run build

if [ -d "dist" ]; then
  echo "  ✓ Build successful"
  cp -r dist "$BUILD_DIR/mirror-dissonance"
  cp package.json "$BUILD_DIR/mirror-dissonance/"
  cp README.md "$BUILD_DIR/mirror-dissonance/"
else
  echo "  ✗ Build failed - dist/ not found"
  exit 1
fi

cd "$REPO_ROOT"

#############################################
# 2. PACKAGE TERRAFORM
#############################################

echo ""
echo "[2/5] Packaging Terraform configuration..."
if [ -d "infra/terraform" ]; then
  mkdir -p "$BUILD_DIR/terraform"
  cp -r infra/terraform/* "$BUILD_DIR/terraform/"
  
  # Remove .terraform directories
  find "$BUILD_DIR/terraform" -type d -name ".terraform" -exec rm -rf {} + 2>/dev/null || true
  
  echo "  ✓ Terraform packaged"
else
  echo "  ✗ Terraform directory not found"
  exit 1
fi

#############################################
# 3. PACKAGE SCRIPTS
#############################################

echo ""
echo "[3/5] Packaging deployment scripts..."
mkdir -p "$BUILD_DIR/scripts"

# Copy essential scripts
for SCRIPT in scripts/setup/*.sh scripts/security/*.sh scripts/test/*.sh; do
  if [ -f "$SCRIPT" ]; then
    SCRIPT_NAME=$(basename "$SCRIPT")
    SCRIPT_SUBDIR=$(basename "$(dirname "$SCRIPT")")
    mkdir -p "$BUILD_DIR/scripts/$SCRIPT_SUBDIR"
    cp "$SCRIPT" "$BUILD_DIR/scripts/$SCRIPT_SUBDIR/"
  fi
done

echo "  ✓ Scripts packaged"

#############################################
# 4. PACKAGE DOCUMENTATION
#############################################

echo ""
echo "[4/5] Packaging documentation..."
mkdir -p "$BUILD_DIR/docs"

# Copy docs
cp README.md "$BUILD_DIR/"
cp CHANGELOG.md "$BUILD_DIR/" 2>/dev/null || echo "  ⚠ CHANGELOG.md not found"
cp MVP_COMPLETION_TRACKER.md "$BUILD_DIR/" 2>/dev/null || true

if [ -d "docs" ]; then
  cp -r docs/* "$BUILD_DIR/docs/"
fi

echo "  ✓ Documentation packaged"

#############################################
# 5. CREATE ARCHIVES
#############################################

echo ""
echo "[5/5] Creating release archives..."

cd "$BUILD_DIR"

# Create tarball
tar -czf "$ARTIFACTS_DIR/phase-mirror-${VERSION}.tar.gz" .
echo "  ✓ Created phase-mirror-${VERSION}.tar.gz"

# Create zip
zip -r -q "$ARTIFACTS_DIR/phase-mirror-${VERSION}.zip" .
echo "  ✓ Created phase-mirror-${VERSION}.zip"

# Generate checksums
cd "$ARTIFACTS_DIR"
sha256sum "phase-mirror-${VERSION}.tar.gz" > "phase-mirror-${VERSION}.tar.gz.sha256"
sha256sum "phase-mirror-${VERSION}.zip" > "phase-mirror-${VERSION}.zip.sha256"
echo "  ✓ Generated checksums"

cd "$REPO_ROOT"

#############################################
# SUMMARY
#############################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Release Artifacts Built Successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Artifacts location: $ARTIFACTS_DIR"
echo ""
ls -lh "$ARTIFACTS_DIR"
echo ""
