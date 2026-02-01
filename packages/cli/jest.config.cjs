/** @type {import('jest').Config} */
module.exports = {
  displayName: 'cli',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  rootDir: '.',
  
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/index.ts'  // Entry point - tested via e2e
  ],
  
  coverageThreshold: {
    global: {
      branches: 70,   // Lower for CLI (heavy I/O)
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2020',
        target: 'ES2020',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  
  coverageDirectory: '<rootDir>/coverage'
};
