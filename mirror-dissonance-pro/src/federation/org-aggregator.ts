/**
 * Organization Aggregator
 *
 * Rolls up dissonance reports across multiple repositories in an organization.
 * Produces org-level governance dashboards and trending data.
 */

export interface OrgRollup {
  orgId: string;
  repoCount: number;
  totalFindings: number;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  timestamp: string;
}

export class OrgAggregator {
  // Placeholder — full implementation in Phase 6F (federation)
}
