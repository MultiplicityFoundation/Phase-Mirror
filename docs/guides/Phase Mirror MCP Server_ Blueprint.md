# Phase Mirror MCP Server: Complete Implementation Blueprint

**Goal:** Ship a production-ready, governance-floor-enforced MCP server with contract validation, tier enforcement, and at least two working tools (`analyze_dissonance` + `validate_l0_invariants`).

**Timeline:** 4 weeks (28 days), broken into 4 phases of 7 days each.

***

## Phase 1: Governance Floor Foundation (Days 1–7)

### Objective

Establish the core enforcement mechanisms: `normalizeResponse`, contract test, and policy manifest structure.

### Day 1–2: Implement Governance Envelope \& Normalizer

**File:** `packages/mcp-server/src/types/governance-envelope.ts`

```typescript
// src/types/governance-envelope.ts
export type GovernanceTier = "authoritative" | "experimental";
export type GovernanceEnvironment = "local" | "cloud";
export type GovernanceDecision = "block" | "warn" | "pass";

export interface MCPGovernanceEnvelope {
  // Core protocol
  success: boolean;
  code?: string;
  message?: string;
  isError?: boolean;

  // Governance semantics
  tier: GovernanceTier;
  environment: GovernanceEnvironment;
  decision?: GovernanceDecision;
  degradedMode?: boolean;

  // Traceability
  requestId: string;
  timestamp: string;

  // Tool-specific payload
  data?: unknown;
}
```

**File:** `packages/mcp-server/src/utils/normalize-response.ts`

```typescript
// src/utils/normalize-response.ts
import type {
  MCPGovernanceEnvelope,
  GovernanceTier,
  GovernanceEnvironment,
} from "../types/governance-envelope.js";
import type { ToolContext } from "../types/index.js";

type RawToolResult = {
  success: boolean;
  code?: string;
  message?: string;
  isError?: boolean;
  decision?: "block" | "warn" | "pass" | string;
  degradedMode?: boolean;
  data?: unknown;
};

export interface NormalizeContext extends ToolContext {
  tier: GovernanceTier;
  environment: GovernanceEnvironment;
}

const L0_ONLY_CODES = new Set([
  "INVARIANT_VIOLATION",
  "CONSENT_REQUIRED",
]);

export function normalizeResponse(
  raw: RawToolResult,
  context: NormalizeContext,
): MCPGovernanceEnvelope {
  const { tier, environment, requestId, timestamp } = context;

  let { success, code, message, isError, decision, degradedMode, data } = raw;

  let l0CodeStripped = false;
  let blockDowngraded = false;

  // Floor 1: experimental tools can never express binding outcomes
  if (tier === "experimental") {
    if (decision === "block") {
      decision = "warn";
      blockDowngraded = true;
    }
    if (code && L0_ONLY_CODES.has(code)) {
      code = undefined;
      l0CodeStripped = true;
    }

    // Governance clamps should not be treated as hard errors by default
    if ((l0CodeStripped || blockDowngraded) && typeof isError === "undefined") {
      isError = false;
    }
  }

  // Floor 2: authoritative tools in local mode are always degraded + non-blocking
  if (tier === "authoritative" && environment === "local") {
    degradedMode = true;
    if (decision === "block") {
      decision = "warn";
    }
    if (typeof isError === "undefined") {
      isError = false;
    }
  }

  const envelope: MCPGovernanceEnvelope = {
    success,
    code,
    message,
    isError,
    tier,
    environment,
    decision: (decision as any) ?? undefined,
    degradedMode,
    requestId,
    timestamp: timestamp.toISOString(),
    data,
  };

  return envelope;
}
```

**Update:** `packages/mcp-server/src/types/index.ts`

```typescript
// Add to existing exports
export * from "./governance-envelope.js";
```


### Day 3–4: Unit Tests for Normalizer

**File:** `packages/mcp-server/test/normalize-response.test.ts`

