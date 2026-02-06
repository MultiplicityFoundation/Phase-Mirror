# Commit Discipline Guide

## The Golden Rule

**Write the commit message before you write the code.**

The commit message is your scope boundary. If you find yourself doing something the message doesn't describe, that's a different commit.

## Why This Matters

### For Phase Mirror Specifically

Phase Mirror's development follows a **point-by-point commit, phase-level PR** strategy. This discipline ensures:

1. **Bisectability**: Every commit is a good or bad point for `git bisect`
2. **Reviewability**: Each commit tells a complete, understandable story
3. **Maintainability**: Future developers see clear intent, not "fixed stuff"

### The Temptation

While fixing error propagation in the FP store (Phase 0, point 4), you notice that `computeWindow()` could use refactoring. Your fingers itch to fix it **right now**.

**Don't.**

That's Phase 1 work. The commit message says "fix FP store error propagation", not "fix FP store and also refactor window computation". 

## The Workflow

### Step 1: Choose Your Work

Pick ONE item from the phase plan:
- Phase 0, Point 4: Fix FP store error propagation
- Phase 0, Point 7: Improve CLI error diagnostics
- Phase 1, Point 2: Implement local adapter

### Step 2: Write the Commit Message

**Before touching any code**, create `commit-msg.txt`:

```bash
cat > commit-msg.txt << 'EOF'
fix(fp-store): propagate DynamoDB errors instead of silently returning empty arrays

When DynamoDB operations fail in getRecentEvents, getFalsePositivesForFinding,
and related methods, errors are logged but empty arrays are returned. This masks
critical failures and can lead to incorrect decisions.

This commit updates error handling to:
- Re-throw DynamoDB errors with operation context
- Preserve error chain for debugging
- Allow callers to implement proper fallback behavior

Refs: docs/known-issues.md #8
EOF
```

#### Anatomy of a Good Message

**Subject line** (50 chars or less):
```
fix(fp-store): propagate DynamoDB errors
```
- `fix`: Type (feat, fix, docs, refactor, test, chore)
- `(fp-store)`: Scope (which module/component)
- `propagate DynamoDB errors`: What changed

**Body** (wrap at 72 chars):
- **What**: Current behavior description
- **Why**: Why this is a problem
- **How**: What this commit does to fix it

**Footer**:
```
Refs: docs/known-issues.md #8
Fixes #42
```

### Step 3: Use the Message as Your Boundary

Now start coding. As you work, keep the commit message **visible** on your screen.

Every line you change, ask: **Does this serve the commit message?**

#### Examples

**✅ GOOD** - Within scope:
```typescript
// commit-msg.txt says: "propagate DynamoDB errors"

// This is fixing error propagation in FP store
async getRecentEvents(windowSec: number): Promise<FalsePositiveEvent[]> {
  try {
    const result = await this.dynamodb.scan(...);
    return result.Items || [];
  } catch (error) {
    // OLD: logger.error('DynamoDB scan failed', error);
    //      return [];
    
    // NEW: Re-throw with context ✅
    throw new Error(`Failed to scan FP events from DynamoDB: ${error.message}`, {
      cause: error,
      context: { windowSec, tableName: this.tableName }
    });
  }
}
```

**❌ BAD** - Scope creep:
```typescript
// commit-msg.txt says: "propagate DynamoDB errors"

// But you're also refactoring computeWindow ❌
// This is Phase 1 work!
async getRecentEvents(windowSec: number): Promise<FalsePositiveEvent[]> {
  // While I'm here, let me refactor this helper... ❌
  const window = this.computeWindowOptimized(windowSec); // Phase 1 work!
  
  try {
    const result = await this.dynamodb.scan(...);
    return result.Items || [];
  } catch (error) {
    throw new Error(`Failed to scan: ${error.message}`);
  }
}
```

### Step 4: Stage Only Relevant Changes

```bash
# Review what changed
git diff

# Stage ONLY files mentioned in commit message
git add packages/mirror-dissonance/src/fp-store/store.ts
git add packages/mirror-dissonance/tests/fp-store/error-propagation.test.ts

# Do NOT stage unrelated changes
# git add packages/mirror-dissonance/src/window/compute-window.ts  ❌
```

