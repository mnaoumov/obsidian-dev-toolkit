/**
 * @file
 *
 * End-to-end tests with `wdio-obsidian-service`: WebdriverIO drives a sandboxed copy of Obsidian, downloaded per
 * version into a cache, with the plugin installed into a copy of the test vault.
 *
 * {@link defineWdioObsidianConfig} derives the `wdio.conf.mts` from the project's layout, and
 * {@link testEndToEndWithWdioObsidian} is the `test:e2e` script: a production build, then `wdio run`.
 *
 * The config is typed structurally rather than through `@wdio/types`, so this module costs a project that does not
 * use WebdriverIO nothing, and the returned object is assignable to `WebdriverIO.Config` in one that does.
 */

import { npmRun } from '@mnaoumov/typescript-dev-toolkit/npm-run';
import {
  execFromRoot,
  resolvePathFromRootSafe
} from '@mnaoumov/typescript-dev-toolkit/root';
import { existsSync } from 'node:fs';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';
import {
  assertProjectPackagesInstalled,
  DEFAULT_END_TO_END_SPECS
} from './e2e-runner-support.ts';

/**
 * The per-test timeout {@link defineWdioObsidianConfig} gives mocha by default, in milliseconds. Obsidian is
 * started once per spec file, which a single test's budget has to absorb.
 */
export const DEFAULT_WDIO_OBSIDIAN_TEST_TIMEOUT_IN_MILLISECONDS = 60_000;

/**
 * The config files {@link testEndToEndWithWdioObsidian} looks for, in order.
 */
export const WDIO_CONFIG_FILE_NAMES: readonly string[] = ['wdio.conf.mts', 'wdio.conf.ts'];

/**
 * The packages a `wdio-obsidian-service` setup needs in the project.
 */
const WDIO_OBSIDIAN_PACKAGES: readonly string[] = ['@wdio/cli', '@wdio/local-runner', '@wdio/mocha-framework', 'wdio-obsidian-reporter', 'wdio-obsidian-service'];

/**
 * Options for {@link defineWdioObsidianConfig}.
 */
export interface DefineWdioObsidianConfigOptions {
  /**
   * The Obsidian app versions to test, one capability each: a version such as `1.8.10`, `latest`, `latest-beta`, or
   * `earliest` (the `minAppVersion` of `manifest.json`). Defaults to `['latest']`; `['earliest', 'latest']` tests
   * both ends of the supported range.
   */
  readonly appVersions?: readonly string[];

  /**
   * The folder Obsidian versions are downloaded into, relative to the project root. Defaults to `.obsidian-cache`,
   * which belongs in `.gitignore`.
   */
  readonly cacheFolder?: string;

  /**
   * The Obsidian installer (Electron) version, `earliest` or `latest` compatible with each app version, or an exact
   * one. Defaults to the service's own choice.
   */
  readonly installerVersion?: string;

  /**
   * How many Obsidian instances run in parallel. Defaults to WebdriverIO's.
   */
  readonly maxInstances?: number;

  /**
   * The folder holding the built plugin (`main.js`, `manifest.json`, `styles.css`), relative to the project root.
   * Defaults to `dist/build`, where the production build writes it.
   */
  readonly pluginFolder?: string;

  /**
   * The spec files, relative to the project root. Defaults to {@link DEFAULT_END_TO_END_SPECS}.
   */
  readonly specs?: readonly string[];

  /**
   * The per-test timeout, in milliseconds. Defaults to {@link DEFAULT_WDIO_OBSIDIAN_TEST_TIMEOUT_IN_MILLISECONDS}.
   */
  readonly testTimeoutInMilliseconds?: number;

  /**
   * The vault every test starts from, relative to the project root. The service opens a COPY of it, so the tests
   * never change the folder. Defaults to the plugin's demo vault (`demo-vault`) when the project has one, and to an
   * empty vault otherwise; `false` forces the empty vault.
   */
  readonly vault?: false | string;
}

/**
 * Options for {@link testEndToEndWithWdioObsidian}.
 */
export interface TestEndToEndWithWdioObsidianOptions {
  /**
   * The WebdriverIO config file, relative to the project root. Defaults to the first of
   * {@link WDIO_CONFIG_FILE_NAMES} that exists.
   */
  readonly configPath?: string;

  /**
   * Whether to run the production build first, so the tests load the current `dist/build`. Defaults to `true`.
   */
  readonly shouldBuild?: boolean;
}

/**
 * A `wdio-obsidian-service` capability: one Obsidian version to run the specs against.
 */
export interface WdioObsidianCapability {
  /**
   * Always `obsidian`, which is what routes the capability to the service.
   */
  readonly 'browserName': 'obsidian';

  /**
   * The Obsidian app version.
   */
  readonly 'browserVersion': string;

  /**
   * The service's own options for this capability.
   */
  readonly 'wdio:obsidianOptions': WdioObsidianCapabilityOptions;
}

/**
 * The `wdio:obsidianOptions` of a {@link WdioObsidianCapability}.
 */
export interface WdioObsidianCapabilityOptions {
  /**
   * The Obsidian installer version.
   */
  readonly installerVersion?: string;

  /**
   * The plugin folders to install into the vault.
   */
  readonly plugins: string[];

  /**
   * The vault to open a copy of.
   */
  readonly vault?: string;
}

/**
 * The WebdriverIO configuration {@link defineWdioObsidianConfig} returns. Every field is plain data, so a project
 * changes any of them by spreading the result: `{ ...defineWdioObsidianConfig(), logLevel: 'info' }`.
 */
