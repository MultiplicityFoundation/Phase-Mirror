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
  requirement:
    | BranchProtectionRequirement
    | StatusCheckRequirement
    | WorkflowRequirement
    | PermissionRequirement
    | CodeownersRequirement;

  /** Severity if this expectation is not met */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface BranchProtectionRequirement {
  type: 'branch-protection';
  branch: string;                          // e.g., "main"
  requirePullRequest: boolean;
  requiredReviewers?: number;              // minimum approvals
  dismissStaleReviews?: boolean;
  requireCodeOwnerReviews?: boolean;
  enforceAdmins?: boolean;
}

export interface StatusCheckRequirement {
  type: 'status-checks';
  branch: string;
  requiredChecks: string[];                // e.g., ["oracle-check", "test", "lint"]
  requireStrictStatusChecks?: boolean;     // require branch to be up-to-date
}

export interface WorkflowRequirement {
  type: 'workflow-presence';
  /** Workflow file that must exist */
  workflowFile: string;                    // e.g., ".github/workflows/oracle.yml"
  /** Or pattern matching */
  workflowPattern?: string;                // e.g., "**/oracle*.yml"
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
  requiredPaths: string[];                 // e.g., [".github/workflows/", "src/security/"]
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
  patterns?: string[];                     // e.g., ["*-service", "api-*"]

  /** Match by GitHub topics */
  topics?: string[];                       // e.g., ["production", "service"]

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

// ─── Repo Governance State (actual observed state) ───────────────────

/**
 * Observed governance state of a single repository.
 * Collected via GitHub API or federation scan.
 */
export interface RepoGovernanceState {
  /** Repository name (org/repo or just repo) */
  name: string;

  /** Whether the repo is archived */
  archived?: boolean;

  /** GitHub topics */
  topics?: string[];

  /** Primary language */
  language?: string;

  /** Visibility */
  visibility?: 'public' | 'private' | 'internal';

  /** Branch protection rules currently configured */
  branchProtection?: {
    branch: string;
    requirePullRequest: boolean;
    requiredReviewers: number;
    dismissStaleReviews: boolean;
    requireCodeOwnerReviews: boolean;
    enforceAdmins: boolean;
    requiredStatusChecks: string[];
    strictStatusChecks: boolean;
  }[];

  /** Workflow files present in the repo */
  workflowFiles?: string[];

  /** Default workflow permissions */
  defaultPermissions?: 'read' | 'write';

  /** CODEOWNERS paths covered */
  codeownersPaths?: string[];
}

// ─── Manifest Utilities ──────────────────────────────────────────────

/**
 * Resolve which expectations apply to a specific repo.
 * Priority: classification overrides > defaults, minus exemptions.
 */
export function resolveExpectationsForRepo(
  manifest: OrgPolicyManifest,
  repoName: string,
  repoMeta?: { topics?: string[]; language?: string; visibility?: string; archived?: boolean },
): { expectations: PolicyExpectation[]; exemptions: PolicyExemption[] } {

  // Start with defaults
  let expectations = [...manifest.defaults];

  // Find matching classifications
  for (const classification of manifest.classifications) {
    if (matchesRepo(classification.match, repoName, repoMeta)) {
      // Classification expectations ADD to defaults (not replace)
      expectations = [...expectations, ...classification.expectations];
    }
  }

  // Remove exempted expectations
  const activeExemptions = manifest.exemptions.filter(e => {
    if (e.repo !== repoName) return false;
    // Check if exemption has expired
    if (new Date(e.expiresAt) < new Date()) return false;
    return true;
  });

  const exemptedIds = new Set(activeExemptions.flatMap(e => e.expectationIds));
  expectations = expectations.filter(e => !exemptedIds.has(e.id));

  // Deduplicate by ID (later entries win)
  const deduped = new Map<string, PolicyExpectation>();
  for (const exp of expectations) {
    deduped.set(exp.id, exp);
  }

  return {
    expectations: Array.from(deduped.values()),
    exemptions: activeExemptions,
  };
}

/**
 * Check if a repo matches the given matcher criteria.
 */
export function matchesRepo(
  matcher: RepoMatcher,
  repoName: string,
  meta?: { topics?: string[]; language?: string; visibility?: string; archived?: boolean },
): boolean {
  // Explicit repo list
  if (matcher.repos && matcher.repos.includes(repoName)) return true;

  // Pattern matching
  if (matcher.patterns) {
    for (const pattern of matcher.patterns) {
      if (matchGlob(pattern, repoName)) return true;
    }
  }

  if (!meta) return false;

  // Topic matching
  if (matcher.topics && meta.topics) {
    if (matcher.topics.some(t => meta.topics!.includes(t))) return true;
  }

  // Language matching
  if (matcher.languages && meta.language) {
    if (matcher.languages.includes(meta.language)) return true;
  }

  // Visibility matching
  if (matcher.visibility && meta.visibility === matcher.visibility) return true;

  // Archive matching
  if (matcher.archived !== undefined && meta.archived === matcher.archived) return true;

  return false;
}

/**
 * Simple glob matching: supports * as wildcard, ? as single-char wildcard.
 */
export function matchGlob(pattern: string, value: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
  );
  return regex.test(value);
}

/**
 * Validate a policy manifest for completeness.
 */
export function validateManifest(manifest: OrgPolicyManifest): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.schemaVersion) errors.push('Missing schemaVersion');
  if (!manifest.orgId) errors.push('Missing orgId');
  if (!manifest.updatedAt) errors.push('Missing updatedAt');
  if (!manifest.approvedBy) errors.push('Missing approvedBy');

  // Check for duplicate expectation IDs
  const allExpectationIds = new Set<string>();
  const allExpectations = [
    ...manifest.defaults,
    ...manifest.classifications.flatMap(c => c.expectations),
  ];

  for (const exp of allExpectations) {
    if (allExpectationIds.has(exp.id)) {
      warnings.push(`Duplicate expectation ID: ${exp.id}`);
    }
    allExpectationIds.add(exp.id);
  }

  // Check exemptions reference valid expectation IDs
  for (const exemption of manifest.exemptions) {
    for (const id of exemption.expectationIds) {
      if (!allExpectationIds.has(id)) {
        errors.push(`Exemption for ${exemption.repo} references unknown expectation: ${id}`);
      }
    }
    if (!exemption.reason) {
      errors.push(`Exemption for ${exemption.repo} missing required reason`);
    }
    if (!exemption.expiresAt) {
      errors.push(`Exemption for ${exemption.repo} missing expiration date`);
    } else if (new Date(exemption.expiresAt) < new Date()) {
      warnings.push(`Exemption for ${exemption.repo} has expired (${exemption.expiresAt})`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
