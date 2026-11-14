/**
 * @file
 *
 * The shared ESLint configuration for Obsidian plugins.
 *
 * It is the generic configuration of `@mnaoumov/typescript-dev-toolkit` plus the Obsidian layers alone:
 * `eslint-plugin-obsidianmd`'s recommended rules, the root `manifest.json` and `LICENSE`, the Node-builtins exemptions
 * of desktop-only modules and tests, the integration-test rules and the Obsidian in-house rules.
 */

/* v8 ignore start -- Declarative ESLint rule/plugin configuration; correctness is verified by running ESLint, not unit tests. */

import type { DefineEslintConfigsOptions as GenericDefineEslintConfigsOptions } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-config';
import type { Linter } from 'eslint';

import {
  createDefaultEslintConfigContext,
  EslintConfigContext,
  getEslintCoreConfigs,
  getGlobalIgnoreConfigs,
  getTypeScriptEslintConfigs
} from '@mnaoumov/typescript-dev-toolkit/linters/eslint-config';
import { join } from '@mnaoumov/typescript-lib/path';
// eslint-disable-next-line import-x/no-rename-default -- The default export name `plugin` is too confusing.
import obsidianmd from 'eslint-plugin-obsidianmd';
import {
  defineConfig,
  globalIgnores
} from 'eslint/config';

import type { ObsidianRuntimeFloor } from '../obsidian-runtime.ts';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import { jsonPlugin } from './eslint-rules/manifest-helpers.ts';
import { obsidianDevToolkitPlugin } from './eslint-rules/obsidian-dev-toolkit-plugin.ts';
import { stripOwnedRuleCustomMessageEntries } from './obsidianmd-rule-custom-message.ts';
import { getRuntimeCompatibilityConfig } from './runtime-compatibility.ts';

/**
 * Options for the Obsidian ESLint configuration.
 */
export interface DefineEslintConfigsOptions extends GenericDefineEslintConfigsOptions {
  /**
   * The ECMAScript edition available in the oldest supported runtime.
   *
   * @default `es2022`
   */
  readonly runtimeFloor?: ObsidianRuntimeFloor;
}
// eslint-disable-next-line unicorn/prefer-export-from -- Re-exported so a plugin's `scripts/eslint-config.ts` keeps importing both from here.
export { EslintConfigContext };

/*
 * The minimum Obsidian installer that still receives app updates and works is 1.1.9, which ships Electron
 * 21.3.3 and runs Node 16.16.0. Shipped source must therefore avoid Node APIs unavailable in that version.
 * ECMAScript builtins use the separately configurable runtime floor. Tests and scripts are dev-only and exempt.
 *
 * Source of truth: `obsidian-integration-testing/metadata.json` — the newest release carrying the field
 * (1.13.1) declares `minRunnableInstallerVersion: "1.1.9"`, and that installer's `runtimeVersions` gives the
 * Electron and Node versions above. Re-derive from there rather than editing this number by hand.
 */
const MINIMUM_NODE_VERSION = '>=16.16.0';

const DEMO_VAULT_ASSETS_FOLDER = join(ObsidianPluginRepoPaths.DemoVault, '_assets');
const DEMO_VAULT_SCRIPTS_FOLDER = join(DEMO_VAULT_ASSETS_FOLDER, 'CodeScriptToolkit');

/**
 * The demo vault's own setup code: the startup script `Demo Vault Helper` points `CodeScript Toolkit` at, and the
 * helpers the demo notes' buttons call. The plugin writes and maintains both, so they take the source-file rules like
 * `src/` does. Every other script in a vault is left alone: `CodeScript Toolkit`'s vault shows unusual module and
 * `require` styles on purpose, and a linter that "fixed" them would break the lesson.
 */
const DEMO_VAULT_SETUP_FILES = ['demoSetup.ts', 'startup.ts'].map((fileName) => join(DEMO_VAULT_SCRIPTS_FOLDER, fileName));

/**
 * Build ESLint configurations.
 *
 * This function builds the ESLint configurations of an Obsidian plugin: the generic configuration of
 * `@mnaoumov/typescript-dev-toolkit` plus the Obsidian layers.
 *
 * @param options - The parameters for defining ESLint configurations.
 * @returns The ESLint configurations.
 */
