# End-to-End Tests

This directory contains end-to-end tests for the Phase Mirror system, testing the full CI/CD cycle from PR creation through drift detection.

## Prerequisites

1. **GitHub Token**: You need a GitHub personal access token with the following permissions:
   - `repo` (full control of private repositories)
   - `workflow` (update GitHub Action workflows)

2. **Test Repository**: A GitHub repository for testing (default: `PhaseMirror/Phase-Mirror-Test`)
   - The repository should have the Mirror Dissonance workflows configured
   - Must have a `main` branch

3. **Node.js**: Version 18 or higher

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set environment variables:
   ```bash
   export GITHUB_TOKEN="your_github_token_here"
   export E2E_TEST_OWNER="PhaseMirror"  # Optional, defaults to PhaseMirror
   export E2E_TEST_REPO="Phase-Mirror-Test"  # Optional, defaults to Phase-Mirror-Test
   ```

## Running Tests

### Run all E2E tests:
```bash
pnpm test
```

### Run specific test:
```bash
pnpm test:e2e
```

### Run with custom timeout:
```bash
JEST_TIMEOUT=900000 pnpm test  # 15 minutes
```

## Test Scenarios

### Full Cycle Test (`full-cycle.test.ts`)

Tests the complete workflow:
1. Creates a test branch
2. Adds a test file
3. Creates a pull request
4. Waits for PR checks to complete
5. Verifies oracle check ran (if configured)
6. Merges the PR
7. Triggers drift detection workflow
8. Verifies drift detection completed
9. Cleans up (closes PR, deletes branch)

**Timeout**: 10 minutes

**Environment Variables**:
- `GITHUB_TOKEN` (required): GitHub personal access token
- `E2E_TEST_OWNER` (optional): Repository owner (default: `PhaseMirror`)
- `E2E_TEST_REPO` (optional): Repository name (default: `Phase-Mirror-Test`)

## Cleanup

The tests automatically clean up resources (branches, PRs) in the `afterAll` hook. If a test fails mid-execution, you may need to manually clean up:

```bash
# List open PRs
gh pr list --repo PhaseMirror/Phase-Mirror-Test

# Close a specific PR
gh pr close <PR_NUMBER> --repo PhaseMirror/Phase-Mirror-Test

# Delete a branch
gh api -X DELETE /repos/PhaseMirror/Phase-Mirror-Test/git/refs/heads/test-e2e-<timestamp>
```

## Troubleshooting

### "GITHUB_TOKEN environment variable is required"
- Set the `GITHUB_TOKEN` environment variable with a valid GitHub personal access token

### "Failed to create branch"
- Ensure your GitHub token has `repo` permissions
- Check that the test repository exists and you have write access

### "Checks did not complete within timeout"
- Increase the timeout using `JEST_TIMEOUT` environment variable
- Check that the repository has workflows configured
- Verify workflows are not failing on the repository

### "Workflow not found"
- The drift detection workflow may not be configured in the test repository
- The test will log a warning but won't fail if the workflow doesn't exist

## Best Practices

1. **Use a dedicated test repository**: Don't run E2E tests against production repositories
2. **Run tests sequentially**: E2E tests can interfere with each other if run in parallel
3. **Monitor rate limits**: GitHub API has rate limits; space out test runs
4. **Clean up manually if tests fail**: Check for leftover branches and PRs after failed tests

## CI/CD Integration

To run E2E tests in CI:

```yaml
name: E2E Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
        working-directory: e2e
      
      - name: Run E2E tests
        env:
          GITHUB_TOKEN: ${{ secrets.E2E_GITHUB_TOKEN }}
        run: pnpm test
        working-directory: e2e
```
