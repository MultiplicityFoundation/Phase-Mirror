/**
 * Federation module — org-level GitHub governance scanning
 *
 * @license Phase Mirror Pro License v1.0
 */

export type {
  OrgAggregatorConfig,
  OrgAggregator,
  GovernanceCacheAdapter,
  DynamoDBLike,
} from './org-aggregator.js';

export {
  NotFoundError,
  RateLimitError,
  GitHubClient,
  DynamoDBGovernanceCache,
  fetchLiveOrgState,
  persistOrgState,
  loadCachedOrgState,
  buildOrgContext,
  mapBranchProtection,
  parseCodeowners,
  loadCodeownersCoverage,
  chunk,
} from './org-aggregator.js';
