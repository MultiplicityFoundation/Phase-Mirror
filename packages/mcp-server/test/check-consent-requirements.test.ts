/**
 * Tests for check_consent_requirements MCP tool
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as checkConsentRequirements from '../src/tools/check-consent-requirements';
import { ToolContext } from '../src/types';

describe('check_consent_requirements tool', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = {
      config: {
        awsRegion: 'us-east-1',
        logLevel: 'info' as const,
      },
      requestId: 'test-request-id',
      timestamp: new Date(),
    };
  });

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(checkConsentRequirements.toolDefinition.name).toBe('check_consent_requirements');
    });

    it('should have description', () => {
      expect(checkConsentRequirements.toolDefinition.description).toBeTruthy();
      expect(checkConsentRequirements.toolDefinition.description).toContain('ADR-004');
      expect(checkConsentRequirements.toolDefinition.description).toContain('GDPR');
    });

    it('should have valid input schema', () => {
      const schema = checkConsentRequirements.toolDefinition.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.required).toContain('orgId');
      expect(schema.required).toContain('operation');
    });
  });

  describe('check_single_resource operation', () => {
    it('should successfully check a single resource', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_single_resource',
        resource: 'fp_patterns',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.resource).toBe('fp_patterns');
      expect(response.granted).toBe(true);
    });

    it('should return error if resource parameter is missing', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_single_resource',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.code).toBe('VALIDATION_ERROR');
    });

    it('should validate resource is a valid consent resource', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_single_resource',
        resource: 'invalid_resource',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('check_multiple_resources operation', () => {
    it('should check multiple resources successfully', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_multiple_resources',
        resources: ['fp_patterns', 'fp_metrics'],
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.allGranted).toBe(true);
      expect(response.results).toBeDefined();
      expect(response.results.fp_patterns).toBeDefined();
      expect(response.results.fp_metrics).toBeDefined();
    });

    it('should return error if resources parameter is missing', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_multiple_resources',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.code).toBe('VALIDATION_ERROR');
    });

    it('should handle empty resources array', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_multiple_resources',
        resources: [],
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('get_consent_summary operation', () => {
    it('should return consent summary for organization', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'get_consent_summary',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.summary).toBeDefined();
      expect(response.summary.orgId).toBe('test-org');
      expect(response.summary.resources).toBeDefined();
      expect(response.policyVersion).toBeDefined();
    });

    it('should include consent version in summary', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'get_consent_summary',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.summary.consentVersion).toBe('1.2');
    });
  });

  describe('get_required_consent operation', () => {
    it('should return required resources for a tool operation', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'get_required_consent',
        tool: 'query_fp_store',
        toolOperation: 'fp_rate',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.requiredResources).toBeDefined();
      expect(Array.isArray(response.requiredResources)).toBe(true);
      expect(response.tool).toBe('query_fp_store');
      expect(response.operation).toBe('fp_rate');
    });

    it('should return error if tool parameter is missing', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'get_required_consent',
        toolOperation: 'fp_rate',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.code).toBe('VALIDATION_ERROR');
    });

    it('should return empty array for unknown tool operations', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'get_required_consent',
        tool: 'unknown_tool',
        toolOperation: 'unknown_operation',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.requiredResources).toEqual([]);
    });
  });

  describe('input validation', () => {
    it('should validate orgId is required', async () => {
      const args = {
        operation: 'check_single_resource',
        resource: 'fp_patterns',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe('VALIDATION_ERROR');
    });

    it('should validate operation is required', async () => {
      const args = {
        orgId: 'test-org',
        resource: 'fp_patterns',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe('VALIDATION_ERROR');
    });

    it('should validate operation is one of allowed values', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'invalid_operation',
      };

      const result = await checkConsentRequirements.execute(args, context);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const args = null;

      const result = await checkConsentRequirements.execute(args, context);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe('consent URLs', () => {
    it('should not include consent URLs when consent is granted', async () => {
      const args = {
        orgId: 'test-org',
        operation: 'check_single_resource',
        resource: 'fp_patterns',
      };

      const result = await checkConsentRequirements.execute(args, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.consentUrl).toBeUndefined();
      expect(response.learnMore).toBeUndefined();
    });
  });
});
