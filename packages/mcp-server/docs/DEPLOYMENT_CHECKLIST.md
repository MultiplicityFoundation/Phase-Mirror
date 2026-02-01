# Production Deployment Checklist

## Pre-Deployment Validation

### Code Quality

- [ ] All unit tests passing (`pnpm test` - excluding integration)
- [ ] All integration tests passing (`pnpm test test/integration/`)
- [ ] Linter checks passing (`pnpm lint`)
- [ ] Build completes without errors (`pnpm build`)
- [ ] No TypeScript compilation errors
- [ ] Code review completed and approved

### Security

- [ ] Security scan completed (CodeQL/Dependabot)
- [ ] No critical or high-severity vulnerabilities
- [ ] Dependency versions reviewed and updated
- [ ] Secrets not committed to repository
- [ ] AWS credentials configured externally (env vars/IAM roles)
- [ ] Input validation tested for all tools
- [ ] Error messages don't leak sensitive information

### Documentation

- [ ] README.md up to date
- [ ] INTEGRATION_TESTING.md reviewed
- [ ] API documentation current
- [ ] ADRs referenced and up to date
- [ ] CHANGELOG.md updated with changes
- [ ] Version number incremented appropriately

### Functional Testing

- [ ] All 6 tools list correctly via `tools/list`
- [ ] `get_server_info` executes successfully
- [ ] `analyze_dissonance` executes successfully
- [ ] `validate_l0_invariants` executes successfully
- [ ] `check_adr_compliance` executes successfully
- [ ] `query_fp_store` executes successfully
- [ ] `check_consent_requirements` executes successfully

### Error Handling Validation

- [ ] Invalid input returns structured error response
- [ ] Missing files return `FILE_NOT_FOUND` error
- [ ] Missing consent returns appropriate consent error
- [ ] Server recovers from transient errors
- [ ] Rate limiting returns appropriate error with retry guidance

### Performance Validation

- [ ] `validate_l0_invariants` completes in < 500ms (single file)
- [ ] `check_consent_requirements` completes in < 200ms
- [ ] `query_fp_store` completes in < 1000ms
- [ ] `analyze_dissonance` completes in < 5000ms (single file)
- [ ] No memory leaks over 50 requests

### Package Preparation

- [ ] `package.json` version updated
- [ ] `package.json` dependencies correct
- [ ] `package.json` engines specifies Node.js 18+
- [ ] `npm pack` produces valid package
- [ ] Package size reasonable (<10MB)

## Environment Configuration

### Required Environment Variables

#### AWS Configuration

```bash
# Required for AWS service access
export AWS_REGION="us-east-1"  # Your AWS region

# Optional - for FP store access (if not set, uses NoOp store)
export FP_TABLE_NAME="your-fp-store-table"

# Optional - for consent management (if not set, uses NoOp store)
export CONSENT_TABLE_NAME="your-consent-store-table"

# Optional - for nonce rotation
export NONCE_PARAMETER_NAME="/your/parameter/path"
```

#### Logging Configuration

```bash
# Set log level (error, warn, info, debug)
export LOG_LEVEL="info"  # Use "info" for production
```

### AWS IAM Permissions

Ensure the execution role/user has permissions for:

#### DynamoDB (if using real stores)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/${FP_TABLE_NAME}",
        "arn:aws:dynamodb:*:*:table/${CONSENT_TABLE_NAME}"
      ]
    }
  ]
}
```

#### Systems Manager Parameter Store (if using nonce rotation)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter${NONCE_PARAMETER_NAME}"
    }
  ]
}
```

## Production Deployment Workflow

### Version Management

#### 1. Version Bump

```bash
# Navigate to mcp-server package
cd packages/mcp-server

# Update version (choose appropriate level)
npm version patch  # For bug fixes (0.1.0 -> 0.1.1)
npm version minor  # For new features (0.1.0 -> 0.2.0)
npm version major  # For breaking changes (0.1.0 -> 1.0.0)

# This automatically:
# - Updates package.json version
# - Creates a git commit
# - Creates a git tag
```

#### 2. Update CHANGELOG.md

Add release notes for the new version:

```markdown
## [0.2.0] - 2026-02-01

### Added
- New feature X
- New tool Y

### Changed
- Improved performance of Z

### Fixed
- Bug in tool A
- Error handling in B

### Security
- Updated dependency C to fix vulnerability
```

### Pre-Publishing Validation

#### 1. Clean Build

```bash
# Clean previous builds
pnpm clean

# Fresh install and build
pnpm install
pnpm build
```

#### 2. Run Full Test Suite

```bash
# Run all tests
pnpm test

# Verify all tests pass
# Expected: All tests passing, no errors
```

#### 3. Package Verification

```bash
# Create package tarball
npm pack

# Inspect contents
tar -tzf phase-mirror-mcp-server-0.2.0.tgz

# Check package size
ls -lh *.tgz
# Should be < 10MB
```

### Publishing to npm

#### 1. Verify npm Authentication

```bash
# Check if logged in
npm whoami

# Login if needed
npm login
```

#### 2. Publish Package