```typescript
// test/normalize-response.test.ts
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse, NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPServerConfig } from "../src/types/index.js";

const baseConfig: MCPServerConfig = {
  awsRegion: "us-east-1",
  logLevel: "info",
};

const baseContext = {
  config: baseConfig,
  requestId: "test-request-id",
  timestamp: new Date("2026-02-01T00:00:00Z"),
} as const;

describe("MCP governance floor", () => {
  it("clamps experimental decision:block to advisory and strips L0-only codes", () => {
    const raw = {
      success: true,
      code: "INVARIANT_VIOLATION",
      message: "Pretend L0 failure from buggy tool",
      decision: "block" as const,
      data: { some: "payload" },
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.tier).toBe("experimental");
    expect(envelope.environment).toBe("cloud");
    expect(envelope.decision).not.toBe("block");
    expect(envelope.code).not.toBe("INVARIANT_VIOLATION");
    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual(raw.data);
    expect(envelope.isError).toBe(false);
  });

  it("marks authoritative tools in local mode as degraded and non-blocking", () => {
    const raw = {
      success: true,
      code: "INVARIANT_VIOLATION",
      decision: "block" as const,
      data: { some: "payload" },
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "local",
    } as NormalizeContext);

    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("local");
    expect(envelope.degradedMode).toBe(true);
    expect(envelope.decision).not.toBe("block");
    expect(envelope.isError).toBe(false);
  });

  it("preserves tool-level success:false without flipping to true", () => {
    const raw = {
      success: false,
      code: "EXECUTION_FAILED",
      message: "Tool crashed",
      decision: "block" as const,
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    // success remains false (tool failure)
    expect(envelope.success).toBe(false);
    // but decision was clamped
    expect(envelope.decision).not.toBe("block");
  });
});
```

**Run:** `pnpm --filter mcp-server test`

### Day 5–7: Dummy Experimental Tool \& Contract Test

**File:** `packages/mcp-server/src/tools/dummy-experimental.ts`

```typescript
// src/tools/dummy-experimental.ts
import type { ToolContext, ToolResponse } from "../types/index.js";

export const toolDefinition = {
  name: "dummy_experimental",
  description: "Deliberately buggy experimental tool for governance-floor tests.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  required: [],
} as const;

export async function execute(
  _args: unknown,
  _context: ToolContext,
): Promise<ToolResponse> {
  // Intentionally violate governance semantics
  const raw = {
    success: true,
    code: "INVARIANT_VIOLATION",
    message: "Bogus invariant failure from experimental tool.",
    decision: "block" as const,
    data: { some: "payload" },
  };

  // Return raw without normalizing (server will handle it)
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(raw, null, 2),
      },
    ],
  };
}
```

**Update:** `packages/mcp-server/src/index.ts` to register dummy tool

```typescript
// src/index.ts (excerpt - add to existing imports and handlers)
import * as dummyExperimentalTool from "./tools/dummy-experimental.js";
import { normalizeResponse } from "./utils/normalize-response.js";

// In setupHandlers() -> tools/list handler
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      analyzeDissonanceTool.toolDefinition,
      dummyExperimentalTool.toolDefinition,
      // ... other tools
    ],
  };
});

// In tools/call handler
case "dummy_experimental": {
  const rawResponse = await dummyExperimentalTool.execute(args, context);
  const parsed = JSON.parse(rawResponse.content[0].text!);
  const envelope = normalizeResponse(parsed, {
    ...(context as any),
    tier: "experimental",
    environment: this.config.fpTableName && this.config.consentTableName
      ? "cloud"
      : "local",
  });
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope, null, 2),
      },
    ],
  };
}
```

**File:** `packages/mcp-server/test/experimental-floor.contract.test.ts`

```typescript
// test/experimental-floor.contract.test.ts
import { describe, it, expect } from "@jest/globals";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";

describe("MCP governance floor end-to-end", () => {
  it("prevents experimental tool from surfacing as L0 blocking failure", async () => {
    // Import your server class
    const { PhaseMirrorMCPServer } = await import("../src/index.js");
    const mcpServer = new (PhaseMirrorMCPServer as any)();
    const server: Server = (mcpServer as any).server;

    // List tools
    const listResponse = await server.handleRequest({
      jsonrpc: "2.0",
      id: "list-1",
      method: "tools/list",
      params: {},
    } as any);
    
    const toolNames = (listResponse.result?.tools ?? []).map((t: any) => t.name);
    expect(toolNames).toContain("dummy_experimental");

    // Call the dummy experimental tool
    const callResponse = await server.handleRequest({
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: "dummy_experimental",
        arguments: {},
      },
    } as any);

    expect(callResponse.error).toBeUndefined();
    const content = (callResponse.result as any).content;
    const text = content[0]?.text as string;
    const envelope = JSON.parse(text) as MCPGovernanceEnvelope;

    // Floor properties enforced
    expect(envelope.tier).toBe("experimental");
    expect(envelope.decision).not.toBe("block");
    expect(envelope.code).not.toBe("INVARIANT_VIOLATION");
    expect(envelope.isError).toBe(false);
    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual({ some: "payload" });
  });
});
```

