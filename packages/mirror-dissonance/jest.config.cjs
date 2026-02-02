/** @type {import('jest').Config} */
module.exports = {
  displayName: 'mirror-dissonance',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root directory for this package
  rootDir: '.',
  
  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/__tests__/**/*.bench.ts'
  ],
  
  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/index.ts',      // Barrel exports
    '!src/types/**',         // Type-only files
    '!src/**/__mocks__/**'   // Mock files
  ],
  
  // Package-specific coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    
    // Higher thresholds for critical paths
    './src/l0-invariants/**/*.ts': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    },
    
    './src/redaction/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    
    './src/nonce/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    
    // Relaxed for adapters (integration-heavy)
    './src/fp-store/dynamodb-store.ts': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Setup files
  // setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  
  // Module name mapper for internal imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Transform
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json'
    }]
  },
  
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage'
};
