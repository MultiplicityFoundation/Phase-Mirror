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