**Checkpoint:** Run `pnpm --filter mcp-server test` — all tests should pass.

***

## Phase 2: Policy Manifest \& Contract Generation (Days 8–14)

### Objective

Create the policy manifest, build script, and contract JSON generation with CI enforcement.

### Day 8–9: Policy Manifest Structure

**File:** `packages/mcp-server/policy/mcp-tools.policy.json`

```json
{
  "$schema": "./policy-schema.json",
  "version": "1.0.0",
  "tools": [
    {
      "name": "analyze_dissonance",
      "x-tier": "authoritative",
      "x-adr": "ADR-0xy",
      "x-visibilityHint": "Primary L1 governance analysis"
    },
    {
      "name": "validate_l0_invariants",
      "x-tier": "authoritative",
      "x-adr": "ADR-0xz",
      "x-visibilityHint": "L0 foundation checks"
    },
    {
      "name": "query_fp_store",
      "x-tier": "experimental",
      "x-visibilityHint": "Advisory FP analytics only"
    },
    {
      "name": "dummy_experimental",
      "x-tier": "experimental",
      "x-visibilityHint": "Test tool for governance floor"
    }
  ]
}
```

**File:** `packages/mcp-server/policy/policy-schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "tools"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "x-tier"],
        "properties": {
          "name": { "type": "string" },
          "x-tier": { "enum": ["authoritative", "experimental"] },
          "x-adr": { "type": "string", "pattern": "^ADR-\\d+$" },
          "x-visibilityHint": { "type": "string" }
        }
      }
    }
  }
}
```


### Day 10–11: Tool Registry Helper

**File:** `packages/mcp-server/src/tool-registry.ts`

```typescript
// src/tool-registry.ts
import * as analyzeDissonanceTool from "./tools/analyze-dissonance.js";
import * as dummyExperimentalTool from "./tools/dummy-experimental.js";
// Import other tools as they're added

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  required?: string[];
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    analyzeDissonanceTool.toolDefinition,
    dummyExperimentalTool.toolDefinition,
    // Add more tools here
  ];
}
```


### Day 12–13: Build Contract Script

**File:** `packages/mcp-server/scripts/build-contract.ts`

```typescript
// scripts/build-contract.ts
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Load live toolDefinitions
  const { getToolDefinitions } = await import('../src/tool-registry.js');
  const liveTools = getToolDefinitions();

  // 2. Load policy manifest
  const manifestPath = resolve(__dirname, '../policy/mcp-tools.policy.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const policyMap = new Map(
    manifest.tools.map((t: any) => [t.name, t])
  );

  // 3. Assert: every live tool has a policy row
  const orphanTools = liveTools.filter(t => !policyMap.has(t.name));
  if (orphanTools.length > 0) {
    console.error('FATAL: Tools registered without policy entry:');
    orphanTools.forEach(t => console.error(`  - ${t.name}`));
    console.error('\nAdd entries to policy/mcp-tools.policy.json before merging.');
    process.exit(1);
  }

  // 4. Warn about stale entries (non-fatal)
  const staleEntries = [...policyMap.keys()].filter(
    name => !liveTools.some(t => t.name === name)
  );
  if (staleEntries.length > 0) {
    console.warn('WARN: Policy entries with no matching tool (stale):');
    staleEntries.forEach(name => console.warn(`  - ${name}`));
    console.warn('These may represent pre-declared tools.\n');
  }

  // 5. Merge: attach policy metadata
  const contract = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    tools: liveTools.map(tool => {
      const policy = policyMap.get(tool.name)!;
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        'x-tier': policy['x-tier'],
        'x-adr': policy['x-adr'] ?? null,
        'x-visibilityHint': policy['x-visibilityHint'],
      };
    }),
  };

  // 6. Write mcp-contract.json
  const outPath = resolve(__dirname, '../mcp-contract.json');
  writeFileSync(outPath, JSON.stringify(contract, null, 2) + '\n');
  console.log(`✓ mcp-contract.json generated with ${contract.tools.length} tools.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

