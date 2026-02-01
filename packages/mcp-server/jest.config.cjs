/** @type {import('jest').Config} */
module.exports = {
  displayName: 'mcp-server',
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  rootDir: '.',
  
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/test/**/*.test.ts'
  ],
  
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/tools/index.ts'  // Tool registry - tested indirectly
  ],
  
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    },
    
    // Higher threshold for tool implementations
    './src/tools/**/*.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
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
  
  coverageDirectory: '<rootDir>/coverage'
};
