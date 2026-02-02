#!/usr/bin/env bash
# Run all security audits and pre-production checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-staging}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror Security Audit Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "Date: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_ISSUES=0

# 1. Dependency scan
echo "▸ Running dependency security scan..."
if "$SCRIPT_DIR/scan-dependencies.sh"; then
  echo "  → Passed"
else
  echo "  → Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# 2. Terraform scan
echo "▸ Running Terraform security scan..."
if "$SCRIPT_DIR/scan-terraform.sh"; then
  echo "  → Passed"
else
  echo "  → Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# 3. Full security audit
echo "▸ Running full security audit..."
if "$SCRIPT_DIR/full-security-audit.sh" "$ENVIRONMENT"; then
  echo "  → Passed"
else
  echo "  → Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# 4. Pre-production checklist
echo "▸ Running pre-production checklist..."
if "$SCRIPT_DIR/pre-production-checklist.sh" "$ENVIRONMENT"; then
  echo "  → Passed"
else
  echo "  → Issues found"
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AUDIT SUITE SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TOTAL_ISSUES -eq 0 ]; then
  echo ""
  echo "✓ ALL AUDITS PASSED"
  echo ""
  echo "Phase Mirror is ready for production deployment!"
  echo ""
  echo "Reports saved to:"
  echo "  - ./security-audit-reports/"
  echo "  - ./pre-prod-reports/"
  exit 0
else
  echo ""
  echo "✗ $TOTAL_ISSUES AUDIT(S) FOUND ISSUES"
  echo ""
  echo "Review reports and remediate before production deployment"
  echo ""
  echo "Reports saved to:"
  echo "  - ./security-audit-reports/"
  echo "  - ./pre-prod-reports/"
  exit 1
fi
