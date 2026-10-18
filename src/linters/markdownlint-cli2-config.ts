/**
 * @file
 *
 * The markdownlint-cli2 configuration of an Obsidian plugin: the generic one from `@mnaoumov/typescript-dev-toolkit`,
 * plus the Obsidian rules of this package.
 */

import type { MarkdownlintCli2ConfigurationSchema as MarkdownlintCli2ConfigSchema } from '@mnaoumov/typescript-dev-toolkit/linters/markdownlint-types/@types/markdownlint-cli2-config-schema';

import { obsidianDevUtilsConfig } from '@mnaoumov/typescript-dev-toolkit/linters/markdownlint-cli2-config';

import {
  PLUGIN_NAME_AS_CODE_RULE_NAME,
  pluginNameAsCodeRule
} from './markdownlint-rules/plugin-name-as-code.ts';

/**
 * The markdownlint-cli2 configuration of an Obsidian plugin.
 */
export const obsidianMarkdownlintCli2Config: MarkdownlintCli2ConfigSchema = {
  ...obsidianDevUtilsConfig,
  config: {
    ...obsidianDevUtilsConfig.config,
    // Markdownlint would enable an unlisted custom rule anyway; it is listed so a repository that needs names the
    // shared list lacks overrides this one key with `{ additionalPluginNames: [...] }` in its own
    // `scripts/markdownlint-cli2-config.ts`. `npm run lint:md:fix` fixes what it reports.
    [PLUGIN_NAME_AS_CODE_RULE_NAME]: true
  },
  customRules: [
    ...obsidianDevUtilsConfig.customRules ?? [],
    pluginNameAsCodeRule
  ]
};
