/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  clearMocks: true,
  testTimeout: 30000,
  // Starts and migrates a throwaway Postgres via Testcontainers before any
  // spec runs, and stops it after the whole suite finishes — see
  // test/support/global-setup.ts for why DATABASE_URL is set there rather
  // than through a setupFiles entry.
  globalSetup: '<rootDir>/test/support/global-setup.ts',
  globalTeardown: '<rootDir>/test/support/global-teardown.ts',
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/infrastructure/**/*.ts',
    'src/**/presentation/**/*.ts',
    '!src/shared/infrastructure/prisma/generated/**',
  ],
  coverageDirectory: 'coverage/e2e',
  // Measured on a real Testcontainers run (12 suites / 96 tests,
  // infrastructure/+presentation/ only — see collectCoverageFrom above):
  // statements 47.98%, branches 48.27%, functions 30.56%, lines 47.04%. Set
  // just under that as a regression tripwire, same reasoning as the unit
  // config's threshold.
  coverageThreshold: {
    global: { statements: 46, branches: 46, functions: 29, lines: 45 },
  },
};
