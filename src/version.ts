/**
 * @file
 *
 * Releases an Obsidian plugin: the generic release from `@mnaoumov/typescript-dev-toolkit/version`, plus what only a
 * plugin has — `manifest.json` (and `manifest-beta.json` for a pre-release) and `versions.json` bumped with the
 * plugin's `minAppVersion`, the updated manifest copied into `dist/build`, the demo vault archived as a release
 * asset, and the files in `dist/build` attached to the GitHub release instead of an `npm pack` tarball.
 *
 * It is guarded by the community directory's checks (`plugin-release-checks.ts`): `manifest.json` and `versions.json`
 * before anything runs, and the tag and the assets in `dist/build` once the version is bumped, before the release
 * commit, so a release the directory would reject or delist stops before it is tagged.
 */

import type {
  ParsedVersionArguments as GenericParsedVersionArguments,
  UpdateVersionOptions as GenericUpdateVersionOptions
} from '@mnaoumov/typescript-dev-toolkit/version';

import { readdirPosix } from '@mnaoumov/typescript-dev-toolkit/fs';
import { editJson } from '@mnaoumov/typescript-dev-toolkit/json';
import { resolvePathFromRootSafe } from '@mnaoumov/typescript-dev-toolkit/root';
import {
  isPreRelease,
  toUpdateVersionOptions,
  updateVersion as updateVersionGeneric,
  VERSION_ARGUMENT_OPTIONS
} from '@mnaoumov/typescript-dev-toolkit/version';
import { join } from '@mnaoumov/typescript-lib/path';
import { existsSync } from 'node:fs';
import {
  cp,
  rm
} from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { gt } from 'semver';

import type { ValidatePluginReleaseOptions } from './plugin-release-checks.ts';

import { archivePluginDemoVault } from './demo-vault.ts';
import { ObsidianPluginRepoPaths } from './obsidian-plugin-repo-paths.ts';
import { analyzePluginApiVersion } from './plugin-api-version-check.ts';
import {
  formatPluginCheckFindings,
  hasPluginCheckErrors,
  validatePluginRelease
} from './plugin-release-checks.ts';

/**
 * Type representing the structure of Obsidian's `desktop-releases.json` feed.
 */
export interface DesktopReleasesJson {
  /**
   * The latest Obsidian version available for desktop.
   */
  readonly latestVersion: string;
}

/**
 * Type representing the manifest file format for Obsidian plugins.
 */
export interface Manifest {
  /**
   * A minimum Obsidian version required for the plugin.
   */
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Updated in place by the manifest release editor.
  minAppVersion: string;

  /**
   * A version of the plugin.
   */
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Updated in place by the manifest release editor.
  version: string;
}
/**
 * The result of parsing the command-line arguments for a plugin release.
 */
export interface ParsedVersionArguments extends GenericParsedVersionArguments {
  /**
   * The {@link UpdateVersionOptions} parsed from the flags.
   */
  readonly options: UpdateVersionOptions;
}

/**
 * Options for {@link updateVersion}: the generic release options plus the plugin's own.
 */
export interface UpdateVersionOptions extends GenericUpdateVersionOptions {
  /**
   * An explicit `minAppVersion` to write into the plugin's `manifest.json` and its new `versions.json`
   * entry. When API analysis is requested, an explicit value below the detected floor is rejected.
   *
   * Only applies to non-pre-release versions (a pre-release copies the
   * existing `manifest.json` and never writes `minAppVersion`).
   *
   * @default The current manifest's minimum, raised to the detected API floor when analysis is requested.
   */
  readonly minAppVersion?: string | undefined;

  /**
   * Whether to archive the plugin's demo vault (`demo-vault/` in the repo root) as a release artifact. Ignored
   * when the repo has no `demo-vault/` folder.
   *
   * @default `true`
   */
  readonly shouldArchiveDemoVault?: boolean;