**Update:** `packages/mcp-server/package.json`

```json
{
  "scripts": {
    "build": "tsc",
    "build:contract": "tsx scripts/build-contract.ts",
    "test": "jest",
    "lint": "eslint src --ext .ts"
  }
}
```

**Run:** `pnpm --filter mcp-server run build:contract`

**Verify:** `packages/mcp-server/mcp-contract.json` is created.

### Day 14: CI Workflow for Contract Enforcement

**File:** `.github/workflows/mcp-contract.yml`

```yaml
name: MCP Contract Enforcement

on:
  pull_request:
    paths:
      - 'packages/mcp-server/**'
      - 'packages/mirror-dissonance/**'
  push:
    branches: [main]

jobs:
  contract-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build core library
        run: pnpm --filter mirror-dissonance build

      - name: Build MCP server
        run: pnpm --filter mcp-server build

      - name: Generate mcp-contract.json
        run: pnpm --filter mcp-server run build:contract

      - name: Assert contract is up-to-date
        run: |
          if ! git diff --exit-code packages/mcp-server/mcp-contract.json; then
            echo "::error::mcp-contract.json is out of sync with live tools + policy."
            echo "Run 'pnpm --filter mcp-server run build:contract' locally and commit."
            exit 1
          fi

      - name: Enforce tier invariants
        run: |
          node -e "
            const fs = require('fs');
            const contract = JSON.parse(
              fs.readFileSync('packages/mcp-server/mcp-contract.json', 'utf-8')
            );

            // Every authoritative tool must have an x-adr
            const missing = contract.tools.filter(
              t => t['x-tier'] === 'authoritative' && !t['x-adr']
            );
            if (missing.length) {
              console.error('FATAL: Authoritative tools without ADR binding:');
              missing.forEach(t => console.error('  -', t.name));
              process.exit(1);
            }

            // No experimental tool may claim blocking semantics
            const experimental = contract.tools.filter(
              t => t['x-tier'] === 'experimental'
            );
            experimental.forEach(t => {
              const hint = t['x-visibilityHint'] || '';
              if (hint.includes('block') || hint.includes('INVARIANT_VIOLATION')) {
                console.error(t.name + ': experimental tool claims blocking semantics');
                process.exit(1);
              }
            });

            console.log('✓ Tier invariants passed for', contract.tools.length, 'tools.');
          "

      - name: Run contract tests
        run: pnpm --filter mcp-server test -- --testPathPattern=contract
```

**Update:** GitHub branch protection for `main` to require `contract-check` job.

***

## Phase 3: ADRs \& Documentation (Days 15–21)

### Objective

Document the governance surface, tool policy, and enforcement rules in ADRs.

### Day 15–17: ADR-0xx MCP Governance Surface

**File:** `adr/ADR-0xx-mcp-governance-surface.md`

