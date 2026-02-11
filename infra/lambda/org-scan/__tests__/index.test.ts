/**
 * Tests for infra/lambda/org-scan handler
 *
 * Validates the runOrgScan orchestration logic with fully stubbed
 * GitHub + DynamoDB dependencies. No network calls.
 */

import type { RepoGovernanceState } from '../../../../proprietary/src/rules/tier-b/MD-101';

// We need to mock fetchLiveOrgState before importing the handler.
// The handler imports from '@phase-mirror/pro' which pnpm resolves to
// the proprietary workspace package. jest.mock intercepts the same
// module identifier the handler uses.
const mockFetchLiveOrgState = jest.fn();
const mockPersistOrgState = jest.fn();
const mockRateLimitError = jest.requireActual(
  '@phase-mirror/pro',
).RateLimitError;

jest.mock('@phase-mirror/pro', () => ({
  ...jest.requireActual('@phase-mirror/pro'),
  fetchLiveOrgState: mockFetchLiveOrgState,
  persistOrgState: mockPersistOrgState,
}));

import { runOrgScan } from '../index';
import type { OrgScanEvent, OrgScanResult } from '../index';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeRepoState(fullName: string): RepoGovernanceState {
  return {
    fullName,
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
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('runOrgScan()', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  it('scans configured orgs and persists results', async () => {
    const repos = [makeRepoState('TestOrg/alpha'), makeRepoState('TestOrg/beta')];
    mockFetchLiveOrgState.mockResolvedValue(repos);
    mockPersistOrgState.mockResolvedValue(undefined);

    const result = await runOrgScan(
      {},
      { orgs: ['TestOrg'], githubToken: 'ghp_test' },
    );

    expect(result.orgsScanned).toBe(1);
    expect(result.totalRepos).toBe(2);
    expect(result.failures).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockPersistOrgState).toHaveBeenCalledWith('TestOrg', repos, undefined);
  });

  it('scans multiple orgs', async () => {
    mockFetchLiveOrgState
      .mockResolvedValueOnce([makeRepoState('OrgA/repo1')])
      .mockResolvedValueOnce([makeRepoState('OrgB/repo2'), makeRepoState('OrgB/repo3')]);
    mockPersistOrgState.mockResolvedValue(undefined);

    const result = await runOrgScan(
      {},
      { orgs: ['OrgA', 'OrgB'], githubToken: 'ghp_test' },
    );

    expect(result.orgsScanned).toBe(2);
    expect(result.totalRepos).toBe(3);
    expect(result.failures).toEqual([]);
    expect(mockPersistOrgState).toHaveBeenCalledTimes(2);
  });

  it('continues after a single org failure', async () => {
    mockFetchLiveOrgState
      .mockRejectedValueOnce(new Error('GitHub is down'))
      .mockResolvedValueOnce([makeRepoState('OrgB/repo1')]);
    mockPersistOrgState.mockResolvedValue(undefined);

    const result = await runOrgScan(
      {},
      { orgs: ['OrgA', 'OrgB'], githubToken: 'ghp_test' },
    );

    expect(result.orgsScanned).toBe(1);
    expect(result.totalRepos).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('OrgA');
    expect(result.failures[0]).toContain('GitHub is down');
    // OrgB still succeeded
    expect(mockPersistOrgState).toHaveBeenCalledWith('OrgB', expect.any(Array), undefined);
  });

  it('logs rate-limit details in failures', async () => {
    const resetDate = new Date('2026-02-11T14:00:00Z');
    mockFetchLiveOrgState.mockRejectedValueOnce(
      new mockRateLimitError(resetDate),
    );

    const result = await runOrgScan(
      {},
      { orgs: ['RateLimited'], githubToken: 'ghp_test' },
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('Rate limited');
    expect(result.failures[0]).toContain('2026-02-11');
  });

  it('event.orgs overrides deps.orgs', async () => {
    mockFetchLiveOrgState.mockResolvedValue([makeRepoState('EventOrg/r')]);
    mockPersistOrgState.mockResolvedValue(undefined);

    await runOrgScan(
      { orgs: ['EventOrg'] },
      { orgs: ['DepsOrg'], githubToken: 'ghp_test' },
    );

    expect(mockFetchLiveOrgState).toHaveBeenCalledWith(
      expect.objectContaining({ org: 'EventOrg' }),
    );
    expect(mockPersistOrgState).toHaveBeenCalledWith('EventOrg', expect.any(Array), undefined);
  });

  it('returns early with warning when no orgs configured', async () => {
    const result = await runOrgScan(
      {},
      { orgs: [], githubToken: 'ghp_test' },
    );

    expect(result.orgsScanned).toBe(0);
    expect(result.totalRepos).toBe(0);
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('No orgs configured'),
    );
  });

  it('throws when no GitHub token is available', async () => {
    // Clear env vars that resolveGitHubToken checks
    const origApp = process.env.GITHUB_APP_TOKEN;
    const origPat = process.env.GITHUB_PAT;
    delete process.env.GITHUB_APP_TOKEN;
    delete process.env.GITHUB_PAT;

    try {
      await expect(
        runOrgScan({}, { orgs: ['SomeOrg'] }),
      ).rejects.toThrow('Missing GITHUB_APP_TOKEN');
    } finally {
      if (origApp) process.env.GITHUB_APP_TOKEN = origApp;
      if (origPat) process.env.GITHUB_PAT = origPat;
    }
  });

  it('logs structured messages during scan', async () => {
    mockFetchLiveOrgState.mockResolvedValue([makeRepoState('Org/r')]);
    mockPersistOrgState.mockResolvedValue(undefined);

    await runOrgScan({}, { orgs: ['Org'], githubToken: 'ghp_test' });

    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[org-scan] Starting scan'),
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('repos=1'),
    );
    expect(consoleSpy.log).toHaveBeenCalledWith(
      expect.stringContaining('[org-scan] Completed'),
    );
  });
});
