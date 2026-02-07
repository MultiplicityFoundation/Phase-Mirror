/**
 * Global test setup for mirror-dissonance package
 */

import { jest } from '@jest/globals';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console methods to reduce noise (optional)
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockFetcher: () => jest.Mock;
      };
    }
  }
}

// AWS SDK mocks removed — production code no longer imports cloud SDKs directly.
// Tests for adapter-layer code live in src/adapters/__tests__/.

// Global test utilities
(global as any).testUtils = {
  createMockFetcher: () => jest.fn<() => Promise<string>>().mockResolvedValue('a'.repeat(64)),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