### Step 5: Verify the Commit

Before committing, verify:

```bash
# Tests must pass
pnpm test

# Build must succeed
pnpm build

# Linter must pass
pnpm lint
```

If any of these fail, the commit is not ready. Fix the issue or adjust the scope.

### Step 6: Commit with Pre-Written Message

```bash
git commit -F commit-msg.txt
```

## Common Scenarios

### Scenario 1: You Find Another Bug

**Situation**: While fixing FP store errors, you notice the nonce loader also has bad error handling.

**Temptation**: Fix both in one commit

**Right Action**:
1. Finish the FP store commit
2. Create a new `commit-msg.txt` for the nonce loader
3. Make that a separate commit

```bash
# Commit 1
git commit -F commit-msg-fp-store.txt

# Commit 2
cat > commit-msg-nonce.txt << 'EOF'
fix(nonce): add SSM parameter context to error messages

The nonce loader catches errors when loading from SSM but doesn't
include which parameter failed or which region was used, making
debugging difficult.
EOF

# Make nonce loader changes
git add packages/mirror-dissonance/src/nonce/loader.ts
git commit -F commit-msg-nonce.txt
```

### Scenario 2: The Refactoring Temptation

**Situation**: While fixing error handling, you see `computeWindow()` is inefficient.

**Temptation**: "I'm already in this file, might as well fix it..."

**Right Action**:
1. **Stop**. Take your hands off the keyboard.
2. Look at your commit message. Does it say "refactor window computation"? No.
3. Create an issue or add to Phase 1 backlog:
   ```bash
   echo "- [ ] Refactor computeWindow for efficiency" >> docs/phase-1-backlog.md
   ```
4. Continue with your original commit

### Scenario 3: Tests Reveal More Issues

**Situation**: You write a test for error propagation and discover the retry logic is also broken.

**Temptation**: Fix everything at once

**Right Action**: Evaluate the scope

**If retry logic is critical to error propagation**:
```bash
# Update commit message to include retry logic
cat > commit-msg.txt << 'EOF'
fix(fp-store): propagate DynamoDB errors and fix retry logic

Error handling has two issues:
1. Errors are logged but not propagated (returns empty arrays)
2. Retry logic doesn't handle transient failures correctly

This commit fixes both by re-throwing errors with context and
implementing exponential backoff for retries.
EOF
```

**If retry logic is independent**:
```bash
# Keep original commit focused
git commit -F commit-msg-error-propagation.txt

# Make retry logic a second commit
cat > commit-msg-retry.txt << 'EOF'
fix(fp-store): implement exponential backoff for DynamoDB retries
EOF
```

### Scenario 4: Cross-File Changes

**Situation**: Fixing CLI error handling requires updating both `cli/src/index.ts` and `cli/src/errors.ts`.

**Right Action**: Multiple files are fine if they serve one logical change

```bash
cat > commit-msg.txt << 'EOF'
fix(cli): improve error diagnostics with error type differentiation

The CLI handles all errors generically, giving users unhelpful messages.
This commit introduces typed errors (ConfigError, OracleError, NetworkError)
and provides specific troubleshooting guidance for each type.

Files changed:
- cli/src/index.ts: Error handling logic
- cli/src/errors.ts: New error types
- cli/tests/error-handling.test.ts: Test coverage
EOF

git add cli/src/index.ts cli/src/errors.ts cli/tests/error-handling.test.ts
git commit -F commit-msg.txt
```

### Scenario 5: Documentation Updates

**Situation**: You fixed error handling. Should docs be in the same commit or separate?

**Right Action**: Depends on the documentation

**Same commit** if docs are directly about the change:
```bash
# Updating error handling behavior documented in code
git add src/fp-store/store.ts
git add src/fp-store/README.md  # Documents error handling behavior
git commit -m "fix(fp-store): propagate errors; update error handling docs"
```

**Separate commit** if docs are broader:
```bash
# First commit: Code change
git commit -m "fix(fp-store): propagate DynamoDB errors"

# Second commit: Broader documentation
git commit -m "docs: add error handling best practices guide"
```