  /**
   * Whether to derive an API floor using the project's typed ESLint configuration before updating stable
   * compatibility files. Raises the existing minimum only when unguarded APIs require it. Analysis failures
   * stop the update; other runtime and dependency requirements still need review. Ignored for pre-releases.
   *
   * @default `false`
   */
  readonly shouldCheckApiVersion?: boolean;

  /**
   * Whether to run the community directory's manifest, tag and asset checks, and stop the release on an error.
   *
   * @default `true`
   */
  readonly shouldRunReleaseChecks?: boolean;
}

/**
 * Copies the updated manifest file to the distribution build folder.
 *
 * @returns A {@link Promise} that resolves when the copy operation is complete.
 */
export async function copyUpdatedManifest(): Promise<void> {
  await cp(
    resolvePathFromRootSafe({ path: ObsidianPluginRepoPaths.ManifestJson }),
    resolvePathFromRootSafe({ path: join(ObsidianPluginRepoPaths.DistBuild, ObsidianPluginRepoPaths.ManifestJson) }),
    { force: true }
  );
}

/**
 * Parses the command-line arguments for a plugin release: every flag the generic `parseVersionArguments`
 * recognizes, plus the plugin's own:
 * - `--min-app-version=<x.y.z>` — write this `minAppVersion` into the plugin's `manifest.json` and its new
 *   `versions.json` entry instead of preserving the current minimum.
 * - `--api-version` — analyze unguarded API uses and raise the preserved minimum when necessary.
 * - `--no-demo-vault` — skip archiving the plugin's demo vault (`demo-vault/`) as a release artifact.
 * - `--no-release-checks` — skip the community directory's manifest, tag and asset checks.
 *
 * @param $arguments - The command-line arguments to parse (typically `process.argv.slice(2)`).
 * @returns The {@link ParsedVersionArguments} containing the version update type and the options.
 */
export function parseVersionArguments($arguments: string[]): ParsedVersionArguments {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
    args: $arguments,
    options: {
      ...VERSION_ARGUMENT_OPTIONS,
      'api-version': { type: 'boolean' },
      'min-app-version': { type: 'string' },
      'no-demo-vault': { type: 'boolean' },
      'no-release-checks': { type: 'boolean' }
    }
  });

  return {
    options: {
      ...toUpdateVersionOptions(values),
      minAppVersion: values['min-app-version'],
      shouldArchiveDemoVault: !(values['no-demo-vault'] ?? false),
      shouldCheckApiVersion: values['api-version'] ?? false,
      shouldRunReleaseChecks: !(values['no-release-checks'] ?? false)
    },
    versionUpdateType: positionals[0]
  };
}

/**
 * Releases the plugin. See the `@file` overview for what it adds to the generic release.
 *
 * @param versionUpdateType - The type of version update to perform (major, minor, patch, premajor, preminor, prepatch, prerelease, or x.y.z[-suffix]).
 * @param options - The {@link UpdateVersionOptions} controlling the release behavior.
 * @returns A {@link Promise} that resolves when the release is complete.
 */
export async function updateVersion(versionUpdateType?: string, options: UpdateVersionOptions = {}): Promise<void> {
  const {
    minAppVersion,
    prepareGitHubRelease,
    shouldArchiveDemoVault = true,
    shouldCheckApiVersion = false,
    shouldRunReleaseChecks = true,
    ...genericOptions
  } = options;

  if (shouldRunReleaseChecks) {
    await assertPluginReleaseChecksPass('before the release', { shouldCheckAssets: false, shouldCheckVersion: false });
  }

  await updateVersionGeneric(versionUpdateType, {
    ...genericOptions,
    getReleaseAssetPaths: getPluginReleaseAssetPaths,
    async prepareGitHubRelease(newVersion: string): Promise<void> {
      await prepareGitHubRelease?.(newVersion);
      if (shouldArchiveDemoVault) {
        await archivePluginDemoVault();
      }
    },
    async updateVersionInExtraFiles(newVersion: string): Promise<void> {
      await updateVersionInFilesForPlugin(newVersion, { minAppVersion, shouldCheckApiVersion });
      if (shouldRunReleaseChecks) {
        await assertPluginReleaseChecksPass(
          `releasing ${newVersion}`,
          isPreRelease(newVersion)
            ? { manifestFile: ObsidianPluginRepoPaths.ManifestBetaJson, shouldCheckAssets: false }
            : { shouldRequireAssets: true, tag: newVersion }
        );
      }
    }
  });
}