```markdown
# ADR-0xx: MCP as Phase Mirror's Canonical Governance Surface

**Status:** Accepted  
**Date:** 2026-02-17  
**Owner:** Governance Council

## Context

Phase Mirror provides governance analysis for AI systems through the Mirror Dissonance Protocol. As agents (GitHub Copilot, custom AI agents) become primary consumers, we need a canonical, enforced interface that guarantees governance semantics cannot be bypassed by badly prompted or malicious tools.

## Decision

The **Model Context Protocol (MCP) server** is Phase Mirror's only sanctioned governance interface for agents. All governance-relevant tools MUST be exposed through MCP, and MCP's response normalization layer is the non-negotiable enforcement boundary.

### Key Principles

1. **MCP overrides prompts**: Schema and runtime behavior at the MCP layer define authority; prompts can only restrict, never expand.
2. **Visible multiplicity**: Tier (authoritative vs experimental) and environment (local vs cloud) are surfaced in every response envelope.
3. **Policy leads code**: Tools cannot ship without corresponding policy manifest entries.

### Response Envelope

All tools return `MCPGovernanceEnvelope`:

```typescript
{
  success: boolean;           // Tool-level outcome
  tier: "authoritative" | "experimental";
  environment: "local" | "cloud";
  decision?: "block" | "warn" | "pass";
  degradedMode?: boolean;
  requestId: string;
  timestamp: string;
  data?: unknown;
}
```


### Enforcement Floor

- **Experimental tools** cannot emit `decision:"block"` or L0-only codes (`INVARIANT_VIOLATION`, `CONSENT_REQUIRED`).
- **Authoritative tools in local mode** are marked `degradedMode:true` and cannot emit binding blocks.
- Normalization happens at the MCP server boundary via `normalizeResponse()`.


### Proof Artifacts

- Unit test: `test/normalize-response.test.ts`
- Contract test: `test/experimental-floor.contract.test.ts`
- CI enforcement: `.github/workflows/mcp-contract.yml`


## Consequences

### Positive

- Agents cannot bypass governance, even if misprompted.
- Clear distinction between binding (authoritative + cloud) and advisory outputs.
- Enforcement is structural, not social.


### Negative

- Additional build/CI complexity (manifest sync, contract generation).
- Developers must understand tier semantics to add tools.


## References

- `ADR-0xy`: MCP Tool Policy
- `packages/mcp-server/policy/mcp-tools.policy.json`

```

### Day 18–20: ADR-0xy MCP Tool Policy

**File:** `adr/ADR-0xy-mcp-tool-policy.md`

```markdown
# ADR-0xy: MCP Tool Tier Policy

**Status:** Accepted  
**Date:** 2026-02-17  
**Owner:** Governance Council

## Context

Not all MCP tools have the same governance authority. Some must enforce L0 invariants or ADR compliance (binding), while others provide analytics or experimental features (advisory). We need clear rules for which tools can claim authoritative semantics.

## Decision

Tools are classified into **two tiers** with different requirements and constraints.

### Tier 1: Authoritative

**Semantics:** Binding governance outcomes; may emit `decision:"block"` in cloud + authoritative mode.

**Requirements:**
- Must have a corresponding ADR documenting the invariant/rule.
- Must be implemented in `mirror-dissonance` core (or equivalent) before MCP exposure.
- Must have integration tests proving floor behavior (local = advisory, cloud = authoritative).

**Tools:**
- `validate_l0_invariants` → ADR-0xz
- `check_adr_compliance` → ADR-0...
- `check_consent_requirements` → ADR-0...

### Tier 2: Experimental / Advisory

**Semantics:** Non-binding insights; may ship MCP-first for UX exploration.

**Constraints:**
- Cannot emit `decision:"block"`.
- Cannot use L0-only error codes (`INVARIANT_VIOLATION`, `CONSENT_REQUIRED`).
- Must be labeled with `x-tier: "experimental"` and clear `x-visibilityHint`.

**Tools:**
- `query_fp_store` (read-only FP analytics)
- `dummy_experimental` (test tool)

### Manifest Enforcement Rule

| Direction | Condition | CI Behavior | Rationale |
|-----------|-----------|-------------|-----------|
| Code without policy | Live tool has no manifest entry | **Fatal** (exit 1) | No tool may operate without declared governance posture |
| Policy without code | Manifest row has no live tool | **Warning** (non-blocking) | Governance may pre-declare intent before implementation |
| Contract drift | Generated contract ≠ committed | **Fatal** (git diff fails) | Contract must always reflect live state |
| Tier 1 without ADR | Authoritative tool missing `x-adr` | **Fatal** | Binding claims require binding documents |
| Tier 2 claiming L0 | Experimental tool emits block/L0 codes | **Fatal** | Floor enforcement |

### Tool Policy Table

| Tool | Tier | Must Lag Core | May Ship MCP-First | Allowed Decisions | Allowed Codes |
|------|------|---------------|-------------------|------------------|---------------|
| `validate_l0_invariants` | authoritative | ✓ | ✗ | block/warn/pass | All including L0 |
| `check_adr_compliance` | authoritative | ✓ | ✗ | block/warn/pass | All |
| `check_consent_requirements` | authoritative | ✓ | ✗ | block/warn/pass | All including CONSENT_REQUIRED |
| `query_fp_store` | experimental | ✗ | ✓ | warn/pass only | Non-L0 only |
| `analyze_dissonance` | authoritative | ✓ | ✗ | block/warn/pass | All |

## Consequences

### Positive

- Clear path for experimental tools (e.g., FP analytics) without governance risk.
- Authoritative tools carry explicit ADR backing.
- CI enforces the split automatically.

### Negative

- Tier 1 tools must wait for core + ADR (slower iteration).
- Requires governance review for every tool classification.

## References

- `ADR-0xx`: MCP Governance Surface
- `packages/mcp-server/policy/mcp-tools.policy.json`
- `scripts/build-contract.ts`
```


