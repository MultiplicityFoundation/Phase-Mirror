/**
 * MD-102: Runner Trust Chain Break
 *
 * Tension Surfaced:
 * Self-hosted runners are trusted implicitly; no attestation that the runner environment
 * matches policy. An org may configure branch protection perfectly, but if the runner
 * executing the checks is compromised or misconfigured, every "passed" check is a lie.
 *
 * Detection Method:
 * Check for runner group restrictions, label-based routing, and attestation steps.
 * Flag runners with no verification, missing group restrictions, or absent environment
 * attestation in the workflow.
 */

import type { RuleDefinition, AnalysisContext, Finding, WorkflowJob, RunnerGroup } from './index.js';

/**
 * Known attestation actions and patterns.
 */
const ATTESTATION_PATTERNS = [
  'actions/attest-build-provenance',
  'sigstore/cosign',
  'slsa-framework/slsa-github-generator',
  'in-toto/in-toto',
  'step-security/harden-runner',
  'ossf/scorecard-action',
];

/**
 * Known GitHub-hosted runner labels.
 */
const GITHUB_HOSTED_LABELS = [
  'ubuntu-latest', 'ubuntu-22.04', 'ubuntu-24.04', 'ubuntu-20.04',
  'macos-latest', 'macos-14', 'macos-13', 'macos-12',
  'windows-latest', 'windows-2022', 'windows-2019',
];

/**
 * Determine if a runs-on value indicates a self-hosted runner.
 */
function isSelfHosted(runsOn: string | string[] | undefined): boolean {
  if (!runsOn) return false;

  const labels = Array.isArray(runsOn) ? runsOn : [runsOn];
  const normalized = labels.map((l) => l.toLowerCase().trim());

  // Explicitly self-hosted
  if (normalized.includes('self-hosted')) return true;

  // Not a known GitHub-hosted label
  const allKnown = normalized.every((l) =>
    GITHUB_HOSTED_LABELS.some((gh) => l === gh || l.startsWith('${')),
  );

  return !allKnown && !normalized.some((l) => l.startsWith('${'));
}

/**
 * Check if a job has attestation or runner verification steps.
 */
function hasAttestation(job: WorkflowJob): { hasIt: boolean; steps: string[] } {
  const attestationSteps: string[] = [];

  for (const step of job.steps) {
    const actionRef = [step.uses ?? '', step.run ?? '', step.name ?? ''].join(' ').toLowerCase();

    for (const pattern of ATTESTATION_PATTERNS) {
      if (actionRef.includes(pattern.toLowerCase())) {
        attestationSteps.push(step.name ?? step.uses ?? 'unnamed step');
      }
    }

    // Check for environment pinning / hash verification
    if (step.run) {
      const runContent = step.run.toLowerCase();
      if (
        runContent.includes('sha256sum') ||
        runContent.includes('cosign verify') ||
        runContent.includes('attestation') ||
        runContent.includes('provenance')
      ) {
        attestationSteps.push(step.name ?? 'inline verification step');
      }
    }
  }

  return { hasIt: attestationSteps.length > 0, steps: attestationSteps };
}

/**
 * Check if a runner group has appropriate restrictions.
 */
