#!/bin/bash
# Automated Progress Tracker for Phase Mirror MVP
# Captures test results, coverage, issues, infrastructure status, and generates daily update
# Usage: ./scripts/update-progress.sh <week-number>

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M)
WEEK=${1:-"unknown"}

if [ "$WEEK" == "unknown" ]; then
  echo "Usage: ./scripts/update-progress.sh <week-number>"
  echo ""
  echo "Example:"
  echo "  ./scripts/update-progress.sh 1    # For Week 1"
  echo "  ./scripts/update-progress.sh 2    # For Week 2"
  echo "  ./scripts/update-progress.sh 3    # For Week 3"
  echo "  ./scripts/update-progress.sh 4    # For Week 4"
  exit 1
fi

echo -e "${BLUE}=== Daily Progress Update: Week ${WEEK} - ${DATE} ${TIME} ===${NC}"
echo ""

# Check if tracker exists
if [ ! -f "docs/internal/mvp-completion-tracker.md" ]; then
  echo -e "${RED}❌ Error: docs/internal/mvp-completion-tracker.md not found${NC}"
  echo "   Create the tracker first before running this script"
  exit 1
fi

# ============================================================================
# Test Results Collection
# ============================================================================
echo -e "${BLUE}📊 Running tests...${NC}"
echo "  (Running with --passWithNoTests, this may take 30-60 seconds)"
TEST_OUTPUT=$(timeout 90 pnpm test --passWithNoTests --silent 2>&1 || true)
TESTS_PASSING=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passed)' | awk '{sum+=$1} END {print sum+0}')
TESTS_FAILING=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= failed)' | awk '{sum+=$1} END {print sum+0}')
TESTS_TOTAL=$((TESTS_PASSING + TESTS_FAILING))

if [ "$TESTS_TOTAL" -eq 0 ]; then
  TEST_STATUS="⚠️ No tests run"
elif [ "$TESTS_FAILING" -eq 0 ]; then
  TEST_STATUS="${GREEN}✅ All passing${NC}"
else
  TEST_STATUS="${RED}❌ $TESTS_FAILING failing${NC}"
fi

echo -e "  Tests: ${TESTS_PASSING}/${TESTS_TOTAL} passing ${TEST_STATUS}"

# ============================================================================
# Coverage Collection
# ============================================================================
echo -e "${BLUE}📈 Checking coverage...${NC}"
# Try to get coverage from existing report instead of running tests again
if [ -f "coverage/coverage-summary.json" ]; then
  # Use jq if available, otherwise fall back to grep
  if command -v jq >/dev/null 2>&1; then
    COVERAGE_PCT=$(jq -r '.total.lines.pct // "N/A"' coverage/coverage-summary.json 2>/dev/null || echo "N/A")
  else
    COVERAGE_PCT=$(cat coverage/coverage-summary.json | grep -oP '"lines":\{"total":\d+,"covered":\d+,"skipped":\d+,"pct":\K[\d.]+' | head -1 2>/dev/null || echo "N/A")
  fi
else
  echo "  Running coverage tests (this may take a moment)..."
  COVERAGE_OUTPUT=$(timeout 60 pnpm test:coverage --passWithNoTests 2>&1 || echo "")
  COVERAGE_PCT=$(echo "$COVERAGE_OUTPUT" | grep "All files" | awk '{print $4}' | tr -d '%' || echo "N/A")
fi

