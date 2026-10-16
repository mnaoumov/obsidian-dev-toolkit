/**
 * @file
 *
 * ESLint plugin carrying the Obsidian-specific in-house rules.
 */
import type { ESLint } from 'eslint';

import { manifestDescription } from './manifest-description.ts';
import { manifestId } from './manifest-id.ts';
import { manifestName } from './manifest-name.ts';
import { manifestSchema } from './manifest-schema.ts';
import { noLocalObsidianInternals } from './no-local-obsidian-internals.ts';
import { noOverCapWaitInEvalInObsidian } from './no-over-cap-wait-in-eval-in-obsidian.ts';
import { noUntrustedInputEvents } from './no-untrusted-input-events.ts';
import { pluginNameAsCodeInUi } from './plugin-name-as-code-in-ui.ts';
import { pluginNameAsCode } from './plugin-name-as-code.ts';
import { requireComponentSuffix } from './require-component-suffix.ts';
import { requirePluginApiContractSchemas } from './require-plugin-api-contract-schemas.ts';

/**
 * The namespace the Obsidian in-house rules are registered under: the name of the package that defines them. The
 * generic rules live beside them under `typescript-dev-toolkit`, as a plugin of their own.
 */
export const OBSIDIAN_DEV_TOOLKIT_ESLINT_PLUGIN_NAME = 'obsidian-dev-toolkit';

/**
 * ESLint plugin carrying the Obsidian in-house rules, registered under {@link OBSIDIAN_DEV_TOOLKIT_ESLINT_PLUGIN_NAME}.
 */
export const obsidianDevToolkitPlugin: ESLint.Plugin = {
  rules: {
    'manifest-description': manifestDescription,
    'manifest-id': manifestId,
    'manifest-name': manifestName,
    'manifest-schema': manifestSchema,
    'no-local-obsidian-internals': noLocalObsidianInternals,
    'no-over-cap-wait-in-eval-in-obsidian': noOverCapWaitInEvalInObsidian,
    'no-untrusted-input-events': noUntrustedInputEvents,
    'plugin-name-as-code': pluginNameAsCode,
    'plugin-name-as-code-in-ui': pluginNameAsCodeInUi,
    'require-component-suffix': requireComponentSuffix,
    'require-plugin-api-contract-schemas': requirePluginApiContractSchemas
  }
};
