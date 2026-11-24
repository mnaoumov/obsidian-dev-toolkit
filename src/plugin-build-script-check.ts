/**
 * @file
 *
 * Warns when the npm script the community directory rebuilds a plugin with does not run this package's production
 * build. The directory rebuilds `main.js` from the tagged commit with the first of `build`, `build:plugin` and `compile`
 * that `package.json` defines, so a hand-written script there can produce other bytes than the release this package
 * built. Re-implemented after `obsidian-plugin-dev-kit`'s `src/release/build-script.ts` (v0.4.0, MIT).
 *
 * Unlike the original, which looks for its own command in the script text, a plugin here runs a script file
 * (`jiti scripts/build.ts`) or a bundler command line (`vite build`, `rollup --config`, `webpack`), so the check reads
 * that file or the bundler's config and looks for this package's builder in it. A script that runs another npm script
 * (`npm run build:plugin`) is followed.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { readFile } from 'node:fs/promises';

import type { PluginCheckFinding } from './plugin-release-checks.ts';

/**
 * Options for {@link validateProjectBuildScript}.
 */
export interface ValidateProjectBuildScriptOptions {
  /**
   * The project root. Defaults to the root of the current working directory's project.
   */
  readonly rootFolder?: string;
}

interface ScriptContext {
  readonly rootFolder: string;
  readonly scripts: Readonly<Record<string, unknown>>;
  readonly visitedScripts: Set<string>;
}

/**
 * The scripts the community directory tries, in its order: the first one `package.json` defines is what rebuilds
 * `main.js` from the tagged commit.
 */
export const DIRECTORY_BUILD_SCRIPTS = ['build', 'build:plugin', 'compile'] as const;

const TOOLKIT_PACKAGE_NAME = '@mnaoumov/obsidian-dev-toolkit';
const TOOLKIT_BUILDER_REGEX = /\bbuild\s*\(|\bobsidianPluginVite\b|\bobsidianPluginRollup\b|\bObsidianPluginWebpackPlugin\b/;
const SCRIPT_FILE_REGEX = /\.[cm]?[jt]s$/;
const OPTION_PREFIX_REGEX = /^--[\w-]+=/;
const COMMAND_SEPARATOR_REGEX = /&&|\|\||[;|]/;
const DEVELOPMENT_FLAG_REGEX = /(?:^|\s)(?:--watch|-w|--mode[\s=]development)(?:\s|$)/;
const NPM_RUN_REGEX = /^(?:npm|pnpm|yarn|bun)$/;
const RUN_SUBCOMMANDS = new Set(['run', 'run-script']);
const PACKAGE_RUNNERS = new Set(['bunx', 'npx', 'pnpx']);
const CONFIG_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];
const BUNDLER_CONFIG_BASENAMES: Readonly<Record<string, string>> = {
  rollup: 'rollup.config',
  vite: 'vite.config',
  webpack: 'webpack.config'
};

/**
 * Validates that the script the community directory rebuilds `main.js` with runs this package's production build.
 * Both findings are warnings: the directory may still produce the same bytes, but nothing here can tell.
 *
 * @param options - The {@link ValidateProjectBuildScriptOptions}.
 * @returns A {@link Promise} that resolves to the findings, empty when the script runs the build or there is no
 *   `package.json` at all.
 */
