# Phase Mirror MCP Server - Troubleshooting Guide

## Common Issues and Solutions

### AWS Credential Issues

#### Symptom
Error messages containing:
- `DYNAMODB_ERROR`
- `SSM_ERROR`
- `AccessDeniedException`
- `ProvisionedThroughputExceededException`

#### Solutions

##### 1. Check AWS Credentials

```bash
# Verify credentials are configured
aws sts get-caller-identity
```

Expected output:
```json
{
  "UserId": "AIDAI...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/username"
}
```

If this fails:
- Check `~/.aws/credentials` file exists
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables
- Or ensure IAM role is attached (for EC2/ECS/Lambda)

##### 2. Verify IAM Permissions

Required permissions for full functionality:

**DynamoDB (FP Store)**:
- `dynamodb:GetItem` on FP store table
- `dynamodb:Query` on FP store table
- `dynamodb:PutItem` on FP store table (for updates)

**DynamoDB (Consent Store)**:
- `dynamodb:GetItem` on consent table
- `dynamodb:Query` on consent table
- `dynamodb:PutItem` on consent table (for consent updates)

**SSM Parameter Store**:
- `ssm:GetParameter` on nonce parameter
- `ssm:PutParameter` on nonce parameter (for rotation)

Test permissions:
```bash
# Test DynamoDB access
aws dynamodb describe-table --table-name $FP_TABLE_NAME

# Test SSM access
aws ssm get-parameter --name $NONCE_PARAMETER_NAME
```

##### 3. Check AWS Region

```bash
# Check configured region
echo $AWS_REGION

# Should match your table region
# Verify table region
aws dynamodb describe-table --table-name $FP_TABLE_NAME --query 'Table.TableArn'
```

Common region mismatch:
- Environment variable: `us-east-1`
- DynamoDB table: `us-west-2`

**Fix**: Set `AWS_REGION` to match your table region.

---

### Server Won't Start

#### Symptom
Server crashes immediately or fails to initialize.

#### Solutions

##### 1. Check Node.js Version

```bash
node --version
# Must be >= 18.0.0
```

If version is too old:
```bash
# Using nvm
nvm install 18
nvm use 18

# Or update Node.js via system package manager
```

##### 2. Check Dependencies

```bash
cd packages/mcp-server
pnpm install
pnpm build
```

##### 3. Enable Debug Logging

```bash
LOG_LEVEL=debug node dist/src/index.js 2>&1 | tee mcp-debug.log
```

Look for:
- Import errors
- Missing environment variables
- Port conflicts

---

### Tool Execution Failures

#### Symptom
Tools return errors when called or don't appear in tool list.

#### Solutions

##### 1. Verify Server Health

Test basic connectivity:
```bash
# List all tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/index.js
```

Expected: JSON response with 6 tools (`get_server_info`, `analyze_dissonance`, etc.)

##### 2. Test Specific Tool

```bash
# Test server info
echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"get_server_info","arguments":{}}}' | node dist/src/index.js

# Test consent check (with NoOp store)
echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"check_consent_requirements","arguments":{"orgId":"test","checkType":"summary"}}}' | node dist/src/index.js
```

##### 3. Check Input Parameters

Common validation errors:
- Missing required fields
- Wrong parameter types
- Invalid enum values

Example:
```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": [
    {
      "path": "files",
      "message": "Required"
    }
  ]
}
```

**Fix**: Check tool schema in documentation and provide all required parameters.

---

### File Not Found Errors

#### Symptom
```json
{
  "code": "FILE_NOT_FOUND",
  "message": "File not found: /path/to/file"
}
```

#### Solutions

##### 1. Check File Paths

Use absolute paths or paths relative to current working directory:
```bash
# Absolute path (recommended)
/home/user/project/src/index.ts

# Relative path (from where you run the server)
./src/index.ts
```

##### 2. Verify File Exists

```bash
ls -la /path/to/file
stat /path/to/file
```

##### 3. Check File Permissions

```bash
# Check if file is readable
test -r /path/to/file && echo "Readable" || echo "Not readable"

# Fix permissions if needed
chmod +r /path/to/file
```

---

### Consent Errors

#### Symptom
```json
{
  "code": "CONSENT_REQUIRED",
  "message": "Organization consent required"
}
```

#### Solutions

##### 1. Using NoOp Store (Development)

For testing without DynamoDB:
```bash
# Don't set CONSENT_TABLE_NAME
unset CONSENT_TABLE_NAME

# Server will use NoOp consent store (always grants consent)
```

##### 2. Using Real Consent Store (Production)

