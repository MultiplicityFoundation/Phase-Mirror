#!/usr/bin/env node

import { spawn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * MCP Inspector Automated Test Runner
 * Executes test cases against MCP server via stdin/stdout
 */
class MCPInspectorTestRunner {
  constructor() {
    this.results = [];
    this.serverProcess = null;
  }

  async loadTestCases() {
    const testCasesPath = resolve(__dirname, "../test-cases/inspector-test-cases.json");
    const content = await readFile(testCasesPath, "utf-8");
    return JSON.parse(content);
  }

  async startServer() {
    const serverPath = resolve(__dirname, "../dist/index.js");
    console.log("Starting MCP server:", serverPath);

    this.serverProcess = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("✓ Server started\n");
  }

  async executeToolCall(toolName, args) {
    return new Promise((resolve, reject) => {
      const requestId = Math.floor(Math.random() * 1000000);
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        id: requestId,
        params: {
          name: toolName,
          arguments: args,
        },
      };

      let responseData = "";

      const timeout = setTimeout(() => {
        reject(new Error("Tool call timeout (10s)"));
      }, 10000);

      const handleData = (chunk) => {
        responseData += chunk.toString();
        
        // Try to parse complete JSON response
        try {
          const lines = responseData.split("\n").filter(l => l.trim());
          for (const line of lines) {
            const parsed = JSON.parse(line);
            if (parsed.id === requestId) {
              clearTimeout(timeout);
              this.serverProcess.stdout.off("data", handleData);
              resolve(parsed);
              return;
            }
          }
        } catch (e) {
          // Not complete JSON yet, continue accumulating
        }
      };

      this.serverProcess.stdout.on("data", handleData);
      this.serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  async runTest(toolName, testName, testCase) {
    console.log(`Running: ${toolName} / ${testName}`);
    console.log(`  Description: ${testCase.description}`);

    const startTime = Date.now();
    
    try {
      const response = await this.executeToolCall(toolName, testCase.input);
      const duration = Date.now() - startTime;

      // Parse result content
      const resultContent = JSON.parse(response.result.content[0].text);

      // Validate against expected
      const validations = this.validateExpectations(resultContent, testCase.expected);
      const passed = validations.every(v => v.passed);

      const result = {
        tool: toolName,
        test: testName,
        description: testCase.description,
        passed,
        duration,
        validations,
        response: resultContent,
      };

      this.results.push(result);

      if (passed) {
        console.log(`  ✓ PASSED (${duration}ms)\n`);
      } else {
        console.log(`  ✗ FAILED (${duration}ms)`);
        for (const v of validations.filter(v => !v.passed)) {
          console.log(`    - ${v.message}`);
        }
        console.log("");
      }

      return result;
    } catch (error) {
      console.log(`  ✗ ERROR: ${error.message}\n`);
      const result = {
        tool: toolName,
        test: testName,
        description: testCase.description,
        passed: false,
        duration: Date.now() - startTime,
        error: error.message,
      };
      this.results.push(result);
      return result;
    }
  }

  validateExpectations(actual, expected) {
    const validations = [];

    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = this.getNestedValue(actual, key);
      
      if (typeof expectedValue === "object" && expectedValue !== null) {
        // Type check
        const typeMatch = typeof actualValue === "object";
        validations.push({
          passed: typeMatch,
          field: key,
          expected: "object",
          actual: typeof actualValue,
          message: typeMatch ? `${key} is object` : `${key}: expected object, got ${typeof actualValue}`,
        });
      } else {
        // Value check
        const match = actualValue === expectedValue;
        validations.push({
          passed: match,
          field: key,
          expected: expectedValue,
          actual: actualValue,
          message: match ? `${key} matches` : `${key}: expected ${expectedValue}, got ${actualValue}`,
        });
      }
    }

    return validations;
  }

  getNestedValue(obj, path) {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (part.includes("[")) {
        // Array access: failures[0].invariantId
        const [arrayPart, indexPart] = part.split("[");
        const index = parseInt(indexPart.replace(/\]/g, ""), 10);
        current = current[arrayPart]?.[index];
      } else {
        current = current?.[part];
      }
      if (current === undefined) return undefined;
    }
    return current;
  }

  async runAllTests() {
    const testCases = await this.loadTestCases();

    console.log("═══════════════════════════════════════");
    console.log("  MCP Inspector Automated Test Suite");
    console.log("═══════════════════════════════════════\n");

    for (const [toolName, tests] of Object.entries(testCases)) {
      console.log(`\n▶ Testing tool: ${toolName}`);
      console.log("─".repeat(40) + "\n");

      for (const [testName, testCase] of Object.entries(tests)) {
        await this.runTest(toolName, testName, testCase);
      }
    }

    this.printSummary();
    await this.saveResults();
  }

  printSummary() {
    console.log("\n═══════════════════════════════════════");
    console.log("  Test Summary");
    console.log("═══════════════════════════════════════\n");

    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`Total Tests:  ${total}`);
    console.log(`Passed:       ${passed} (${passRate}%)`);
    console.log(`Failed:       ${failed}`);
    console.log("");

    // Per-tool summary
    const byTool = {};
    for (const result of this.results) {
      if (!byTool[result.tool]) {
        byTool[result.tool] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        byTool[result.tool].passed++;
      } else {
        byTool[result.tool].failed++;
      }
    }

    console.log("Per-Tool Results:");
    for (const [tool, stats] of Object.entries(byTool)) {
      const toolTotal = stats.passed + stats.failed;
      const toolPassRate = ((stats.passed / toolTotal) * 100).toFixed(1);
      console.log(`  ${tool}: ${stats.passed}/${toolTotal} (${toolPassRate}%)`);
    }

    console.log("");
  }

  async saveResults() {
    const outputPath = resolve(__dirname, "../test-results/inspector-automated-results.json");
    await writeFile(outputPath, JSON.stringify(this.results, null, 2), "utf-8");
    console.log(`Results saved to: ${outputPath}\n`);
  }

  async cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log("Server stopped");
    }
  }
}

// Run tests
(async () => {
  const runner = new MCPInspectorTestRunner();
  
  try {
    await runner.startServer();
    await runner.runAllTests();
  } catch (error) {
    console.error("Test runner error:", error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
})();
