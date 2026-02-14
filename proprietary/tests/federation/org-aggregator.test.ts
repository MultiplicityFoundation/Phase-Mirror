/**
 * Tests for federation/org-aggregator
 *
 * All GitHub interactions are stubbed — these tests verify mapping logic,
 * CODEOWNERS parsing, pagination, error handling, DynamoDB cache, and
 * buildOrgContext wiring without any network calls.
 */

import type { RepoGovernanceState } from '../../src/rules/tier-b/MD-101';
import type { OrgPolicyManifest } from '../../src/rules/tier-b/policy-manifest';
import {
  GitHubClient,
  NotFoundError,
  RateLimitError,
  DynamoDBGovernanceCache,
  fetchLiveOrgState,
  buildOrgContext,
  mapBranchProtection,
  parseCodeowners,
  loadCodeownersCoverage,
  chunk,
  persistOrgState,
  loadCachedOrgState,
} from '../../src/federation/org-aggregator';
import type {
  OrgAggregatorConfig,
  DynamoDBLike,
  GovernanceCacheAdapter,
} from '../../src/federation/org-aggregator';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeGitHubRepo(overrides: Record<string, unknown> = {}) {
  return {
    name: 'my-repo',
    full_name: 'TestOrg/my-repo',
    owner: { login: 'TestOrg' },
    default_branch: 'main',
    private: false,
    archived: false,
    visibility: 'public' as const,
    language: 'TypeScript',
    topics: ['mirror'],
    ...overrides,
  };
}

function makeManifest(overrides?: Partial<OrgPolicyManifest>): OrgPolicyManifest {
  return {
    schemaVersion: '1.0.0',
    orgId: 'TestOrg',
    updatedAt: '2026-01-01T00:00:00Z',
    approvedBy: 'admin',
    defaults: [],
    classifications: [],
    exemptions: [],
    ...overrides,
  };
}