export function defineEslintConfigs(options: DefineEslintConfigsOptions = {}): Linter.Config[] {
  const context = createDefaultEslintConfigContext();
  // Before `editContext`, so a project can take them out again. Without this they match no config object at all.
  context.sourceFiles.push(...DEMO_VAULT_SETUP_FILES);

  if (options.editContext) {
    options.editContext(context);
  }

  const customConfigs = options.customConfigs?.(context) ?? [];

  return defineConfig(
    ...getGlobalIgnoreConfigs(),
    // Obsidianmd configs run first so our stricter rules override their relaxed defaults
    ...getObsidianLintConfigs(context),
    ...getTypeScriptEslintConfigs({ context, minimumNodeVersion: options.minimumNodeVersion ?? MINIMUM_NODE_VERSION }),
    {
      ...getRuntimeCompatibilityConfig(options.runtimeFloor),
      files: context.sourceFiles,
      ignores: [...context.testFiles, ...context.scriptFiles]
    },
    ...getObsidianOverrideConfigs(context),
    ...getNodeBuiltinsConfigs(context),
    ...getIntegrationTestConfigs(context),
    ...getManifestConfigs(),
    ...getLicenseConfigs(),
    ...getDemoVaultSetupConfigs(),
    ...customConfigs,
    ...getDemoVaultSetupUnignoreConfigs()
  );
}

function getDemoVaultSetupConfigs(): Linter.Config[] {
  return defineConfig([
    {
      files: DEMO_VAULT_SETUP_FILES,
      rules: {
        /*
         * The nearest `package.json` of these files is the repository's, or the vault's own where the vault installs
         * packages for its example scripts. Neither lists what they import: `CodeScript Toolkit` serves `obsidian` and
         * `@mnaoumov/obsidian-lib` to vault scripts at runtime. The rule is registered under both plugin names.
         */
        'import-x/no-extraneous-dependencies': 'off',
        'import/no-extraneous-dependencies': 'off',
        // `CodeScriptToolkit` is the vault's script folder, named in the plugin's settings and in every demo note.
        'unicorn/filename-case': 'off'
      }
    }
  ]);
}

/*
 * A plugin's own config commonly ignores `demo-vault/**`, since the vault is committed and so in no ignore file. That
 * hid the setup files from every check, so a global un-ignore of the path to them comes AFTER the consumer's configs:
 * a later negated pattern wins, and an earlier one is overridden. The folders on the way are re-included first,
 * because a file inside an ignored folder cannot be un-ignored. Nothing else in the vault is re-included.
 */
function getDemoVaultSetupUnignoreConfigs(): Linter.Config[] {
  return defineConfig(
    globalIgnores(
      [
        `!${ObsidianPluginRepoPaths.DemoVault}/`,
        `!${DEMO_VAULT_ASSETS_FOLDER}/`,
        `!${DEMO_VAULT_SCRIPTS_FOLDER}/`,
        ...DEMO_VAULT_SETUP_FILES.map((file) => `!${file}`)
      ],
      'obsidian-dev-toolkit/demo-vault-setup-files'
    )
  );
}
function getIntegrationTestConfigs(context: EslintConfigContext): Linter.Config[] {
  return defineConfig([
    {
      /*
       * An integration test that drives the UI with `dispatchEvent(new KeyboardEvent(...))` produces an
       * UNTRUSTED event, and Obsidian and CodeMirror gate on `isTrusted` — so the test can exercise
       * nothing while still passing. Only integration tests are covered: a unit test has no real input
       * pipeline to reach, so dispatching is the only thing it can do.
       *
       * Android files used to be exempt BY FILENAME, on the grounds that the trusted helpers were built on
       * `window.electron` and so could not be reached from a phone at all. That exemption is gone: the
       * harness gained a mobile trusted-input path, and `clickElement`, `clickMouse`, `pressKey` and
       * `typeIntoEditor` all work there. Only the hover helpers still throw, because `:hover` has no touch
       * equivalent — a file reaching for those has to branch on `Platform.isDesktopApp`, which is the same
       * thing a `*.cross-platform.*` file has always had to do.
       */
      files: context.sourceFolders.map((sourceFolder) => join(sourceFolder, ObsidianPluginRepoPaths.AnyPath, ObsidianPluginRepoPaths.AnyIntegrationTestTs)),
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/no-untrusted-input-events': 'error'
      }
    }
  ]);
}

