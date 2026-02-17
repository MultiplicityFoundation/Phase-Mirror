/**
 * build-contract.ts
 *
 * Generates mcp-contract.json by merging live tool definitions from
 * the tool registry with governance metadata from the policy manifest.
 *
 * Enforcement rules:
 *   FATAL  — any live tool without a policy entry
 *   FATAL  — any authoritative tool without an x-adr
 *   WARN   — policy entries with no matching live tool (pre-declared intent)
 *
 * Usage: tsx scripts/build-contract.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. Load live toolDefinitions
  const { getToolDefinitions } = await import("../src/tool-registry.js");
  const liveTools = getToolDefinitions();

  // 2. Load policy manifest
  const manifestPath = resolve(__dirname, "../policy/mcp-tools.policy.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const policyMap = new Map<string, Record<string, unknown>>(
    manifest.tools.map((t: Record<string, unknown>) => [t.name as string, t]),
  );

  // 3. Assert: every live tool has a policy row
  const orphanTools = liveTools.filter((t) => !policyMap.has(t.name));
  if (orphanTools.length > 0) {
    console.error("FATAL: Tools registered without policy entry:");
    orphanTools.forEach((t) => console.error(`  - ${t.name}`));
    console.error(
      "\nAdd entries to policy/mcp-tools.policy.json before merging.",
    );
    process.exit(1);
  }

  // 4. Warn about stale entries (non-fatal)
  const staleEntries = [...policyMap.keys()].filter(
    (name) => !liveTools.some((t) => t.name === name),
  );
  if (staleEntries.length > 0) {
    console.warn("WARN: Policy entries with no matching tool (stale):");
    staleEntries.forEach((name) => console.warn(`  - ${name}`));
    console.warn("These may represent pre-declared tools.\n");
  }

  // 5. Assert: authoritative tools must have an x-adr
  const authWithoutADR = liveTools.filter((t) => {
    const policy = policyMap.get(t.name);
    return policy && policy["x-tier"] === "authoritative" && !policy["x-adr"];
  });
  if (authWithoutADR.length > 0) {
    console.error("FATAL: Authoritative tools without ADR binding:");
    authWithoutADR.forEach((t) => console.error(`  - ${t.name}`));
    process.exit(1);
  }

  // 6. Merge: attach policy metadata
  const contract = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    tools: liveTools.map((tool) => {
      const policy = policyMap.get(tool.name)!;
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        "x-tier": policy["x-tier"],
        "x-adr": policy["x-adr"] ?? null,
        "x-visibilityHint": policy["x-visibilityHint"],
      };
    }),
  };

  // 7. Write mcp-contract.json
  const outPath = resolve(__dirname, "../mcp-contract.json");
  writeFileSync(outPath, JSON.stringify(contract, null, 2) + "\n");
  console.log(
    `✓ mcp-contract.json generated with ${contract.tools.length} tools.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
