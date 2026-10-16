/**
 * @file
 *
 * Copies the fixture plugin in `test-fixtures/` into a folder of its own and builds it with one bundler adapter.
 * Shared by the two bundler integration suites: the one that loads each build in a model of Obsidian's plugin loader,
 * and the one that loads it in a real Obsidian.
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/**
 * One bundler build of the plain fixture.
 */
export interface BundlerCase {
  /**
   * The bundler adapter that builds it.
   */
  readonly bundler: string;

  /**
   * Whether it is a development build, into `dist/dev`, rather than a production one, into `dist/build`.
   */
  readonly isDevelopment: boolean;
}

interface FixtureFeatures {
  readonly framework?: string;
}

const REPO_ROOT = join(import.meta.dirname, '../..');
const FIXTURE_SOURCE_FOLDER = join(REPO_ROOT, 'test-fixtures/obsidian-plugin');
const FEATURE_FIXTURES_FOLDER = join(REPO_ROOT, 'test-fixtures/features');
const TSCONFIG_PRESETS_FOLDER = join(REPO_ROOT, 'tsconfig');
const BUILD_SCRIPT = join(REPO_ROOT, 'scripts/helpers/build-bundler-fixture.ts');
const JITI_CLI = join(REPO_ROOT, 'node_modules/jiti/lib/jiti-cli.mjs');

/**
 * How long one fixture build may take, in milliseconds.
 */
export const BUILD_TIMEOUT_IN_MILLISECONDS = 180_000;

/**
 * The bundler adapters every fixture is built with.
 */
export const BUNDLERS = ['esbuild', 'parcel', 'rollup', 'vite', 'webpack'];

/**
 * The adapters with a `mode` option, which alone can build once in development.
 */
export const BUNDLERS_WITH_MODE = ['rollup', 'vite', 'webpack'];

/**
 * Every bundler in production, and the adapters with a `mode` option in development too.
 */
export const BUNDLER_CASES: readonly BundlerCase[] = [
  ...BUNDLERS.map((bundler) => ({ bundler, isDevelopment: false })),
  // Esbuild's and parcel's `dev()` always watch, so only the adapters with a `mode` option build once in development.
  ...BUNDLERS_WITH_MODE.map((bundler) => ({ bundler, isDevelopment: true }))
];

/**
 * Builds a fixture folder with one bundler adapter, in a process of its own, since every adapter finds the project from
 * the working directory.
 *
 * @param fixtureFolder - The folder {@link createFixtureFolder} made.
 * @param bundler - The bundler adapter to build with.
 * @param isDevelopment - Whether to build in development mode.
 * @returns The folder the build was written to.
 */
export function buildFixture(fixtureFolder: string, bundler: string, isDevelopment: boolean): string {
  const env = { ...process.env };
  // A development build deploys into this vault when it is set, and a test must not touch a real vault.
  delete env['OBSIDIAN_CONFIG_FOLDER'];
  // Vitest sets it to `test`, which a bundler takes for its own mode; a project's build runs without it.
  delete env['NODE_ENV'];
  execFileSync(process.execPath, [JITI_CLI, BUILD_SCRIPT, bundler, ...isDevelopment ? ['development'] : []], {
    cwd: fixtureFolder,
    env,
    stdio: 'pipe'
  });
  return join(fixtureFolder, isDevelopment ? 'dist/dev' : 'dist/build');
}

/**
 * Copies a fixture into a folder of its own outside the repository, with its `package.json` under its real name
 * and its `node_modules` linked to this repository's. A feature fixture is laid over the plain one, with the toolkit's
 * tsconfig preset for its framework copied in and extended, as a project's own tsconfig would extend it.
 *
 * It is built outside the repository because every adapter takes the nearest `package.json` for the project root, and
 * the library build deletes every nested `package.json` in the repository, so the fixture keeps its own under another
 * name.
 *
 * The folder is its real path, since webpack's virtual modules (which `unplugin-vue`
 * uses) miss a module whose path goes through a link.
 *
 * @param feature - The feature fixture to lay over the plain one, if any.
 * @returns The fixture's folder.
 */
export function createFixtureFolder(feature?: string): string {
  const fixtureFolder = realpathSync.native(mkdtempSync(join(tmpdir(), `obsidian-dev-toolkit-bundler-fixture-${feature ?? 'plain'}-`)));
  cpSync(FIXTURE_SOURCE_FOLDER, fixtureFolder, { recursive: true });
  renameSync(join(fixtureFolder, 'fixture-package.json'), join(fixtureFolder, 'package.json'));
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(fixtureFolder, 'node_modules'), 'junction');
  if (feature === undefined) {
    return fixtureFolder;
  }

  rmSync(join(fixtureFolder, 'src'), { recursive: true });
  cpSync(join(FEATURE_FIXTURES_FOLDER, feature), fixtureFolder, { recursive: true });
  const { framework } = JSON.parse(readFileSync(join(fixtureFolder, 'features.json'), 'utf-8')) as FixtureFeatures;
  cpSync(TSCONFIG_PRESETS_FOLDER, join(fixtureFolder, 'toolkit-tsconfig'), { recursive: true });
  const tsconfig = {
    compilerOptions: { allowImportingTsExtensions: true, module: 'esnext', moduleResolution: 'bundler', noEmit: true, target: 'es2022' },
    ...framework !== undefined && { extends: `./toolkit-tsconfig/${framework}.json` }
  };
  writeFileSync(join(fixtureFolder, 'tsconfig.json'), JSON.stringify(tsconfig));
  return fixtureFolder;
}
