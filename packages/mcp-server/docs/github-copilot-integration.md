# GitHub Copilot Integration Guide

This guide covers setting up the Phase Mirror MCP Server with GitHub Copilot coding agent for production use.

## Prerequisites

- GitHub repository with Copilot enabled
- Admin access to repository settings
- Phase Mirror MCP server version 0.1.0 or later

## Configuration Steps

### Step 1: Navigate to Repository Settings

Go to your repository's Copilot settings:

```
https://github.com/[OWNER]/[REPO]/settings
Settings → Copilot → Coding Agent
```

### Step 2: Enable Copilot Coding Agent

1. Toggle "Enable Copilot coding agent" → **ON**
2. This enables the MCP (Model Context Protocol) integration

### Step 3: Configure MCP Server

Choose one of the following configuration options:

#### Option A: Published Package (Recommended for Production)

Use this when the MCP server is published to npm:

```json
{
  "mcpServers": {
    "phase-mirror": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@phase-mirror/mcp-server@latest"],
      "env": {
        "AWS_REGION": "COPILOT_MCP_AWS_REGION",
        "FP_TABLE_NAME": "COPILOT_MCP_FP_TABLE_NAME",
        "CONSENT_TABLE_NAME": "COPILOT_MCP_CONSENT_TABLE_NAME",
        "NONCE_PARAMETER_NAME": "COPILOT_MCP_NONCE_PARAMETER_NAME",
        "LOG_LEVEL": "COPILOT_MCP_LOG_LEVEL"
      }
    }
  }
}
```

#### Option B: Local Development

Use this for testing with a local development version:

```json
{
  "mcpServers": {
    "phase-mirror-dev": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/Phase-Mirror/packages/mcp-server/dist/index.js"],
      "env": {
        "AWS_REGION": "us-east-1",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/Phase-Mirror` with the actual absolute path to your Phase Mirror repository.

### Step 4: Configure Environment Secrets

The MCP server requires environment variables for AWS resource access. Set these up in GitHub:

1. Go to: `Settings → Environments`
2. Create environment: `copilot`
3. Add the following secrets:

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `COPILOT_MCP_AWS_REGION` | AWS region for DynamoDB/SSM | `us-east-1` |
| `COPILOT_MCP_FP_TABLE_NAME` | DynamoDB false positive table | `phase-mirror-fp-store-prod` |
| `COPILOT_MCP_CONSENT_TABLE_NAME` | DynamoDB consent table | `phase-mirror-consent-prod` |
| `COPILOT_MCP_NONCE_PARAMETER_NAME` | SSM parameter for nonce | `/phase-mirror/nonce/prod` |
| `COPILOT_MCP_LOG_LEVEL` | Logging verbosity | `info` (or `debug` for testing) |

**Note**: All environment variable references in the MCP configuration automatically use the `COPILOT_MCP_` prefix, which GitHub provides to the MCP server.

### Step 5: Configure Firewall (Optional)

If the MCP server needs to access AWS resources:

1. In repository settings, find "Copilot firewall" section
2. Enable firewall: **ON**
3. Set recommended allowlist: **ON**
4. Add custom allowlist entries:

```
dynamodb.us-east-1.amazonaws.com
ssm.us-east-1.amazonaws.com
```

**Note**: Adjust the region (`us-east-1`) to match your `AWS_REGION` setting.

### Step 6: Save Configuration

1. Review the configuration in the textarea
2. Ensure there are no JSON syntax errors
3. Click **Save** button

The MCP server will now be available to GitHub Copilot coding agent in your repository.

## Verification

### Test the Integration

1. Create a test issue in your repository
2. Assign the issue to `@copilot`
3. Ask Copilot to use Phase Mirror tools:
   ```
   @copilot Please analyze the files in packages/mcp-server using analyze_dissonance
   ```
4. Monitor the Copilot session logs for tool calls

### Expected Tool Calls

When Copilot uses the MCP server, you should see:

```json
{
  "tool": "analyze_dissonance",
  "arguments": {
    "files": ["packages/mcp-server/src/index.ts"],
    "mode": "issue"
  }
}
```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| MCP server not found | Package not published or path incorrect | Verify npm package or absolute path |
| Connection refused | Server failed to start | Check server logs, verify build |
| Permission denied | AWS credentials missing | Verify environment secrets are set |
| Timeout | Network/firewall blocking | Check firewall allowlist |

## Available Tools

Once configured, GitHub Copilot can use these Phase Mirror tools:

### 1. `analyze_dissonance`

Detect inconsistencies across requirements, configs, code, and runtime.

**Example prompt:**
```
@copilot Please analyze these files for dissonance: src/index.ts, package.json
```

**What Copilot will do:**
- Call `analyze_dissonance` with the specified files
- Review the findings and severity levels
- Suggest fixes based on ADR references

### 2. `validate_l0_invariants`

Validate foundation-tier governance checks (permissions, drift, nonce freshness, etc.).

**Example prompt:**
```
@copilot Check if the CI workflow has excessive permissions using L0 invariants
```

**What Copilot will do:**
- Call `validate_l0_invariants` with workflow files
- Report any L0 invariant failures
- Suggest remediation steps

## Best Practices

### When to Use MCP Tools

1. **Pre-implementation validation**: Before starting work, validate proposed changes
2. **PR reviews**: Automatically check PRs for governance violations
3. **Issue triage**: Analyze issues for compliance before assigning
4. **Drift detection**: Regular baseline comparisons to catch unauthorized changes

### Security Considerations

1. **Never commit secrets**: Environment variables are managed by GitHub, not in code
2. **Least privilege**: AWS credentials should have minimal required permissions
3. **Audit logs**: Monitor MCP server usage in Copilot logs
4. **Nonce rotation**: Regularly rotate nonces and validate freshness

### Performance Tips

1. **Batch files**: Analyze multiple files in one call when possible
2. **Specific checks**: Use targeted L0 checks instead of full suite when appropriate
3. **Cache results**: GitHub Copilot may cache tool responses within a session

## Advanced Configuration

### Multiple Environments

You can configure different MCP servers for different environments:

```json
{
  "mcpServers": {
    "phase-mirror-prod": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@phase-mirror/mcp-server@1.0.0"],
      "env": {
        "AWS_REGION": "COPILOT_MCP_PROD_AWS_REGION"
      }
    },
    "phase-mirror-staging": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@phase-mirror/mcp-server@0.9.0"],
      "env": {
        "AWS_REGION": "COPILOT_MCP_STAGING_AWS_REGION"
      }
    }
  }
}
```

### Custom Logging

For debugging, set higher log levels:

```json
{
  "env": {
    "LOG_LEVEL": "COPILOT_MCP_LOG_LEVEL"
  }
}
```

Then set `COPILOT_MCP_LOG_LEVEL` to `debug` in your environment secrets.

### Version Pinning

For stability, pin to specific versions:

```json
{
  "args": ["-y", "@phase-mirror/mcp-server@0.1.0"]
}
```

## Support

For issues or questions:

1. Check [MCP Server README](../README.md)
2. Review [L0 Invariants Reference](./l0-invariants-reference.md)
3. File an issue: https://github.com/PhaseMirror/Phase-Mirror/issues

## Next Steps

After successful integration:

1. ✅ Run through MCP Inspector tests (see [Testing Guide](./testing-guide.md))
2. ✅ Create example issues to test tool usage
3. ✅ Document common use cases for your team
4. ✅ Set up monitoring for MCP server performance