### Day 21: Update MCP Server README

**File:** `packages/mcp-server/README.md`

Add sections:

```markdown
## Governance Tiers

Phase Mirror MCP tools are classified into two tiers:

- **Tier 1 (Authoritative)**: Binding governance outcomes. May emit `decision:"block"` when running in cloud mode with real FP/consent stores. Examples: `validate_l0_invariants`, `check_adr_compliance`.

- **Tier 2 (Experimental)**: Advisory insights only. Never emit blocking decisions or L0-style errors. Examples: `query_fp_store`, exploratory analytics.

See `policy/mcp-tools.policy.json` and `ADR-0xy` for full policy.

## Local vs Cloud Behavior

- **Local mode** (no FP/consent stores): All tools are advisory, `degradedMode:true`, decisions downgraded to `warn`.
- **Cloud mode** (real stores): Tier 1 tools may emit authoritative blocks.

Always check `tier`, `environment`, and `degradedMode` in responses.

## Adding a New Tool

1. Implement tool in `src/tools/your-tool.ts`.
2. Add entry to `policy/mcp-tools.policy.json` with `x-tier` and (if Tier 1) `x-adr`.
3. Register in `src/tool-registry.ts`.
4. Run `pnpm run build:contract` and commit `mcp-contract.json`.
5. Add tests (unit + contract if Tier 1).
6. Open PR — CI will enforce policy compliance.
```


***

## Phase 4: Implement `validate_l0_invariants` (Days 22–28)

### Objective

Ship the first true L0 tool under the governance envelope, proving the floor works for authoritative tools.

### Day 22–24: L0 Tool Implementation

**File:** `packages/mcp-server/src/tools/validate-l0-invariants.ts`

