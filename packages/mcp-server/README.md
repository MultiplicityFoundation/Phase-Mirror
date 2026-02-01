# @phase-mirror/mcp-server

Model Context Protocol (MCP) server for Phase Mirror governance tooling. This package exposes Phase Mirror's governance capabilities as callable tools for GitHub Copilot coding agent and other AI assistants.

## Features

- **MCP Server**: Standards-compliant MCP server implementation
- **Governance Tools**: Access Phase Mirror's governance capabilities via AI tools
- **TypeScript**: Full TypeScript support with type definitions
- **Workspace Integration**: Seamlessly integrates with Phase Mirror's pnpm workspace

## Installation

```bash
# From the repository root
pnpm install

# Build the package
cd packages/mcp-server
pnpm build
```

## Development

```bash
# Watch mode for development
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Configuration

The MCP server is configured via environment variables:

- `AWS_REGION`: AWS region for DynamoDB/SSM access (default: `us-east-1`)
- `FP_TABLE_NAME`: DynamoDB table name for FP store
- `CONSENT_TABLE_NAME`: DynamoDB table name for consent store
- `NONCE_PARAMETER_NAME`: SSM parameter name for nonce
- `LOG_LEVEL`: Log level (`debug`, `info`, `warn`, `error`, default: `info`)

## Usage

### As a CLI Tool

```bash
# Run the MCP server
pnpm phase-mirror-mcp
```

### In Code

```typescript
import { MCPServerConfig } from '@phase-mirror/mcp-server';

const config: MCPServerConfig = {
  awsRegion: 'us-east-1',
  logLevel: 'info',
};
```

## Available Tools

- `get_server_info`: Get information about the Phase Mirror MCP server

More tools will be added as the package develops.

## Project Structure

```
packages/mcp-server/
├── src/
│   ├── index.ts        # Main server entry point
│   ├── types/          # TypeScript type definitions
│   ├── tools/          # MCP tool implementations
│   └── utils/          # Utility functions
├── test/               # Test files
├── dist/               # Build output
├── package.json
└── tsconfig.json
```

## License

Apache-2.0

## Author

Phase Mirror LLC