/**
 * Runs the community directory's checks and throws on an error, printing every finding.
 *
 * @param stage - Where in the release the checks run, for the error message.
 * @param options - The checks to run.
 * @returns A {@link Promise} that resolves when no check reported an error.
 */
async function assertPluginReleaseChecksPass(stage: string, options: ValidatePluginReleaseOptions): Promise<void> {
  const findings = await validatePluginRelease(options);
  if (findings.length === 0) {
    return;
  }

  const report = formatPluginCheckFindings(findings);
  if (hasPluginCheckErrors(findings)) {
    throw new Error(
      `The community directory checks failed ${stage}. Fix these, or pass --no-release-checks to release anyway:\n${report}`
    );
  }
  console.warn(report);
}

/**
 * The plugin's release assets: every file in `dist/build`.
 *
 * @returns The asset paths.
 */
async function getPluginReleaseAssetPaths(): Promise<string[]> {
  const buildFolder = resolvePathFromRootSafe({ path: ObsidianPluginRepoPaths.DistBuild });
  const fileNames = await readdirPosix(buildFolder);
  return fileNames.map((fileName) => join(buildFolder, fileName));
}

async function updateVersionInFilesForPlugin(
  newVersion: string,
  options: Pick<UpdateVersionOptions, 'minAppVersion' | 'shouldCheckApiVersion'>
): Promise<void> {
  const { minAppVersion, shouldCheckApiVersion } = options;
  const manifestBetaJsonPath = resolvePathFromRootSafe({ path: ObsidianPluginRepoPaths.ManifestBetaJson });
  if (isPreRelease(newVersion)) {
    await cp(
      resolvePathFromRootSafe({ path: ObsidianPluginRepoPaths.ManifestJson }),
      manifestBetaJsonPath,
      { force: true }
    );
    await editJson<Manifest>({
      editFunction: (manifest) => {
        manifest.version = newVersion;
      },
      path: ObsidianPluginRepoPaths.ManifestBetaJson
    });
  } else {
    const apiVersionReport = shouldCheckApiVersion ? await analyzePluginApiVersion() : undefined;
    const requiredMinAppVersion = apiVersionReport?.requiredMinAppVersion;
    if (minAppVersion !== undefined && requiredMinAppVersion !== undefined && gt(requiredMinAppVersion, minAppVersion)) {
      throw new Error(`The source requires Obsidian ${requiredMinAppVersion}, above --min-app-version=${minAppVersion}. Raise the minimum or guard the newer APIs.`);
    }
    let resolvedMinAppVersion: string;

    await editJson<Manifest>({
      editFunction: (manifest) => {
        resolvedMinAppVersion = minAppVersion ?? manifest.minAppVersion;
        if (requiredMinAppVersion !== undefined && gt(requiredMinAppVersion, resolvedMinAppVersion)) {
          resolvedMinAppVersion = requiredMinAppVersion;
        }
        manifest.minAppVersion = resolvedMinAppVersion;
        manifest.version = newVersion;
      },
      path: ObsidianPluginRepoPaths.ManifestJson
    });

    await editJson<Record<string, string>>({
      editFunction: (versions) => {
        versions[newVersion] = resolvedMinAppVersion;
      },
      path: ObsidianPluginRepoPaths.VersionsJson
    });

    if (existsSync(manifestBetaJsonPath)) {
      await rm(manifestBetaJsonPath);
    }
  }

  await copyUpdatedManifest();
}