```typescript
// src/tools/validate-l0-invariants.ts
import z from "zod";
import type { ToolContext, ToolResponse } from "../types/index.js";
import { normalizeResponse } from "../utils/normalize-response.js";
import type { NormalizeContext } from "../utils/normalize-response.js";

export const ValidateL0InputSchema = z.object({
  checks: z.array(z.enum([
    "schema-hash",
    "permission-bits",
    "drift-magnitude",
    "nonce-freshness",
    "contraction-witness"
  ])).optional().describe("Specific L0 checks to run; if omitted, runs all"),
  
  schemaFile: z.string().optional().describe("Path to schema file for hash validation"),
  expectedSchemaHash: z.string().optional().describe("Expected SHA-256 hash"),
  
  workflowFiles: z.array(z.string()).optional().describe("GitHub Actions workflow files"),
  
  driftCheck: z.object({
    currentMetric: z.object({ name: z.string(), value: z.number() }),
    baselineMetric: z.object({ name: z.string(), value: z.number() }),
    threshold: z.number().default(0.5),
  }).optional(),
  
  nonceValidation: z.object({
    nonce: z.string(),
    timestamp: z.string(),
    maxAgeSeconds: z.number().default(3600),
  }).optional(),
  
  contractionCheck: z.object({
    previousFPR: z.number(),
    currentFPR: z.number(),
    witnessEventCount: z.number(),
    minRequiredEvents: z.number().default(10),
  }).optional(),
});

export type ValidateL0Input = z.infer<typeof ValidateL0InputSchema>;

export const toolDefinition = {
  name: "validate_l0_invariants",
  description: "Validate Phase Mirror L0 foundation invariants (schema integrity, permissions, drift, nonce, FPR contraction). Sub-100ns target latency per check.",
  inputSchema: {
    type: "object",
    properties: {
      checks: {
        type: "array",
        items: {
          enum: ["schema-hash", "permission-bits", "drift-magnitude", "nonce-freshness", "contraction-witness"]
        },
        description: "Specific checks to run; omit to run all"
      },
      schemaFile: { type: "string" },
      expectedSchemaHash: { type: "string" },
      workflowFiles: { type: "array", items: { type: "string" } },
      driftCheck: {
        type: "object",
        properties: {
          currentMetric: { type: "object", required: ["name", "value"] },
          baselineMetric: { type: "object", required: ["name", "value"] },
          threshold: { type: "number", default: 0.5 }
        }
      },
      nonceValidation: {
        type: "object",
        properties: {
          nonce: { type: "string" },
          timestamp: { type: "string" },
          maxAgeSeconds: { type: "number", default: 3600 }
        }
      },
      contractionCheck: {
        type: "object",
        properties: {
          previousFPR: { type: "number" },
          currentFPR: { type: "number" },
          witnessEventCount: { type: "number" },
          minRequiredEvents: { type: "number", default: 10 }
        }
      }
    }
  },
  required: [],
} as const;

export async function execute(
  args: unknown,
  context: ToolContext,
): Promise<ToolResponse> {
  // Validate input
  let validated: ValidateL0Input;
  try {
    validated = ValidateL0InputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const envelope = normalizeResponse(
        {
          success: false,
          code: "INVALID_INPUT",
          message: "Invalid L0 validation input",
          isError: true,
          data: { errors: error.errors },
        },
        {
          ...(context as NormalizeContext),
          tier: "authoritative",
          environment: "cloud", // Will be overridden by actual detection
        }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
      };
    }
    throw error;
  }

  try {
    // Import L0 validator from core
    const { validateL0Invariants } = await import("mirror-dissonance/l0");
    
    const results = await validateL0Invariants({
      checks: validated.checks,
      schemaFile: validated.schemaFile,
      expectedSchemaHash: validated.expectedSchemaHash,
      workflowFiles: validated.workflowFiles,
      driftCheck: validated.driftCheck,
      nonceValidation: validated.nonceValidation,
      contractionCheck: validated.contractionCheck,
    });

    const allPassed = results.every(r => r.passed);
    const failures = results.filter(r => !r.passed);

    const raw = {
      success: true,
      decision: allPassed ? "pass" : "block" as const,
      data: {
        validation: {
          allPassed,
          checksRun: results.length,
          passed: results.filter(r => r.passed).length,
          failed: failures.length,
          results,
          failures,
        },
        performanceNs: results.reduce((sum, r) => sum + (r.latencyNs || 0), 0),
        withinPerformanceTarget: results.every(r => (r.latencyNs || 0) < 100),
      },
    };

    const envelope = normalizeResponse(raw, {
      ...(context as NormalizeContext),
      tier: "authoritative",
      environment: context.config.fpTableName && context.config.consentTableName
        ? "cloud"
        : "local",
    });

    return {
      content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    };
  } catch (error) {
    const envelope = normalizeResponse(
      {
        success: false,
        code: "EXECUTION_FAILED",
        message: error instanceof Error ? error.message : String(error),
        isError: true,
      },
      {
        ...(context as NormalizeContext),
        tier: "authoritative",
        environment: "cloud",
      }
    );

    return {
      content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }],
    };
  }
}
```


### Day 25–26: Register \& Test L0 Tool

**Update:** `packages/mcp-server/src/tool-registry.ts`

```typescript
import * as validateL0Tool from "./tools/validate-l0-invariants.js";

export function getToolDefinitions(): ToolDefinition[] {
  return [
    analyzeDissonanceTool.toolDefinition,
    validateL0Tool.toolDefinition,
    dummyExperimentalTool.toolDefinition,
  ];
}
```

**Update:** `packages/mcp-server/src/index.ts` tools/call handler

```typescript
case "validate_l0_invariants":
  return await validateL0Tool.execute(args, context);
```

**Update:** `packages/mcp-server/policy/mcp-tools.policy.json`

```json
{
  "name": "validate_l0_invariants",
  "x-tier": "authoritative",
  "x-adr": "ADR-0xz",
  "x-visibilityHint": "L0 foundation checks"
}
```

