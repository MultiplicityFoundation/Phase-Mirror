import * as analyzeDissonanceTool from "../src/tools/analyze-dissonance.js";
import { createMockContext } from "./test-utils.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("analyze_dissonance integration tests", () => {
  let testDir: string;
  
  beforeAll(async () => {
    // Create test files in temp directory with proper structure
    testDir = join(tmpdir(), `mcp-integration-test-${Date.now()}-${process.pid}`);
    await mkdir(testDir, { recursive: true });
    
    // Create GitHub workflows directory structure
    const workflowsDir = join(testDir, ".github", "workflows");
    await mkdir(workflowsDir, { recursive: true });
    
    // Create a test workflow file in proper location
    await writeFile(
      join(workflowsDir, "test-workflow.yml"),
      `name: Test Workflow
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`,
      "utf-8"
    );

    // Create a test config file
    await writeFile(
      join(testDir, "test-config.json"),
      JSON.stringify({
        api: {
          endpoint: "https://api.example.com",
          timeout: 5000,
        },
      }, null, 2),
      "utf-8"
    );

    // Create a test source file
    await writeFile(
      join(testDir, "test-source.ts"),
      `export function validateInput(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return true;
}

export class DataProcessor {
  private cache: Map<string, any> = new Map();

  process(key: string, value: any): void {
    this.cache.set(key, value);
  }

  get(key: string): any {
    return this.cache.get(key);
  }
}
`,
      "utf-8"
    );
  });

  afterAll(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  it("executes analysis successfully with real orchestrator", async () => {
    const context = createMockContext({
      fpTableName: undefined, // Use NoOp store
      consentTableName: undefined,
    });

    const input = {
      files: [
        join(testDir, ".github", "workflows", "test-workflow.yml"),
        join(testDir, "test-config.json"),
        join(testDir, "test-source.ts"),
      ],
      context: "test-owner/test-repo",
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    
    const content = response.content[0];
    expect('text' in content).toBe(true);
    
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      
      expect(parsed.success).toBe(true);
      expect(parsed.analysis).toBeDefined();
      expect(parsed.analysis.filesAnalyzed).toBe(3);
      expect(parsed.analysis.files).toHaveLength(3);
      
      // Verify file types are detected correctly
      const workflow = parsed.analysis.files.find((f: any) => f.path.includes('workflow.yml'));
      const config = parsed.analysis.files.find((f: any) => f.path.includes('config.json'));
      const source = parsed.analysis.files.find((f: any) => f.path.includes('source.ts'));
      
      expect(workflow?.type).toBe('workflow');
      expect(config?.type).toBe('config');
      expect(source?.type).toBe('source');
      
      // Verify hashes are generated
      expect(workflow?.hash).toHaveLength(64); // SHA-256
      expect(config?.hash).toHaveLength(64);
      expect(source?.hash).toHaveLength(64);
      
      expect(parsed.analysis.summary).toBeDefined();
      expect(parsed.analysis.decision).toBeDefined();
      expect(parsed.analysis.report).toBeDefined();
    }
  }, 30000); // 30s timeout for real analysis

  it("handles missing files gracefully", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "nonexistent-file.ts")],
      context: "test-owner/test-repo",
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    // Should succeed but with 0 files analyzed (orchestrator logs warning)
    expect(response.isError).toBeUndefined();
    
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.analysis.filesAnalyzed).toBe(0);
    }
  });

  it("handles empty file list", async () => {
    const context = createMockContext();

    const input = {
      files: [],
      context: "test-owner/test-repo",
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    // Should succeed with 0 files
    expect(response.isError).toBeUndefined();
    
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.analysis.filesAnalyzed).toBe(0);
    }
  });

  it("processes different file types correctly", async () => {
    const context = createMockContext();

    const input = {
      files: [
        join(testDir, ".github", "workflows", "test-workflow.yml"),
        join(testDir, "test-config.json"),
        join(testDir, "test-source.ts"),
      ],
      context: "test-owner/test-repo",
      mode: "pull_request" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      
      expect(parsed.success).toBe(true);
      expect(parsed.analysis.mode).toBe('pull_request');
      
      // Check that files were categorized by type
      const fileTypes = parsed.analysis.files.map((f: any) => f.type);
      expect(fileTypes).toContain('workflow');
      expect(fileTypes).toContain('config');
      expect(fileTypes).toContain('source');
    }
  }, 30000);

  it("supports all analysis modes", async () => {
    const context = createMockContext();
    const testFile = join(testDir, "test-source.ts");

    const modes = ['issue', 'pull_request', 'merge_group', 'drift'] as const;

    for (const mode of modes) {
      const input = {
        files: [testFile],
        context: "test-owner/test-repo",
        mode,
      };

      const response = await analyzeDissonanceTool.execute(input, context);
      expect(response.isError).toBeUndefined();
      
      const content = response.content[0];
      if ('text' in content) {
        const parsed = JSON.parse(content.text);
        expect(parsed.success).toBe(true);
        // The mode in the output is the Oracle mode (issue gets mapped to pull_request internally)
        expect(parsed.analysis.mode).toBe(mode);
      }
    }
  }, 30000);

  it("includes ADR references in response", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, ".github", "workflows", "test-workflow.yml")],
      context: "test-owner/test-repo",
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);
    
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      
      if (parsed.success) {
        // ADR references field should exist (may be empty array)
        expect(parsed.analysis.adrReferences).toBeDefined();
        expect(Array.isArray(parsed.analysis.adrReferences)).toBe(true);
      }
    }
  });

  it("handles nested repository paths", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "test-source.ts")],
      context: "org/team/repo", // Nested path
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
    }
  });

  it("generates consistent hashes for same content", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "test-source.ts")],
      context: "test-owner/test-repo",
      mode: "issue" as const,
    };

    // Run analysis twice
    const response1 = await analyzeDissonanceTool.execute(input, context);
    const response2 = await analyzeDissonanceTool.execute(input, context);

    const content1 = response1.content[0];
    const content2 = response2.content[0];
    
    if ('text' in content1 && 'text' in content2) {
      const parsed1 = JSON.parse(content1.text);
      const parsed2 = JSON.parse(content2.text);
      
      // Hashes should be identical
      expect(parsed1.analysis.files[0].hash).toBe(parsed2.analysis.files[0].hash);
    }
  });
});
