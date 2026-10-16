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
    // Registered but OFF by default: markdownlint enables an unlisted custom rule, so landing it silent has to be
    // said out loud. Repositories still carry plain plugin names from before the rule existed; each one fixes them
    // (`npm run lint:md:fix` does it) and turns the rule on by overriding this one key in its own
    // `scripts/markdownlint-cli2-config.ts`. The rule takes `{ additionalPluginNames: [...] }` for names the shared
    // list lacks.
    [PLUGIN_NAME_AS_CODE_RULE_NAME]: false
  },
  customRules: [
    ...obsidianDevUtilsConfig.customRules ?? [],
    pluginNameAsCodeRule
  ]
};