export async function validateProjectBuildScript(options: ValidateProjectBuildScriptOptions = {}): Promise<PluginCheckFinding[]> {
  const rootFolder = options.rootFolder ?? ensureNonNullable(getRootFolder(), 'Could not find the project root');
  const packageJsonText = await readTextFile(join(rootFolder, 'package.json'));
  if (packageJsonText === null) {
    return [];
  }

  const scripts = readScripts(parseJson(packageJsonText));
  const scriptName = DIRECTORY_BUILD_SCRIPTS.find((candidate) => typeof scripts[candidate] === 'string');
  if (scriptName === undefined) {
    return [{
      level: 'warning',
      message: `package.json has none of the scripts ${DIRECTORY_BUILD_SCRIPTS.map((script) => `"${script}"`).join(', ')}, so the community directory has nothing to rebuild main.js with. Add "build": "jiti scripts/build.ts", whose script calls build() from ${TOOLKIT_PACKAGE_NAME}/bundlers/esbuild.`,
      ruleId: 'build-script-missing'
    }];
  }

  const command = String(scripts[scriptName]);
  const context: ScriptContext = { rootFolder, scripts, visitedScripts: new Set([scriptName]) };
  if (await doesCommandRunToolkitBuild(command, context)) {
    return [];
  }

  return [{
    level: 'warning',
    message: `package.json scripts.${scriptName} is "${command}" and does not run the production build of ${TOOLKIT_PACKAGE_NAME}. The community directory rebuilds main.js with that script, so the bytes it compares may not be the ones this package releases. Make it run a script file that calls build() from ${TOOLKIT_PACKAGE_NAME}/bundlers/<bundler>, or a vite, rollup or webpack build whose config uses the package's adapter.`,
    ruleId: 'build-script-not-toolkit'
  }];
}

async function doesCommandRunToolkitBuild(command: string, context: ScriptContext): Promise<boolean> {
  for (const segment of command.split(COMMAND_SEPARATOR_REGEX)) {
    if (await doesCommandSegmentRunToolkitBuild(segment.trim(), context)) {
      return true;
    }
  }
  return false;
}

async function doesCommandSegmentRunToolkitBuild(segment: string, context: ScriptContext): Promise<boolean> {
  if (DEVELOPMENT_FLAG_REGEX.test(segment)) {
    return false;
  }

  const tokens = segment.split(/\s+/).filter(Boolean).map((token) => unquote(token));
  const [first, second, third] = tokens;
  if (first === undefined) {
    return false;
  }

  if (NPM_RUN_REGEX.test(first) && second !== undefined) {
    const nestedName = RUN_SUBCOMMANDS.has(second) ? third : second;
    if (nestedName !== undefined && typeof context.scripts[nestedName] === 'string') {
      return await doesNestedScriptRunToolkitBuild(nestedName, context);
    }
  }

  // A script file, or a bundler config named on the command line (`--config build/vite.mts`, `--config=...`).
  for (const rawToken of tokens) {
    const token = rawToken.replace(OPTION_PREFIX_REGEX, '');
    if (SCRIPT_FILE_REGEX.test(token) && await doesFileUseToolkitBuilder(join(context.rootFolder, token))) {
      return true;
    }
  }

  const bundler = PACKAGE_RUNNERS.has(first) || NPM_RUN_REGEX.test(first) ? second : first;
  const configBasename = bundler === undefined ? undefined : BUNDLER_CONFIG_BASENAMES[bundler];
  if (configBasename === undefined) {
    return false;
  }

  for (const extension of CONFIG_EXTENSIONS) {
    if (await doesFileUseToolkitBuilder(join(context.rootFolder, `${configBasename}.${extension}`))) {
      return true;
    }
  }
  return false;
}

async function doesFileUseToolkitBuilder(path: string): Promise<boolean> {
  const text = await readTextFile(path);
  return text !== null && text.includes(TOOLKIT_PACKAGE_NAME) && TOOLKIT_BUILDER_REGEX.test(text);
}

async function doesNestedScriptRunToolkitBuild(scriptName: string, context: ScriptContext): Promise<boolean> {
  if (context.visitedScripts.has(scriptName)) {
    return false;
  }
  context.visitedScripts.add(scriptName);
  return await doesCommandRunToolkitBuild(String(context.scripts[scriptName]), context);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function readScripts(packageJson: unknown): Readonly<Record<string, unknown>> {
  if (typeof packageJson !== 'object' || packageJson === null) {
    return {};
  }
  const scripts = (packageJson as Record<string, unknown>)['scripts'];
  return typeof scripts === 'object' && scripts !== null ? scripts as Record<string, unknown> : {};
}

async function readTextFile(path: string): Promise<null | string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function unquote(token: string): string {
  return token.replaceAll(/^["']|["']$/g, '');
}
