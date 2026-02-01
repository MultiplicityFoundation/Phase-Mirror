/**
 * Tests for Analysis Orchestrator
 */
import { AnalysisOrchestrator, createOrchestrator } from '../orchestrator.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AnalysisOrchestrator', () => {
  let testDir: string;
  let testFiles: string[];

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `mirror-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create test files
    testFiles = [
      join(testDir, 'source.ts'),
      join(testDir, 'config.json'),
      join(testDir, '.github', 'workflows', 'ci.yml'),
    ];

    // Ensure .github/workflows directory exists
    await mkdir(join(testDir, '.github', 'workflows'), { recursive: true });

    // Write test files
    await writeFile(testFiles[0], 'export function test() { return true; }');
    await writeFile(testFiles[1], '{ "name": "test", "version": "1.0.0" }');
    await writeFile(testFiles[2], 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create orchestrator with default config', () => {
      const orchestrator = new AnalysisOrchestrator();
      expect(orchestrator).toBeInstanceOf(AnalysisOrchestrator);
      expect(orchestrator.isInitialized()).toBe(false);
    });

    it('should create orchestrator with custom config', () => {
      const orchestrator = new AnalysisOrchestrator({
        awsRegion: 'us-west-2',
        adrPath: './docs/adr',
      });
      expect(orchestrator).toBeInstanceOf(AnalysisOrchestrator);
    });

    it('should initialize successfully', async () => {
      const orchestrator = new AnalysisOrchestrator();
      await orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      const orchestrator = new AnalysisOrchestrator();
      await orchestrator.initialize();
      await orchestrator.initialize(); // Second call should be no-op
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('should create and initialize via factory function', async () => {
      const orchestrator = await createOrchestrator();
      expect(orchestrator.isInitialized()).toBe(true);
    });
  });

  describe('file artifact processing', () => {
    it('should throw error if analyze called before initialization', async () => {
      const orchestrator = new AnalysisOrchestrator();
      
      await expect(
        orchestrator.analyze({
          files: testFiles,
          repository: {
            owner: 'test',
            name: 'repo',
          },
          mode: 'pull_request',
        })
      ).rejects.toThrow('not initialized');
    });

    it('should build artifacts from file paths', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: testFiles,
        repository: {
          owner: 'test',
          name: 'repo',
          branch: 'main',
        },
        mode: 'pull_request',
        commitSha: 'abc123',
      });

      expect(result.artifacts).toHaveLength(3);
      
      // Check source file
      const sourceArtifact = result.artifacts.find(a => a.path.endsWith('source.ts'));
      expect(sourceArtifact).toBeDefined();
      expect(sourceArtifact?.type).toBe('source');
      expect(sourceArtifact?.content).toContain('export function test');
      expect(sourceArtifact?.hash).toHaveLength(64); // SHA-256 hex is 64 chars

      // Check config file
      const configArtifact = result.artifacts.find(a => a.path.endsWith('config.json'));
      expect(configArtifact).toBeDefined();
      expect(configArtifact?.type).toBe('config');
      expect(configArtifact?.content).toContain('"name"');

      // Check workflow file
      const workflowArtifact = result.artifacts.find(a => a.path.includes('workflows'));
      expect(workflowArtifact).toBeDefined();
      expect(workflowArtifact?.type).toBe('workflow');
      expect(workflowArtifact?.content).toContain('runs-on');
    });

    it('should handle missing files gracefully', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: [
          ...testFiles,
          join(testDir, 'nonexistent.txt'), // This file doesn't exist
        ],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      // Should still process the valid files
      expect(result.artifacts.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect file types correctly', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: testFiles,
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      const types = result.artifacts.map(a => a.type);
      expect(types).toContain('source');
      expect(types).toContain('config');
      expect(types).toContain('workflow');
    });
  });

  describe('analysis execution', () => {
    it('should execute Oracle analysis', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: testFiles,
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      // Check that Oracle output is present
      expect(result.machineDecision).toBeDefined();
      expect(result.machineDecision.outcome).toMatch(/allow|warn|block/);
      expect(result.violations).toBeInstanceOf(Array);
      expect(result.summary).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.report.rulesChecked).toBeGreaterThan(0);
    });

    it('should pass through analysis mode correctly', async () => {
      const orchestrator = await createOrchestrator();
      
      const modes = ['pull_request', 'merge_group', 'drift', 'calibration'] as const;
      
      for (const mode of modes) {
        const result = await orchestrator.analyze({
          files: [testFiles[0]], // Just one file for speed
          repository: {
            owner: 'test',
            name: 'repo',
          },
          mode,
        });

        expect(result.machineDecision.metadata.mode).toBe(mode);
      }
    });

    it('should include repository context in analysis', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'TestOrg',
          name: 'TestRepo',
          branch: 'feature-branch',
        },
        mode: 'pull_request',
        commitSha: 'abc123def456',
        prNumber: 42,
        author: 'testuser',
      });

      expect(result).toBeDefined();
      // Oracle receives context as part of OracleInput
    });

    it('should handle strict and dry-run modes', async () => {
      const orchestrator = await createOrchestrator();
      
      const strictResult = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
        strict: true,
      });

      expect(strictResult).toBeDefined();

      const dryRunResult = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
        dryRun: true,
      });

      expect(dryRunResult).toBeDefined();
    });
  });

  describe('ADR extraction', () => {
    it('should include empty ADR references by default', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      // ADR references should not be included if adrPath not configured
      expect(result.adrReferences).toBeUndefined();
    });

    it('should attempt ADR extraction when configured', async () => {
      const orchestrator = await createOrchestrator({
        adrPath: join(testDir, 'adr'),
      });
      
      const result = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      // ADR extraction is currently a placeholder, should return empty array
      expect(result.adrReferences).toEqual([]);
    });
  });

  describe('content hashing', () => {
    it('should generate consistent hashes for same content', async () => {
      const orchestrator = await createOrchestrator();
      
      const result1 = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      const result2 = await orchestrator.analyze({
        files: [testFiles[0]],
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      expect(result1.artifacts[0].hash).toBe(result2.artifacts[0].hash);
    });

    it('should generate different hashes for different content', async () => {
      const orchestrator = await createOrchestrator();
      
      const result = await orchestrator.analyze({
        files: testFiles,
        repository: {
          owner: 'test',
          name: 'repo',
        },
        mode: 'pull_request',
      });

      const hashes = result.artifacts.map(a => a.hash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length); // All hashes should be unique
    });
  });
});
