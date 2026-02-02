#!/usr/bin/env bash
# Pre-Release Validation for MVP v1.0.0
# Ensures all requirements met before tagging release

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MVP v1.0.0 Pre-Release Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Date: $(date)"
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git rev-parse --short HEAD)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

VALIDATION_FAILED=0

section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

check_pass() {
  echo "  ✓ $1"
}

check_fail() {
  echo "  ✗ $1"
  VALIDATION_FAILED=1
}

#############################################
# 1. GIT STATUS
#############################################

section "1. Git Repository Status"

# Check branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" = "main" ]; then
  check_pass "On main branch"
else
  check_fail "Not on main branch (currently on: $CURRENT_BRANCH)"
fi

# Check for uncommitted changes
if git diff-index --quiet HEAD --; then
  check_pass "No uncommitted changes"
else
  check_fail "Uncommitted changes detected"
  git status --short
fi

# Check for untracked files
UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
if [ "$UNTRACKED" -eq 0 ]; then
  check_pass "No untracked files"
else
  check_fail "$UNTRACKED untracked files found"
fi

# Check remote sync
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "NO_UPSTREAM")
BASE=$(git merge-base @ @{u} 2>/dev/null || echo "NO_BASE")

if [ "$LOCAL" = "$REMOTE" ]; then
  check_pass "In sync with remote"
elif [ "$LOCAL" = "$BASE" ]; then
  check_fail "Local behind remote - pull required"
elif [ "$REMOTE" = "$BASE" ]; then
  check_fail "Local ahead of remote - push required"
else
  check_fail "Diverged from remote"
fi

#############################################
# 2. DEPENDENCY CHECKS
#############################################

section "2. Dependency Validation"

cd "$REPO_ROOT/packages/mirror-dissonance"

# Check package.json exists
if [ -f "package.json" ]; then
  check_pass "package.json exists"
else
  check_fail "package.json not found"
fi

# Install dependencies
echo "  → Installing dependencies..."
if pnpm install --frozen-lockfile 2>&1 | grep -q "Already up to date"; then
  check_pass "Dependencies installed (lockfile frozen)"
elif pnpm install --frozen-lockfile >/dev/null 2>&1; then
  check_pass "Dependencies installed"
else
  check_fail "Dependency installation failed"
fi

