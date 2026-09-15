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
};
