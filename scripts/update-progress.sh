#!/bin/bash
# Update MVP progress tracker with daily status
# Usage: ./scripts/update-progress.sh <week-number>

set -e

DATE=$(date +%Y-%m-%d)
WEEK=$1  # Pass week number as argument

if [ -z "$WEEK" ]; then
  echo "Usage: ./scripts/update-progress.sh <week-number>"
  echo ""
  echo "Example:"
  echo "  ./scripts/update-progress.sh 1    # For Week 1"
  echo "  ./scripts/update-progress.sh 2    # For Week 2"
  exit 1
fi

echo "=== Daily Progress Update: Week ${WEEK} - ${DATE} ==="
echo ""

# Run tests and capture results
echo "📊 Running tests..."
TEST_OUTPUT=$(pnpm test --passWithNoTests 2>&1 || true)
TESTS_PASSING=$(echo "$TEST_OUTPUT" | grep -o '[0-9]* passed' | awk '{sum+=$1} END {print sum}' || echo "0")
TESTS_FAILING=$(echo "$TEST_OUTPUT" | grep -o '[0-9]* failed' | awk '{sum+=$1} END {print sum}' || echo "0")
TESTS_TOTAL=$(echo "$TEST_OUTPUT" | grep -o 'Tests:' | wc -l || echo "0")

# Calculate total tests
if [ "$TESTS_TOTAL" -gt 0 ]; then
  TESTS_TOTAL=$((TESTS_PASSING + TESTS_FAILING))
fi

# Check coverage if available
echo "📈 Checking coverage..."
COVERAGE_OUTPUT=$(pnpm test:coverage --passWithNoTests 2>&1 || echo "")
COVERAGE_PCT=$(echo "$COVERAGE_OUTPUT" | grep "All files" | awk '{print $4}' | tr -d '%' || echo "N/A")

# Count known issues from docs/known-issues.md
if [ -f "docs/known-issues.md" ]; then
  CRITICAL_ISSUES=$(grep -i "critical\|CRITICAL" docs/known-issues.md | wc -l || echo "0")
  IMPORTANT_ISSUES=$(grep -i "important\|IMPORTANT" docs/known-issues.md | wc -l || echo "0")
else
  CRITICAL_ISSUES="0"
  IMPORTANT_ISSUES="0"
fi

# Get git stats
UNCOMMITTED=$(git status --porcelain | wc -l || echo "0")
BRANCH=$(git rev-parse --abbrev-ref HEAD || echo "unknown")

# Create progress entry
PROGRESS_ENTRY="
## Daily Update: ${DATE} (Week ${WEEK})

**Branch:** \`${BRANCH}\`  
**Tests Passing:** ${TESTS_PASSING}/${TESTS_TOTAL} $([ "$TESTS_FAILING" -gt 0 ] && echo "(**${TESTS_FAILING} failing**)" || echo "✓")  
**Coverage:** ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "%")  
**Known Issues:** ${CRITICAL_ISSUES} critical, ${IMPORTANT_ISSUES} important  
**Uncommitted Changes:** ${UNCOMMITTED}

### 📝 Completed Today
- [ ] <!-- Add completed tasks here -->

### 🚧 Blockers
- <!-- List blockers or write 'None' -->

### 🎯 Tomorrow's Focus
- [ ] <!-- Add tomorrow's priorities here -->

### 📊 Metrics Update
\`\`\`
Tests:    ${TESTS_PASSING}/${TESTS_TOTAL} passing
Coverage: ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "%")
Issues:   ${CRITICAL_ISSUES} critical, ${IMPORTANT_ISSUES} important
\`\`\`

---
"

# Check if tracker exists
if [ ! -f "MVP_COMPLETION_TRACKER.md" ]; then
  echo "❌ Error: MVP_COMPLETION_TRACKER.md not found"
  echo "   Create the tracker first before running this script"
  exit 1
fi

# Append to tracker
echo "$PROGRESS_ENTRY" >> MVP_COMPLETION_TRACKER.md

echo "✅ Progress tracker updated"
echo ""
echo "📋 Summary:"
echo "  Date:            ${DATE}"
echo "  Week:            ${WEEK}"
echo "  Tests:           ${TESTS_PASSING}/${TESTS_TOTAL} passing"
echo "  Coverage:        ${COVERAGE_PCT}$([ "$COVERAGE_PCT" != "N/A" ] && echo "%")"
echo "  Critical Issues: ${CRITICAL_ISSUES}"
echo "  Important Issues: ${IMPORTANT_ISSUES}"
echo ""
echo "💡 Next steps:"
echo "  1. Edit MVP_COMPLETION_TRACKER.md to fill in today's details"
echo "  2. Mark completed tasks with [x]"
echo "  3. Add blockers and tomorrow's focus"
echo "  4. Commit changes: git add MVP_COMPLETION_TRACKER.md && git commit -m 'chore: daily progress update Week ${WEEK} - ${DATE}'"
