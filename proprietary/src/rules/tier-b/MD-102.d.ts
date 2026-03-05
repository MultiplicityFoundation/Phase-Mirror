/**
 * MD-102: Merge Queue Trust Chain Break (Proprietary, Per-Repo)
 *
 * Tier B semantic rule that detects when branch protection and merge queue
 * configuration allows bypassing the intended trust chain. This is the
 * Pro version of the OSS MD-102 — it uses the full RuleDefinition contract,
 * structured evidence (FindingEvidence[]), FP tolerance, promotion criteria,
 * and the license gate.
 *
 * Central Tension: safety vs. enforcement. MD-102 starts as warn-only.
 * All findings — even critical severity for federated checks — pass through
 * the FP/demotion machinery. No auto-block until the rule has completed
 * its promotion window (200 evaluations, <2% observed FPR, 14 days, steward
 * approval).
 *
 * Per-repo scope: Analyzes one repository's branch protection + workflow
 * configuration against its declared policy manifest. For org-wide analysis,
 * see MD-102-federated.ts.
 *
 * @license Phase Mirror Pro License v1.0
 */
import type { RuleDefinition } from '../types.js';
export declare const rule: RuleDefinition;
export default rule;
