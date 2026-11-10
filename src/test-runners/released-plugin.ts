/**
 * @file
 *
 * Fetches a community plugin's RELEASED build, so an integration test can install the real thing into a live vault
 * rather than a stub standing in for it.
 *
 * A plugin that depends on another plugin, or talks to one, needs this whenever a stub cannot prove what the test is
 * there to prove: a stub emits what the plugin under test expects, not what the published plugin actually does. Only a
 * released artifact settles whether the two agree.
 *
 * A released asset, deliberately, and not a locally built one: it is the build a user installs, it pins to a version
 * number the test can state, and it needs no checkout of the other repository to be present or buildable. The version
 * is required, never `latest`: a test that silently follows a moving artifact stops being a statement about anything.
 *
 * Downloads land in `node_modules/.cache/obsidian-dev-toolkit/released-plugins/<plugin id>/<version>` under the project
 * root, so they need no `.gitignore` entry, a suite run after the first does no network I/O, and a pinned version is
 * fetched exactly once.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  mkdir,
  readFile,
  rename,
  writeFile
} from 'node:fs/promises';
import process from 'node:process';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';

/**
 * Parameters for {@link downloadReleasedPlugin}.
 */
export interface DownloadReleasedPluginParams {
  /**
   * The plugin's `manifest.id`, used as the cache folder name.
   */
  readonly pluginId: string;

  /**
   * The `owner/name` of the GitHub repository publishing the release.
   */
  readonly repo: string;

  /**
   * The project root whose `node_modules/.cache` holds the downloads. Defaults to the root of the current working
   * directory.
   */
  readonly rootFolder?: string;

  /**
   * The release tag to download. A pinned version, never `latest`.
   */
  readonly version: string;
}

/**
 * Parameters for {@link getReleasedPluginPopulate}.
 */
export interface GetReleasedPluginPopulateParams extends DownloadReleasedPluginParams {
  /**
   * The vault's configuration folder. Defaults to `.obsidian`, which every vault the harness opens uses.
   */
  readonly configFolder?: string;

  /**
   * The plugin settings to seed as its `data.json`, serialized with `JSON.stringify`. Omitted, no `data.json` is
   * seeded and the plugin starts on its defaults.
   */
  readonly data?: unknown;
}

/**
 * The files an Obsidian plugin needs in its folder to be loaded. `styles.css` is deliberately absent: it is optional,
 * and a release need not carry it.
 */
export interface ReleasedPluginFiles {
  /**
   * The contents of the release's `main.js`.
   */
  readonly mainJs: string;

  /**
   * The contents of the release's `manifest.json`.
   */
  readonly manifestJson: string;
}

/**
 * Reads a plugin's released `manifest.json` and `main.js`, downloading them on first use.
 *
 * @param params - Which plugin, repository and release tag to read.
 * @returns The two files' contents.
 * @throws When an asset is neither cached nor downloadable.
 */
export async function downloadReleasedPlugin(params: DownloadReleasedPluginParams): Promise<ReleasedPluginFiles> {
  const rootFolder = params.rootFolder ?? ensureNonNullable(getRootFolder(), 'Could not find the project root');
  const cacheFolderPath = join(rootFolder, 'node_modules', '.cache', 'obsidian-dev-toolkit', 'released-plugins', params.pluginId, params.version);

  return {
    mainJs: await readCachedAsset(cacheFolderPath, 'main.js', params),
    manifestJson: await readCachedAsset(cacheFolderPath, 'manifest.json', params)
  };
}

/**
 * Builds the vault-relative file map that installs a plugin's released build, and optionally its settings, ready to
 * hand to a global setup's `populate` or to merge into a larger map. Enabling it is the global setup's
 * `enableCommunityPlugins`.
 *
 * The result is assignable to `obsidian-integration-testing`'s `PopulateFilesParams`.
 *
 * @param params - Which plugin, repository and release tag to install, and the settings to seed.
 * @returns The map of vault-relative paths to file contents.
 * @throws When an asset is neither cached nor downloadable.
 */
export async function getReleasedPluginPopulate(params: GetReleasedPluginPopulateParams): Promise<Record<string, string>> {
  const files = await downloadReleasedPlugin(params);
  const pluginFolder = `${params.configFolder ?? ObsidianPluginRepoPaths.DotObsidian}/plugins/${params.pluginId}`;

  const populate: Record<string, string> = {
    [`${pluginFolder}/main.js`]: files.mainJs,
    [`${pluginFolder}/manifest.json`]: files.manifestJson
  };

  if (params.data !== undefined) {
    populate[`${pluginFolder}/data.json`] = ensureNonNullable(JSON.stringify(params.data), 'The plugin settings are not JSON-serializable');
  }

  return populate;
}

/**
 * Reads one asset from the cache, downloading and caching it when it is not there yet.
 *
 * @param cacheFolderPath - The folder holding this plugin version's cached assets.
 * @param assetName - The asset's file name, which is also its name in the release.
 * @param params - Which plugin, repository and release tag to read.
 * @returns The asset's contents.
 * @throws When the asset is neither cached nor downloadable.
 */
async function readCachedAsset(cacheFolderPath: string, assetName: string, params: DownloadReleasedPluginParams): Promise<string> {
  const cachedFilePath = join(cacheFolderPath, assetName);

  try {
    return await readFile(cachedFilePath, 'utf-8');
  } catch {
    // Not cached yet, which is the ordinary first-run path rather than a failure.
  }

  const url = `https://github.com/${params.repo}/releases/download/${params.version}/${assetName}`;
  // eslint-disable-next-line no-restricted-globals -- We run this outside of Obsidian, so we don't have `requestUrl()`.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: HTTP ${String(response.status)} ${response.statusText}`);
  }

  const content = await response.text();
  await mkdir(cacheFolderPath, { recursive: true });
  // Written beside the target and renamed into place, so a concurrent reader never sees a partial file.
  const temporaryFilePath = `${cachedFilePath}.${String(process.pid)}.tmp`;
  await writeFile(temporaryFilePath, content, 'utf-8');
  await rename(temporaryFilePath, cachedFilePath);
  return content;
}