export interface WdioObsidianConfig {
  /**
   * Where Obsidian versions are downloaded.
   */
  // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
  readonly cacheDir: string;

  /**
   * One capability per Obsidian version.
   */
  readonly capabilities: WdioObsidianCapability[];

  /**
   * The test framework.
   */
  readonly framework: 'mocha';

  /**
   * WebdriverIO's log level.
   */
  readonly logLevel: 'debug' | 'error' | 'info' | 'silent' | 'trace' | 'warn';

  /**
   * How many Obsidian instances run in parallel.
   */
  readonly maxInstances?: number;

  /**
   * Mocha's options.
   */
  // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
  readonly mochaOpts: WdioObsidianMochaOptions;

  /**
   * The reporters. `obsidian` is the spec reporter, naming the Obsidian version instead of Chromium's.
   */
  readonly reporters: string[];

  /**
   * Where the specs run.
   */
  readonly runner: 'local';

  /**
   * The services. `obsidian` is `wdio-obsidian-service`.
   */
  readonly services: string[];

  /**
   * The spec files.
   */
  readonly specs: string[];
}

/**
 * The `mochaOpts` of a {@link WdioObsidianConfig}.
 */
export interface WdioObsidianMochaOptions {
  /**
   * The per-test timeout, in milliseconds.
   */
  readonly timeout: number;

  /**
   * The interface the specs are written in.
   */
  readonly ui: 'bdd';
}

/**
 * Builds the WebdriverIO configuration for end-to-end tests with `wdio-obsidian-service`, derived from the plugin's
 * layout: the production build in `dist/build` is the plugin under test, the demo vault (when there is one) is the
 * vault, and the specs live in `e2e/`.
 *
 * `wdio.conf.mts`:
 *
 * ```ts
 * import { defineWdioObsidianConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/wdio-obsidian';
 *
 * export const config: WebdriverIO.Config = defineWdioObsidianConfig({ appVersions: ['earliest', 'latest'] });
 * ```
 *
 * @param options - The {@link DefineWdioObsidianConfigOptions}.
 * @returns The configuration, to export as `config`.
 */
export function defineWdioObsidianConfig(options: DefineWdioObsidianConfigOptions = {}): WdioObsidianConfig {
  const pluginFolder = resolvePathFromRootSafe({ path: options.pluginFolder ?? ObsidianPluginRepoPaths.DistBuild });
  const vault = resolveVault(options.vault);
  const capabilityOptions: WdioObsidianCapabilityOptions = {
    plugins: [pluginFolder],
    ...(options.installerVersion !== undefined && { installerVersion: options.installerVersion }),
    ...(vault !== undefined && { vault })
  };

  return {
    // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
    cacheDir: resolvePathFromRootSafe({ path: options.cacheFolder ?? '.obsidian-cache' }),
    capabilities: (options.appVersions ?? ['latest']).map((appVersion) => ({
      'browserName': 'obsidian',
      'browserVersion': appVersion,
      'wdio:obsidianOptions': { ...capabilityOptions, plugins: [...capabilityOptions.plugins] }
    })),
    framework: 'mocha',
    logLevel: 'warn',
    ...(options.maxInstances !== undefined && { maxInstances: options.maxInstances }),
    // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
    mochaOpts: {
      timeout: options.testTimeoutInMilliseconds ?? DEFAULT_WDIO_OBSIDIAN_TEST_TIMEOUT_IN_MILLISECONDS,
      ui: 'bdd'
    },
    reporters: ['obsidian'],
    runner: 'local',
    services: ['obsidian'],
    specs: [...options.specs ?? [DEFAULT_END_TO_END_SPECS]]
  };
}

/**
 * Runs the end-to-end tests with `wdio-obsidian-service`: the production build, then `wdio run <config>`. It is the
 * body of a plugin's `test:e2e` script.
 *
 * @param options - The {@link TestEndToEndWithWdioObsidianOptions}.
 * @returns A {@link Promise} that resolves once the tests pass.
 * @throws When a package is missing, no config file is found, the build fails or a test fails.
 */
export async function testEndToEndWithWdioObsidian(options: TestEndToEndWithWdioObsidianOptions = {}): Promise<void> {
  assertProjectPackagesInstalled({ packageNames: WDIO_OBSIDIAN_PACKAGES, requester: 'testEndToEndWithWdioObsidian()' });
  const configPath = options.configPath ?? findWdioConfigFile();
  if (options.shouldBuild ?? true) {
    await npmRun('build');
  }
  await execFromRoot(['wdio', 'run', configPath], { isInteractive: true });
}

function findWdioConfigFile(): string {
  const configFileName = WDIO_CONFIG_FILE_NAMES.find((fileName) => existsSync(resolvePathFromRootSafe({ path: fileName })));
  if (configFileName === undefined) {
    throw new Error(
      `testEndToEndWithWdioObsidian() found no WebdriverIO config (${WDIO_CONFIG_FILE_NAMES.join(', ')}) in the project root. `
        + 'Create wdio.conf.mts exporting `config = defineWdioObsidianConfig()`, or pass `configPath`.'
    );
  }
  return configFileName;
}

function resolveVault(vault: DefineWdioObsidianConfigOptions['vault']): string | undefined {
  if (vault === false) {
    return undefined;
  }
  if (vault !== undefined) {
    return resolvePathFromRootSafe({ path: vault });
  }
  const demoVaultPath = resolvePathFromRootSafe({ path: ObsidianPluginRepoPaths.DemoVault });
  return existsSync(demoVaultPath) ? demoVaultPath : undefined;
}
