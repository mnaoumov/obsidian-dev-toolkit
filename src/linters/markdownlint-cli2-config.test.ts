import { obsidianDevUtilsConfig } from '@mnaoumov/typescript-dev-toolkit/linters/markdownlint-cli2-config';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { obsidianMarkdownlintCli2Config } from './markdownlint-cli2-config.ts';
import {
  PLUGIN_NAME_AS_CODE_RULE_NAME,
  pluginNameAsCodeRule
} from './markdownlint-rules/plugin-name-as-code.ts';

describe('obsidianMarkdownlintCli2Config', () => {
  afterEach(() => {
    vi.doUnmock('@mnaoumov/typescript-dev-toolkit/linters/markdownlint-cli2-config');
    vi.resetModules();
  });

  it('should keep the generic configuration', () => {
    expect(obsidianMarkdownlintCli2Config.config).toMatchObject(obsidianDevUtilsConfig.config ?? {});
    expect(obsidianMarkdownlintCli2Config.globs).toEqual(obsidianDevUtilsConfig.globs);
  });

  it('should register the plugin-name rule, switched off', () => {
    expect(obsidianMarkdownlintCli2Config.customRules).toEqual([...obsidianDevUtilsConfig.customRules ?? [], pluginNameAsCodeRule]);
    expect(obsidianMarkdownlintCli2Config.config?.[PLUGIN_NAME_AS_CODE_RULE_NAME]).toBe(false);
  });

  it('should register the plugin-name rule alone when the generic configuration has no custom rules', async () => {
    vi.resetModules();
    vi.doMock('@mnaoumov/typescript-dev-toolkit/linters/markdownlint-cli2-config', () => ({ obsidianDevUtilsConfig: { config: {} } }));
    const { obsidianMarkdownlintCli2Config: config } = await import('./markdownlint-cli2-config.ts');
    expect(config.customRules).toHaveLength(1);
  });
});
