/** Component tests only (*.test.tsx) via jest-expo + RNTL. Pure-logic *.test.ts
 *  stays on Vitest. The two never overlap (testMatch vs Vitest include). */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
