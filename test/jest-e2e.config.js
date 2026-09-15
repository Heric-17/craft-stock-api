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
};
