# Quick Reference: MCP Inspector Testing

This is a quick reference for the Day 6-7 testing infrastructure.

## File Structure

```
packages/mcp-server/
├── scripts/
│   ├── test-inspector.sh           # Interactive MCP Inspector launcher
│   ├── run-inspector-tests.js      # Automated test runner
│   └── test-with-inspector.sh      # Original simple launcher
├── test-cases/
│   └── inspector-test-cases.json   # 13 test scenarios (5 + 8)
├── test-results/
│   ├── inspector-test-log.md       # Manual testing template
│   └── inspector-automated-results.json  # Auto-generated (gitignored)
└── docs/
    ├── testing-guide.md            # Complete Day 6-7 guide
    ├── github-copilot-integration.md  # Copilot setup guide
    └── l0-invariants-reference.md  # L0 invariants docs
```

## Commands

### Quick Start

```bash
# Build the server
cd packages/mcp-server
pnpm build

# Launch interactive inspector (opens browser)
./scripts/test-inspector.sh

# Run automated tests
node scripts/run-inspector-tests.js

# Run unit tests
pnpm test
```

### What Each Script Does

#### `test-inspector.sh`
- Checks if server is built
- Starts MCP Inspector on http://localhost:5173
- Opens browser automatically
- Best for: Interactive manual testing

#### `run-inspector-tests.js`
- Starts MCP server programmatically
- Executes all 13 test cases
- Validates outputs against expectations
- Generates JSON report
- Best for: Automated validation

## Test Coverage

### `analyze_dissonance` (5 tests)
1. ✓ Basic single file analysis
2. ✓ GitHub Actions workflow analysis
3. ✓ Multiple files batch analysis
4. ✓ Invalid input (error handling)
5. ✓ Missing file (error handling)

### `validate_l0_invariants` (8 tests)
1. ✓ Permission check (L0-002)
2. ✓ Fresh nonce validation
3. ✓ Expired nonce detection (L0-004)
4. ✓ Drift within threshold
5. ✓ Drift exceeds threshold (L0-003)
6. ✓ Legitimate FPR contraction
7. ✓ Illegitimate FPR contraction (L0-005)
8. ✓ Multi-check validation

## Common Tasks

### Add a New Test Case

Edit `test-cases/inspector-test-cases.json`:

```json
{
  "analyze_dissonance": {
    "test_N_description": {
      "description": "Human-readable description",
      "input": {
        "files": ["path/to/file"],
        "mode": "issue"
      },
      "expected": {
        "success": true,
        "analysis.filesAnalyzed": 1
      }
    }
  }
}
```

Then run: `node scripts/run-inspector-tests.js`

### Manual Testing Workflow

1. Start inspector: `./scripts/test-inspector.sh`
2. Open test cases: `test-cases/inspector-test-cases.json`
3. Open test log: `test-results/inspector-test-log.md`
4. For each test:
   - Copy input from test cases
   - Paste into Inspector UI
   - Execute tool
   - Record results in test log

### Automated Testing Workflow

```bash
# Run all tests
node scripts/run-inspector-tests.js

# Check results
cat test-results/inspector-automated-results.json | jq '.[] | select(.passed == false)'

# View summary
node scripts/run-inspector-tests.js | grep -A 10 "Test Summary"
```

## Performance Targets

| Tool | Target | Acceptable |
|------|--------|------------|
| `validate_l0_invariants` | <100ns | <150ns |
| `analyze_dissonance` | <2000ms | <3000ms |

## Troubleshooting

### Issue: "dist/index.js not found"
**Fix**: Run `pnpm build` first

### Issue: "Port 5173 already in use"
**Fix**: Kill existing Inspector instance or use different port

### Issue: Test timeout (10s)
**Causes**: Large files, slow I/O, external dependencies
**Fix**: Check file sizes, monitor resources

### Issue: Invalid JSON in test cases
**Fix**: Validate with `node -e "JSON.parse(require('fs').readFileSync('test-cases/inspector-test-cases.json'))"`

## Next Steps

After Day 6 testing:
- ✅ Review test results
- ✅ Document any issues found
- ✅ Proceed to Day 7: GitHub Copilot integration
- ✅ Follow [github-copilot-integration.md](./github-copilot-integration.md)

## Documentation Links

- **Complete Guide**: [docs/testing-guide.md](./testing-guide.md)
- **Copilot Setup**: [docs/github-copilot-integration.md](./github-copilot-integration.md)
- **L0 Reference**: [docs/l0-invariants-reference.md](./l0-invariants-reference.md)
- **Main README**: [README.md](./README.md)

## Support

Issues? https://github.com/PhaseMirror/Phase-Mirror/issues