function evaluateRunnerGroup(group: RunnerGroup): Finding[] {
  const findings: Finding[] = [];

  if (group.isHosted) {
    return findings; // GitHub-hosted runners are managed
  }

  // No repository restrictions on the runner group
  if (!group.restrictedTo || group.restrictedTo.length === 0) {
    findings.push({
      ruleId: 'MD-102',
      title: `Runner Trust Chain Break: Runner group "${group.name}" has no repo restrictions`,
      severity: 'block',
      evidence: `Self-hosted runner group "${group.name}" (id: ${group.id}) is not restricted ` +
        `to specific repositories. Any repository in the organization can schedule jobs on these runners. ` +
        `A compromised repository could use this group to access the runner's network, ` +
        `secrets, and file system.`,
      metadata: {
        groupId: group.id,
        groupName: group.name,
        labels: group.labels,
        breakType: 'unrestricted-group',
      },
    });
  }

  // No attestation enabled for the group
  if (!group.attestationEnabled) {
    findings.push({
      ruleId: 'MD-102',
      title: `Runner Trust Chain Break: Runner group "${group.name}" lacks attestation`,
      severity: 'warn',
      evidence: `Self-hosted runner group "${group.name}" does not have attestation enabled. ` +
        `There is no cryptographic proof that the runner environment matches organizational policy. ` +
        `An attacker who compromises the runner machine could modify the environment without detection.`,
      metadata: {
        groupId: group.id,
        groupName: group.name,
        breakType: 'no-attestation',
      },
    });
  }

  // No verification steps
  if (!group.verificationSteps || group.verificationSteps.length === 0) {
    findings.push({
      ruleId: 'MD-102',
      title: `Runner Trust Chain Break: Runner group "${group.name}" has no verification steps`,
      severity: 'warn',
      evidence: `Self-hosted runner group "${group.name}" has no configured verification steps. ` +
        `Consider adding environment checksums, package verification, or boot-time attestation.`,
      metadata: {
        groupId: group.id,
        groupName: group.name,
        breakType: 'no-verification-steps',
      },
    });
  }

  return findings;
}

export const md102: RuleDefinition = {
  id: 'MD-102',
  name: 'Runner Trust Chain Break',
  tier: 'B',
  severity: 'warn',
  version: '1.0.0',

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    const findings: Finding[] = [];

    // Evaluate workflow jobs for self-hosted runner usage
    if (context.workflows) {
      for (const workflow of context.workflows) {
        for (const job of workflow.jobs) {
          if (!isSelfHosted(job.runsOn)) {
            continue; // GitHub-hosted runners are managed — skip
          }

          const runsOnDisplay = Array.isArray(job.runsOn)
            ? job.runsOn.join(', ')
            : job.runsOn ?? 'unknown';

          const attestation = hasAttestation(job);

          // Self-hosted runner without any attestation step
          if (!attestation.hasIt) {
            findings.push({
              ruleId: 'MD-102',
              title: `Runner Trust Chain Break: Job "${job.name}" uses self-hosted runner without attestation`,
              severity: 'warn',
              filePath: workflow.path,
              evidence: `Job "${job.name}" (id: ${job.id}) runs on self-hosted runner [${runsOnDisplay}] ` +
                `but has no attestation or verification steps. The CI checks reported by this job ` +
                `cannot be independently verified. Consider adding step-security/harden-runner ` +
                `or equivalent attestation.`,
              metadata: {
                jobId: job.id,
                jobName: job.name,
                runsOn: job.runsOn,
                breakType: 'no-job-attestation',
              },
            });
          }

          // Self-hosted runner with no label-based routing (using just "self-hosted")
          const labels = Array.isArray(job.runsOn) ? job.runsOn : [job.runsOn ?? ''];
          const onlyGenericLabel = labels.length === 1 &&
            labels[0].toLowerCase().trim() === 'self-hosted';

          if (onlyGenericLabel) {
            findings.push({
              ruleId: 'MD-102',
              title: `Runner Trust Chain Break: Job "${job.name}" uses generic self-hosted label`,
              severity: 'warn',
              filePath: workflow.path,
              evidence: `Job "${job.name}" uses the generic "self-hosted" label without additional ` +
                `routing labels. This means the job could run on ANY self-hosted runner in the org. ` +
                `Use specific labels (e.g., "self-hosted", "linux", "production") to route to ` +
                `trusted runner groups.`,
              metadata: {
                jobId: job.id,
                jobName: job.name,
                runsOn: job.runsOn,
                breakType: 'generic-label',
              },
            });
          }
        }
      }
    }

    // Evaluate runner groups if provided
    if (context.runnerGroups) {
      for (const group of context.runnerGroups) {
        findings.push(...evaluateRunnerGroup(group));
      }
    }

    return findings;
  },
};

// Export helpers for testing
export {
  isSelfHosted,
  hasAttestation,
  evaluateRunnerGroup,
  ATTESTATION_PATTERNS,
  GITHUB_HOSTED_LABELS,
};
