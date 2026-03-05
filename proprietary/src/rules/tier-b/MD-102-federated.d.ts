/**
 * MD-102 Federated: Org-Wide Merge Queue Trust Chain Analysis
 *
 * Consumes RepoGovernanceState[] + OrgPolicyManifest to detect merge queue
 * trust-chain breaks at the org level. This is the cross-repo extension of
 * MD-102 — the per-repo rule (MD-102.ts) catches local misconfigurations;
 * this module catches systemic governance gaps across the org.
 *
 * Central Tension: org-wide enforcement vs. repo autonomy. Not every repo
 * needs a merge queue — a docs repo or archived project shouldn't be flagged.
 * The manifest's classifications and tags gate which repos get scrutinized.
 *
 * Examples of what this surfaces:
 * - A policy requires merge queues for all repos, but some repos allow direct pushes.
 * - A repo tagged "critical" has no merge queue enabled.
 * - Admin bypass is forbidden org-wide, but enforcement is inconsistent across repos.
 * - Linear history is required by policy but not configured on several repos.
 *
 * All findings flow through the standard Tier B FP/demotion machinery — no
 * auto-block, even for critical repos. The governance steward must approve
 * promotion to blocking status after the promotion window completes.
 *
 * @license Phase Mirror Pro License v1.0
 */
import type { OrgContext } from './MD-101.js';
import type { Finding } from '../types.js';
/**
 * Evaluate MD-102 across all repositories in an org context.
 *
 * @param ctx - OrgContext containing manifest + repos
 * @returns Findings for org-wide merge queue trust-chain breaks
 */
export declare function evaluateMD102Federated(ctx: OrgContext): Promise<Finding[]>;
