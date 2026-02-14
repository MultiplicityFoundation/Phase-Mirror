/**
 * MD-100: Semantic Job Drift
 *
 * Detects when CI/CD job names suggest one purpose but the actual steps
 * perform a different function. This is a governance risk because branch
 * protection rules reference job names — if the name lies, the protection lies.
 *
 * Central Tension: Detection accuracy vs. keyword heuristics. A full
 * semantic analysis engine would be ideal but doesn't exist yet. This is
 * the pragmatic 80% solution: a keyword-to-intent mapping engine that's
 * explicit, testable, and extensible — not ML-based.
 *
 * @license Phase Mirror Pro License v1.0
 */

import type {
  RuleDefinition,
  Finding,
  AnalysisContext,
} from '../types.js';
import { requirePro } from '../../license-gate.js';

// ─── Intent Vocabulary ───────────────────────────────────────────────
// Maps keywords found in job names to expected "intent categories."
// A job named "security-scan" has intent ["security", "scan"].
// If its steps contain zero actions matching those intents, it's drifted.

export interface IntentSignal {
  keywords: string[];         // Trigger words in job name
  expectedActions: string[];  // Action prefixes/commands that satisfy this intent
  expectedCommands: string[]; // Shell commands that satisfy this intent
}

export const INTENT_VOCABULARY: IntentSignal[] = [
  {
    keywords: ['test', 'tests', 'testing', 'spec', 'specs', 'unit', 'integration', 'e2e'],
    expectedActions: [
      'actions/setup-node', 'actions/setup-python', 'actions/setup-go',
      'actions/setup-java', 'actions/setup-dotnet',
    ],
    expectedCommands: [
      'npm test', 'pnpm test', 'yarn test', 'jest', 'vitest', 'mocha',
      'pytest', 'go test', 'cargo test', 'dotnet test', 'mvn test',
      'gradle test', 'phpunit', 'rspec', 'mix test',
    ],
  },
  {
    keywords: ['lint', 'linting', 'format', 'formatting', 'style', 'prettier', 'eslint'],
    expectedActions: [
      'actions/setup-node',
    ],
    expectedCommands: [
      'eslint', 'prettier', 'tslint', 'stylelint', 'rubocop', 'black',
      'flake8', 'pylint', 'golangci-lint', 'clippy', 'npm run lint',
      'pnpm lint', 'yarn lint',
    ],
  },
  {
    keywords: ['security', 'scan', 'sast', 'dast', 'vulnerability', 'audit', 'snyk', 'codeql', 'trivy'],
    expectedActions: [
      'github/codeql-action', 'aquasecurity/trivy-action', 'snyk/actions',
      'securego/gosec', 'returntocorp/semgrep-action',
    ],
    expectedCommands: [
      'npm audit', 'pnpm audit', 'yarn audit', 'snyk', 'trivy', 'semgrep',
      'bandit', 'gosec', 'brakeman', 'safety check', 'codeql',
    ],
  },
  {
    keywords: ['deploy', 'deployment', 'release', 'publish', 'ship'],
    expectedActions: [
      'aws-actions/configure-aws-credentials', 'azure/login', 'google-github-actions/auth',
      'aws-actions/amazon-ecs-deploy-task-definition', 'azure/webapps-deploy',
    ],
    expectedCommands: [
      'npm publish', 'pnpm publish', 'docker push', 'kubectl apply',
      'terraform apply', 'aws deploy', 'gcloud deploy', 'az webapp deploy',
      'helm upgrade', 'fly deploy', 'vercel deploy', 'netlify deploy',
    ],
  },
  {
    keywords: ['build', 'compile', 'assemble', 'package'],
    expectedActions: [
      'actions/setup-node', 'actions/setup-go', 'actions/setup-java',
      'docker/build-push-action',
    ],
    expectedCommands: [
      'npm run build', 'pnpm build', 'yarn build', 'tsc', 'go build',
      'cargo build', 'mvn package', 'gradle build', 'docker build',
      'make build', 'dotnet build',
    ],
  },
];

