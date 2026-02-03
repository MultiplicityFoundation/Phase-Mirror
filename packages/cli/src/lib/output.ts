import chalk from 'chalk';
import { table } from 'table';
import boxen from 'boxen';

export class OutputFormatter {
  constructor(private format: string = 'text') {}

  formatReport(report: any): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'sarif':
        return this.toSARIF(report);
      case 'github':
        return this.toGitHubAnnotations(report);
      default:
        return this.formatTextReport(report);
    }
  }

  private formatTextReport(report: any): string {
    let output = '\n';

    // Header
    output += boxen(
      chalk.cyan.bold('Phase Mirror Analysis Report'),
      { padding: 1, margin: 1, borderStyle: 'round' }
    );

    output += '\n';

    // Summary
    const summaryData = [
      ['Decision', this.colorizeDecision(report.decision)],
      ['Findings', report.findings?.length || 0],
      ['Critical', report.criticalCount || 0],
      ['High', report.highCount || 0],
      ['Medium', report.mediumCount || 0],
      ['Low', report.lowCount || 0]
    ];

    output += table(summaryData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    });

    // Findings
    if (report.findings && report.findings.length > 0) {
      output += '\n' + chalk.bold('Findings:\n\n');

      for (const finding of report.findings) {
        output += this.formatFinding(finding);
        output += '\n';
      }
    }

    return output;
  }

  private formatFinding(finding: any): string {
    const severity = this.colorizeSeverity(finding.severity);
    const ruleId = chalk.cyan(finding.ruleId);
    
    let output = `${severity} ${ruleId}: ${finding.message}\n`;
    
    if (finding.evidence && finding.evidence.length > 0) {
      output += chalk.dim('  Evidence:\n');
      for (const ev of finding.evidence) {
        output += chalk.dim(`    ${ev.path}:${ev.line || '?'}\n`);
        if (ev.snippet) {
          output += chalk.dim(`      ${ev.snippet}\n`);
        }
      }
    }

    return output;
  }

  formatL0Result(result: any): string {
    if (this.format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    let output = '\n';
    output += boxen(
      chalk.cyan.bold('L0 Invariants Validation'),
      { padding: 1, margin: 1, borderStyle: 'round' }
    );

    output += '\n';

    if (result.valid) {
      output += chalk.green('✓ All L0 invariants satisfied\n');
    } else {
      output += chalk.red(`✖ ${result.violations.length} violations detected\n\n`);
      
      for (const violation of result.violations) {
        output += chalk.red(`  • ${violation.check}: ${violation.message}\n`);
      }
    }

    return output;
  }

  formatDriftResult(result: any): string {
    if (this.format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    let output = '\n';
    output += boxen(
      chalk.cyan.bold('Drift Detection'),
      { padding: 1, margin: 1, borderStyle: 'round' }
    );

    output += '\n';

    if (result.driftDetected) {
      const magnitude = (result.magnitude * 100).toFixed(1);
      output += chalk.yellow(`⚠ Drift detected: ${magnitude}% change\n\n`);
      
      if (result.changes) {
        output += chalk.dim('Changes:\n');
        for (const change of result.changes) {
          output += chalk.dim(`  • ${change.type}: ${change.description}\n`);
        }
      }
    } else {
      output += chalk.green('✓ No significant drift detected\n');
    }

    return output;
  }

  formatFPList(fps: any[]): string {
    if (this.format === 'json') {
      return JSON.stringify(fps, null, 2);
    }

    if (fps.length === 0) {
      return chalk.dim('\nNo false positives found\n');
    }

    const data = [
      [chalk.bold('Finding ID'), chalk.bold('Rule ID'), chalk.bold('Marked At'), chalk.bold('Reason')]
    ];

    for (const fp of fps) {
      data.push([
        fp.findingId,
        fp.ruleId,
        new Date(fp.markedAt).toLocaleDateString(),
        fp.reason
      ]);
    }

    return '\n' + table(data);
  }

  private colorizeDecision(decision: string): string {
    switch (decision.toUpperCase()) {
      case 'PASS':
        return chalk.green('PASS');
      case 'WARN':
        return chalk.yellow('WARN');
      case 'BLOCK':
        return chalk.red('BLOCK');
      default:
        return decision;
    }
  }

  private colorizeSeverity(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return chalk.red.bold('CRITICAL');
      case 'high':
        return chalk.red('HIGH');
      case 'medium':
        return chalk.yellow('MEDIUM');
      case 'low':
        return chalk.blue('LOW');
      default:
        return severity;
    }
  }

  private toSARIF(report: any): string {
    // SARIF 2.1.0 format
    const sarif = {
      version: '2.1.0',
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'Phase Mirror',
              version: '0.1.0',
              informationUri: 'https://phasemirror.com',
              rules: []
            }
          },
          results: report.findings?.map((f: any) => ({
            ruleId: f.ruleId,
            level: this.severityToSARIFLevel(f.severity),
            message: {
              text: f.message
            },
            locations: f.evidence?.map((ev: any) => ({
              physicalLocation: {
                artifactLocation: {
                  uri: ev.path
                },
                region: {
                  startLine: ev.line || 1
                }
              }
            }))
          })) || []
        }
      ]
    };

    return JSON.stringify(sarif, null, 2);
  }

  private severityToSARIFLevel(severity: string): string {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'note';
      default:
        return 'none';
    }
  }

  private toGitHubAnnotations(report: any): string {
    let output = '';

    for (const finding of report.findings || []) {
      for (const evidence of finding.evidence || []) {
        const level = finding.severity === 'critical' || finding.severity === 'high' ? 'error' : 'warning';
        output += `::${level} file=${evidence.path},line=${evidence.line || 1}::${finding.message}\n`;
      }
    }

    return output;
  }
}
