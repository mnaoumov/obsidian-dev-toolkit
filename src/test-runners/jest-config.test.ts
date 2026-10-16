import {
  describe,
  expect,
  it
} from 'vitest';

import {
  defineObsidianPluginJestConfig,
  OBSIDIAN_JEST_INTEGRATION_TEST_PATH_IGNORE_PATTERN,
  OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV
} from './jest-config.ts';

describe('defineObsidianPluginJestConfig', () => {
  it('should add the Obsidian defaults to the generic configuration', () => {
    const config = defineObsidianPluginJestConfig({ esm: true });

    expect(config.testEnvironment).toBe('jsdom');
    expect(config.moduleNameMapper).toMatchObject({ '^obsidian$': 'obsidian-test-mocks/obsidian' });
    expect(config.setupFilesAfterEnv).toEqual([...OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV]);
    expect(config.testPathIgnorePatterns).toEqual(['/node_modules/', '/dist/', OBSIDIAN_JEST_INTEGRATION_TEST_PATH_IGNORE_PATTERN]);
    // The generic half is still there.
    expect(config.extensionsToTreatAsEsm).toEqual(['.ts', '.tsx']);
    expect(config.roots).toEqual(['<rootDir>/src']);
  });

  it('should merge the mapper and append the list options', () => {
    const config = defineObsidianPluginJestConfig({
      moduleNameMapper: { '\\.css$': '<rootDir>/stub.ts' },
      setupFilesAfterEnv: ['<rootDir>/own-setup.ts'],
      testPathIgnorePatterns: ['/fixtures/']
    });

    expect(config.moduleNameMapper).toMatchObject({
      '\\.css$': '<rootDir>/stub.ts',
      '^obsidian$': 'obsidian-test-mocks/obsidian'
    });
    expect(config.setupFilesAfterEnv).toEqual([...OBSIDIAN_JEST_SETUP_FILES_AFTER_ENV, '<rootDir>/own-setup.ts']);
    expect(config.testPathIgnorePatterns?.at(-1)).toBe('/fixtures/');
  });

  it('should let an option replace the environment', () => {
    expect(defineObsidianPluginJestConfig({ testEnvironment: 'node' }).testEnvironment).toBe('node');
  });

  it('should let an explicit mapping replace the obsidian one', () => {
    const config = defineObsidianPluginJestConfig({ moduleNameMapper: { '^obsidian$': '<rootDir>/my-mock.ts' } });

    expect(config.moduleNameMapper).toMatchObject({ '^obsidian$': '<rootDir>/my-mock.ts' });
  });
});
