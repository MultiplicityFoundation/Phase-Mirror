/**
 * Integration test for nonce CLI commands
 * 
 * This test demonstrates the complete workflow of nonce management via CLI.
 */

import { promises as fs } from 'node:fs';
import { nonceCommand } from '../commands/nonce.js';
import { createLocalTrustAdapters } from '@mirror-dissonance/core';
import { OrganizationIdentity } from '@mirror-dissonance/core';

describe('Nonce CLI Commands', () => {
  const testDataDir = '.test-data-cli-nonce';
  
  beforeEach(async () => {
    // Set test data directory
    process.env.PHASE_MIRROR_DATA_DIR = testDataDir;
    
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
    
    // Setup test identity
    const adapters = createLocalTrustAdapters(testDataDir);
    const identity: OrganizationIdentity = {
      orgId: 'test-org',
      publicKey: 'test-pubkey',
      verificationMethod: 'github_org',
      verifiedAt: new Date(),
      uniqueNonce: '',
      githubOrgId: 12345,
    };
    await adapters.identityStore.storeIdentity(identity);
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.PHASE_MIRROR_DATA_DIR;
  });

  describe('generate', () => {
    it('should generate and bind a new nonce', async () => {
      // Capture console output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await nonceCommand.generate({
        orgId: 'test-org',
        publicKey: 'test-pubkey',
      });
      
      // Verify output contains nonce
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('Organization ID: test-org');
      expect(output).toContain('Public Key: test-pubkey');
      
      consoleSpy.mockRestore();
    });

    it('should reject generating for non-existent org', async () => {
      await expect(
        nonceCommand.generate({
          orgId: 'non-existent',
          publicKey: 'test-pubkey',
        })
      ).rejects.toThrow('not found or not verified');
    });
  });

  describe('validate', () => {
    it('should validate a valid nonce', async () => {
      // First generate a nonce
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await nonceCommand.generate({
        orgId: 'test-org',
        publicKey: 'test-pubkey',
      });
      
      // Extract nonce from output
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      const nonceMatch = output.match(/Nonce: ([a-f0-9]{64})/);
      expect(nonceMatch).not.toBeNull();
      const nonce = nonceMatch![1];
      
      consoleSpy.mockClear();
      
      // Validate the nonce
      await nonceCommand.validate({
        orgId: 'test-org',
        nonce: nonce,
        verbose: true,
      });
      
      const validateOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(validateOutput).toContain('valid and properly bound');
      
      consoleSpy.mockRestore();
    });

    it('should reject invalid nonce', async () => {
      await expect(
        nonceCommand.validate({
          orgId: 'test-org',
          nonce: 'invalid-nonce',
        })
      ).rejects.toThrow('validation failed');
    });
  });

  describe('workflow', () => {
    it('should support complete workflow: generate -> validate -> rotate', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // 1. Generate
      await nonceCommand.generate({
        orgId: 'test-org',
        publicKey: 'test-pubkey',
      });
      
      const generateOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      const nonceMatch = generateOutput.match(/Nonce: ([a-f0-9]{64})/);
      const nonce = nonceMatch![1];
      
      consoleSpy.mockClear();
      
      // 2. Validate
      await nonceCommand.validate({
        orgId: 'test-org',
        nonce: nonce,
      });
      
      const validateOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(validateOutput).toContain('valid');
      
      consoleSpy.mockClear();
      
      // 3. Rotate
      await nonceCommand.rotate({
        orgId: 'test-org',
        publicKey: 'new-pubkey',
        reason: 'Scheduled rotation',
      });
      
      const rotateOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(rotateOutput).toContain('rotated');
      
      consoleSpy.mockRestore();
    });
  });

  describe('show', () => {
    it('should show nonce binding details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await nonceCommand.generate({
        orgId: 'test-org',
        publicKey: 'test-pubkey',
      });
      
      consoleSpy.mockClear();
      
      await nonceCommand.show({
        orgId: 'test-org',
      });
      
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('Org ID: test-org');
      expect(output).toContain('Public Key: test-pubkey');
      expect(output).toContain('Usage Count');
      
      consoleSpy.mockRestore();
    });

    it('should show revoked status', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await nonceCommand.generate({
        orgId: 'test-org',
        publicKey: 'test-pubkey',
      });
      
      await nonceCommand.revoke({
        orgId: 'test-org',
        reason: 'Test revocation',
      });
      
      consoleSpy.mockClear();
      
      await nonceCommand.show({
        orgId: 'test-org',
      });
      
      const output = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(output).toContain('REVOKED');
      expect(output).toContain('Test revocation');
      
      consoleSpy.mockRestore();
    });
  });
});
