#!/usr/bin/env ts-node
/**
 * Test Report Generator
 * 
 * Parses Jest test results and generates formatted reports
 * with summary statistics and tool-specific breakdowns.
 * 
 * Usage:
 *   pnpm test --json --outputFile=test-results.json
 *   ts-node scripts/generate-test-report.ts test-results.json
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

interface TestResult {
  tool: string;
  test: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestReport {
  timestamp: string;
  version: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    totalDuration: number;
  };
  byTool: Record<string, {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  }>;
  failures: TestResult[];
  slowTests: TestResult[];
}

interface JestTestResult {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: Array<{
    name: string;
    assertionResults: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
      duration?: number;
      failureMessages?: string[];
    }>;
  }>;
}

/**
 * Parse Jest JSON output
 */
async function parseJestResults(filePath: string): Promise<JestTestResult> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Extract tool name from test file path
 */
function extractToolName(filePath: string): string {
  const match = filePath.match(/\/([^/]+)\.test\.ts$/);
  if (match) {
    return match[1].replace(/-/g, "_");
  }
  
  // Check for integration tests
  if (filePath.includes("integration")) {
    const integrationMatch = filePath.match(/\/([^/]+)\.integration\.test\.ts$/);
    if (integrationMatch) {
      return `integration:${integrationMatch[1]}`;
    }
  }
  
  return "unknown";
}

/**
 * Generate test report from Jest results
 */
