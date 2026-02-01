import { MCPServerConfigSchema } from '../src/types/index.js';

describe('MCPServerConfig', () => {
  it('should validate a valid config', () => {
    const validConfig = {
      awsRegion: 'us-east-1',
      logLevel: 'info' as const,
    };
    
    const result = MCPServerConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should accept optional fields', () => {
    const configWithOptionals = {
      awsRegion: 'us-west-2',
      fpTableName: 'test-fp-table',
      consentTableName: 'test-consent-table',
      nonceParameterName: '/test/nonce',
      logLevel: 'debug' as const,
    };
    
    const result = MCPServerConfigSchema.safeParse(configWithOptionals);
    expect(result.success).toBe(true);
  });

  it('should reject invalid log level', () => {
    const invalidConfig = {
      awsRegion: 'us-east-1',
      logLevel: 'invalid',
    };
    
    const result = MCPServerConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const invalidConfig = {
      logLevel: 'info',
    };
    
    const result = MCPServerConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});
