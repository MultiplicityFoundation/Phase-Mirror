# Git Hooks Setup Guide

Git hooks automate quality checks before commits and enforce commit message standards. This is **optional but recommended** for maintaining code quality.

## Available Hooks

### Pre-Commit Hook
Runs tests before allowing a commit to ensure no broken code is committed.

### Commit-Msg Hook
Enforces conventional commit message format for consistent commit history.

---

## Installation

### Automatic Installation Script

Create and run this script to install all hooks:

```bash
#!/bin/bash
# Install git hooks for Phase Mirror

HOOKS_DIR=".git/hooks"

echo "Installing git hooks..."

# Pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
# Pre-commit hook: Run tests before allowing commit

echo "🧪 Running tests before commit..."

# Run tests
pnpm test --passWithNoTests

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Tests failed. Commit aborted."
  echo "   Fix tests or use 'git commit --no-verify' to skip this check."
  exit 1
fi

echo "✅ Tests passed. Proceeding with commit."
EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo "✓ Pre-commit hook installed"

# Commit-msg hook
cat > "$HOOKS_DIR/commit-msg" << 'EOF'
#!/bin/bash
# Commit message hook: Enforce conventional commits format

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Pattern: type(scope): message
# Types: feat, fix, docs, style, refactor, test, chore
PATTERN="^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{10,}"

if ! echo "$COMMIT_MSG" | grep -Eq "$PATTERN"; then
  echo "❌ Invalid commit message format."
  echo ""
  echo "Expected format: type(scope): message"
  echo ""
  echo "Valid types: feat, fix, docs, style, refactor, test, chore"
  echo ""
  echo "Examples:"
  echo "  feat(fp-store): add DynamoDB batch write support"
  echo "  fix(consent): handle expired consent properly"
  echo "  docs(readme): update installation instructions"
  echo "  test(oracle): add integration tests"
  echo ""
  echo "Message must be at least 10 characters after the colon."
  exit 1
fi

echo "✅ Commit message format valid."
EOF

chmod +x "$HOOKS_DIR/commit-msg"
echo "✓ Commit-msg hook installed"

echo ""
echo "✅ Git hooks installed successfully!"
echo ""
echo "Hooks installed:"
echo "  - pre-commit: Runs tests before commit"
echo "  - commit-msg: Enforces conventional commit format"
echo ""
echo "To bypass hooks (not recommended):"
echo "  git commit --no-verify"
```

Save as `scripts/install-git-hooks.sh` and run:

```bash
chmod +x scripts/install-git-hooks.sh
./scripts/install-git-hooks.sh
```

---

## Manual Installation

### Pre-Commit Hook

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Pre-commit hook: Run tests before allowing commit

echo "🧪 Running tests before commit..."

# Run tests
pnpm test --passWithNoTests

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Tests failed. Commit aborted."
  echo "   Fix tests or use 'git commit --no-verify' to skip this check."
  exit 1
fi

echo "✅ Tests passed. Proceeding with commit."
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

### Commit-Msg Hook

Create `.git/hooks/commit-msg`:

```bash
#!/bin/bash
# Commit message hook: Enforce conventional commits format

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Pattern: type(scope): message
PATTERN="^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{10,}"

if ! echo "$COMMIT_MSG" | grep -Eq "$PATTERN"; then
  echo "❌ Invalid commit message format."
  echo ""
  echo "Expected format: type(scope): message"
  echo ""
  echo "Valid types: feat, fix, docs, style, refactor, test, chore"
  echo ""
  echo "Examples:"
  echo "  feat(fp-store): add DynamoDB batch write support"
  echo "  fix(consent): handle expired consent properly"
  echo "  docs(readme): update installation instructions"
  echo ""
  exit 1
fi

echo "✅ Commit message format valid."
```

Make executable:
```bash
chmod +x .git/hooks/commit-msg
```

---

## Conventional Commit Format

### Structure
```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(fp-store): add batch write support` |
| `fix` | Bug fix | `fix(consent): handle expired consent` |
| `docs` | Documentation changes | `docs(readme): update setup instructions` |
| `style` | Code style changes (formatting) | `style: fix indentation in oracle.ts` |
| `refactor` | Code refactoring (no behavior change) | `refactor(nonce): simplify cache logic` |
| `test` | Test changes | `test(l0): add invariant validation tests` |
| `chore` | Build/tooling changes | `chore: update dependencies` |

