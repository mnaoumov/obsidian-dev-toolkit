/**
 * @file
 *
 * The markdownlint configuration of this repository: the shared Obsidian one, with the soft-break rule turned on.
 */

import type { MarkdownlintCli2ConfigurationSchema as MarkdownlintCli2ConfigSchema } from '@mnaoumov/typescript-dev-toolkit/linters/markdownlint-types/@types/markdownlint-cli2-config-schema';

import { obsidianMarkdownlintCli2Config } from '../src/linters/markdownlint-cli2-config.ts';

export const config: MarkdownlintCli2ConfigSchema = {
  ...obsidianMarkdownlintCli2Config,
  config: {
    ...obsidianMarkdownlintCli2Config.config,
    // Turned ON here, against the shared default of OFF: every paragraph in this repository's markdown is one
    // physical line, and the rule is what keeps hard wrapping from coming back.
    'no-soft-break-in-paragraph': true
  }
};
