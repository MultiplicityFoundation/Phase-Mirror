/**
 * MD-100: Semantic Job Drift
 *
 * Tension Surfaced:
 * CI jobs renamed but behavior unchanged (or vice versa) — governance assumes name = intent.
 * When a job called "security-scan" silently becomes a linter, branch protection still references
 * the old semantic meaning. The check passes, but the protection it promised has evaporated.
 *
 * Detection Method:
 * Compare job name semantic tokens against step-level action graph. Flag when the job name
 * implies a purpose (build, test, deploy, security, lint) that the steps don't fulfill,
 * or when steps perform actions that the job name doesn't declare.
 */

import type { RuleDefinition, AnalysisContext, Finding, WorkflowJob } from './index.js';

/**
 * Semantic categories derived from job names / step actions.
 * Each category has trigger tokens (found in names) and evidence tokens (found in steps).
 */
const SEMANTIC_CATEGORIES: Record<string, { nameTokens: string[]; stepSignals: string[] }> = {
  build: {
    nameTokens: ['build', 'compile', 'package', 'bundle', 'assemble'],
    stepSignals: [
      'actions/setup-node', 'actions/setup-python', 'actions/setup-java',
      'npm run build', 'pnpm build', 'yarn build', 'make build',
      'docker build', 'gradle build', 'mvn package', 'cargo build',
      'tsc', 'webpack', 'vite build', 'esbuild',
    ],
  },
  test: {
    nameTokens: ['test', 'spec', 'check', 'verify', 'validate', 'qa'],
    stepSignals: [
      'npm test', 'pnpm test', 'yarn test', 'jest', 'mocha', 'vitest',
      'pytest', 'cargo test', 'go test', 'gradle test', 'mvn test',
      'cypress', 'playwright', 'selenium',
    ],
  },
  security: {
    nameTokens: ['security', 'scan', 'sast', 'dast', 'vulnerability', 'audit', 'codeql', 'snyk', 'trivy'],
    stepSignals: [
      'github/codeql-action', 'snyk/actions', 'aquasecurity/trivy-action',
      'npm audit', 'pnpm audit', 'yarn audit',
      'bandit', 'semgrep', 'grype', 'syft', 'cosign',
      'ossf/scorecard-action', 'securego/gosec',
    ],
  },
  lint: {
    nameTokens: ['lint', 'format', 'style', 'prettier', 'eslint'],
    stepSignals: [
      'eslint', 'prettier', 'stylelint', 'rubocop', 'pylint', 'flake8',
      'black', 'gofmt', 'rustfmt', 'shellcheck', 'hadolint',
      'super-linter', 'megalinter',
    ],
  },
  deploy: {
    nameTokens: ['deploy', 'release', 'publish', 'ship', 'rollout', 'push'],
    stepSignals: [
      'aws-actions/amazon-ecs-deploy', 'azure/webapps-deploy',
      'google-github-actions/deploy-cloudrun',
      'npm publish', 'pnpm publish',
      'docker push', 'helm upgrade', 'kubectl apply',
      'terraform apply', 'pulumi up', 'cdk deploy',
    ],
  },
};

/**
 * Tokenize a string into lowercase words for semantic matching.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')
    .split(/[\s\-_]+/)
    .filter(Boolean);
}

/**
 * Determine which semantic categories a job name implies.
 */
function categoriesFromName(jobName: string): string[] {
  const tokens = tokenize(jobName);
  const matched: string[] = [];

  for (const [category, { nameTokens }] of Object.entries(SEMANTIC_CATEGORIES)) {
    if (nameTokens.some((nt) => tokens.some((t) => t.includes(nt) || nt.includes(t)))) {
      matched.push(category);
    }
  }

  return matched;
}

/**
 * Determine which semantic categories a job's steps actually perform.
 */
function categoriesFromSteps(job: WorkflowJob): string[] {
  const matched = new Set<string>();

  for (const step of job.steps) {
    const haystack = [step.uses ?? '', step.run ?? '', step.name ?? '']
      .join(' ')
      .toLowerCase();

    for (const [category, { stepSignals }] of Object.entries(SEMANTIC_CATEGORIES)) {
      if (stepSignals.some((sig) => haystack.includes(sig.toLowerCase()))) {
        matched.add(category);
      }
    }
  }

  return Array.from(matched);
}

export const md100: RuleDefinition = {
  id: 'MD-100',
  name: 'Semantic Job Drift',
  tier: 'B',
  severity: 'warn',
  version: '1.0.0',

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    const findings: Finding[] = [];

    if (!context.workflows || context.workflows.length === 0) {
      return findings;
    }

    for (const workflow of context.workflows) {
      for (const job of workflow.jobs) {
        const nameCategories = categoriesFromName(job.name);
        const stepCategories = categoriesFromSteps(job);

        // Skip jobs with no detectable semantic category in their name
        if (nameCategories.length === 0) {
          continue;
        }

        // Case 1: Name promises something the steps don't deliver
        const undelivered = nameCategories.filter((c) => !stepCategories.includes(c));

        for (const category of undelivered) {
          findings.push({
            ruleId: 'MD-100',
            title: `Semantic Job Drift: "${job.name}" implies ${category} but steps don't perform it`,
            severity: 'warn',
            filePath: workflow.path,
            evidence: `Job "${job.name}" (id: ${job.id}) has name tokens matching "${category}" category, ` +
              `but none of its ${job.steps.length} steps contain matching actions. ` +
              `Name implies: [${nameCategories.join(', ')}]. Steps perform: [${stepCategories.join(', ') || 'none detected'}].`,
            metadata: {
              jobId: job.id,
              jobName: job.name,
              expectedCategory: category,
              nameCategories,
              stepCategories,
              driftType: 'name-without-substance',
            },
          });
        }

        // Case 2: Steps perform something the name doesn't declare
        // (less severe — the work is being done, just not transparently)
        const undeclared = stepCategories.filter((c) => !nameCategories.includes(c));

        if (undeclared.length > 0 && nameCategories.length > 0) {
          findings.push({
            ruleId: 'MD-100',
            title: `Semantic Job Drift: "${job.name}" performs undeclared ${undeclared.join('/')} work`,
            severity: 'warn',
            filePath: workflow.path,
            evidence: `Job "${job.name}" (id: ${job.id}) performs [${undeclared.join(', ')}] work ` +
              `that its name doesn't reflect. Name implies: [${nameCategories.join(', ')}]. ` +
              `Steps also perform: [${undeclared.join(', ')}]. ` +
              `This creates governance ambiguity — branch protection referencing this job ` +
              `may not understand its full scope.`,
            metadata: {
              jobId: job.id,
              jobName: job.name,
              undeclaredCategories: undeclared,
              nameCategories,
              stepCategories,
              driftType: 'undeclared-scope',
            },
          });
        }
      }
    }

    return findings;
  },
};

// Export helpers for testing
export { categoriesFromName, categoriesFromSteps, tokenize, SEMANTIC_CATEGORIES };