/*
 * The Community directory requires a root `LICENSE`, and `obsidianmd/validate-license` checks that it is not
 * the sample plugin's notice left unedited: the sample's copyright holder, and the year of such a line. Any other
 * holder's line is not checked at all, so the year of the author's own notice never turns a repo red.
 * `obsidianmd.configs.recommended` already lints `LICENSE` through the plugin's `obsidianmd/plain-text`
 * language, at `warn`; this block only raises it to an error.
 */
function getLicenseConfigs(): Linter.Config[] {
  return defineConfig([
    {
      files: [ObsidianPluginRepoPaths.License],
      language: 'obsidianmd/plain-text',
      plugins: {
        obsidianmd
      },
      rules: {
        'obsidianmd/validate-license': 'error'
      }
    }
  ]);
}

/*
 * The root `manifest.json` is what the Community directory's automated review actually reads.
 * `obsidianmd/validate-manifest` checks it the way that review does (the keys, their types, and the words and
 * format of the id, name and description); `obsidianmd.configs.recommended` turns it on at `warn`, and this
 * block raises it to an error, with `checkId` so a new plugin's id is checked as the developer docs ask.
 *
 * The in-house `manifest-*` rules hold only what upstream does not check, and report nothing it already does.
 * `manifest.json` is strict JSON, so an `eslint-disable` comment in it is a parse error AND would stop Obsidian
 * loading the plugin. That makes the config the only place a check can be waived, which is why each in-house
 * check is a rule of its own, and why a grandfathered id is waived through `validate-manifest`'s own options:
 * `checkId: false`, or `allowedWords` for one word in one field.
 */
function getManifestConfigs(): Linter.Config[] {
  return defineConfig([
    {
      files: [ObsidianPluginRepoPaths.ManifestJson],
      language: 'json/json',
      plugins: {
        'json': jsonPlugin,
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin,
        obsidianmd
      },
      rules: {
        'obsidian-dev-toolkit/manifest-description': 'error',
        'obsidian-dev-toolkit/manifest-funding-url': 'error',
        'obsidian-dev-toolkit/manifest-id': 'error',
        'obsidian-dev-toolkit/manifest-name': 'error',
        'obsidianmd/validate-manifest': ['error', { checkId: true }]
      }
    }
  ]);
}

/*
 * Every file set that is exempt from the Node-builtins bans, in one place.
 *
 * Two rules ban Node builtins, and they are NOT interchangeable. `import-x/no-nodejs-modules` is ours, it is
 * an error, and its waivers are tolerated by the community-directory review runner. `obsidianmd/no-nodejs-modules`
 * arrives via `obsidianmd.configs.recommended` (see `getObsidianLintConfigs`) and is strictly weaker on static
 * imports — its own source says "Static import declarations can never be guarded at runtime", so it reports every
 * `ImportDeclaration` of a builtin unconditionally and only `import()` / `require()` get guard-awareness. It is
 * also one the consumer CANNOT WAIVE: the directory runner sets
 * `eslint-comments/no-restricted-disable: ['error', 'obsidianmd/*', ...]`, whitelisting only
 * `obsidianmd/ui/sentence-case`, so an inline disable of it trades a warning for an error in a review. That is why
 * every exemption below has to live here in the shared config rather than as a comment at the call site.
 *
 * One further exemption deliberately lives elsewhere: `getImportXConfigs` turns off only `import-x/no-nodejs-modules`
 * for `context.scriptFiles`. It needs no `obsidianmd` twin, because `getObsidianLintConfigs` scopes the obsidianmd
 * rules to `context.sourceFiles`, so they never reach scripts in the first place.
 */
