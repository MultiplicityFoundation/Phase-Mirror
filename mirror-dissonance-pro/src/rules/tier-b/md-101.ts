/**
 * MD-101: Cross-Repo Protection Gap
 *
 * Tension Surfaced:
 * Multi-repo orgs assume repo-level governance covers cross-repo dependencies — it doesn't.
 * When Repo A triggers a workflow in Repo B via repository_dispatch or workflow_call,
 * the protection rules of Repo A say nothing about Repo B's posture. A compromised
 * dependency chain can bypass all branch protection because governance stops at repo boundaries.
 *
 * Detection Method:
 * Scan workflow triggers for `repository_dispatch`, `workflow_call`, and `workflow_run`
 * across the dependency graph. Flag unprotected dependency chains where the target repo
 * lacks equivalent protection to the source.
 */

import type { RuleDefinition, AnalysisContext, Finding, RepoDependencyEdge } from './index.js';

/**
 * Protection level scoring for comparison.
 */
const PROTECTION_SCORES: Record<string, number> = {
  full: 3,
  partial: 2,
  none: 0,
};

/**
 * Extract cross-repo triggers from workflow files.
 * Scans for repository_dispatch, workflow_call, and workflow_run patterns.
 */
function extractCrossRepoTriggers(context: AnalysisContext): RepoDependencyEdge[] {
  const edges: RepoDependencyEdge[] = [];

  if (!context.workflows) {
    return context.repoGraph ?? [];
  }

  for (const workflow of context.workflows) {
    const content = workflow.content.toLowerCase();

    // Detect incoming triggers (this repo is a target)
    if (content.includes('repository_dispatch') || content.includes('workflow_dispatch')) {
      // This repo accepts external triggers — it's a target
      // We note this but need the graph to know the source
    }

    // Detect outgoing triggers (this repo triggers others)
    for (const job of workflow.jobs) {
      for (const step of job.steps) {
        const stepContent = [step.uses ?? '', step.run ?? '', step.name ?? ''].join(' ');

        // Check for repository_dispatch action
        if (stepContent.includes('repository-dispatch') || stepContent.includes('repository_dispatch')) {
          const targetRepo = step.with?.['repository'] || step.with?.['repo'] || 'unknown';
          edges.push({
            sourceRepo: context.repositoryName,
            targetRepo,
            triggerType: 'repository_dispatch',
            protectionLevel: 'none', // Default — no cross-repo protection
          });
        }

        // Check for workflow_call (reusable workflows)
        if (step.uses && step.uses.includes('/') && step.uses.includes('.github/workflows/')) {
          const targetRepo = step.uses.split('/').slice(0, 2).join('/');
          edges.push({
            sourceRepo: context.repositoryName,
            targetRepo,
            triggerType: 'workflow_call',
            protectionLevel: 'partial', // Reusable workflows have some protection
          });
        }
      }

      // Check job-level `uses` for reusable workflows
      if (job.uses && job.uses.includes('.github/workflows/')) {
        const targetRepo = job.uses.split('/').slice(0, 2).join('/');
        edges.push({
          sourceRepo: context.repositoryName,
          targetRepo,
          triggerType: 'workflow_call',
          protectionLevel: 'partial',
        });
      }
    }
  }

  // Merge with explicitly provided repo graph
  if (context.repoGraph) {
    for (const edge of context.repoGraph) {
      const isDuplicate = edges.some(
        (e) => e.sourceRepo === edge.sourceRepo &&
               e.targetRepo === edge.targetRepo &&
               e.triggerType === edge.triggerType,
      );
      if (!isDuplicate) {
        edges.push(edge);
      }
    }
  }

  return edges;
}

/**
 * Identify chains of repos where protection degrades across hops.
 */
function findProtectionGaps(edges: RepoDependencyEdge[]): {
  edge: RepoDependencyEdge;
  gap: string;
}[] {
  const gaps: { edge: RepoDependencyEdge; gap: string }[] = [];

  for (const edge of edges) {
    const score = PROTECTION_SCORES[edge.protectionLevel ?? 'none'] ?? 0;

    if (score === 0) {
      gaps.push({
        edge,
        gap: `No cross-repo protection between ${edge.sourceRepo} → ${edge.targetRepo} (trigger: ${edge.triggerType})`,
      });
    } else if (score <= 1) {
      gaps.push({
        edge,
        gap: `Weak protection between ${edge.sourceRepo} → ${edge.targetRepo} (trigger: ${edge.triggerType}, level: ${edge.protectionLevel})`,
      });
    }
  }

  return gaps;
}

