import type { Config } from 'jest';

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/routes/**/*.test.ts',
        '<rootDir>/tests/services/**/*.test.ts',
        '<rootDir>/tests/middleware/**/*.test.ts',
        '<rootDir>/tests/helpers/**/*.test.ts',
      ],
    },
    {
      displayName: 'repo',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/repos/**/*.test.ts'],
      globalSetup: '<rootDir>/tests/repos/globalSetup.ts',
    },
  ],
};

export default config;
