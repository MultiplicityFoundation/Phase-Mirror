/**
 * Tests for org-scan CLI command
 *
 * Validates the command's orchestration: env-var validation, Pro module
 * dynamic import, dry-run vs. persist behavior. All GitHub + DynamoDB
 * calls are fully mocked.
 */

// ─── Mock setup ──────────────────────────────────────────────────────

const mockFetchLiveOrgState = jest.fn();
const mockPersistOrgState = jest.fn();

class MockRateLimitError extends Error {
  readonly code = 'GITHUB_RATE_LIMITED' as const;
  readonly resetAt: Date;
  constructor(resetAt: Date) {
    super(`Rate limited until ${resetAt.toISOString()}`);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

jest.mock('@phase-mirror/pro', () => ({
  fetchLiveOrgState: mockFetchLiveOrgState,
  persistOrgState: mockPersistOrgState,
  RateLimitError: MockRateLimitError,
}));

import { orgScanCommand } from '../commands/org-scan.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeRepoState(fullName: string) {
  return {
    fullName,
    meta: {
      topics: [],
      language: 'TypeScript',
      visibility: 'private' as const,
      archived: false,
      defaultBranch: 'main',
    },
    branchProtection: null,
    workflows: [],
    defaultPermissions: 'read' as const,
    codeowners: { exists: false, coveredPaths: [] },
    scannedAt: new Date().toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('orgScanCommand', () => {
  let origEnv: NodeJS.ProcessEnv;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.GITHUB_PAT = 'ghp_test_token';
    process.env.MD_GOVERNANCE_CACHE_TABLE = 'test-table';

    jest.clearAllMocks();

    // Prevent actual process.exit
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(
      (() => { throw new Error('process.exit called'); }) as any,
    );

    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = origEnv;
    jest.restoreAllMocks();
  });

  it('calls fetchLiveOrgState and persistOrgState on normal run', async () => {
    const repos = [makeRepoState('Org/alpha'), makeRepoState('Org/beta')];
    mockFetchLiveOrgState.mockResolvedValue(repos);
    mockPersistOrgState.mockResolvedValue(undefined);

    const result = await orgScanCommand({
      org: 'TestOrg',
      dryRun: false,
    });

    expect(mockFetchLiveOrgState).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'TestOrg', githubToken: 'ghp_test_token' }),
    );
    expect(mockPersistOrgState).toHaveBeenCalledWith('TestOrg', repos);
    expect(result.repos).toBe(2);
    expect(result.dryRun).toBe(false);
  });

  it('prints JSON and skips persist on --dry-run', async () => {
    const repos = [makeRepoState('Org/gamma')];
    mockFetchLiveOrgState.mockResolvedValue(repos);

    const result = await orgScanCommand({
      org: 'TestOrg',
      dryRun: true,
    });

    expect(mockPersistOrgState).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"fullName": "Org/gamma"'),
    );
    expect(result.dryRun).toBe(true);
    expect(result.repos).toBe(1);
  });

  it('passes maxRepos to fetchLiveOrgState', async () => {
    mockFetchLiveOrgState.mockResolvedValue([]);

    await orgScanCommand({
      org: 'TestOrg',
      dryRun: true,
      maxRepos: 3,
    });

    expect(mockFetchLiveOrgState).toHaveBeenCalledWith(
      expect.objectContaining({ maxRepos: 3 }),
    );
  });

  it('exits with error when no GitHub token is set', async () => {
    delete process.env.GITHUB_APP_TOKEN;
    delete process.env.GITHUB_PAT;

    await expect(
      orgScanCommand({ org: 'TestOrg', dryRun: false }),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error when no DynamoDB table is set (non-dry-run)', async () => {
    delete process.env.MD_GOVERNANCE_CACHE_TABLE;

    await expect(
      orgScanCommand({ org: 'TestOrg', dryRun: false }),
    ).rejects.toThrow('process.exit called');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('allows missing table env when --dry-run is used', async () => {
    delete process.env.MD_GOVERNANCE_CACHE_TABLE;
    mockFetchLiveOrgState.mockResolvedValue([]);

    // Should not throw or exit
    const result = await orgScanCommand({
      org: 'TestOrg',
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
  });

  it('propagates fetch errors after logging', async () => {
    mockFetchLiveOrgState.mockRejectedValue(new Error('GitHub is down'));

    await expect(
      orgScanCommand({ org: 'TestOrg', dryRun: false }),
    ).rejects.toThrow('GitHub is down');
  });
});