```bash
# Publish with public access
npm publish --access public

# For pre-release/beta versions
npm publish --access public --tag beta
```

#### 3. Verify Publication

```bash
# Check package is available
npm view @phase-mirror/mcp-server

# Test installation
npx @phase-mirror/mcp-server --version
```

### GitHub Release

#### 1. Create Git Tag

```bash
# Tag should already exist from npm version
# Push tags to GitHub
git push origin main
git push origin --tags
```

#### 2. Create GitHub Release

1. Go to https://github.com/PhaseMirror/Phase-Mirror/releases/new
2. Select the version tag (e.g., `v0.2.0`)
3. Add release title: "Phase Mirror MCP Server v0.2.0"
4. Copy CHANGELOG excerpt to release notes
5. Attach any additional assets (if needed)
6. Publish release

### Post-Publication Validation

- [ ] Package available on npm: `npm view @phase-mirror/mcp-server`
- [ ] `npx @phase-mirror/mcp-server` works
- [ ] GitHub release created with release notes
- [ ] Documentation site updated (if applicable)

## Deployment Steps

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build Project

```bash
pnpm build
```

Verify `dist/src/index.js` exists and is executable.

### 3. Test Build

```bash
# Test that the built server starts
node dist/src/index.js
# Should output: "Phase Mirror MCP Server running on stdio"
# Press Ctrl+C to exit
```

### 4. Run Pre-Deployment Tests

```bash
# Run all tests
pnpm test

# Specifically run integration tests
pnpm test test/integration/
```

All tests should pass.

### 5. Configure MCP Client

#### Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "phase-mirror": {
      "command": "node",
      "args": ["/path/to/Phase-Mirror/packages/mcp-server/dist/src/index.js"],
      "env": {
        "AWS_REGION": "us-east-1",
        "FP_TABLE_NAME": "prod-fp-store",
        "CONSENT_TABLE_NAME": "prod-consent-store",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

#### VS Code with Copilot

Configure in `.vscode/settings.json`:

```json
{
  "github.copilot.mcp.servers": {
    "phase-mirror": {
      "command": "node",
      "args": ["/path/to/Phase-Mirror/packages/mcp-server/dist/src/index.js"],
      "env": {
        "AWS_REGION": "us-east-1",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### 6. Verify Connection

Test the MCP connection using MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/src/index.js
```

Verify:
- [ ] Server starts without errors
- [ ] All 6 tools listed (including `get_server_info`)
- [ ] Each tool has proper input schema
- [ ] Test calls to `get_server_info` succeed

## Post-Deployment Validation

### Smoke Tests

#### 1. Get Server Info

```
Tool: get_server_info
Arguments: {}
Expected: Returns server name, version, and config
```

#### 2. Analyze Dissonance (with NoOp)

```
Tool: analyze_dissonance
Arguments: {
  "files": ["/path/to/test/file.ts"],
  "context": "org/repo",
  "mode": "pull_request"
}
Expected: Returns analysis with filesAnalyzed > 0
```

#### 3. Validate L0 Invariants

```
Tool: validate_l0_invariants
Arguments: {
  "files": ["/path/to/test/file.ts"],
  "context": "org/repo"
}
Expected: Returns validation results
```

#### 4. Check ADR Compliance

```
Tool: check_adr_compliance
Arguments: {
  "files": ["/path/to/test/file.ts"],
  "adrPath": "/path/to/adrs"
}
Expected: Returns compliance check results
```

#### 5. Check Consent (if using real store)

```
Tool: check_consent_requirements
Arguments: {
  "orgId": "test-org",
  "checkType": "summary"
}
Expected: Returns consent status
```

#### 6. Query FP Store (if using real store)

```
Tool: query_fp_store
Arguments: {
  "queryType": "fp_rate",
  "ruleId": "MD-001",
  "orgId": "test-org"
}
Expected: Returns FP data or "no data" message
```

### Error Handling Tests

Test error scenarios to ensure graceful failures:

- [ ] Invalid tool name returns clear error
- [ ] Missing required parameters return validation errors
- [ ] Invalid parameter types are rejected
- [ ] File not found errors are handled gracefully
- [ ] AWS service errors (if any) don't crash server

### Performance Tests

Monitor initial performance:

- [ ] Server startup time < 2 seconds
- [ ] `get_server_info` responds < 100ms
- [ ] Simple file analysis < 5 seconds
- [ ] Large file analysis (1MB+) < 30 seconds
- [ ] Memory usage stable over time

## Monitoring & Logging

### Log Locations

- **Server Logs**: Written to stderr by MCP server
- **Client Logs**: Check MCP client's log directory
  - Claude Desktop: `~/Library/Logs/Claude/mcp*.log`
  - VS Code: Output panel → GitHub Copilot Logs

### What to Monitor

#### Normal Operation

- Server startup confirmations
- Tool call counts and types
- Average response times
- Error rates (should be low)

#### Warning Signs

- Frequent validation errors (may indicate client issues)
- Slow response times (>30s for simple operations)
- Memory leaks (increasing memory over time)
- AWS throttling errors (may need rate limiting)
- Frequent crashes/restarts

### Alerting

Set up alerts for:

- Server crashes (automatic restarts)
- High error rates (>5% of requests)
- Slow response times (p95 > 30s)
- AWS service errors
- Memory exhaustion

### CloudWatch Alarms (AWS Deployments)

If using AWS infrastructure, set up CloudWatch alarms:

```bash
# DynamoDB throttling alarm
aws cloudwatch put-metric-alarm \
  --alarm-name mcp-dynamodb-throttling \
  --alarm-description "Alert on DynamoDB throttling" \
  --metric-name ThrottledRequests \
  --namespace AWS/DynamoDB \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=TableName,Value=$FP_TABLE_NAME

# Error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name mcp-error-rate \
  --alarm-description "Alert on high error rate" \
  --metric-name ErrorCount \
  --namespace MCP/Server \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold

# Latency alarm (p99 > 5s)
aws cloudwatch put-metric-alarm \
  --alarm-name mcp-high-latency \
  --alarm-description "Alert on high latency" \
  --metric-name Duration \
  --namespace MCP/Server \
  --statistic p99 \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 5000 \
  --comparison-operator GreaterThanThreshold
```

### Structured Logging

Enable structured JSON logging for better analysis:

```bash
# Production logging configuration
export LOG_LEVEL="info"
export LOG_FORMAT="json"  # If supported

# Log to file for analysis
node dist/src/index.js 2>&1 | tee -a /var/log/mcp-server/server.log
```

Ensure logs include:
- Request IDs for tracing
- Tool names and parameters (sanitized)
- Execution times
- Error codes and messages
- AWS service call metadata

### Metrics Collection

Track these metrics for monitoring:

**Tool Metrics**:
- Tool call counts (by tool name)
- Tool execution latencies (p50, p95, p99)
- Tool success/failure rates

**Error Metrics**:
- Error counts by error code
- Error rates (errors/total requests)
- Retry counts and success rates

**Performance Metrics**:
- Request throughput (requests/second)
- Memory usage over time
- CPU utilization
- DynamoDB read/write capacity consumed

**Consent Metrics**:
- Consent check outcomes (granted/denied)
- Consent cache hit rate
- Organizations with active consent

## Rollback Plan

If issues arise after deployment:

### 1. Immediate Rollback

```bash
# Revert to previous version in MCP client config
# Update version/path in claude_desktop_config.json
```

### 2. Identify Issue

- Check server logs for errors
- Review recent changes
- Test in isolation

### 3. Fix Forward vs. Rollback

- **Minor issues**: Fix forward with hotfix
- **Major issues**: Full rollback to last known good version

#### Deprecate Broken npm Version

If critical bug is discovered:

```bash
# Deprecate the broken version
npm deprecate @phase-mirror/mcp-server@0.2.0 "Critical bug in tool X, use 0.2.1 instead"

# Publish hotfix
npm version patch  # 0.2.0 -> 0.2.1
npm publish

# Verify deprecation notice appears
npm view @phase-mirror/mcp-server@0.2.0
```

#### Notify Users

- Update GitHub release notes with warning
- Post announcement in Discord/community channels (if available)
- Send email notification for critical security issues
- Update documentation site with notice

### 4. Post-Mortem

- Document what went wrong
- Update tests to catch the issue
- Improve deployment checklist

## Versioning

### Version Numbering

Follow Semantic Versioning (SemVer):

- **MAJOR**: Breaking API changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

### Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with changes
3. Create git tag: `git tag -a v0.2.0 -m "Version 0.2.0"`
4. Push tag: `git push origin v0.2.0`
5. Create GitHub release with notes

## Maintenance

### Regular Tasks

#### Weekly

- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Update dependencies (patch versions)

#### Monthly

- [ ] Update dependencies (minor versions)
- [ ] Review and update documentation
- [ ] Run full test suite
- [ ] Check for AWS service updates

#### Quarterly

- [ ] Security audit
- [ ] Performance review
- [ ] Update dependencies (major versions, with testing)
- [ ] Review and update ADRs

## Support

### Troubleshooting Resources

- [Integration Testing Guide](./INTEGRATION_TESTING.md)
- [Main README](../README.md)
- [ADRs](../../docs/adr/)
- [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues)

### Getting Help

1. Check troubleshooting documentation
2. Search existing GitHub issues
3. Open new issue with:
   - MCP server version
   - Client environment (Claude Desktop, VS Code, etc.)
   - Error logs
   - Steps to reproduce

### Emergency Contacts

- **Production Issues**: [Your team contact]
- **Security Issues**: [Your security contact]
- **Infrastructure**: [Your infrastructure contact]

## Success Criteria

Deployment is considered successful when:

- [ ] All smoke tests pass
- [ ] No critical errors in first hour
- [ ] Response times within acceptable ranges
- [ ] Client can successfully use all tools
- [ ] Monitoring shows stable operation
- [ ] No user-reported issues

## Sign-Off

- **Deployed By**: ________________
- **Date**: ________________
- **Version**: ________________
- **Environment**: ________________
- **Approval**: ________________

---

**Last Updated**: 2026-02-01  
**Version**: 0.1.0  
**Status**: Production Ready
