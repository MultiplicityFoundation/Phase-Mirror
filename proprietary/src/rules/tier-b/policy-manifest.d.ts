/**
 * Organization Policy Manifest
 *
 * Declares expected governance posture per repository or per-group.
 * MD-101 compares actual repo state against this manifest to detect gaps.
 *
 * @license Phase Mirror Pro License v1.0
 */
/**
 * A single governance expectation that should be enforced.
 */
export interface PolicyExpectation {
    /** Unique identifier for this expectation */
    id: string;
    /** Human-readable name */
    name: string;
    /** What category this falls under */
    category: 'branch-protection' | 'status-checks' | 'workflow-presence' | 'permissions' | 'codeowners';
    /** The specific requirement */
    requirement: BranchProtectionRequirement | StatusCheckRequirement | WorkflowRequirement | PermissionRequirement | CodeownersRequirement;
    /** Severity if this expectation is not met */
    severity: 'critical' | 'high' | 'medium' | 'low';
}
export interface BranchProtectionRequirement {
    type: 'branch-protection';
    branch: string;
    requirePullRequest: boolean;
    requiredReviewers?: number;
    dismissStaleReviews?: boolean;
    requireCodeOwnerReviews?: boolean;
    enforceAdmins?: boolean;
}
export interface StatusCheckRequirement {
    type: 'status-checks';
    branch: string;
    requiredChecks: string[];
    requireStrictStatusChecks?: boolean;
}
export interface WorkflowRequirement {
    type: 'workflow-presence';
    /** Workflow file that must exist */
    workflowFile: string;
    /** Or pattern matching */
    workflowPattern?: string;
    /** Jobs that must exist in the workflow */
    requiredJobs?: string[];
}
export interface PermissionRequirement {
    type: 'permissions';
    /** Maximum allowed default workflow permissions */
    maxDefaultPermissions: 'read' | 'write';
}
export interface CodeownersRequirement {
    type: 'codeowners';
    /** Paths that must have CODEOWNERS entries */
    requiredPaths: string[];
}
/**
 * Repos can be grouped by classification. Different groups get different policies.
 */
export interface RepoClassification {
    /** Name of this classification group */
    name: string;
    /** Description of what this group is for */
    description: string;
    /** Repository selection criteria */
    match: RepoMatcher;
    /** Policy expectations for repos in this group */
    expectations: PolicyExpectation[];
}
export interface RepoMatcher {
    /** Explicit repo names */
    repos?: string[];
    /** Pattern matching on repo name */
    patterns?: string[];
    /** Match by GitHub topics */
    topics?: string[];
    /** Match by language */
    languages?: string[];
    /** Match by visibility */
    visibility?: 'public' | 'private' | 'internal';
    /** Match by archive status */
    archived?: boolean;
}
/**
 * Full organization policy manifest.
 * Lives at `.github/.phase-mirror/policy-manifest.json` in the org's `.github` repo,
 * or inline in the Phase Mirror Pro configuration.
 */
export interface OrgPolicyManifest {
    /** Schema version for forward compatibility */
    schemaVersion: '1.0.0';
    /** Organization identifier */
    orgId: string;
    /** When this manifest was last updated */
    updatedAt: string;
    /** Who approved this manifest */
    approvedBy: string;
    /** Default expectations applied to ALL repos unless exempted */
    defaults: PolicyExpectation[];
    /** Classification-specific overrides */
    classifications: RepoClassification[];
    /** Explicit exemptions — repos that intentionally skip certain expectations */
    exemptions: PolicyExemption[];
    /**
     * Org-wide merge queue policy (consumed by MD-102 federation).
     * When present, MD-102-federated checks every repo against these expectations.
     */
    mergeQueue?: OrgMergeQueuePolicy;
}
/**
 * Org-level merge queue governance expectations.
 * Used by MD-102-federated to detect trust-chain breaks across repositories.
 */
export interface OrgMergeQueuePolicy {
    /** Whether the default branch requires a merge queue for all repos */
    requiredForDefaultBranch: boolean;
    /** Whether administrators are allowed to bypass merge queue protections */
    allowBypassForAdmins: boolean;
    /** Whether linear history (rebase / squash only) is required */
    requireLinearHistory: boolean;
    /** Whether direct pushes to the protected branch are allowed */
    allowDirectPushes: boolean;
}
export interface PolicyExemption {
    /** Which repo is exempted */
    repo: string;
    /** Which expectation IDs are exempted */
    expectationIds: string[];
    /** Why this exemption exists — required for governance audit */
    reason: string;
    /** Who approved this exemption */
    approvedBy: string;
    /** When this exemption expires (must be reviewed) */
    expiresAt: string;
    /** Linked ticket for audit trail */
    ticket?: string;
}
/**
 * Resolve which expectations apply to a specific repo.
 * Priority: classification overrides > defaults, minus exemptions.
 */
export declare function resolveExpectationsForRepo(manifest: OrgPolicyManifest, repoName: string, repoMeta?: {
    topics?: string[];
    language?: string;
    visibility?: string;
    archived?: boolean;
}): {
    expectations: PolicyExpectation[];
    exemptions: PolicyExemption[];
};
/**
 * Check if a repo matches the given matcher criteria.
 */
export declare function matchesRepo(matcher: RepoMatcher, repoName: string, meta?: {
    topics?: string[];
    language?: string;
    visibility?: string;
    archived?: boolean;
}): boolean;
/**
 * Simple glob matching: supports * as wildcard, ? as single-char wildcard.
 */
export declare function matchGlob(pattern: string, value: string): boolean;
/**
 * Validate a policy manifest for completeness.
 */
export declare function validateManifest(manifest: OrgPolicyManifest): {
    valid: boolean;
    errors: string[];
    warnings: string[];
};
