# GitHub Copilot Integration Test Templates

This directory contains test issue templates for validating Phase Mirror MCP server integration with GitHub Copilot coding agent.

## Overview

These templates help you create test issues that exercise MCP tools through GitHub Copilot. Each template includes:
- Expected tool calls
- Success criteria
- Validation checklist
- GitHub CLI commands to create issues

## Test Templates

### Basic Integration Test

**File**: `test-issue-template.md`

**Purpose**: Validate basic MCP tool functionality with Copilot

**Tools Tested**:
- `analyze_dissonance`
- `validate_l0_invariants`

**Usage**:
```bash
gh issue create \
  --title "Test: Phase Mirror MCP Integration" \
  --body-file packages/mcp-server/test-templates/test-issue-template.md \
  --label "copilot-test,mcp-integration" \
  --assignee "@copilot"
```

## Advanced Test Scenarios

Located in `advanced-scenarios/` directory:

### Scenario 2: Permission Escalation Detection

**File**: `advanced-scenarios/scenario-2-permission-escalation.md`

**Purpose**: Verify detection of excessive GitHub Actions permissions

**Focus**:
- L0-002 permission checks
- Least privilege validation
- Specific remediation suggestions

**Usage**:
```bash
gh issue create \
  --title "Test: Detect GitHub Actions Permission Escalation" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-2-permission-escalation.md \
  --label "copilot-test,mcp-integration,security" \
  --assignee "@copilot"
```

### Scenario 3: Multi-File Analysis with Context

**File**: `advanced-scenarios/scenario-3-multi-file-context.md`

**Purpose**: Test contextual understanding across multiple files

**Focus**:
- Batch file analysis
- Context incorporation
- ADR reference validation
- Cross-file pattern detection

**Usage**:
```bash
gh issue create \
  --title "Test: Comprehensive Governance Check" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-3-multi-file-context.md \
  --label "copilot-test,mcp-integration,comprehensive" \
  --assignee "@copilot"
```

### Scenario 4: Nonce Rotation Validation

**File**: `advanced-scenarios/scenario-4-nonce-rotation.md`

**Purpose**: Verify L0-004 nonce freshness validation

**Focus**:
- Nonce age calculation
- Timestamp validation
- L0-004 invariant checks
- Fresh vs expired detection

**Usage**:
```bash
gh issue create \
  --title "Test: Validate Nonce Rotation" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-4-nonce-rotation.md \
  --label "copilot-test,mcp-integration,l0-invariants" \
  --assignee "@copilot"
```

### Scenario 5: Error Recovery

**File**: `advanced-scenarios/scenario-5-error-recovery.md`

**Purpose**: Test graceful error handling

**Focus**:
- Invalid input handling
- Error code validation
- No infinite retries
- Helpful error messages

**Usage**:
```bash
gh issue create \
  --title "Test: Handle Invalid Tool Input" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-5-error-recovery.md \
  --label "copilot-test,mcp-integration,error-handling" \
  --assignee "@copilot"
```

## Test Workflow

### 1. Prerequisites

Before creating test issues:
- ✅ MCP server configured in repository settings
- ✅ Environment secrets configured
- ✅ Copilot enabled for repository
- ✅ Test labels created (`copilot-test`, `mcp-integration`)

See [GitHub Copilot Integration Guide](../docs/github-copilot-integration.md) for setup instructions.

### 2. Create Test Issue

Choose a template and create the issue:

```bash
# Basic test
gh issue create \
  --title "Test: [Title]" \
  --body-file packages/mcp-server/test-templates/[template].md \
  --label "copilot-test,mcp-integration" \
  --assignee "@copilot"
```

### 3. Monitor Execution

1. Navigate to issue in GitHub
2. Wait for Copilot to start (30-60 seconds)
3. Watch for Copilot comment
4. Check session logs:
   - Settings → Copilot → Coding Agent → Session Logs
   - Find session for your issue
   - Click "View Details"