// ─── YAML Parsing (lightweight, no dependency) ───────────────────────

export interface WorkflowJob {
  jobKey: string;      // The YAML key (e.g., "security-scan")
  jobName?: string;    // The `name:` field if present
  steps: WorkflowStep[];
  filePath: string;
}

export interface WorkflowStep {
  name?: string;
  uses?: string;       // Action reference (e.g., "actions/checkout@v4")
  run?: string;        // Shell command
}

export function parseWorkflowJobs(content: string, filePath: string): WorkflowJob[] {
  const jobs: WorkflowJob[] = [];

  // Extract the jobs block — simple line-based parsing.
  // This avoids a YAML dependency; robust enough for CI workflow structure.
  const lines = content.split('\n');
  let inJobs = false;
  let currentJob: WorkflowJob | null = null;
  let currentStep: Partial<WorkflowStep> | null = null;
  let jobIndent = 0;
  let stepIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Detect `jobs:` block
    if (trimmed === 'jobs:' || trimmed.startsWith('jobs:')) {
      inJobs = true;
      jobIndent = indent + 2;
      continue;
    }

    if (!inJobs) continue;

    // Detect top-level job key (e.g., `  security-scan:`)
    if (indent === jobIndent && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      if (currentStep && currentJob) {
        currentJob.steps.push(currentStep as WorkflowStep);
        currentStep = null;
      }
      if (currentJob) jobs.push(currentJob);
      currentJob = {
        jobKey: trimmed.slice(0, -1).trim(),
        steps: [],
        filePath,
      };
      currentStep = null;
      continue;
    }

    if (!currentJob) continue;

    // Detect job name field
    if (trimmed.startsWith('name:') && indent === jobIndent + 2) {
      currentJob.jobName = trimmed.slice(5).trim().replace(/^['"]|['"]$/g, '');
      continue;
    }

    // Detect steps block
    if (trimmed === 'steps:') {
      stepIndent = indent + 2;
      continue;
    }

    // Detect step entry (starts with `- `)
    if (trimmed.startsWith('- ') && indent >= stepIndent) {
      if (currentStep && currentJob) {
        currentJob.steps.push(currentStep as WorkflowStep);
      }
      currentStep = {};
      const afterDash = trimmed.slice(2).trim();
      if (afterDash.startsWith('name:')) {
        currentStep.name = afterDash.slice(5).trim().replace(/^['"]|['"]$/g, '');
      } else if (afterDash.startsWith('uses:')) {
        currentStep.uses = afterDash.slice(5).trim();
      } else if (afterDash.startsWith('run:')) {
        currentStep.run = afterDash.slice(4).trim();
      }
      continue;
    }

    // Continuation lines within a step
    if (currentStep && indent > stepIndent) {
      if (trimmed.startsWith('name:')) {
        currentStep.name = trimmed.slice(5).trim().replace(/^['"]|['"]$/g, '');
      } else if (trimmed.startsWith('uses:')) {
        currentStep.uses = trimmed.slice(5).trim();
      } else if (trimmed.startsWith('run:')) {
        currentStep.run = trimmed.slice(4).trim();
      } else if (trimmed === '|') {
        // Multi-line run block marker — skip
      } else if (currentStep.run !== undefined && indent > stepIndent + 4) {
        // Continuation of multi-line run
        currentStep.run += ' ' + trimmed;
      }
    }

    // Exit jobs block if we hit a top-level key at indent 0
    if (indent === 0 && trimmed.endsWith(':') && trimmed !== 'jobs:') {
      if (currentStep && currentJob) {
        currentJob.steps.push(currentStep as WorkflowStep);
      }
      if (currentJob) jobs.push(currentJob);
      inJobs = false;
      currentJob = null;
      currentStep = null;
    }
  }

  // Push final step and job
  if (currentStep && currentJob) {
    currentJob.steps.push(currentStep as WorkflowStep);
  }
  if (currentJob) jobs.push(currentJob);

  return jobs;
}

// ─── Intent Matching ─────────────────────────────────────────────────

export interface IntentMatch {
  category: string;       // e.g., "test", "security"
  keywords: string[];     // Which keywords matched in the job name
}

export function detectJobIntent(jobKey: string, jobName?: string): IntentMatch[] {
  const nameToCheck = `${jobKey} ${jobName ?? ''}`.toLowerCase();
  const matches: IntentMatch[] = [];

  for (const signal of INTENT_VOCABULARY) {
    const matchedKeywords = signal.keywords.filter(kw => nameToCheck.includes(kw));
    if (matchedKeywords.length > 0) {
      matches.push({
        category: signal.keywords[0], // Use first keyword as category name
        keywords: matchedKeywords,
      });
    }
  }

  return matches;
}

export function stepsMatchIntent(steps: WorkflowStep[], intents: IntentMatch[]): {
  matched: boolean;
  matchedCategories: string[];
  unmatchedCategories: string[];
} {
  const matchedCategories: string[] = [];
  const unmatchedCategories: string[] = [];

  for (const intent of intents) {
    const signal = INTENT_VOCABULARY.find(s => s.keywords[0] === intent.category);
    if (!signal) continue;

    const hasMatchingAction = steps.some(step =>
      step.uses && signal.expectedActions.some(action =>
        step.uses!.toLowerCase().includes(action.toLowerCase())
      )
    );

    const hasMatchingCommand = steps.some(step =>
      step.run && signal.expectedCommands.some(cmd =>
        step.run!.toLowerCase().includes(cmd.toLowerCase())
      )
    );

    if (hasMatchingAction || hasMatchingCommand) {
      matchedCategories.push(intent.category);
    } else {
      unmatchedCategories.push(intent.category);
    }
  }

  return {
    matched: unmatchedCategories.length === 0,
    matchedCategories,
    unmatchedCategories,
  };
}

// ─── Environment Drift Detection ─────────────────────────────────────
// Detects when a job named "deploy-staging" targets production environment

export function detectEnvironmentDrift(job: WorkflowJob): Finding | null {
  const nameToCheck = `${job.jobKey} ${job.jobName ?? ''}`.toLowerCase();

  const claimsStaging = nameToCheck.includes('staging') || nameToCheck.includes('dev');
  const claimsProduction = nameToCheck.includes('prod') || nameToCheck.includes('production');

  if (!claimsStaging && !claimsProduction) return null;

  for (const step of job.steps) {
    const commandText = `${step.run ?? ''} ${step.uses ?? ''} ${step.name ?? ''}`.toLowerCase();

    if (claimsStaging && (
      commandText.includes('production') ||
      commandText.includes('--env prod') ||
      commandText.includes('env=prod') ||
      commandText.includes('.prod.')
    )) {
      return {
        id: `MD-100-env-${job.jobKey}`,
        ruleId: 'MD-100',
        ruleName: 'Semantic Job Drift — Environment Mismatch',
        severity: 'high',
        title: `Job "${job.jobKey}" claims staging but targets production`,
        description:
          `The job "${job.jobKey}" has a name suggesting staging/dev deployment, ` +
          `but its steps reference production environment variables or targets. ` +
          `Branch protection assumes the job name reflects its actual behavior.`,
        evidence: [{
          path: job.filePath,
          line: 0,
          context: {
            jobKey: job.jobKey,
            jobName: job.jobName,
            claimedEnvironment: 'staging',
            actualTarget: 'production',
          },
        }],
        remediation:
          'Rename the job to reflect its actual target environment, or ' +
          'fix the deployment target to match the job name.',
        adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
      };
    }
  }

  return null;
}

// ─── Rule Definition ─────────────────────────────────────────────────

export const rule: RuleDefinition = {
  id: 'MD-100',
  name: 'Semantic Job Drift',
  description:
    'Detects when CI/CD job names suggest one purpose but the actual steps ' +
    'perform a different function. This is a governance risk because branch ' +
    'protection rules reference job names — if the name lies, the protection lies.',
  version: '1.0.0',
  tier: 'B',
  severity: 'warn',
  category: 'governance',
  fpTolerance: { ceiling: 0.10, window: 200 },
  promotionCriteria: {
    minWindowN: 200,
    maxObservedFPR: 0.05,
    minRedTeamCases: 3,
    minDaysInWarn: 14,
    requiredApprovers: ['steward'],
  },
  adrReferences: ['ADR-003: CI/CD Pipeline Governance'],

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    requirePro(context, 'MD-100: Semantic Job Drift');

    const findings: Finding[] = [];

    // Filter for workflow files
    const workflowFiles = (context.files ?? []).filter(f =>
      f.path.includes('.github/workflows/') &&
      (f.path.endsWith('.yml') || f.path.endsWith('.yaml'))
    );

    for (const file of workflowFiles) {
      if (!file.content) continue;

      let jobs: WorkflowJob[];
      try {
        jobs = parseWorkflowJobs(file.content, file.path);
      } catch {
        // Malformed YAML — skip, don't crash
        continue;
      }

      for (const job of jobs) {
        // Skip jobs with no steps (empty or uses-only)
        if (job.steps.length === 0) continue;

        // Skip checkout-only jobs (too common, low signal)
        const nonCheckoutSteps = job.steps.filter(s =>
          !(s.uses && s.uses.startsWith('actions/checkout'))
        );
        if (nonCheckoutSteps.length === 0) continue;

        // Detect declared intent from job name
        const intents = detectJobIntent(job.jobKey, job.jobName);
        if (intents.length === 0) continue; // No recognizable intent — skip

        // Check if steps match the declared intent
        const match = stepsMatchIntent(job.steps, intents);

        if (!match.matched && match.unmatchedCategories.length > 0) {
          // Collect what the steps actually do
          const actualActions = job.steps
            .filter(s => s.uses || s.run)
            .map(s => s.uses ?? s.run ?? '')
            .filter(Boolean)
            .slice(0, 5); // Cap evidence size

          findings.push({
            id: `MD-100-${job.jobKey}`,
            ruleId: 'MD-100',
            ruleName: 'Semantic Job Drift',
            severity: 'warn',
            title: `Job "${job.jobKey}" name implies [${match.unmatchedCategories.join(', ')}] but steps don't match`,
            description:
              `The job "${job.jobKey}"${job.jobName ? ` ("${job.jobName}")` : ''} ` +
              `has a name suggesting ${match.unmatchedCategories.join(' and ')} intent, ` +
              `but none of its ${job.steps.length} steps invoke actions or commands ` +
              `associated with ${match.unmatchedCategories.join('/')}. ` +
              (match.matchedCategories.length > 0
                ? `Steps DO match: [${match.matchedCategories.join(', ')}]. `
                : '') +
              `Governance systems referencing this job by name may be misled.`,
            evidence: [{
              path: file.path,
              line: 0,
              context: {
                jobKey: job.jobKey,
                jobName: job.jobName,
                declaredIntent: intents.map(i => i.category),
                matchedCategories: match.matchedCategories,
                unmatchedCategories: match.unmatchedCategories,
                actualSteps: actualActions,
              },
            }],
            remediation:
              `Either rename the job to reflect what it actually does, or add ` +
              `${match.unmatchedCategories.join('/')}-related steps to match the name. ` +
              `Branch protection rules that reference "${job.jobKey}" assume it performs ` +
              `${match.unmatchedCategories.join(' and ')} — if it doesn't, the protection is illusory.`,
            adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
          });
        }

        // Check for environment drift (staging name → production target)
        const envFinding = detectEnvironmentDrift(job);
        if (envFinding) findings.push(envFinding);
      }
    }

    return findings;
  },
};

export default rule;
