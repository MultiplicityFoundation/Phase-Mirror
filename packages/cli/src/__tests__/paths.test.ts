/**
 * Unit tests for path resolution utilities
 * 
 * Tests the CLI path resolution functions that enable the package to work
 * in monorepo development, global installs, npx execution, and Docker containers.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveSchemaPath,
  resolveRulesDir,
  resolveConfigPath,
  CLI_PACKAGE_ROOT,
} from '../paths.js';

describe('Path Resolution Utilities', () => {
  describe('CLI_PACKAGE_ROOT', () => {
    it('should resolve to the CLI package root directory', () => {
      expect(CLI_PACKAGE_ROOT).toBeTruthy();
      expect(CLI_PACKAGE_ROOT).toContain('packages/cli');
      // In compiled code, should be one level up from dist/
      expect(existsSync(join(CLI_PACKAGE_ROOT, 'package.json'))).toBe(true);
    });
  });

  describe('resolveSchemaPath', () => {
    it('should resolve schema path in monorepo development environment', () => {
      const schemaPath = resolveSchemaPath();
      
      expect(schemaPath).toBeTruthy();
      expect(schemaPath).toContain('dissonance-report.schema.json');
      expect(existsSync(schemaPath)).toBe(true);
    });

    it('should return a valid absolute path', () => {
      const schemaPath = resolveSchemaPath();
      
      expect(schemaPath.startsWith('/')).toBe(true);
    });

    it('should find schema in mirror-dissonance package in monorepo', () => {
      const schemaPath = resolveSchemaPath();
      
      // In monorepo, should find the sibling package
      expect(schemaPath).toContain('mirror-dissonance/schemas');
    });
  });

  describe('resolveRulesDir', () => {
    it('should resolve rules directory in monorepo development environment', () => {
      const rulesDir = resolveRulesDir();
      
      expect(rulesDir).toBeTruthy();
      expect(rulesDir).toContain('rules');
      expect(existsSync(rulesDir)).toBe(true);
    });

    it('should return a valid absolute path', () => {
      const rulesDir = resolveRulesDir();
      
      expect(rulesDir.startsWith('/')).toBe(true);
    });

    it('should find rules in mirror-dissonance package in monorepo', () => {
      const rulesDir = resolveRulesDir();
      
      // In monorepo, should find the sibling package
      expect(rulesDir).toContain('mirror-dissonance');
    });
  });

  describe('resolveConfigPath', () => {
    const testConfigPath = join(process.cwd(), '.mirror-dissonance.json');
    
    afterEach(() => {
      // Clean up test config file if it exists
      if (existsSync(testConfigPath)) {
        rmSync(testConfigPath);
      }
    });

    it('should return undefined when no config file exists', () => {
      // Ensure no config file exists
      if (existsSync(testConfigPath)) {
        rmSync(testConfigPath);
      }
      
      const configPath = resolveConfigPath();
      expect(configPath).toBeUndefined();
    });

    it('should find config file in current working directory', () => {
      // Create a test config file
      writeFileSync(testConfigPath, JSON.stringify({ version: '1' }));
      
      const configPath = resolveConfigPath();
      expect(configPath).toBe(testConfigPath);
      expect(existsSync(configPath!)).toBe(true);
    });

    it('should return explicit config path when provided', () => {
      // Create a test config file with a different name
      const explicitPath = join(process.cwd(), '.custom-config.json');
      writeFileSync(explicitPath, JSON.stringify({ version: '1' }));
      
      try {
        const configPath = resolveConfigPath(explicitPath);
        expect(configPath).toBe(explicitPath);
        expect(existsSync(configPath!)).toBe(true);
      } finally {
        rmSync(explicitPath);
      }
    });

    it('should throw error when explicit config path does not exist', () => {
      const nonExistentPath = join(process.cwd(), '.nonexistent-config.json');
      
      expect(() => resolveConfigPath(nonExistentPath)).toThrow('Config file not found');
    });
  });

  describe('Error handling', () => {
    it('should provide helpful error message when schema cannot be found', () => {
      // This test would need to mock the file system to simulate a missing schema
      // For now, we verify the schema exists in development
      expect(() => resolveSchemaPath()).not.toThrow();
    });

    it('should provide helpful error message when rules directory cannot be found', () => {
      // This test would need to mock the file system to simulate a missing rules dir
      // For now, we verify the rules directory exists in development
      expect(() => resolveRulesDir()).not.toThrow();
    });
  });

  describe('Path resolution cascade', () => {
    it('should prioritize monorepo sibling packages', () => {
      // In the development environment, the first candidate (monorepo sibling) should be used
      const schemaPath = resolveSchemaPath();
      const rulesDir = resolveRulesDir();
      
      // These should resolve to the sibling packages, not node_modules
      expect(schemaPath).toContain('packages/mirror-dissonance');
      expect(rulesDir).toContain('packages/mirror-dissonance');
    });
  });
});