Ensure consent is granted:
```bash
# Check consent status
echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"check_consent_requirements","arguments":{"orgId":"your-org-id","checkType":"summary"}}}' | node dist/src/index.js
```

Grant consent manually via DynamoDB or consent management tool.

---

### Performance Issues

#### Symptom
- Slow response times
- Timeouts
- High CPU/memory usage

#### Solutions

##### 1. Check Tool Execution Times

Enable timing logs:
```bash
LOG_LEVEL=debug node dist/src/index.js
```

Look for slow operations:
- File I/O
- DynamoDB queries
- Analysis operations

##### 2. Optimize File Analysis

For large files:
```javascript
// Analyze fewer files at once
{
  "files": ["file1.ts", "file2.ts"], // Instead of 100 files
  "mode": "issue"
}
```

##### 3. Monitor Resource Usage

```bash
# Check memory usage
node --max-old-space-size=2048 dist/src/index.js

# Monitor with top/htop
top -p $(pgrep -f "node.*index.js")
```

---

### Rate Limiting

#### Symptom
```json
{
  "code": "RATE_LIMITED",
  "message": "DynamoDB rate limit exceeded"
}
```

#### Solutions

##### 1. Implement Exponential Backoff

The server includes automatic retry with backoff. Wait and retry:
```javascript
import { retryWithBackoff } from './errors/recovery.js';

await retryWithBackoff(
  async () => await operation(),
  { maxAttempts: 3 }
);
```

##### 2. Increase DynamoDB Capacity

```bash
# Check current capacity
aws dynamodb describe-table --table-name $FP_TABLE_NAME \
  --query 'Table.ProvisionedThroughput'

# Increase capacity (if using provisioned mode)
aws dynamodb update-table \
  --table-name $FP_TABLE_NAME \
  --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=5
```

##### 3. Use On-Demand Billing

```bash
aws dynamodb update-table \
  --table-name $FP_TABLE_NAME \
  --billing-mode PAY_PER_REQUEST
```

---

### Integration Test Failures

#### Symptom
Tests fail or hang during `pnpm test test/integration/`.

#### Solutions

##### 1. Build Before Testing

```bash
pnpm run build
pnpm test test/integration/
```

##### 2. Check Test Timeouts

Increase Jest timeout for slow environments:
```javascript
// jest.config.js
{
  testTimeout: 60000, // 60 seconds
}
```

##### 3. Clean Test Artifacts

```bash
# Remove temp files
rm -rf /tmp/mcp-*

# Clear Jest cache
pnpm jest --clearCache
```

---

## Diagnostic Commands

### Server Health Check

```bash
# Quick health check
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/index.js | jq '.result.tools | length'
# Should output: 6
```

### Test Individual Tools

```bash
# Test get_server_info
echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"get_server_info","arguments":{}}}' | node dist/src/index.js | jq .

# Test analyze_dissonance (requires files)
echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"analyze_dissonance","arguments":{"files":["README.md"],"context":"test/repo","mode":"issue"}}}' | node dist/src/index.js | jq .

# Test validate_l0_invariants
echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"validate_l0_invariants","arguments":{"files":["README.md"],"context":"test/repo"}}}' | node dist/src/index.js | jq .

# Test check_consent_requirements
echo '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"check_consent_requirements","arguments":{"orgId":"test-org","checkType":"summary"}}}' | node dist/src/index.js | jq .

# Test query_fp_store
echo '{"jsonrpc":"2.0","method":"tools/call","id":5,"params":{"name":"query_fp_store","arguments":{"queryType":"fp_rate","ruleId":"MD-001","orgId":"test-org"}}}' | node dist/src/index.js | jq .

# Test check_adr_compliance
echo '{"jsonrpc":"2.0","method":"tools/call","id":6,"params":{"name":"check_adr_compliance","arguments":{"files":["README.md"]}}}' | node dist/src/index.js | jq .
```

### Enable Debug Logging

```bash
# Full debug output
LOG_LEVEL=debug node dist/src/index.js 2>&1 | tee mcp-debug.log

# Capture only errors
LOG_LEVEL=error node dist/src/index.js 2>&1 | tee mcp-errors.log
```

### Test AWS Connectivity

```bash
# Test DynamoDB connection
aws dynamodb describe-table --table-name $FP_TABLE_NAME --region $AWS_REGION

# Test SSM connection
aws ssm get-parameter --name $NONCE_PARAMETER_NAME --region $AWS_REGION

# Test credentials
aws sts get-caller-identity

# List available tables (check region)
aws dynamodb list-tables --region $AWS_REGION
```

### Check Environment Configuration

