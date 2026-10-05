/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!shared/infrastructure/prisma/generated/**',
  ],
  coverageDirectory: '../coverage/unit',
  // `domain/` and `application/` sit near 95-100% in this project (plain unit
  // tests, fakes — never a Prisma mock, per CLAUDE.md §11); `infrastructure/`
  // and `presentation/` sit far lower here on purpose, because that code is
  // exercised by the e2e suite against real Postgres instead (see
  // test/jest-e2e.config.js's own threshold). A per-layer glob threshold
  // looks like the right tool for that split, but Jest enforces a glob
  // threshold per matching FILE, not as a layer average — it fails on
  // legitimate near-zero-logic files (DI tokens, port interfaces) and
  // silently subtracts the matched files from `global`. So this is a single
  // `global` floor, set just under the real baseline, as a regression
  // tripwire rather than a layer-by-layer gate.
  coverageThreshold: {
    global: { statements: 69, branches: 63, functions: 68, lines: 70 },
  },
};
