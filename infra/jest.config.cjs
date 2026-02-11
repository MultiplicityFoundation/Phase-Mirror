/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lambda'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@phase-mirror/pro$': '<rootDir>/../proprietary/src',
    '^@phase-mirror/pro/(.*)$': '<rootDir>/../proprietary/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  collectCoverageFrom: [
    'lambda/**/*.ts',
    '!lambda/**/*.d.ts',
    '!lambda/**/__tests__/**',
  ],
};
