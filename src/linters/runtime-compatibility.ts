/**
 * @file
 *
 * Reuses the ECMAScript compatibility rules for a plugin's runtime floor.
 */

import type {
  Linter,
  Rule
} from 'eslint';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import esX from 'eslint-plugin-es-x';

import type { ObsidianRuntimeFloor } from '../obsidian-runtime.ts';

import { DEFAULT_OBSIDIAN_RUNTIME_FLOOR } from '../obsidian-runtime.ts';

const FIND_LAST_RULE = ensureNonNullable(esX.rules['no-array-prototype-findlast-findlastindex']);
const FIND_LAST_RULE_OVERRIDE: Rule.RuleModule = {
  ...FIND_LAST_RULE,
  create(context) {
    return FIND_LAST_RULE.create({
      ...context,
      options: context.options,
      report(descriptor) {
        // Only Array#findLastIndex is supplied by Obsidian; findLast and typed arrays remain checked.
        if (ensureNonNullable(descriptor.data)['name'] !== 'Array.prototype.findLastIndex') {
          context.report(descriptor);
        }
      },
      settings: context.settings,
      sourceCode: context.sourceCode
    });
  }
};
const RUNTIME_PLUGIN = {
  ...esX,
  rules: {
    ...esX.rules,
    'no-array-prototype-findlast-findlastindex': FIND_LAST_RULE_OVERRIDE
  }
} satisfies NonNullable<Linter.Config['plugins']>[string];

/**
 * Creates the compatibility rules for shipped plugin source. Syntax targets do not polyfill builtins.
 *
 * @param runtimeFloor - The ECMAScript edition available in every supported runtime.
 * @returns The compatibility configuration.
 */
export function getRuntimeCompatibilityConfig(runtimeFloor: ObsidianRuntimeFloor = DEFAULT_OBSIDIAN_RUNTIME_FLOOR): Linter.Config {
  const config = esX.configs[`flat/restrict-to-${runtimeFloor}`];
  return {
    ...config,
    plugins: { 'es-x': RUNTIME_PLUGIN },
    rules: {
      ...config.rules,
      ...esX.configs['flat/no-new-in-esnext'].rules,
      // These constructs are lowered or handled by the bundler, unlike runtime APIs and RegExp features.
      'es-x/no-arbitrary-module-namespace-names': 'off',
      'es-x/no-class-instance-fields': 'off',
      'es-x/no-class-private-fields': 'off',
      'es-x/no-class-private-methods': 'off',
      'es-x/no-class-static-block': 'off',
      'es-x/no-class-static-fields': 'off',
      'es-x/no-dynamic-import-options': 'off',
      'es-x/no-hashbang': 'off',
      'es-x/no-import-attributes': 'off',
      'es-x/no-json-modules': 'off',
      'es-x/no-logical-assignment-operators': 'off',
      'es-x/no-numeric-separators': 'off',
      'es-x/no-private-in': 'off',
      'es-x/no-top-level-await': 'off',
      'es-x/no-trailing-dynamic-import-commas': 'off',
      'es-x/no-using-declarations': 'off',
      // ECMAScript compatibility belongs to the shared floor, rather than the separate Node API floor.
      'n/no-unsupported-features/es-builtins': 'off'
    }
  };
}