function getNodeBuiltinsConfigs(context: EslintConfigContext): Linter.Config[] {
  return defineConfig([
    {
      // Integration tests run in a Node environment and legitimately read files / paths, so the Node-builtins bans do not apply to them.
      files: context.sourceFolders.map((sourceFolder) => join(sourceFolder, ObsidianPluginRepoPaths.AnyPath, ObsidianPluginRepoPaths.AnyIntegrationTestTs)),
      rules: {
        'import-x/no-nodejs-modules': 'off',
        'obsidianmd/no-nodejs-modules': 'off'
      }
    },
    {
      /*
       * A `desktop-` prefixed module is desktop-only by convention: it is reached only through a
       * `Platform.isDesktopApp`-gated dynamic `import()` in its caller, so its static Node imports never
       * load on mobile. Neither rule can see that gate, because it sits one file up — the correctly-written pattern
       * reports anyway, and no author-side rewrite silences it.
       *
       * Exempting BY FILENAME rather than by a disable comment carries a trade-off knowingly: the exemption keys
       * off what the file is NAMED rather than what it does, so the prefix is load-bearing. A desktop-only module
       * that skips the prefix keeps reporting, and a cross-platform module that wrongly takes it gets an exemption
       * it should not have.
       */
      files: context.sourceFolders.map((sourceFolder) => join(sourceFolder, ObsidianPluginRepoPaths.AnyPath, ObsidianPluginRepoPaths.AnyDesktopTs)),
      rules: {
        'import-x/no-nodejs-modules': 'off',
        'obsidianmd/no-nodejs-modules': 'off'
      }
    },
    {
      /*
       * A unit test runs under vitest in Node and is never bundled into `main.js`, so the Node-builtins bans do not
       * apply to it either — the identical argument the integration-test block above already accepts. This also
       * covers the SUT-grouped `*.desktop.test.ts` shape, which names the platform as a dot segment after the
       * subject under test rather than as a `desktop-` prefix.
       */
      files: context.testFiles,
      rules: {
        'import-x/no-nodejs-modules': 'off',
        'obsidianmd/no-nodejs-modules': 'off'
      }
    }
  ]);
}

function getObsidianLintConfigs(context: EslintConfigContext): Linter.Config[] {
  const obsidianRecommendedConfigs = obsidianmd.configs.recommended;

  /*
   * A builtin this config sets itself must not ALSO run through `obsidianmd/rule-custom-message`, or a consumer's own
   * `'no-console': 'off'` is inert and every console line is reported twice. See `obsidianmd-rule-custom-message.ts`.
   */
  const ownedRuleNames = new Set(getEslintCoreConfigs(context).flatMap((config) => Object.keys(config.rules ?? {})));

  /*
   * A block that names a `language` lints a file that is not code (`package.json`, `manifest.json`, `LICENSE`, an
   * English locale `.json`) and is already scoped to it, so it keeps its own `files`. Narrowed to the source files instead,
   * it would parse every `.ts` file as JSON or plain text.
   */
  const scopedObsidianRecommendedConfigs = obsidianRecommendedConfigs.map((config) => {
    return config.language === undefined
      ? {
        ...stripOwnedRuleCustomMessageEntries({ config, ownedRuleNames }),
        files: context.sourceFiles
      }
      : config;
  });

  return defineConfig([
    {
      extends: [scopedObsidianRecommendedConfigs],
      plugins: {
        obsidianmd
      }
    }
  ]);
}

