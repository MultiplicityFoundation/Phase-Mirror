#!/usr/bin/env node
/**
 * CLI for Mirror Dissonance Protocol Oracle
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('oracle')
  .description('Mirror Dissonance Protocol Oracle - Analyze agentic reasoning tensions')
  .version('1.0.0');

program
  .command('run')
  .description('Run oracle analysis')
  .option('--mode <mode>', 'Analysis mode: pull_request, merge_group, drift, calibration', 'pull_request')
  .option('--strict', 'Enable strict mode with enhanced thresholds', false)
  .option('--dry-run', 'Warn-only mode, do not block', false)
  .option('--baseline <file>', 'Baseline file for drift detection')
  .option('--repo <name>', 'Repository name')
  .option('--pr <number>', 'Pull request number')
  .option('--commit <sha>', 'Commit SHA')
  .option('--branch <name>', 'Branch name')
  .option('--author <name>', 'Author name')
  .option('--output <file>', 'Output file for results')
  .action(async (options) => {
    try {
      // Dynamically import the oracle module
      const oraclePath = path.join(__dirname, '../../mirror-dissonance/dist/src/oracle.js');
      const { analyze } = await import(oraclePath);
      
      // Build input
      const input = {
        mode: options.mode,
        strict: options.strict,
        dryRun: options.dryRun,
        baselineFile: options.baseline,
        context: {
          repositoryName: options.repo || process.env.GITHUB_REPOSITORY,
          prNumber: options.pr ? parseInt(options.pr) : undefined,
          commitSha: options.commit || process.env.GITHUB_SHA,
          branch: options.branch || process.env.GITHUB_REF_NAME,
          author: options.author || process.env.GITHUB_ACTOR,
        },
      };

      console.log('Starting Oracle analysis...');
      console.log(`Mode: ${input.mode}`);
      console.log(`Strict: ${input.strict}`);
      console.log(`Dry Run: ${input.dryRun}`);
      console.log('');

      // Run analysis
      const result = await analyze(input);

      // Print summary
      console.log(result.summary);

      // Save output if requested
      if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`\nResults saved to: ${outputPath}`);
      }

      // Write to GitHub Step Summary if in CI
      if (process.env.GITHUB_STEP_SUMMARY) {
        const summaryPath = process.env.GITHUB_STEP_SUMMARY;
        const markdown = generateMarkdownSummary(result);
        fs.appendFileSync(summaryPath, markdown);
        console.log('\nGitHub Step Summary updated.');
      }

      // Exit with appropriate code
      if (result.machineDecision.outcome === 'block') {
        console.error('\n❌ Oracle decision: BLOCK');
        process.exit(1);
      } else if (result.machineDecision.outcome === 'warn') {
        console.warn('\n⚠️  Oracle decision: WARN');
        process.exit(0);
      } else {
        console.log('\n✅ Oracle decision: ALLOW');
        process.exit(0);
      }
    } catch (error) {
      console.error('Error running oracle:', error);
      process.exit(1);
    }
  });

function generateMarkdownSummary(result: any): string {
  const lines: string[] = [];
  
  lines.push('## Mirror Dissonance Protocol - Oracle Analysis\n');
  lines.push(`**Decision:** ${result.machineDecision.outcome.toUpperCase()}\n`);
  lines.push(`**Timestamp:** ${result.machineDecision.metadata.timestamp}\n`);
  lines.push(`**Mode:** ${result.machineDecision.metadata.mode}\n`);
  lines.push('\n### Report\n');
  lines.push(`- Rules Checked: ${result.report.rulesChecked}`);
  lines.push(`- Violations Found: ${result.report.violationsFound}`);
  lines.push(`- Critical Issues: ${result.report.criticalIssues}\n`);
  
  if (result.violations.length > 0) {
    lines.push('\n### Violations\n');
    result.violations.forEach((v: any) => {
      lines.push(`- **[${v.severity.toUpperCase()}] ${v.ruleId}:** ${v.message}`);
    });
  }
  
  lines.push('\n### Reasons\n');
  result.machineDecision.reasons.forEach((reason: string) => {
    lines.push(`- ${reason}`);
  });
  
  return lines.join('\n');
}

program.parse();