**File:** `packages/mcp-server/test/validate-l0.contract.test.ts`

```typescript
// test/validate-l0.contract.test.ts
import { describe, it, expect } from "@jest/globals";

describe("validate_l0_invariants contract", () => {
  it("respects governance floor in local mode", async () => {
    const { PhaseMirrorMCPServer } = await import("../src/index.js");
    const mcpServer = new (PhaseMirrorMCPServer as any)();
    const server = (mcpServer as any).server;

    const response = await server.handleRequest({
      jsonrpc: "2.0",
      id: "l0-1",
      method: "tools/call",
      params: {
        name: "validate_l0_invariants",
        arguments: {
          checks: ["drift-magnitude"],
          driftCheck: {
            currentMetric: { name: "score", value: 90 },
            baselineMetric: { name: "score", value: 100 },
            threshold: 0.2,
          }
        },
      },
    } as any);

    const envelope = JSON.parse((response.result as any).content[0].text);
    
    // In local mode, should be degraded and non-blocking
    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("local");
    expect(envelope.degradedMode).toBe(true);
    expect(envelope.decision).not.toBe("block");
  });
});
```


### Day 27–28: Documentation \& Final Testing

**Update:** `packages/mcp-server/README.md`

Add tool documentation:

```markdown
### `validate_l0_invariants`

**Tier:** Authoritative  
**ADR:** ADR-0xz

Validates Phase Mirror L0 foundation invariants with sub-100ns target latency.

**Checks:**
- `schema-hash`: Schema integrity
- `permission-bits`: GitHub Actions least privilege
- `drift-magnitude`: Metric drift within thresholds
- `nonce-freshness`: Cryptographic nonce age
- `contraction-witness`: FPR decrease evidence

**Example:**
```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "checks": ["drift-magnitude"],
    "driftCheck": {
      "currentMetric": { "name": "score", "value": 95 },
      "baselineMetric": { "name": "score", "value: 100 },
      "threshold": 0.2
    }
  }
}
```

**Response:** `MCPGovernanceEnvelope` with `data.validation` containing check results.

```

**Run full test suite:**
```bash
pnpm --filter mcp-server test
pnpm --filter mcp-server run build:contract
git add packages/mcp-server/mcp-contract.json
git commit -m "feat(mcp): add validate_l0_invariants as Tier 1 tool"
```


***

## Completion Checklist

### Phase 1 ✓

- [ ] `MCPGovernanceEnvelope` type defined
- [ ] `normalizeResponse()` implemented with floor rules
- [ ] Unit tests for normalizer passing
- [ ] Dummy experimental tool created
- [ ] Contract test proving floor enforcement


### Phase 2 ✓

- [ ] Policy manifest structure (`mcp-tools.policy.json`)
- [ ] Tool registry helper (`tool-registry.ts`)
- [ ] Build contract script (`scripts/build-contract.ts`)
- [ ] `mcp-contract.json` generation working
- [ ] CI workflow enforcing contract (`mcp-contract.yml`)


### Phase 3 ✓

- [ ] ADR-0xx (MCP Governance Surface) written
- [ ] ADR-0xy (MCP Tool Policy) written
- [ ] MCP README updated with tier semantics
- [ ] CODEOWNERS updated for `policy/` directory


### Phase 4 ✓

- [ ] `validate_l0_invariants` tool implemented
- [ ] L0 tool registered and policy entry added
- [ ] Contract test for L0 tool local/cloud behavior
- [ ] All tests passing
- [ ] Documentation complete

***

## Success Metrics

After 28 days:

- MCP server builds and tests pass in CI
- `mcp-contract.yml` is required on `main` branch
- At least 2 authoritative tools (`analyze_dissonance`, `validate_l0_invariants`) under envelope
- 0 tools without policy manifest entries
- Contract drift detection catches 100% of policy/code mismatches

***

## Next Steps (Beyond 28 Days)

1. Implement remaining Tier 1 tools (`check_adr_compliance`, `check_consent_requirements`)
2. Ship `query_fp_store` as first MCP-first Tier 2 tool
3. Add UI badges/chips for tier + environment visibility
4. Update Copilot prompts with tier-aware guidance
5. Track MCP CI health metric (30-day green window)