function getObsidianOverrideConfigs(context: EslintConfigContext): Linter.Config[] {
  return defineConfig([
    {
      files: context.sourceFolders.map((sourceFolder) => join(sourceFolder, ObsidianPluginRepoPaths.MainTs)),
      rules: {
        'import-x/no-default-export': 'off'
      }
    },
    {
      files: context.allFiles(),
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        /*
         * Deliberately here, on `allFiles()`, rather than beside `no-untrusted-input-events` in
         * `getIntegrationTestConfigs()` (owner, 2026-09-09). An `evalInObsidian` call is unmistakable, so a
         * file that makes none is untouched and a broad glob costs nothing -- while script code that drives
         * a real Obsidian outside a test (`demo-vault-buttons.ts`) is under the same transport cap and would
         * otherwise be enforced nowhere.
         */
        'obsidian-dev-toolkit/no-over-cap-wait-in-eval-in-obsidian': 'error',
        'obsidian-dev-toolkit/require-component-suffix': 'error',
        /*
         * An `evalInObsidian` / `pollInObsidian` callback is serialized and run inside Obsidian, where the
         * module's imports are not in scope, so a `dedent` template there throws `dedent is not defined`.
         */
        'typescript-dev-toolkit/prefer-dedent': ['error', { ignoreInsideCallsTo: ['evalInObsidian', 'pollInObsidian'] }],
        /*
         * Obsidian's `Component` has its own `removeChild(component)` for the component lifecycle, unrelated
         * to `Node#removeChild`. The rule matches on the method name alone, so every report here is a
         * component being unloaded, and following the advice calls a `remove()` that does not exist -- which
         * is what `tsc` said when the fixer was let loose on them.
         */
        'unicorn/prefer-dom-node-remove': 'off',
        /*
         * Directly contradicts `obsidianmd/no-global-this`: this rule rewrites `window.x` to `globalThis.x`, and
         * that one forbids `globalThis` outright. With both enabled, `--fix` applies one and then the other
         * reverts it, which ESLint reports as `ESLintCircularFixesWarning` across 29 files. Obsidian's own
         * guidance wins in an Obsidian library, so this is the rule that gives way.
         */
        'unicorn/prefer-global-this': 'off'
      }
    },
    {
      /*
       * Obsidian's internal API is typed in `obsidian-typings`, so a `declare module 'obsidian'` augmentation in
       * shipped source may carry only the plugin's own custom-event overloads. Tests are exempt: a mock shape or a
       * harness global never ships.
       */
      files: context.sourceFiles,
      ignores: context.testFiles,
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/no-local-obsidian-internals': 'error'
      }
    },
    {
      /*
       * Every method entry of a plugin API contract carries an `input` and an `output` schema, so a `{}` entry that
       * validates nothing cannot come back where the contract type is untyped and the compiler does not refuse it.
       * Tests are exempt: they may publish a deliberately broken contract.
       */
      files: context.sourceFiles,
      ignores: context.testFiles,
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/require-plugin-api-contract-schemas': 'error'
      }
    },
    {
      /*
       * A plugin's display name is marked as code: backticks in a comment (`plugin-name-as-code`, autofixed), a
       * `appendCodeBlock()` in UI (`plugin-name-as-code-in-ui`, reported only). Both take
       * `{ additionalPluginNames: [...] }` for names the shared list lacks, and `{ excludedPluginNames: [...] }` for a
       * name that is an ordinary word in that project, its own manifest `name` included.
       */
      files: context.allFiles(),
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/plugin-name-as-code': 'error',
        'obsidian-dev-toolkit/plugin-name-as-code-in-ui': 'error'
      }
    },
    {
      /*
       * A `<code>` element in UI is built with `appendCodeBlock()`: a bare `createEl('code', ...)` gets no inline-code
       * chip in Obsidian's UI, only a monospace font. Tests are exempt: a fixture may build any element.
       */
      files: context.sourceFiles,
      ignores: context.testFiles,
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/no-bare-code-element': 'error'
      }
    },
    {
      /*
       * A dynamic `import()` of a Node builtin stays a native `import()` in a CommonJS plugin bundle, which Obsidian's
       * renderer cannot load, so it fails only when it runs. `desktop-` modules are NOT exempt: the trap is the same
       * there, and the fix is a static import in one. Tests are exempt: they run in Node.
       */
      files: context.sourceFiles,
      ignores: context.testFiles,
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/no-dynamic-node-builtin-import': 'error'
      }
    },
    {
      /*
       * A shipped component extends `ComponentEx` from `@mnaoumov/obsidian-lib`, never Obsidian's raw `Component`:
       * every plugin built with this toolkit depends on `obsidian-lib` already, and `ComponentEx` adds child tracking,
       * an awaitable async load and `Disposable`. Tests are exempt: a test double may extend whatever it needs.
       */
      files: context.sourceFiles,
      ignores: context.testFiles,
      plugins: {
        'obsidian-dev-toolkit': obsidianDevToolkitPlugin
      },
      rules: {
        'obsidian-dev-toolkit/prefer-component-ex': 'error'
      }
    }
  ]);
}

/* v8 ignore stop */
