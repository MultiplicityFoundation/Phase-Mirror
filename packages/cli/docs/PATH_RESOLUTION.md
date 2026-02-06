# CLI Path Resolution

## Overview

The Phase Mirror CLI uses a sophisticated path resolution system that enables it to work correctly in all deployment contexts:

- **Monorepo development**: Direct access to sibling packages
- **Global install** (`npm install -g`): Resolution via global node_modules
- **npx execution**: Resolution via temporary cache directory
- **Docker containers**: Fallback to bundled resources

## The Problem

Traditional relative paths like `../../schemas/dissonance-report.schema.json` only work when the directory structure matches the developer's environment. They break in production scenarios:

```
# Development (works)
Phase-Mirror/packages/cli/dist/index.js
  → ../../mirror-dissonance/schemas/...

# Global install (broken)
/usr/local/lib/node_modules/@mirror-dissonance/cli/dist/index.js
  → ../../ points to system directories, not package files
```

## The Solution: Three-Tier Resolution Cascade

The `paths.ts` module implements a cascade strategy that tries multiple resolution methods in order:

### 1. Monorepo Sibling Resolution (Development)

First, try to locate resources in sibling packages within the monorepo:

```typescript
join(__dirname, "..", "..", "mirror-dissonance", "schemas", "dissonance-report.schema.json")
```

This works when the CLI is run from the source tree or when workspaces are preserved.

### 2. Node Module Resolution (Production)

Second, use Node's module resolution to find the `@mirror-dissonance/core` package:

```typescript
const require = createRequire(import.meta.url);
const packageMain = require.resolve("@mirror-dissonance/core");
// Navigate to package root and append subpath
```

This works when both packages are installed via npm (global, local, or npx).

### 3. Bundled Fallback

Finally, look for resources bundled with the CLI package itself:

```typescript
join(CLI_PACKAGE_ROOT, "schemas", "dissonance-report.schema.json")
```

This enables self-contained distributions.

## Usage

### Resolving the Schema File

```typescript
import { resolveSchemaPath } from './paths.js';

const schemaPath = resolveSchemaPath();
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
```

### Resolving the Rules Directory

```typescript
import { resolveRulesDir } from './paths.js';

const rulesDir = resolveRulesDir();
const ruleFiles = readdirSync(rulesDir);
```

### Resolving Config Files

```typescript
import { resolveConfigPath } from './paths.js';

// Auto-detect config in CWD
const configPath = resolveConfigPath();
if (configPath) {
  const config = loadConfig(configPath);
}

// Explicit config path
const explicitPath = resolveConfigPath('/path/to/config.json');
```

## Implementation Details

### Anchor Point: `import.meta.url`

The resolution system anchors to the compiled file's location using `import.meta.url`:

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

This provides a stable reference point regardless of how the CLI is invoked.

### Package Root

The CLI package root is one level up from the `dist/` directory:

```typescript
export const CLI_PACKAGE_ROOT = resolve(__dirname, "..");
```

In development:
```
/home/user/Phase-Mirror/packages/cli
```

In global install:
```
/usr/local/lib/node_modules/@mirror-dissonance/cli
```

### Error Messages

When resolution fails, the error includes all attempted paths:

```
Cannot locate dissonance-report.schema.json.
Searched:
  - /home/user/Phase-Mirror/packages/mirror-dissonance/schemas/dissonance-report.schema.json
  - /usr/local/lib/node_modules/@mirror-dissonance/core/schemas/dissonance-report.schema.json
  - /usr/local/lib/node_modules/@mirror-dissonance/cli/schemas/dissonance-report.schema.json

If running globally, ensure @mirror-dissonance/core is installed alongside @mirror-dissonance/cli.
```

## Testing

The path resolution system includes comprehensive unit tests:

```bash
npm test -- paths.test
```

Tests verify:
- ✅ Package root resolution
- ✅ Schema path resolution in all contexts
- ✅ Rules directory resolution
- ✅ Config file detection
- ✅ Error handling and messages
- ✅ Resolution cascade priority

## Deployment Scenarios

### Scenario 1: Monorepo Development

**Context**: Developer working in the Phase Mirror repository

**Resolution**: First cascade level (sibling packages)

```bash
cd /home/user/Phase-Mirror
node packages/cli/dist/index.js analyze
# → Uses packages/mirror-dissonance/schemas/...
```

### Scenario 2: Global Install

**Context**: User installs CLI globally

```bash
npm install -g @mirror-dissonance/cli @mirror-dissonance/core
oracle analyze
# → Uses node_modules resolution to find @mirror-dissonance/core
```

### Scenario 3: npx Execution

**Context**: User runs CLI via npx without installation

```bash
npx @mirror-dissonance/cli analyze
# → npx downloads packages to cache
# → Uses node_modules resolution within cache directory
```

### Scenario 4: Docker Container

**Context**: CLI runs in a container with bundled resources

```dockerfile
COPY packages/cli/dist /app/cli
COPY packages/mirror-dissonance/schemas /app/cli/schemas
```

```bash
node /app/cli/index.js
# → Falls back to bundled schemas in /app/cli/schemas
```

## Future Enhancements

1. **Package Exports**: When Node.js `import.meta.resolve()` becomes stable, we can simplify the Node module resolution

2. **Environment Variables**: Allow override via `PHASE_MIRROR_SCHEMAS_DIR` for custom deployments

3. **Caching**: Cache resolved paths after first lookup to improve performance

4. **Validation**: Add schema validation at resolution time to fail fast with clear errors

## Related Issues

This implementation resolves **Known Issue #4** from `docs/known-issues.md`:

> "CLI path resolution uses hardcoded relative paths" - Unlike the FP store and rule evaluation fixes (which were about data integrity), this one is about deployability.

## References

- Source: `packages/cli/src/paths.ts`
- Tests: `packages/cli/src/__tests__/paths.test.ts`
- Issue: `docs/known-issues.md` (Issue #4)
