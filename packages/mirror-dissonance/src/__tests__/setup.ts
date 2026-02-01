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
        createMockSSMClient: () => any;
        createMockDynamoClient: () => any;
      };
    }
  }
}

// Mock AWS SDK clients (prevents actual AWS calls)
jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  GetParameterCommand: jest.fn(),
  PutParameterCommand: jest.fn(),
  DeleteParameterCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutItemCommand: jest.fn(),
  GetItemCommand: jest.fn(),
  QueryCommand: jest.fn(),
  UpdateItemCommand: jest.fn(),
  DeleteItemCommand: jest.fn()
}));

// Global test utilities
global.testUtils = {
  createMockSSMClient: () => ({
    send: jest.fn()
  }),
  
  createMockDynamoClient: () => ({
    send: jest.fn()
  })
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