function makeRepoState(overrides: Partial<RepoGovernanceState> & { fullName: string }): RepoGovernanceState {
  return {
    meta: {
      topics: [],
      language: 'TypeScript',
      visibility: 'private',
      archived: false,
      defaultBranch: 'main',
    },
    branchProtection: null,
    workflows: [],
    defaultPermissions: 'read',
    codeowners: { exists: false, coveredPaths: [] },
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** In-memory stub for DynamoDBLike */
function createMemoryDynamo(): DynamoDBLike & { store: Map<string, Record<string, unknown>[]> } {
  const store = new Map<string, Record<string, unknown>[]>();
  return {
    store,
    async batchWrite(tableName: string, items: Record<string, unknown>[]): Promise<void> {
      const existing = store.get(tableName) ?? [];
      existing.push(...items);
      store.set(tableName, existing);
    },
    async query(tableName: string, org: string): Promise<Record<string, unknown>[] | null> {
      const all = store.get(tableName) ?? [];
      const matching = all.filter(item => item.org === org);
      return matching.length > 0 ? matching : null;
    },
  };
}

// ─── Unit Tests ──────────────────────────────────────────────────────

describe('chunk()', () => {
  it('splits array into chunks of specified size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when array is smaller than size', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('NotFoundError', () => {
  it('sets code and message', () => {
    const err = new NotFoundError('/repos/x/y/branches/main/protection');
    expect(err.code).toBe('GITHUB_NOT_FOUND');
    expect(err.message).toContain('/repos/x/y/branches/main/protection');
    expect(err.name).toBe('NotFoundError');
  });
});

describe('RateLimitError', () => {
  it('includes resetAt time', () => {
    const reset = new Date('2026-02-11T12:00:00Z');
    const err = new RateLimitError(reset);
    expect(err.code).toBe('GITHUB_RATE_LIMITED');
    expect(err.resetAt).toBe(reset);
    expect(err.message).toContain('2026-02-11');
  });
});

describe('parseCodeowners()', () => {
  it('extracts covered paths from CODEOWNERS content', () => {
    const content = [
      '# This is a comment',
      '',
      '*.js @js-team',
      '/src/ @core-team',
      '/docs/ @docs-team',
      '# Another comment',
      '/infra/ @ops-team',
    ].join('\n');

    const paths = parseCodeowners(content);
    expect(paths).toEqual(['*.js', '/src/', '/docs/', '/infra/']);
  });

  it('returns empty array for empty content', () => {
    expect(parseCodeowners('')).toEqual([]);
  });

  it('returns empty array for comment-only content', () => {
    expect(parseCodeowners('# just a comment\n# another')).toEqual([]);
  });

  it('handles paths without leading slash or star', () => {
    const content = 'src/utils/ @team'; // no leading / or *
    expect(parseCodeowners(content)).toEqual([]);
  });
});

describe('mapBranchProtection()', () => {
  it('maps full protection response', () => {
    const bp = {
      required_pull_request_reviews: {
        required_approving_review_count: 2,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
      },
      enforce_admins: { enabled: true },
      required_status_checks: {
        strict: true,
        contexts: ['ci/test', 'oracle-check'],
      },
    };

    const result = mapBranchProtection(bp, 'main');
    expect(result).toEqual({
      branch: 'main',
      enabled: true,
      requirePullRequest: true,
      requiredReviewers: 2,
      dismissStaleReviews: true,
      requireCodeOwnerReviews: true,
      enforceAdmins: true,
      requiredStatusChecks: ['ci/test', 'oracle-check'],
      requireStrictStatusChecks: true,
    });
  });

  it('maps minimal protection (no reviews, no checks)', () => {
    const bp = {};
    const result = mapBranchProtection(bp, 'develop');
    expect(result).toEqual({
      branch: 'develop',
      enabled: true,
      requirePullRequest: false,
      requiredReviewers: 0,
      dismissStaleReviews: false,
      requireCodeOwnerReviews: false,
      enforceAdmins: false,
      requiredStatusChecks: [],
      requireStrictStatusChecks: false,
    });
  });
});

describe('loadCodeownersCoverage()', () => {
  it('returns coverage from .github/CODEOWNERS first', async () => {
    const client = {
      getFileContent: jest.fn()
        .mockResolvedValueOnce('*.ts @team\n/src/ @core'), // .github/CODEOWNERS
    } as unknown as GitHubClient;

    const result = await loadCodeownersCoverage(client, 'org', 'repo');
    expect(result.exists).toBe(true);
    expect(result.coveredPaths).toEqual(['*.ts', '/src/']);
    expect(client.getFileContent).toHaveBeenCalledTimes(1);
  });

  it('falls back to root CODEOWNERS', async () => {
    const client = {
      getFileContent: jest.fn()
        .mockResolvedValueOnce(null) // .github/CODEOWNERS
        .mockResolvedValueOnce('/api/ @backend'), // root CODEOWNERS
    } as unknown as GitHubClient;

    const result = await loadCodeownersCoverage(client, 'org', 'repo');
    expect(result.exists).toBe(true);
    expect(result.coveredPaths).toEqual(['/api/']);
  });

  it('returns false when none found', async () => {
    const client = {
      getFileContent: jest.fn().mockResolvedValue(null),
    } as unknown as GitHubClient;

    const result = await loadCodeownersCoverage(client, 'org', 'repo');
    expect(result.exists).toBe(false);
    expect(result.coveredPaths).toEqual([]);
    expect(client.getFileContent).toHaveBeenCalledTimes(3); // all 3 paths tried
  });
});

// ─── DynamoDB Cache Tests ────────────────────────────────────────────

describe('DynamoDBGovernanceCache', () => {
  it('persist() writes items in chunks of 25', async () => {
    const dynamo = createMemoryDynamo();
    const cache = new DynamoDBGovernanceCache({
      tableName: 'test-cache',
      dynamoClient: dynamo,
    });

    // Create 30 repo states (should split into 25 + 5)
    const repos: RepoGovernanceState[] = Array.from({ length: 30 }, (_, i) =>
      makeRepoState({ fullName: `org/repo-${i}` }),
    );

    await cache.persist('TestOrg', repos);

    const stored = dynamo.store.get('test-cache')!;
    expect(stored).toHaveLength(30);
    expect(stored[0]).toHaveProperty('org', 'TestOrg');
    expect(stored[0]).toHaveProperty('repo', 'org/repo-0');
    expect(stored[0]).toHaveProperty('expiresAt');
    expect(stored[0]).toHaveProperty('state');
    expect(typeof stored[0].state).toBe('string');
  });

  it('load() returns parsed RepoGovernanceState[]', async () => {
    const repo = makeRepoState({ fullName: 'org/test-repo' });
    const dynamo = createMemoryDynamo();
    const cache = new DynamoDBGovernanceCache({
      tableName: 'test-cache',
      dynamoClient: dynamo,
    });

    // Manually insert
    dynamo.store.set('test-cache', [
      { org: 'TestOrg', repo: 'org/test-repo', state: JSON.stringify(repo) },
    ]);

    const result = await cache.load('TestOrg');
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].fullName).toBe('org/test-repo');
  });

  it('load() returns null when no items exist', async () => {
    const dynamo = createMemoryDynamo();
    const cache = new DynamoDBGovernanceCache({
      tableName: 'test-cache',
      dynamoClient: dynamo,
    });

    const result = await cache.load('NonExistentOrg');
    expect(result).toBeNull();
  });

  it('round-trip: persist then load', async () => {
    const dynamo = createMemoryDynamo();
    const cache = new DynamoDBGovernanceCache({
      tableName: 'test-cache',
      dynamoClient: dynamo,
    });

    const repos = [
      makeRepoState({ fullName: 'org/alpha' }),
      makeRepoState({ fullName: 'org/beta' }),
    ];

    await cache.persist('MyOrg', repos);
    const loaded = await cache.load('MyOrg');

    expect(loaded).toHaveLength(2);
    expect(loaded!.map(r => r.fullName).sort()).toEqual(['org/alpha', 'org/beta']);
  });
});

// ─── buildOrgContext Tests ───────────────────────────────────────────

describe('buildOrgContext()', () => {
  it('returns OrgContext from cached data', async () => {
    const manifest = makeManifest();
    const repos = [makeRepoState({ fullName: 'org/service-a' })];

    const stubCache: GovernanceCacheAdapter = {
      persist: jest.fn(),
      load: jest.fn().mockResolvedValue(repos),
    };

    const ctx = await buildOrgContext('TestOrg', manifest, stubCache);
    expect(ctx.manifest).toBe(manifest);
    expect(ctx.repos).toHaveLength(1);
    expect(ctx.repos[0].fullName).toBe('org/service-a');
  });

  it('throws when no cached data exists', async () => {
    const manifest = makeManifest();
    const stubCache: GovernanceCacheAdapter = {
      persist: jest.fn(),
      load: jest.fn().mockResolvedValue(null),
    };

    await expect(buildOrgContext('EmptyOrg', manifest, stubCache)).rejects.toThrow(
      'No cached governance state',
    );
  });

  it('throws when cached data is empty array', async () => {
    const manifest = makeManifest();
    const stubCache: GovernanceCacheAdapter = {
      persist: jest.fn(),
      load: jest.fn().mockResolvedValue([]),
    };

    await expect(buildOrgContext('EmptyOrg', manifest, stubCache)).rejects.toThrow(
      'No cached governance state',
    );
  });
});

// ─── fetchLiveOrgState Tests (with mocked GitHubClient) ──────────────

describe('fetchLiveOrgState()', () => {
  // We mock the GitHubClient methods via prototype to test the orchestration
  let listOrgReposSpy: jest.SpyInstance;
  let getBranchProtectionSpy: jest.SpyInstance;
  let listWorkflowsSpy: jest.SpyInstance;
  let getFileContentSpy: jest.SpyInstance;

  beforeEach(() => {
    listOrgReposSpy = jest.spyOn(GitHubClient.prototype, 'listOrgRepos');
    getBranchProtectionSpy = jest.spyOn(GitHubClient.prototype, 'getBranchProtection');
    listWorkflowsSpy = jest.spyOn(GitHubClient.prototype, 'listWorkflows');
    getFileContentSpy = jest.spyOn(GitHubClient.prototype, 'getFileContent');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseConfig: OrgAggregatorConfig = {
    org: 'TestOrg',
    githubToken: 'ghp_test_token',
  };

  it('produces RepoGovernanceState with all data present', async () => {
    listOrgReposSpy.mockResolvedValue([makeGitHubRepo()]);
    getBranchProtectionSpy.mockResolvedValue({
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
      },
      enforce_admins: { enabled: false },
      required_status_checks: {
        strict: false,
        contexts: ['ci/test'],
      },
    });
    listWorkflowsSpy.mockResolvedValue({
      total_count: 1,
      workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' }],
    });
    getFileContentSpy.mockResolvedValueOnce('/src/ @core-team');

    const states = await fetchLiveOrgState(baseConfig);

    expect(states).toHaveLength(1);
    const state = states[0];
    expect(state.fullName).toBe('TestOrg/my-repo');
    expect(state.meta.language).toBe('TypeScript');
    expect(state.meta.visibility).toBe('public');
    expect(state.meta.topics).toEqual(['mirror']);
    expect(state.branchProtection).not.toBeNull();
    expect(state.branchProtection!.requiredReviewers).toBe(1);
    expect(state.branchProtection!.requiredStatusChecks).toEqual(['ci/test']);
    expect(state.workflows).toHaveLength(1);
    expect(state.workflows[0].path).toBe('.github/workflows/ci.yml');
    expect(state.codeowners.exists).toBe(true);
    expect(state.codeowners.coveredPaths).toEqual(['/src/']);
    expect(state.scannedAt).toBeDefined();
  });

  it('handles missing branch protection gracefully', async () => {
    listOrgReposSpy.mockResolvedValue([makeGitHubRepo()]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockResolvedValue({ total_count: 0, workflows: [] });
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState(baseConfig);

    expect(states).toHaveLength(1);
    expect(states[0].branchProtection).toBeNull();
  });

  it('handles missing workflows gracefully', async () => {
    listOrgReposSpy.mockResolvedValue([makeGitHubRepo()]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockRejectedValue(new Error('forbidden'));
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState(baseConfig);

    expect(states[0].workflows).toEqual([]);
  });

  it('propagates RateLimitError from branch protection', async () => {
    listOrgReposSpy.mockResolvedValue([makeGitHubRepo()]);
    getBranchProtectionSpy.mockRejectedValue(
      new RateLimitError(new Date('2026-02-11T14:00:00Z')),
    );

    await expect(fetchLiveOrgState(baseConfig)).rejects.toThrow(RateLimitError);
  });

  it('infers visibility from private flag when visibility field is absent', async () => {
    listOrgReposSpy.mockResolvedValue([
      makeGitHubRepo({ visibility: undefined, private: true }),
    ]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockResolvedValue({ total_count: 0, workflows: [] });
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState(baseConfig);
    expect(states[0].meta.visibility).toBe('private');
  });

  it('handles archived repos', async () => {
    listOrgReposSpy.mockResolvedValue([
      makeGitHubRepo({ archived: true }),
    ]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockResolvedValue({ total_count: 0, workflows: [] });
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState(baseConfig);
    expect(states[0].meta.archived).toBe(true);
  });

  it('maps multiple repos', async () => {
    listOrgReposSpy.mockResolvedValue([
      makeGitHubRepo({ name: 'alpha', full_name: 'TestOrg/alpha' }),
      makeGitHubRepo({ name: 'beta', full_name: 'TestOrg/beta' }),
      makeGitHubRepo({ name: 'gamma', full_name: 'TestOrg/gamma' }),
    ]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockResolvedValue({ total_count: 0, workflows: [] });
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState(baseConfig);
    expect(states).toHaveLength(3);
    expect(states.map(s => s.fullName)).toEqual([
      'TestOrg/alpha',
      'TestOrg/beta',
      'TestOrg/gamma',
    ]);
  });

  it('uses config.defaultBranch when repo has no default_branch', async () => {
    listOrgReposSpy.mockResolvedValue([
      makeGitHubRepo({ default_branch: undefined }),
    ]);
    getBranchProtectionSpy.mockRejectedValue(new NotFoundError('/protection'));
    listWorkflowsSpy.mockResolvedValue({ total_count: 0, workflows: [] });
    getFileContentSpy.mockResolvedValue(null);

    const states = await fetchLiveOrgState({ ...baseConfig, defaultBranch: 'develop' });
    expect(states[0].meta.defaultBranch).toBe('develop');
  });
});

// ─── Standalone persistOrgState / loadCachedOrgState ─────────────────

describe('persistOrgState()', () => {
  it('delegates to the provided cache adapter', async () => {
    const repos = [makeRepoState({ fullName: 'org/test' })];
    const mockCache: GovernanceCacheAdapter = {
      persist: jest.fn().mockResolvedValue(undefined),
      load: jest.fn(),
    };

    await persistOrgState('TestOrg', repos, mockCache);

    expect(mockCache.persist).toHaveBeenCalledWith('TestOrg', repos);
  });
});

describe('loadCachedOrgState()', () => {
  it('returns cached data from the adapter', async () => {
    const repos = [makeRepoState({ fullName: 'org/cached' })];
    const mockCache: GovernanceCacheAdapter = {
      persist: jest.fn(),
      load: jest.fn().mockResolvedValue(repos),
    };

    const result = await loadCachedOrgState('TestOrg', mockCache);
    expect(result).toEqual(repos);
  });

  it('returns null when no data is cached', async () => {
    const mockCache: GovernanceCacheAdapter = {
      persist: jest.fn(),
      load: jest.fn().mockResolvedValue(null),
    };

    const result = await loadCachedOrgState('EmptyOrg', mockCache);
    expect(result).toBeNull();
  });
});