async function generateReport(jestResults: JestTestResult): Promise<TestReport> {
  const allTests: TestResult[] = [];
  const byTool: Record<string, { total: number; passed: number; failed: number; duration: number }> = {};

  // Process each test file
  for (const testFile of jestResults.testResults) {
    const tool = extractToolName(testFile.name);
    
    if (!byTool[tool]) {
      byTool[tool] = { total: 0, passed: 0, failed: 0, duration: 0 };
    }

    // Process each test
    for (const assertion of testFile.assertionResults) {
      const testName = [...assertion.ancestorTitles, assertion.title].join(" > ");
      const passed = assertion.status === "passed";
      const duration = assertion.duration || 0;
      const error = assertion.failureMessages?.join("\n");

      const testResult: TestResult = {
        tool,
        test: testName,
        passed,
        duration,
        error,
      };

      allTests.push(testResult);

      // Update tool stats
      byTool[tool].total++;
      byTool[tool].duration += duration;
      if (passed) {
        byTool[tool].passed++;
      } else {
        byTool[tool].failed++;
      }
    }
  }

  // Calculate summary
  const totalDuration = allTests.reduce((sum, t) => sum + t.duration, 0);
  const passRate = jestResults.numTotalTests > 0
    ? (jestResults.numPassedTests / jestResults.numTotalTests) * 100
    : 0;

  // Get failures and slow tests
  const failures = allTests.filter((t) => !t.passed);
  const slowTests = allTests
    .filter((t) => t.passed && t.duration > 1000) // Tests > 1 second
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  // Read package.json for version
  let version = "unknown";
  try {
    const pkgPath = resolve(__dirname, "../package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    version = pkg.version;
  } catch (e) {
    // Ignore
  }

  return {
    timestamp: new Date().toISOString(),
    version,
    summary: {
      total: jestResults.numTotalTests,
      passed: jestResults.numPassedTests,
      failed: jestResults.numFailedTests,
      skipped: jestResults.numPendingTests,
      passRate: Math.round(passRate * 100) / 100,
      totalDuration: Math.round(totalDuration),
    },
    byTool,
    failures,
    slowTests,
  };
}

/**
 * Format report as markdown
 */
function formatMarkdown(report: TestReport): string {
  let md = `# Test Report\n\n`;
  md += `**Generated**: ${new Date(report.timestamp).toLocaleString()}\n`;
  md += `**Version**: ${report.version}\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Tests | ${report.summary.total} |\n`;
  md += `| Passed | ✅ ${report.summary.passed} |\n`;
  md += `| Failed | ❌ ${report.summary.failed} |\n`;
  md += `| Skipped | ⏭️ ${report.summary.skipped} |\n`;
  md += `| Pass Rate | ${report.summary.passRate}% |\n`;
  md += `| Total Duration | ${(report.summary.totalDuration / 1000).toFixed(2)}s |\n`;
  md += `\n`;

  // By Tool
  md += `## Results by Tool/Module\n\n`;
  md += `| Tool | Total | Passed | Failed | Duration |\n`;
  md += `|------|-------|--------|--------|----------|\n`;

  const sortedTools = Object.entries(report.byTool).sort((a, b) => 
    b[1].total - a[1].total
  );

  for (const [tool, stats] of sortedTools) {
    const duration = (stats.duration / 1000).toFixed(2);
    const status = stats.failed === 0 ? "✅" : "❌";
    md += `| ${status} ${tool} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${duration}s |\n`;
  }
  md += `\n`;

  // Failures
  if (report.failures.length > 0) {
    md += `## ❌ Failures (${report.failures.length})\n\n`;
    for (const failure of report.failures) {
      md += `### ${failure.tool}: ${failure.test}\n\n`;
      if (failure.error) {
        md += `\`\`\`\n${failure.error}\n\`\`\`\n\n`;
      }
    }
  } else {
    md += `## ✅ No Failures\n\nAll tests passed!\n\n`;
  }

  // Slow tests
  if (report.slowTests.length > 0) {
    md += `## 🐌 Slow Tests (>1s)\n\n`;
    md += `| Test | Duration |\n`;
    md += `|------|----------|\n`;
    for (const test of report.slowTests) {
      const duration = (test.duration / 1000).toFixed(2);
      md += `| ${test.tool}: ${test.test} | ${duration}s |\n`;
    }
    md += `\n`;
  }

  return md;
}

/**
 * Format report as JSON
 */
function formatJSON(report: TestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format report as console output
 */
function formatConsole(report: TestReport): string {
  let output = `\n`;
  output += `╔════════════════════════════════════════╗\n`;
  output += `║        TEST REPORT SUMMARY             ║\n`;
  output += `╚════════════════════════════════════════╝\n\n`;

  output += `Version: ${report.version}\n`;
  output += `Timestamp: ${new Date(report.timestamp).toLocaleString()}\n\n`;

  // Summary
  const { summary } = report;
  const passIcon = summary.failed === 0 ? "✅" : "❌";
  output += `${passIcon} Tests: ${summary.passed}/${summary.total} passed (${summary.passRate}%)\n`;
  if (summary.skipped > 0) {
    output += `⏭️  Skipped: ${summary.skipped}\n`;
  }
  output += `⏱️  Duration: ${(summary.totalDuration / 1000).toFixed(2)}s\n\n`;

  // By tool
  output += `Results by Tool:\n`;
  output += `────────────────────────────────────────\n`;
  
  const sortedTools = Object.entries(report.byTool).sort((a, b) => 
    b[1].total - a[1].total
  );

  for (const [tool, stats] of sortedTools) {
    const status = stats.failed === 0 ? "✅" : "❌";
    const duration = (stats.duration / 1000).toFixed(2);
    output += `${status} ${tool.padEnd(30)} ${stats.passed}/${stats.total} (${duration}s)\n`;
  }

  // Failures
  if (report.failures.length > 0) {
    output += `\n❌ FAILURES:\n`;
    output += `────────────────────────────────────────\n`;
    for (const failure of report.failures) {
      output += `\n${failure.tool}: ${failure.test}\n`;
      if (failure.error) {
        // Show first line of error
        const firstLine = failure.error.split("\n")[0];
        output += `  ${firstLine.substring(0, 80)}...\n`;
      }
    }
  }

  // Slow tests
  if (report.slowTests.length > 0) {
    output += `\n🐌 SLOW TESTS (>1s):\n`;
    output += `────────────────────────────────────────\n`;
    for (const test of report.slowTests.slice(0, 5)) {
      const duration = (test.duration / 1000).toFixed(2);
      output += `  ${duration}s - ${test.tool}: ${test.test.substring(0, 60)}\n`;
    }
  }

  output += `\n`;
  return output;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("Usage: ts-node generate-test-report.ts <test-results.json> [--format=md|json|console]");
    console.error("\nFirst, generate test results:");
    console.error("  pnpm test --json --outputFile=test-results.json");
    console.error("\nThen generate report:");
    console.error("  ts-node scripts/generate-test-report.ts test-results.json");
    process.exit(1);
  }

  const inputFile = args[0];
  const formatArg = args.find((a) => a.startsWith("--format="));
  const format = formatArg ? formatArg.split("=")[1] : "console";

  try {
    // Parse Jest results
    const jestResults = await parseJestResults(inputFile);
    
    // Generate report
    const report = await generateReport(jestResults);

    // Format and output
    let output: string;
    let outputFile: string | undefined;

    switch (format) {
      case "md":
      case "markdown":
        output = formatMarkdown(report);
        outputFile = "test-report.md";
        break;
      case "json":
        output = formatJSON(report);
        outputFile = "test-report.json";
        break;
      case "console":
      default:
        output = formatConsole(report);
        break;
    }

    // Write to file or console
    if (outputFile) {
      await writeFile(outputFile, output, "utf-8");
      console.log(`Report written to: ${outputFile}`);
    } else {
      console.log(output);
    }

    // Exit with error code if tests failed
    process.exit(report.summary.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error("Error generating report:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