if [ "$COVERAGE_PCT" != "N/A" ] && [ "$COVERAGE_PCT" != "" ]; then
  # Simple integer comparison - validate it's a number first
  if [[ "$COVERAGE_PCT" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    COVERAGE_INT=${COVERAGE_PCT%.*}
    if [ "$COVERAGE_INT" -ge 80 ] 2>/dev/null; then
      COVERAGE_STATUS="${GREEN}✅ Target met${NC}"
    elif [ "$COVERAGE_INT" -ge 60 ] 2>/dev/null; then
      COVERAGE_STATUS="${YELLOW}⚠️ In progress${NC}"
    else
      COVERAGE_STATUS="${RED}❌ Below target${NC}"
    fi
    echo -e "  Coverage: ${COVERAGE_PCT}% ${COVERAGE_STATUS}"
  else
    echo "  Coverage: N/A (invalid coverage data)"
    COVERAGE_PCT="N/A"
  fi
else
  echo "  Coverage: N/A (no coverage data)"
fi

# ============================================================================
# Known Issues Count
# ============================================================================
echo -e "${BLUE}🐛 Counting known issues...${NC}"
if [ -f "docs/known-issues.md" ]; then
  CRITICAL_ISSUES=$(grep -ic "critical" docs/known-issues.md 2>/dev/null || echo "0")
  IMPORTANT_ISSUES=$(grep -ic "important" docs/known-issues.md 2>/dev/null || echo "0")
elif [ -f "docs/internal/mvp-completion-tracker.md" ]; then
  # Fallback: count from tracker
  CRITICAL_ISSUES=$(grep -c "Critical Issues.*|.*|" docs/internal/mvp-completion-tracker.md 2>/dev/null || echo "0")
  IMPORTANT_ISSUES=$(grep -c "Important Issues.*|.*|" docs/internal/mvp-completion-tracker.md 2>/dev/null || echo "0")
else
  CRITICAL_ISSUES="0"
  IMPORTANT_ISSUES="0"
fi

echo "  Critical: $CRITICAL_ISSUES, Important: $IMPORTANT_ISSUES"

# ============================================================================
# Infrastructure Status (if terraform exists)
# ============================================================================
echo -e "${BLUE}🏗️  Checking infrastructure...${NC}"
INFRA_STATUS="Not deployed"
if [ -d "infra/terraform" ]; then
  # Use subshell to avoid changing directory
  WORKSPACE=$(cd infra/terraform && terraform workspace show 2>/dev/null || echo "")
  if [ -n "$WORKSPACE" ]; then
    INFRA_STATUS="Workspace: $WORKSPACE"
  fi
fi
echo "  Status: $INFRA_STATUS"

# ============================================================================
# Git Status
# ============================================================================
echo -e "${BLUE}📂 Git status...${NC}"
UNCOMMITTED=$(git status --porcelain | wc -l || echo "0")
BRANCH=$(git rev-parse --abbrev-ref HEAD || echo "unknown")
LAST_COMMIT=$(git log -1 --pretty=format:"%h - %s" 2>/dev/null || echo "unknown")

echo "  Branch: $BRANCH"
echo "  Uncommitted: $UNCOMMITTED files"
echo "  Last commit: $LAST_COMMIT"

# ============================================================================
# Performance Benchmarks (if available)
# ============================================================================
echo -e "${BLUE}⚡ Performance benchmarks...${NC}"
# Expected format in docs/benchmarks/latest.md:
#   L0 p99: 75ns (or L0.*p99.*75ns)
#   FP Store p99: 35ms (or FP Store.*p99.*35ms)
BENCHMARK_FILE="docs/benchmarks/latest.md"
if [ -f "$BENCHMARK_FILE" ]; then
  L0_P99=$(grep -oP 'L0[^\n]*p99[^\n]*\K\d+ns' "$BENCHMARK_FILE" 2>/dev/null || echo "N/A")
  FP_P99=$(grep -oP 'FP Store[^\n]*p99[^\n]*\K\d+ms' "$BENCHMARK_FILE" 2>/dev/null || echo "N/A")
  echo "  L0 p99: $L0_P99 (target: <100ns)"
  echo "  FP Store p99: $FP_P99 (target: <50ms)"
else
  echo "  No benchmark data available (expected at $BENCHMARK_FILE)"
  L0_P99="N/A"
  FP_P99="N/A"
fi

# ============================================================================
# Generate Progress Entry
# ============================================================================
echo ""
echo -e "${BLUE}📝 Generating progress entry...${NC}"

PROGRESS_ENTRY="
## Daily Update: ${DATE} (Week ${WEEK})

**Timestamp:** ${DATE} ${TIME}  
**Branch:** \`${BRANCH}\`  
**Tests Passing:** ${TESTS_PASSING}/${TESTS_TOTAL} $([ "$TESTS_FAILING" -gt 0 ] && echo "(**${TESTS_FAILING} failing**)" || echo "✅")  
**Coverage:** ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "%")  
**Known Issues:** ${CRITICAL_ISSUES} critical, ${IMPORTANT_ISSUES} important  
**Infrastructure:** ${INFRA_STATUS}  
**Uncommitted Changes:** ${UNCOMMITTED} files

### ✅ Completed Today
- [ ] <!-- Add completed tasks here -->
- [ ] <!-- Example: Implemented FP Store tests -->

### 🚧 In Progress
- [ ] <!-- Add in-progress tasks here -->

### 🔴 Blockers
- <!-- List blockers or write 'None' -->

### 🎯 Tomorrow's Focus
- [ ] <!-- Add tomorrow's priorities here -->
- [ ] <!-- Example: Complete integration tests -->

### 📊 Metrics Update
\`\`\`
Tests:         ${TESTS_PASSING}/${TESTS_TOTAL} passing $([ "$TESTS_FAILING" -gt 0 ] && echo "($TESTS_FAILING failing)")
Coverage:      ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "% (target: 80%+)")
Issues:        ${CRITICAL_ISSUES} critical, ${IMPORTANT_ISSUES} important
L0 p99:        ${L0_P99} (target: <100ns)
FP Store p99:  ${FP_P99} (target: <50ms)
Infrastructure: ${INFRA_STATUS}
\`\`\`

### 💭 Notes
<!-- Add any notes, learnings, or observations -->

---
"

# Append to tracker
echo "$PROGRESS_ENTRY" >> docs/internal/mvp-completion-tracker.md

# ============================================================================
# Summary Output
# ============================================================================
echo ""
echo -e "${GREEN}✅ Progress tracker updated successfully${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "  Date:               ${DATE} ${TIME}"
echo "  Week:               ${WEEK}"
echo "  Tests:              ${TESTS_PASSING}/${TESTS_TOTAL} passing"
echo "  Coverage:           ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "%")"
echo "  Critical Issues:    ${CRITICAL_ISSUES}"
echo "  Important Issues:   ${IMPORTANT_ISSUES}"
echo "  Infrastructure:     ${INFRA_STATUS}"
echo "  L0 Performance:     ${L0_P99}"
echo "  FP Store Performance: ${FP_P99}"
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "  1. Edit docs/internal/mvp-completion-tracker.md to fill in today's details"
echo "  2. Mark completed tasks with [x]"
echo "  3. Add in-progress tasks"
echo "  4. Document blockers (or write 'None')"
echo "  5. Add tomorrow's focus areas"
echo "  6. Add any notes or learnings"
echo ""
echo "  Then commit:"
echo "  git add docs/internal/mvp-completion-tracker.md"
echo "  git commit -m 'chore: daily progress update Week ${WEEK} - ${DATE}'"
echo ""
