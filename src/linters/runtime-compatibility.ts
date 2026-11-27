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
 * A rule elsewhere in the shared configuration whose advice needs a builtin newer than some runtime floors.
 */
export interface RuntimeDependentRule {
  /**
   * A call of the builtin the rule recommends, which the matching `es-x` rule reports below {@link edition}.
   */
  readonly api: string;

  /**
   * The ECMAScript edition that added the builtin, spelled like a runtime floor.
   */
  readonly edition: `es${number}`;

  /**
   * The rule entry used below {@link edition}.
   *
   * @default `'off'`
   */
  readonly entryBelowEdition?: Linter.RuleEntry;
}

/**
 * The rules whose advice the runtime floor can forbid. Following one of them below its edition only trades its report
 * for an `es-x` report, so the rule gives way to the floor there.
 */
export const RUNTIME_DEPENDENT_RULES: Readonly<Record<string, RuntimeDependentRule>> = {
  'unicorn/no-array-splice': { api: '[].toSpliced(0, 1);', edition: 'es2023' },
  // Keeps the `find()` checks; only the `findLast()` advice depends on the floor.
  'unicorn/prefer-array-find': { api: '[].findLast((item) => item);', edition: 'es2023', entryBelowEdition: ['error', { checkFromLast: false }] },
  // It also offers `findLastIndex()`, which Obsidian supplies, but its `findLast()` advice is forbidden below ES2023.
  'unicorn/prefer-array-last-methods': { api: '[].findLast((item) => item);', edition: 'es2023' },
  'unicorn/prefer-get-or-insert-computed': { api: 'new Map().getOrInsertComputed(1, () => 2);', edition: 'es2026' },
  'unicorn/prefer-group-by': { api: 'Object.groupBy([], (item) => item); Map.groupBy([], (item) => item);', edition: 'es2024' },
  'unicorn/prefer-iterator-zip': { api: 'Iterator.zip([[], []]);', edition: 'es2026' },
  'unicorn/prefer-promise-try': { api: 'Promise.try(() => 1);', edition: 'es2025' }
};

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

/**
 * Turns off, or narrows, the rules elsewhere in the shared configuration that would recommend a builtin the runtime
 * floor forbids, so the configuration never asks for what it forbids.
 *
 * @param runtimeFloor - The ECMAScript edition available in every supported runtime.
 * @returns The rule entries to apply over the shared configuration, for the files the floor covers.
 */
export function getRuntimeDependentRuleOverrides(runtimeFloor: ObsidianRuntimeFloor = DEFAULT_OBSIDIAN_RUNTIME_FLOOR): Linter.RulesRecord {
  const rules: Linter.RulesRecord = {};
  for (const [ruleId, rule] of Object.entries(RUNTIME_DEPENDENT_RULES)) {
    if (getEditionYear(runtimeFloor) < getEditionYear(rule.edition)) {
      rules[ruleId] = rule.entryBelowEdition ?? 'off';
    }
  }
  return rules;
}

function getEditionYear(edition: `es${number}`): number {
  return Number(edition.slice('es'.length));
}
