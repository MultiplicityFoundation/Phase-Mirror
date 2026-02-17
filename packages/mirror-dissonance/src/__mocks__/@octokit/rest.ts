/**
 * Manual Jest mock for @octokit/rest (ESM-only package).
 *
 * @octokit/rest v22+ ships as pure ESM which ts-jest cannot transform in
 * a CJS test environment.  All production call-sites use constructor DI
 * (octokitOverride) so the real SDK is never exercised in unit tests.
 *
 * This mock provides a minimal Octokit constructor whose instances
 * expose the API surface used by GitHubVerifier.
 */

export class Octokit {
  constructor(_options?: { auth?: string }) {
    // no-op – real HTTP client is never needed in unit tests
  }

  orgs = {
    get: async () => ({ data: {} }),
    listMembers: async () => ({ data: [], headers: {} }),
  };

  activity = {
    listPublicOrgEvents: async () => ({ data: [] }),
  };

  rateLimit = {
    get: async () => ({
      data: { resources: { core: { limit: 5000, remaining: 5000, reset: 0 } } },
    }),
  };
}