```bash
# Print all relevant environment variables
env | grep -E "AWS_|FP_|CONSENT_|NONCE_|LOG_" | sort

# Verify paths
which node
which npm
which pnpm
```

---

## Error Code Reference

### Validation Errors (400-level)

| Code | Description | Solution |
|------|-------------|----------|
| `INVALID_INPUT` | Parameter validation failed | Check parameter types and required fields |
| `MISSING_REQUIRED_FIELD` | Required parameter missing | Add missing parameter |

### Authorization Errors (401-403)

| Code | Description | Solution |
|------|-------------|----------|
| `UNAUTHORIZED` | Invalid credentials | Check AWS credentials |
| `UNAUTHORIZED_ORG` | Organization not authorized | Grant consent for organization |
| `FORBIDDEN` | Permission denied | Check IAM permissions |

### Resource Errors (404)

| Code | Description | Solution |
|------|-------------|----------|
| `NOT_FOUND` | Resource not found | Verify resource exists |
| `FILE_NOT_FOUND` | File doesn't exist | Check file path |

### Rate Limiting (429)

| Code | Description | Solution |
|------|-------------|----------|
| `RATE_LIMITED` | Service rate limit hit | Wait and retry with backoff |
| `TOO_MANY_REQUESTS` | Too many requests | Reduce request rate |

### Execution Errors (500-level)

| Code | Description | Solution |
|------|-------------|----------|
| `INTERNAL_ERROR` | Unexpected error | Check logs, report if persists |
| `EXECUTION_FAILED` | Operation failed | Check operation parameters |
| `EXTERNAL_SERVICE_ERROR` | AWS service error | Check AWS service status |
| `DYNAMODB_ERROR` | DynamoDB error | Check credentials and permissions |
| `TIMEOUT` | Operation timed out | Increase timeout or optimize operation |

---

## Getting Help

### Documentation

- **Main README**: [packages/mcp-server/README.md](../README.md)
- **Integration Testing**: [INTEGRATION_TESTING.md](./INTEGRATION_TESTING.md)
- **Error Handling**: [ERROR_HANDLING.md](./ERROR_HANDLING.md)
- **Deployment Checklist**: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

### Community Resources

- **GitHub Issues**: https://github.com/PhaseMirror/Phase-Mirror/issues
- **Documentation Site**: https://phasemirror.com/docs (if available)
- **Discord Community**: https://discord.gg/phasemirror (if available)

### Support Channels

- **Email Support**: support@phasemirror.com
- **GitHub Discussions**: Use for questions and community help
- **Security Issues**: security@phasemirror.com (for security vulnerabilities)

### When Reporting Issues

Include the following information:

1. **Environment**:
   ```bash
   # MCP server version
   npm list @phase-mirror/mcp-server
   
   # Node.js version
   node --version
   
   # Operating system
   uname -a  # Linux/Mac
   systeminfo | findstr /B /C:"OS"  # Windows
   ```

2. **Configuration**:
   ```bash
   # Environment variables (redact sensitive values)
   env | grep -E "AWS_|FP_|CONSENT_|LOG_" | sed 's/=.*/=***/'
   ```

3. **Error Messages**:
   ```bash
   # Full error output with debug logging
   LOG_LEVEL=debug node dist/src/index.js 2>&1 | tee error.log
   ```

4. **Steps to Reproduce**:
   - Exact commands run
   - Input parameters used
   - Expected vs actual behavior

5. **Attempted Solutions**:
   - What you've already tried
   - Results of diagnostic commands

---

## Advanced Troubleshooting

### Using MCP Inspector

```bash
# Start MCP Inspector for interactive debugging
npx @modelcontextprotocol/inspector node dist/src/index.js

# Open browser to http://localhost:5173
```

This provides:
- Interactive tool testing
- Request/response inspection
- Schema validation
- Real-time debugging

### Debugging with Chrome DevTools

```bash
# Start server with inspector
node --inspect-brk dist/src/index.js

# Open chrome://inspect in Chrome
# Click "inspect" under Remote Target
```

### Network Debugging

```bash
# Trace AWS API calls
export AWS_SDK_LOAD_CONFIG=1
export AWS_SDK_JS_LOG=1
node dist/src/index.js 2>&1 | grep "AWS"
```

### Memory Profiling

```bash
# Generate heap snapshot
node --expose-gc --heap-prof dist/src/index.js

# Profile with clinic.js
npx clinic doctor -- node dist/src/index.js
```

---

**Last Updated**: 2026-02-01  
**Version**: 0.1.0  
**Maintainer**: Phase Mirror Team
