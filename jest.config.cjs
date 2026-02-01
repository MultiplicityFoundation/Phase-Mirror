/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Root configuration - delegates to package-specific configs
  projects: [
    '<rootDir>/packages/mirror-dissonance',
    '<rootDir>/packages/cli',
    '<rootDir>/packages/mcp-server'
  ],
  
  // Global coverage thresholds (enforced across all packages)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Collect coverage from all packages
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/__tests__/**',
    '!packages/*/src/**/*.test.{ts,tsx}',
    '!packages/*/src/**/*.spec.{ts,tsx}',
    '!packages/*/src/**/index.ts'  // Exclude barrel exports
  ],
  
  // Coverage reporters
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Summary in console
    'html',          // HTML report in coverage/
    'lcov',          // For CI tools
    'json-summary'   // Machine-readable summary
  ],
  
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',
  
  // Global setup/teardown
  // globalSetup: '<rootDir>/test-setup/global-setup.ts',
  // globalTeardown: '<rootDir>/test-setup/global-teardown.ts',
  
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}'
  ],
  
  // Module path aliases (matches tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/packages/mirror-dissonance/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Transform TypeScript
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2020',
        target: 'ES2020',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  
  // Verbose output
  verbose: true,
  
  // Bail after first failure (for CI)
  // bail: 1,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.next/'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
