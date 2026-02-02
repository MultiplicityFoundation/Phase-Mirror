#!/usr/bin/env bash
# Dependency Security Scanning

set -euo pipefail

REPORT_DIR="./security-audit-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/dependency-scan-${TIMESTAMP}.json"

mkdir -p "$REPORT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Dependency Security Scan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd packages/mirror-dissonance 2>/dev/null || cd .

if [ ! -f "package.json" ]; then
  echo "✗ package.json not found"
  exit 1
fi

echo "[1/4] Running pnpm audit..."
pnpm audit --json > "$REPORT_FILE" 2>/dev/null || true

# Parse results
CRITICAL=$(jq -r '.metadata.vulnerabilities.critical // 0' "$REPORT_FILE")
HIGH=$(jq -r '.metadata.vulnerabilities.high // 0' "$REPORT_FILE")
MODERATE=$(jq -r '.metadata.vulnerabilities.moderate // 0' "$REPORT_FILE")
LOW=$(jq -r '.metadata.vulnerabilities.low // 0' "$REPORT_FILE")
TOTAL=$((CRITICAL + HIGH + MODERATE + LOW))

echo ""
echo "[2/4] Vulnerability Summary:"
echo "  Critical:  $CRITICAL"
echo "  High:      $HIGH"
echo "  Moderate:  $MODERATE"
echo "  Low:       $LOW"
echo "  Total:     $TOTAL"

echo ""
echo "[3/4] Checking for known vulnerable packages..."

# Check for specific known vulnerable packages
VULNERABLE_PACKAGES=(
  "lodash<4.17.21"
  "axios<0.21.2"
  "minimist<1.2.6"
)

for VULN in "${VULNERABLE_PACKAGES[@]}"; do
  PKG=$(echo "$VULN" | cut -d'<' -f1)
  if grep -q "\"$PKG\"" package.json 2>/dev/null; then
    echo "  ⚠ Found $PKG - verify version"
  fi
done

echo ""
echo "[4/4] Generating recommendations..."

if [ "$CRITICAL" -gt 0 ]; then
  echo ""
  echo "❌ CRITICAL vulnerabilities found - must fix before production"
  echo "   Run: pnpm audit fix --force"
fi

if [ "$HIGH" -gt 0 ]; then
  echo ""
  echo "⚠️  HIGH vulnerabilities found - should fix before production"
  echo "   Run: pnpm audit fix"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$CRITICAL" -eq 0 ] && [ "$HIGH" -eq 0 ]; then
  echo "✓ No critical or high vulnerabilities"
  exit 0
else
  echo "✗ Security issues require attention"
  exit 1
fi
