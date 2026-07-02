/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/test/mock-expo-server-sdk.ts'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@finby/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