/**
 * Detect repos that accept repository_dispatch without protection.
 */
function findUnprotectedReceivers(context: AnalysisContext): string[] {
  const receivers: string[] = [];

  if (!context.workflows) return receivers;

  for (const workflow of context.workflows) {
    const content = workflow.content.toLowerCase();
    if (content.includes('repository_dispatch')) {
      // Check if there's any token validation or sender verification
      const hasTokenCheck = content.includes('github.event.client_payload') &&
        (content.includes('token') || content.includes('secret') || content.includes('verify'));

      if (!hasTokenCheck) {
        receivers.push(workflow.path);
      }
    }
  }

  return receivers;
}

export const md101: RuleDefinition = {
  id: 'MD-101',
  name: 'Cross-Repo Protection Gap',
  tier: 'B',
  severity: 'warn',
  version: '1.0.0',

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    const findings: Finding[] = [];

    // Check for unprotected dispatch receivers (independent of repo graph)
    const unprotectedReceivers = findUnprotectedReceivers(context);

    for (const workflowPath of unprotectedReceivers) {
      findings.push({
        ruleId: 'MD-101',
        title: 'Cross-Repo Protection Gap: Unvalidated repository_dispatch receiver',
        severity: 'warn',
        filePath: workflowPath,
        evidence: `Workflow at ${workflowPath} accepts repository_dispatch events without ` +
          `apparent sender verification. Any repository with a valid PAT can trigger this workflow. ` +
          `Consider validating client_payload tokens or restricting dispatch sources.`,
        metadata: {
          workflowPath,
          gapType: 'unvalidated-receiver',
        },
      });
    }

    const edges = extractCrossRepoTriggers(context);

    // No cross-repo dependencies detected — return receiver findings only
    if (edges.length === 0) {
      return findings;
    }

    // Find protection gaps in the dependency graph
    const gaps = findProtectionGaps(edges);

    for (const { edge, gap } of gaps) {
      const severity = edge.protectionLevel === 'none' ? 'block' : 'warn';

      findings.push({
        ruleId: 'MD-101',
        title: `Cross-Repo Protection Gap: ${edge.sourceRepo} → ${edge.targetRepo}`,
        severity,
        evidence: `${gap}. When ${edge.sourceRepo} triggers work in ${edge.targetRepo} via ${edge.triggerType}, ` +
          `the governance posture of ${edge.sourceRepo} does not extend to ${edge.targetRepo}. ` +
          `A compromised workflow in ${edge.sourceRepo} could trigger arbitrary execution in ${edge.targetRepo} ` +
          `without branch protection review.`,
        metadata: {
          sourceRepo: edge.sourceRepo,
          targetRepo: edge.targetRepo,
          triggerType: edge.triggerType,
          protectionLevel: edge.protectionLevel,
          gapType: edge.protectionLevel === 'none' ? 'unprotected' : 'weak',
        },
      });
    }

    // Detect transitive chains (A → B → C where C has no idea about A)
    const repoSources = new Map<string, string[]>();
    for (const edge of edges) {
      const sources = repoSources.get(edge.targetRepo) ?? [];
      sources.push(edge.sourceRepo);
      repoSources.set(edge.targetRepo, sources);
    }

    for (const edge of edges) {
      const transitiveTargets = edges
        .filter((e) => e.sourceRepo === edge.targetRepo)
        .map((e) => e.targetRepo);

      for (const transitiveTarget of transitiveTargets) {
        findings.push({
          ruleId: 'MD-101',
          title: `Cross-Repo Protection Gap: Transitive chain ${edge.sourceRepo} → ${edge.targetRepo} → ${transitiveTarget}`,
          severity: 'block',
          evidence: `Transitive dependency chain detected: ${edge.sourceRepo} triggers ${edge.targetRepo}, ` +
            `which in turn triggers ${transitiveTarget}. The governance posture degrades with each hop. ` +
            `${transitiveTarget} has no visibility into ${edge.sourceRepo}'s original intent or authorization.`,
          metadata: {
            chain: [edge.sourceRepo, edge.targetRepo, transitiveTarget],
            gapType: 'transitive-chain',
          },
        });
      }
    }

    return findings;
  },
};

// Export helpers for testing
export { extractCrossRepoTriggers, findProtectionGaps, findUnprotectedReceivers, PROTECTION_SCORES };
