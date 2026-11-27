/**
 * @file
 *
 * The plugin layer of `assertReproducibleBuild` from `@mnaoumov/typescript-dev-toolkit`: it names the files a plugin
 * release ships, `main.js` and `styles.css` in the production output folder, as the outputs a build of the committed
 * tree must reproduce byte for byte. The community directory rebuilds `main.js` from the release tag, so a bundle that
 * depends on an uncommitted file, or carries a path of this machine, is one the directory cannot match.
 */

import type {
  AssertReproducibleBuildParams,
  ReproducibleBuildDependencies
} from '@mnaoumov/typescript-dev-toolkit/reproducible-build';

import {
  assertReproducibleBuild,
  createNodeReproducibleBuildDependencies
} from '@mnaoumov/typescript-dev-toolkit/reproducible-build';
import { existsSync } from 'node:fs';
import {
  join,
  relative,
  resolve
} from 'node:path';
import process from 'node:process';

import { ObsidianPluginRepoPaths } from './obsidian-plugin-repo-paths.ts';

/**
 * Options of {@link assertObsidianPluginReproducibleBuild}.
 */
export interface AssertObsidianPluginReproducibleBuildOptions extends Partial<AssertReproducibleBuildParams> {
  /**
   * The production output folder, relative to the project folder or absolute: the `distFolder` the build is
   * configured with.
   *
   * @default `'dist/build'`
   */
  readonly distFolder?: string;

  /**
   * The outputs to compare instead of `main.js` and `styles.css` in {@link distFolder}, relative to the project folder.
   */
  readonly outputPaths?: readonly string[];
}

const DEFAULT_BUILD_COMMAND: readonly string[] = ['npm', 'run', 'build'];

const OUTPUT_TAIL_LINE_COUNT = 20;

/**
 * Parameters of {@link getObsidianPluginReproducibleOutputPaths}.
 */
export interface GetObsidianPluginReproducibleOutputPathsParams {
  /**
   * The production output folder, relative to {@link projectFolder} or absolute.
   */
  readonly distFolder: string;

  /**
   * The project folder.
   */
  readonly projectFolder: string;
}

interface BuildWorkingTreeParams {
  readonly buildCommand: readonly string[];
  readonly dependencies: ReproducibleBuildDependencies;
  readonly projectFolder: string;
}

/**
 * Builds the plugin from the working tree and from the committed tree extracted elsewhere, and requires `main.js` and
 * `styles.css` to be identical byte for byte (`styles.css` only when the working-tree build wrote one).
 *
 * The working tree is built first, here, so that a plugin without styles is not reported for a `styles.css` neither
 * build produced. The esbuild adapter honours the `NODE_PRESERVE_SYMLINKS=1` the second build runs under.
 *
 * @param options - The {@link AssertObsidianPluginReproducibleBuildOptions}.
 * @returns A {@link Promise} that resolves when every output matches.
 * @throws If a build fails, or with every difference found.
 */
export async function assertObsidianPluginReproducibleBuild(options: AssertObsidianPluginReproducibleBuildOptions = {}): Promise<void> {
  const {
    buildCommand = DEFAULT_BUILD_COMMAND,
    dependencies = createNodeReproducibleBuildDependencies(),
    distFolder = ObsidianPluginRepoPaths.DistBuild,
    outputPaths,
    projectFolder = process.cwd(),
    shouldBuildWorkingTree = true,
    ...rest
  } = options;

  if (shouldBuildWorkingTree) {
    await buildWorkingTree({ buildCommand, dependencies, projectFolder });
  }

  await assertReproducibleBuild({
    ...rest,
    buildCommand,
    dependencies,
    outputPaths: outputPaths ?? getObsidianPluginReproducibleOutputPaths({ distFolder, projectFolder }),
    projectFolder,
    shouldBuildWorkingTree: false
  });
}

/**
 * Names the release files of a plugin build as paths relative to the project folder: `main.js` always, and
 * `styles.css` when the build left one.
 *
 * @param params - The {@link GetObsidianPluginReproducibleOutputPathsParams}.
 * @returns The output paths, `/`-separated.
 */
export function getObsidianPluginReproducibleOutputPaths(params: GetObsidianPluginReproducibleOutputPathsParams): string[] {
  const { distFolder, projectFolder } = params;
  const absoluteDistFolder = resolve(projectFolder, distFolder);
  const outputPaths = [ObsidianPluginRepoPaths.MainJs as string];
  if (existsSync(join(absoluteDistFolder, ObsidianPluginRepoPaths.StylesCss))) {
    outputPaths.push(ObsidianPluginRepoPaths.StylesCss);
  }

  return outputPaths.map((fileName) => relative(projectFolder, join(absoluteDistFolder, fileName)).replaceAll('\\', '/'));
}

async function buildWorkingTree(params: BuildWorkingTreeParams): Promise<void> {
  const { buildCommand, dependencies, projectFolder } = params;
  dependencies.log(`Building the working tree: ${buildCommand.join(' ')}`);
  const result = await dependencies.run(buildCommand, { cwd: projectFolder });
  if (result.exitCode === 0) {
    return;
  }

  const output = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-OUTPUT_TAIL_LINE_COUNT);
  throw new Error([`the working tree does not build: ${buildCommand.join(' ')} exited with ${String(result.exitCode)}.`, ...output].join('\n'));
}
