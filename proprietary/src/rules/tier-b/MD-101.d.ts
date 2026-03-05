/**
 * MD-101: Cross-Repo Protection Gap
 *
 * Detects protection asymmetry across repositories in the same organization:
 * repos that should share governance policies but don't. This is the first
 * rule that requires cross-repo context — making it inherently a Pro feature.
 *
 * Central Tension: Coverage completeness vs. organizational autonomy. Not every
 * repo in an org should have identical protection. A docs repo doesn't need the
 * same CI gates as the payment service. MD-101 must distinguish intentional
 * policy variation from accidental protection gaps — otherwise it becomes noise
 * that teams ignore.
 *
 * What this surfaces:
 * - Repos that match a policy classification but lack expected branch protection
 * - Required status checks (e.g., oracle-check) present in some repos but not others
 * - Required workflow files missing from repos that should have them
 * - Permission drift (write-default where read-default is expected)
 * - CODEOWNERS gaps for critical paths
 * - Expired exemptions that need review
 *
 * @license Phase Mirror Pro License v1.0
 */
import type { RuleDefinition } from '../types.js';
import type { OrgPolicyManifest } from './policy-manifest.js';
export interface BranchProtectionState {
    branch: string;
    enabled: boolean;
    requirePullRequest: boolean;
    requiredReviewers: number;
    dismissStaleReviews: boolean;
    requireCodeOwnerReviews: boolean;
    enforceAdmins: boolean;
    requiredStatusChecks: string[];
    requireStrictStatusChecks: boolean;
}
export interface WorkflowEntry {
    path: string;
    jobNames: string[];
}
export interface CodeownersState {
    exists: boolean;
    coveredPaths: string[];
}
export interface RepoGovernanceState {
    fullName: string;
    meta: {
        topics: string[];
        language: string;
        visibility: 'public' | 'private' | 'internal';
        archived: boolean;
        defaultBranch: string;
        /** Governance tags (e.g., 'critical', 'pci', 'internal-only'). Used by MD-102 federation. */
        tags?: string[];
    };
    branchProtection: BranchProtectionState | null;
    workflows: WorkflowEntry[];
    defaultPermissions: 'read' | 'write';
    codeowners: CodeownersState;
    scannedAt: string;
    /** Merge queue configuration. Used by MD-102 federation. */
    mergeQueue?: {
        enabled: boolean;
        method?: 'merge' | 'squash' | 'rebase';
    };
}
export interface OrgContext {
    manifest: OrgPolicyManifest;
    repos: RepoGovernanceState[];
}
export declare const rule: RuleDefinition;
export default rule;