### Scope (Optional)

The scope specifies what part of the codebase is affected:
- `fp-store` - False positive store
- `consent` - Consent management
- `oracle` - Main Oracle implementation
- `cli` - CLI wrapper
- `docs` - Documentation
- `infra` - Infrastructure/Terraform
- `tests` - Test infrastructure

### Examples

#### Good Commit Messages ✅

```bash
feat(fp-store): implement batch write operation
fix(consent): correct expiration time calculation
docs(terraform): add backend configuration guide
test(oracle): add integration tests for FP workflow
refactor(nonce): extract cache logic to separate module
chore(deps): update AWS SDK to v3.500.0
```

#### Bad Commit Messages ❌

```bash
update code          # Too vague, no type
Fix bug              # No scope, description too short
WIP                  # Not descriptive
asdf                 # Not following any convention
```

---

## Bypassing Hooks

Sometimes you may need to bypass hooks (e.g., WIP commits, emergency fixes):

```bash
# Skip pre-commit hook
git commit --no-verify -m "wip: work in progress"

# Skip all hooks
git commit --no-verify --no-edit
```

**⚠️ Warning:** Use `--no-verify` sparingly. Bypassing hooks can introduce broken code or inconsistent commit history.

---

## Testing Hooks

### Test Pre-Commit Hook

1. Make a change to any file
2. Stage the change: `git add .`
3. Try to commit: `git commit -m "test: testing pre-commit hook"`
4. Hook should run tests before allowing commit

### Test Commit-Msg Hook

1. Try an invalid commit message:
   ```bash
   git commit --allow-empty -m "bad message"
   ```
   Should be rejected with error message.

2. Try a valid commit message:
   ```bash
   git commit --allow-empty -m "test: valid commit message format"
   ```
   Should be accepted.

---

## Customizing Hooks

### Disable Test Execution in Pre-Commit

If tests take too long, you can modify the pre-commit hook to only run linting:

```bash
#!/bin/bash
echo "🔍 Running linter before commit..."

pnpm lint

if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Commit aborted."
  exit 1
fi

echo "✅ Linting passed."
```

### Add More Commit Types

Edit the commit-msg hook and add types to the pattern:

```bash
# Add 'perf' and 'build' types
PATTERN="^(feat|fix|docs|style|refactor|test|chore|perf|build)(\(.+\))?: .{10,}"
```

---

## Troubleshooting

### Hook Not Running

**Problem:** Hook doesn't execute when committing.

**Solution:**
```bash
# Check if hook exists and is executable
ls -la .git/hooks/
chmod +x .git/hooks/pre-commit
chmod +x .git/hooks/commit-msg
```

### Hook Always Fails

**Problem:** Pre-commit hook fails even though tests pass manually.

**Solution:**
```bash
# Ensure pnpm is in PATH for the hook
# Add to top of hook:
export PATH="/usr/local/bin:$PATH"

# Test manually
.git/hooks/pre-commit
```

### Wrong Shell

**Problem:** Hook syntax errors.

**Solution:**
Ensure hook starts with correct shebang:
```bash
#!/bin/bash
# or
#!/bin/sh
```

---

## Uninstalling Hooks

To remove hooks:

```bash
rm .git/hooks/pre-commit
rm .git/hooks/commit-msg
```

Or rename to disable:

```bash
mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled
mv .git/hooks/commit-msg .git/hooks/commit-msg.disabled
```

---

## Team Guidelines

### For Individual Development
- Install hooks for personal quality checks
- Use `--no-verify` for WIP commits if needed
- Fix issues before final PR

### For Team Projects
- **Recommended:** All team members install hooks
- **Document:** Add installation instructions to README
- **Enforce:** Use CI/CD checks as backup
- **Flexible:** Allow bypassing with good reason

---

## Additional Resources

- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Commitlint](https://commitlint.js.org/) - More advanced commit message linting

---

**Last Updated:** 2026-02-01  
**Maintained By:** Phase Mirror Team