## Anti-Patterns

### ❌ The Kitchen Sink
```bash
git commit -m "Fixed multiple issues"
# Changed 15 files across 4 modules
```

**Problem**: Can't bisect, can't review, can't understand intent

**Fix**: Split into separate commits per issue

### ❌ The WIP Trap
```bash
git commit -m "WIP: working on fp store"
# Tests failing, build broken
```

**Problem**: Breaks bisectability, clutters history

**Fix**: Use `git stash` or local branches for work-in-progress

### ❌ The Retroactive Message
```bash
# After coding for 2 hours
git commit -m "fix stuff in fp store"
```

**Problem**: Message doesn't reflect actual scope; likely has scope creep

**Fix**: Write message FIRST

### ❌ The Vague Subject
```bash
git commit -m "updates"
git commit -m "changes"
git commit -m "fixes"
```

**Problem**: Uninformative; doesn't help future debugging

**Fix**: Be specific: "fix(fp-store): propagate DynamoDB errors"

### ❌ The Cross-Phase Commit
```bash
# Commit includes Phase 0 AND Phase 1 work
git commit -m "fix errors and add adapter layer"
```

**Problem**: Violates phase boundaries; makes PR coherence impossible

**Fix**: Separate commits in appropriate phase branches

## Commit Message Templates

### Bug Fix
```
fix(<scope>): <brief description>

Current behavior:
<what happens now>

Problem:
<why this is wrong>

This commit:
<what changes>

Refs: docs/known-issues.md #<number>
```

### Feature Addition
```
feat(<scope>): <brief description>

Adds <new capability> to enable <use case>.

Implementation:
- <key point 1>
- <key point 2>

Tests added:
- <test scenario 1>
- <test scenario 2>

Refs: ADR-<number>, Issue #<number>
```

### Refactoring
```
refactor(<scope>): <brief description>

Extract <something> to improve <quality attribute>.

No functional changes. Verified by:
- All tests pass (no changes needed)
- Build succeeds
- Manual smoke test

Refs: Phase <number>, Point <number>
```

### Documentation
```
docs(<scope>): <brief description>

<What this documentation adds or clarifies>

Audience: <who this is for>
Purpose: <why this is needed>

Refs: Issue #<number>
```

### Test Addition
```
test(<scope>): <brief description>

Adds test coverage for <functionality>.

Covers:
- <scenario 1>
- <scenario 2>
- <edge case>

Current coverage: <before>% -> <after>%

Refs: Phase <number>, Point <number>
```

## Pre-Commit Checklist

Before running `git commit`, verify:

- [ ] **Message written first** and visible on screen
- [ ] **Changes match message** — no scope creep
- [ ] **Tests pass** — `pnpm test` succeeds
- [ ] **Build succeeds** — `pnpm build` works
- [ ] **Linter passes** — `pnpm lint` is clean
- [ ] **Only relevant files staged** — check `git diff --staged`
- [ ] **No debugging code** — no console.logs, breakpoints, etc.
- [ ] **No commented code** — remove or document why kept
- [ ] **References included** — link to issue/docs/ADR

## Git Configuration

### Set Commit Template
```bash
cat > .git/commit-template << 'EOF'
<type>(<scope>): <subject>

<body>

Refs: 
EOF

git config commit.template .git/commit-template
```

### Enable Commit Message Validation
```bash
# .git/hooks/commit-msg
#!/bin/bash
commit_msg=$(cat "$1")

# Check format: type(scope): subject
if ! echo "$commit_msg" | grep -qE '^(feat|fix|docs|refactor|test|chore)\([a-z-]+\): .+$'; then
  echo "ERROR: Commit message must follow format:"
  echo "  type(scope): subject"
  echo ""
  echo "Example:"
  echo "  fix(fp-store): propagate DynamoDB errors"
  exit 1
fi
```

### Require Pre-Commit Tests
```bash
# .git/hooks/pre-commit
#!/bin/bash
echo "Running tests before commit..."
pnpm test:unit

if [ $? -ne 0 ]; then
  echo "ERROR: Tests must pass before committing"
  echo "Fix the failing tests or adjust your changes"
  exit 1
fi
```

