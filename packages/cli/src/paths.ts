/**
 * Path resolution utilities for CLI package
 * 
 * Provides package-relative path resolution that works in all deployment contexts:
 * - Local monorepo development
 * - Global npm install (npm install -g)
 * - npx execution
 * - Docker containers
 * 
 * Strategy: Try multiple resolution strategies in order:
 * 1. Monorepo sibling packages (for local development)
 * 2. Node module resolution (for npm installs)
 * 3. Bundled fallback (for self-contained distribution)
 */

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Package names for resolution
 */
const CORE_PACKAGE_NAME = "@mirror-dissonance/core";
const SIBLING_PACKAGE_DIR = "mirror-dissonance";

/**
 * Anchor point: the directory containing THIS compiled file.
 * Works correctly in all contexts:
 *   - Local dev: packages/cli/dist/paths.js
 *   - Global install: /usr/local/lib/node_modules/@mirror-dissonance/cli/dist/paths.js
 *   - npx: ~/.npm/_npx/.../node_modules/@mirror-dissonance/cli/dist/paths.js
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The root of the CLI package (one level up from dist/).
 * packages/cli/ in dev, or the installed package root in production.
 */
export const CLI_PACKAGE_ROOT = resolve(__dirname, "..");

/**
 * Resolve the dissonance report schema.
 *
 * Strategy (checked in order):
 * 1. Sibling package in monorepo (local dev / workspace install)
 * 2. Resolved via Node module resolution (npm dependency)
 * 3. Bundled copy shipped with CLI package
 */
export function resolveSchemaPath(): string {
  const candidates = [
    // 1. Monorepo sibling: packages/cli/dist/../../../mirror-dissonance/schemas/
    join(__dirname, "..", "..", SIBLING_PACKAGE_DIR, "schemas", "dissonance-report.schema.json"),

    // 2. Node module resolution: the schema is exported from @mirror-dissonance/core
    resolveFromNodeModules(
      CORE_PACKAGE_NAME,
      "schemas/dissonance-report.schema.json"
    ),

    // 3. Bundled fallback: shipped inside CLI package
    join(CLI_PACKAGE_ROOT, "schemas", "dissonance-report.schema.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Cannot locate dissonance-report.schema.json.\n` +
    `Searched:\n${candidates.map((c) => `  - ${c}`).join("\n")}\n\n` +
    `If running globally, ensure @mirror-dissonance/core is installed alongside @mirror-dissonance/cli.`
  );
}

/**
 * Resolve the default rules directory.
 * Same cascade: monorepo → node_modules → bundled.
 */
export function resolveRulesDir(): string {
  const candidates = [
    join(__dirname, "..", "..", SIBLING_PACKAGE_DIR, "src", "rules"),
    resolveFromNodeModules(CORE_PACKAGE_NAME, "dist/src/rules"),
    join(CLI_PACKAGE_ROOT, "rules"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Cannot locate rules directory.\n` +
    `Searched:\n${candidates.map((c) => `  - ${c}`).join("\n")}`
  );
}

/**
 * Resolve the default config file location.
 * Looks in CWD first (user's project), then package defaults.
 */
export function resolveConfigPath(explicit?: string): string | undefined {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`Config file not found: ${explicit}`);
    }
    return explicit;
  }

  const cwdConfig = resolve(process.cwd(), ".mirror-dissonance.json");
  if (existsSync(cwdConfig)) {
    return cwdConfig;
  }

  return undefined; // No config — use defaults
}

/**
 * Attempt to resolve a path within an installed npm package.
 * Returns the path if the package is installed, undefined otherwise.
 */
function resolveFromNodeModules(
  packageName: string,
  subpath: string
): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const packageMain = require.resolve(packageName);
    const packageDir = dirname(packageMain);
    // Navigate up from dist/src/index.js to package root
    const packageRoot = resolve(packageDir, "..", "..");
    return join(packageRoot, subpath);
  } catch {
    return undefined; // Package not installed
  }
}