### 4. Document Results

Record results in tracking document:
- `test-results/copilot-integration-log.md`

Include:
- Tool calls made
- Response times
- Success/failure status
- Issues discovered
- Screenshots

### 5. Validate Success Criteria

For each test, verify:
- ✅ MCP server started
- ✅ Tools listed correctly
- ✅ Tool calls executed
- ✅ Response times acceptable
- ✅ Copilot interpreted results correctly
- ✅ Recommendations align with governance

## Test Coverage Matrix

| Test | analyze_dissonance | validate_l0_invariants | Error Handling | Multi-Tool | Context | ADRs |
|------|-------------------|------------------------|----------------|------------|---------|------|
| Basic | ✅ | ✅ | | ✅ | | |
| Permission Escalation | ✅ | ✅ (L0-002) | | ✅ | | |
| Multi-File Context | ✅ | | | | ✅ | ✅ |
| Nonce Rotation | | ✅ (L0-004) | | | | |
| Error Recovery | ✅ | | ✅ | | | |

## Success Metrics

### Tool Call Success Rate
- **Target**: >95%
- **Measure**: Successful tool calls / Total tool calls

### Response Time
- **Target**: <5 seconds per tool call
- **Measure**: Time from tool call to response

### Copilot Accuracy
- **Target**: >90% correct interpretation
- **Measure**: Correct recommendations / Total recommendations

### Error Handling
- **Target**: 100% graceful handling
- **Measure**: No crashes or infinite retries

## Common Issues

### Issue: Copilot doesn't call MCP tools

**Possible causes**:
- MCP server not configured correctly
- Environment secrets missing
- Firewall blocking connections

**Fix**: Review [GitHub Copilot Integration Guide](../docs/github-copilot-integration.md)

### Issue: Tool calls timeout

**Possible causes**:
- Large files being analyzed
- Network latency
- AWS resource access issues

**Fix**: 
- Check file sizes
- Verify AWS credentials
- Review firewall configuration

### Issue: Copilot misinterprets results

**Possible causes**:
- Tool response format unexpected
- Complex findings structure

**Fix**:
- Review tool output in MCP Inspector
- Verify response matches expected schema
- File bug report with example

## Best Practices

### Creating Test Issues

1. **Be specific**: Clearly state what you want Copilot to do
2. **Include context**: Help Copilot understand the scenario
3. **Set expectations**: List success criteria
4. **Use labels**: Make test issues easy to find

### Monitoring Tests

1. **Check session logs**: Don't just wait for comments
2. **Measure response times**: Track performance
3. **Document failures**: Note what went wrong
4. **Take screenshots**: Visual evidence is helpful

### Documenting Results

1. **Be thorough**: Record all details
2. **Include tool calls**: Show exact inputs/outputs
3. **Note observations**: Even small details matter
4. **Track over time**: Compare results across test runs

## Reporting Issues

If you find bugs or unexpected behavior:

1. **Document thoroughly**:
   - Test scenario
   - Expected behavior
   - Actual behavior
   - Tool calls (inputs/outputs)
   - Session logs
   - Screenshots

2. **Create issue**: https://github.com/PhaseMirror/Phase-Mirror/issues

3. **Label appropriately**:
   - `bug` for defects
   - `mcp-server` for component
   - `copilot-integration` for context

## Related Documentation

- [Testing Guide](../docs/testing-guide.md) - Complete Day 6-7 procedures
- [GitHub Copilot Integration](../docs/github-copilot-integration.md) - Setup guide
- [Integration Report Template](../docs/COPILOT_INTEGRATION_REPORT.md) - Results template
- [Integration Log Template](../test-results/copilot-integration-log.md) - Tracking template

## Next Steps

After running all tests:

1. Complete `test-results/copilot-integration-log.md`
2. Fill out `docs/COPILOT_INTEGRATION_REPORT.md`
3. Review findings with team
4. Address any critical issues
5. Proceed to production or iteration