## Tools and Utilities

### Pre-Write Message Helper
```bash
#!/bin/bash
# scripts/new-commit.sh

echo "What are you fixing/adding? (one-line summary)"
read -r summary

echo "Why? (problem statement)"
read -r why

echo "How? (what this commit does)"
read -r how

cat > commit-msg.txt << EOF
fix(component): $summary

Current behavior: $why

This commit: $how

Refs: 
EOF

echo "Created commit-msg.txt. Edit if needed, then start coding."
```

### Scope Checker
```bash
#!/bin/bash
# scripts/check-scope.sh

# Extract scope from commit message
scope=$(head -1 commit-msg.txt | sed 's/.*(\(.*\)):.*/\1/')

# Get changed files
changed=$(git diff --name-only --cached)

# Check if changes are in scope
for file in $changed; do
  if ! echo "$file" | grep -q "$scope"; then
    echo "WARNING: $file might be out of scope for ($scope)"
  fi
done
```

## Real-World Examples from Phase Mirror

### Example 1: Phase 0, Point 4

**Message (written first)**:
```
fix(fp-store): propagate DynamoDB errors instead of silently returning empty arrays

When DynamoDB operations fail in getRecentEvents and related methods,
errors are logged but empty arrays are returned. This masks critical
failures and can lead to incorrect decisions.

This commit updates error handling to re-throw errors with context:
- Operation type (scan, query, put)
- Table name
- Query parameters
- Original error chain

Refs: docs/known-issues.md #8
```

**Changes (within scope)**:
```diff
// packages/mirror-dissonance/src/fp-store/store.ts

async getRecentEvents(windowSec: number): Promise<FalsePositiveEvent[]> {
  try {
    const result = await this.dynamodb.scan({...});
    return result.Items || [];
  } catch (error) {
-   logger.error('DynamoDB scan failed', error);
-   return [];
+   throw new FPStoreError('Failed to scan recent FP events', {
+     cause: error,
+     context: { operation: 'scan', windowSec, tableName: this.tableName }
+   });
  }
}
```

**Out of scope (resisted temptation)**:
```typescript
// Did NOT refactor this — it's Phase 1 work
computeWindow(windowSec: number) { /* ... */ }
```

### Example 2: Phase 0, Point 7

**Message (written first)**:
```
fix(cli): differentiate error types and provide specific troubleshooting guidance

The CLI catches all errors with a generic handler, giving users
unhelpful "An error occurred" messages. This makes debugging difficult.

This commit introduces typed errors:
- ConfigError: Configuration file issues
- OracleError: Rule evaluation failures
- NetworkError: GitHub API or AWS connection issues

Each error type includes specific next steps for the user.

Refs: docs/known-issues.md #10
```

**Changes (cross-file but coherent)**:
```typescript
// packages/cli/src/errors.ts (NEW FILE)
export class ConfigError extends Error { /* ... */ }
export class OracleError extends Error { /* ... */ }
export class NetworkError extends Error { /* ... */ }

// packages/cli/src/index.ts
try {
  await runOracle(config);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
    console.error('Check your .phase-mirror.yml file');
  } else if (error instanceof OracleError) {
    console.error(`Rule evaluation failed: ${error.message}`);
    console.error('Check rule definitions and input data');
  } else if (error instanceof NetworkError) {
    console.error(`Network error: ${error.message}`);
    console.error('Check AWS credentials and GitHub token');
  }
}
```

## Summary

The discipline is simple:

1. **Choose** one item from the phase plan
2. **Write** the commit message before coding
3. **Use** the message as your scope boundary
4. **Stage** only relevant changes
5. **Verify** tests and build pass
6. **Commit** with your pre-written message

This discipline gives Phase Mirror a clean, bisectable history and reviewable phase-level narratives.

---

**Last Updated**: 2026-02-06
**Related**: [docs/BRANCH_STRATEGY.md](./BRANCH_STRATEGY.md)
**Status**: Active