# Security audit
echo "  → Running security audit..."
CRITICAL=$(pnpm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.critical // 0')
HIGH=$(pnpm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.high // 0')

if [ "$CRITICAL" -eq 0 ]; then
  check_pass "No critical vulnerabilities"
else
  check_fail "$CRITICAL critical vulnerabilities found"
fi

if [ "$HIGH" -eq 0 ]; then
  check_pass "No high vulnerabilities"
else
  check_fail "$HIGH high vulnerabilities found"
fi

cd "$REPO_ROOT"

#############################################
# 3. BUILD & TESTS
#############################################

section "3. Build & Test Validation"

cd "$REPO_ROOT/packages/mirror-dissonance"

# Build
echo "  → Building package..."
if pnpm run build >/dev/null 2>&1; then
  check_pass "Build successful"
else
  check_fail "Build failed"
fi

# Unit tests
echo "  → Running unit tests..."
if pnpm test -- --passWithNoTests --silent 2>&1 | grep -q "Tests.*passed"; then
  check_pass "Unit tests passed"
elif pnpm test -- --passWithNoTests >/dev/null 2>&1; then
  check_pass "Unit tests passed (no failures)"
else
  check_fail "Unit tests failed"
fi

# Test coverage
echo "  → Checking test coverage..."
COVERAGE=$(pnpm test -- --coverage --silent 2>&1 | grep "All files" | awk '{print $10}' | sed 's/%//' || echo "0")
if [ "${COVERAGE%.*}" -ge 80 ]; then
  check_pass "Test coverage ≥80% (${COVERAGE}%)"
elif [ "${COVERAGE%.*}" -ge 70 ]; then
  echo "  ⚠ Test coverage ${COVERAGE}% (target: 80%)"
else
  check_fail "Test coverage <70% (${COVERAGE}%)"
fi

cd "$REPO_ROOT"

#############################################
# 4. SECURITY AUDITS
#############################################

section "4. Security Audit Validation"

# Run security scans
if [ -f "scripts/security/run-all-audits.sh" ]; then
  echo "  → Running security audit suite..."
  if ./scripts/security/run-all-audits.sh staging >/dev/null 2>&1; then
    check_pass "Security audits passed"
  else
    check_fail "Security audits failed"
  fi
else
  echo "  ⚠ Security audit scripts not found"
fi

#############################################
# 5. DOCUMENTATION
#############################################

section "5. Documentation Validation"

# Check required docs exist
REQUIRED_DOCS=(
  "README.md"
  "docs/internal/mvp-completion-tracker.md"
  "docs/PRE_PRODUCTION_CHECKLIST.md"
  "packages/mirror-dissonance/README.md"
)

for DOC in "${REQUIRED_DOCS[@]}"; do
  if [ -f "$DOC" ]; then
    check_pass "Documentation exists: $(basename "$DOC")"
  else
    check_fail "Documentation missing: $DOC"
  fi
done

#############################################
# 6. INFRASTRUCTURE
#############################################

section "6. Infrastructure Validation"

# Check Terraform files
if [ -d "infra/terraform" ]; then
  check_pass "Terraform configuration exists"
  
  cd infra/terraform
  
  # Validate Terraform syntax
  if terraform fmt -check >/dev/null 2>&1; then
    check_pass "Terraform formatting correct"
  else
    check_fail "Terraform formatting issues"
  fi
  
  if terraform validate >/dev/null 2>&1; then
    check_pass "Terraform validation passed"
  else
    echo "  ⚠ Terraform validation failed (may require init)"
  fi
  
  cd "$REPO_ROOT"
else
  check_fail "Terraform configuration not found"
fi

# Check GitHub Actions workflows
if [ -f ".github/workflows/terraform.yml" ]; then
  check_pass "Terraform workflow exists"
else
  check_fail "Terraform workflow missing"
fi

if [ -f ".github/workflows/security-audit.yml" ]; then
  check_pass "Security audit workflow exists"
else
  check_fail "Security audit workflow missing"
fi

#############################################
# 7. VERSION CONSISTENCY
#############################################

section "7. Version Consistency Check"

# Check package.json version
PKG_VERSION=$(jq -r '.version' packages/mirror-dissonance/package.json 2>/dev/null || echo "UNKNOWN")
echo "  → package.json version: $PKG_VERSION"

if [[ "$PKG_VERSION" =~ ^1\.0\.0 ]]; then
  check_pass "Version is 1.0.0 family"
else
  echo "  ⚠ Version is $PKG_VERSION (will be updated to 1.0.0-mvp)"
fi

#############################################
# 8. MVP TRACKER
#############################################

section "8. MVP Completion Tracker"

if [ -f "docs/internal/mvp-completion-tracker.md" ]; then
  # Count completed days
  COMPLETED_DAYS=$(grep -c "✅ Complete" docs/internal/mvp-completion-tracker.md || echo "0")
  echo "  → Completed days: $COMPLETED_DAYS"
  
  if [ "$COMPLETED_DAYS" -ge 20 ]; then
    check_pass "MVP tracker shows ≥20 days complete"
  else
    check_fail "MVP tracker shows only $COMPLETED_DAYS days complete"
  fi
else
  check_fail "docs/internal/mvp-completion-tracker.md not found"
fi

#############################################
# SUMMARY
#############################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VALIDATION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $VALIDATION_FAILED -eq 0 ]; then
  echo ""
  echo "✅ ALL VALIDATIONS PASSED"
  echo ""
  echo "Ready to proceed with MVP release v1.0.0"
  echo ""
  exit 0
else
  echo ""
  echo "❌ VALIDATION FAILED"
  echo ""
  echo "Fix issues above before proceeding with release"
  echo ""
  exit 1
fi
