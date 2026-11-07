/**
 * @file
 *
 * Releases an Obsidian plugin: the generic release from `@mnaoumov/typescript-dev-toolkit/version`, plus what only a
 * plugin has — `manifest.json` (and `manifest-beta.json` for a pre-release) and `versions.json` bumped with the
 * plugin's `minAppVersion`, the updated manifest (`manifest-beta.json` for a pre-release) copied into `dist/build` as
 * the `manifest.json` release asset, the demo vault archived as a release
 * asset, and the files in `dist/build` attached to the GitHub release instead of an `npm pack` tarball.
 *
 * It is guarded by the community directory's checks (`plugin-release-checks.ts`): `manifest.json` and `versions.json`
 * before anything runs, and the tag and the assets in `dist/build` once the version is bumped, before the release
 * commit, so a release the directory would reject or delist stops before it is tagged.
 *
 * It publishes before it pushes (the generic `shouldPublishBeforePush`): the tag goes up first, the GitHub release
 * is created and verified with every asset, and only then does the default branch receive the commit that carries the
 * new stable `manifest.json`. Obsidian reads a plugin's version from that branch and downloads the assets of the
 * release whose tag equals it, so the branch must never name a release that is not public yet.
 */

import type {
  ParsedVersionArguments as GenericParsedVersionArguments,
  UpdateVersionOptions as GenericUpdateVersionOptions
} from '@mnaoumov/typescript-dev-toolkit/version';

import { readdirPosix } from '@mnaoumov/typescript-dev-toolkit/fs';
import {
  editJson,
  readJson
} from '@mnaoumov/typescript-dev-toolkit/json';
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
import {
  gt,
  prerelease,
  valid
} from 'semver';

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
 *
 * This is the feed the desktop app itself updates from, so it is the only source that states a version
 * desktop users can actually run. Its `latestVersion` is the public stable release; insider (Catalyst) builds
 * live under a separate `beta` key, which is deliberately not read.
 */
export interface DesktopReleasesJson {
  /**
   * The latest public Obsidian version available for desktop.
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
   * entry. When set, it is used verbatim and the latest public Obsidian version is not fetched at all. When API
   * analysis is requested, an explicit value below the detected floor is rejected.
   *
   * The support policy is that every release requires the latest public Obsidian, so a plugin never carries the
   * burden of older versions; this override is the explicit, visible opt-out from that policy. Only applies to
   * non-pre-release versions (a pre-release copies the existing `manifest.json` and never writes `minAppVersion`).
   *
   * @default the latest public Obsidian desktop version
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
   * compatibility files. The floor never changes the minimum: it only stops a release whose minimum is below it (an
   * explicit `minAppVersion` too low, or source using an API newer than the latest public Obsidian). Analysis
   * failures stop the update; other runtime and dependency requirements still need review. Ignored for pre-releases.
   *
   * @default `false`
   */
  readonly shouldCheckApiVersion?: boolean;

  /**
   * Whether to publish and verify the GitHub release before the release commit reaches the default branch, so
   * the branch never exposes a stable `manifest.json` whose release is not public yet. See the generic option.
   *
   * @default `true`, unlike the generic release
   */
  readonly shouldPublishBeforePush?: boolean;

  /**
   * Whether to run the community directory's manifest, tag and asset checks, and stop the release on an error.
   *
   * @default `true`
   */
  readonly shouldRunReleaseChecks?: boolean;
}

/**
 * The feed the Obsidian desktop app updates from.
 *
 * Deliberately NOT the GitHub `releases/latest` API: that endpoint returns the newest release of any kind
 * in `obsidianmd/obsidian-releases`, including one whose only asset is the Android APK, which no desktop
 * user can install. See {@link getLatestPublicObsidianVersion}.
 */
const DESKTOP_RELEASES_JSON_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json';

/**
 * Copies the updated manifest file to the distribution build folder, as the `manifest.json` release asset.
 *
 * A pre-release passes `manifest-beta.json`, because BRAT reads `manifest.json` from the release assets (and ignores
 * `manifest-beta.json` in the repository since its 1.1.0), so the asset must carry the pre-release version.
 *
 * @param manifestFile - The repository manifest to copy: `manifest.json` for a stable release, `manifest-beta.json`
 * for a pre-release.
 * @returns A {@link Promise} that resolves when the copy operation is complete.
 */
export async function copyUpdatedManifest(manifestFile: string = ObsidianPluginRepoPaths.ManifestJson): Promise<void> {
  await cp(
    resolvePathFromRootSafe({ path: manifestFile }),
    resolvePathFromRootSafe({ path: join(ObsidianPluginRepoPaths.DistBuild, ObsidianPluginRepoPaths.ManifestJson) }),
    { force: true }
  );
}

/**
 * Parses the command-line arguments for a plugin release: every flag the generic `parseVersionArguments`
 * recognizes, plus the plugin's own:
 * - `--min-app-version=<x.y.z>` — write this `minAppVersion` into the plugin's `manifest.json` and its new
 *   `versions.json` entry instead of the latest public Obsidian desktop version.
 * - `--api-version` — analyze unguarded API uses and stop the release when the minimum is below their floor.
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
    shouldPublishBeforePush = true,
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
      await assertReleasedManifestMatchesTag(newVersion);
      await prepareGitHubRelease?.(newVersion);
      if (shouldArchiveDemoVault) {
        await archivePluginDemoVault();
      }
    },
    shouldPublishBeforePush,
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
 * Stops a release whose manifest, in the repository or among the assets, does not carry the tag's version: for a
 * stable release `manifest.json`, for a pre-release `manifest-beta.json`, and in both cases the `manifest.json`
 * asset in `dist/build`. Runs before the tag is pushed, so a mismatch leaves the remote untouched.
 *
 * @param newVersion - The version being released, which is also the tag.
 * @returns A {@link Promise} that resolves when both manifests carry the version.
 */
async function assertReleasedManifestMatchesTag(newVersion: string): Promise<void> {
  const isPreReleaseVersion = isPreRelease(newVersion);
  const manifestPaths = [
    isPreReleaseVersion ? ObsidianPluginRepoPaths.ManifestBetaJson : ObsidianPluginRepoPaths.ManifestJson,
    join(ObsidianPluginRepoPaths.DistBuild, ObsidianPluginRepoPaths.ManifestJson)
  ];
  const releaseKind = isPreReleaseVersion ? 'a pre-release' : 'a stable';
  for (const path of manifestPaths) {
    const manifest = await readJson<Manifest>(resolvePathFromRootSafe({ path }));
    if (manifest.version !== newVersion) {
      throw new Error(`Refusing to release ${newVersion}: ${path} carries version ${manifest.version}, and ${releaseKind} manifest must equal the release tag.`);
    }
  }
}

/**
 * Fetches the latest public stable version of Obsidian that the desktop app can actually run.
 *
 * Reads {@link DESKTOP_RELEASES_JSON_URL}, not the GitHub `releases/latest` API. The API returns the newest
 * release of ANY kind, so whenever a mobile-only release (an APK-only asset) is newer than the desktop one,
 * it reports a version that does not exist for desktop. A plugin released in that window gets a
 * `minAppVersion` no desktop user can satisfy, and Obsidian silently keeps offering them the previous
 * release instead — the release succeeds and reaches nobody.
 *
 * Every failure throws rather than falling back to the manifest's current minimum, so a release never claims the
 * latest-public policy while silently keeping a stale floor.
 *
 * @returns A {@link Promise} that resolves to the latest public Obsidian version available for desktop.
 */
async function getLatestPublicObsidianVersion(): Promise<string> {
  const hint = 'Pass --min-app-version=<x.y.z> to release with an explicit minimum instead.';
  let response: Response;
  try {
    // eslint-disable-next-line no-restricted-globals -- We run this outside of Obsidian, so we don't have `requestUrl()`.
    response = await fetch(DESKTOP_RELEASES_JSON_URL);
  } catch (error) {
    throw new Error(`Could not fetch the latest public Obsidian version from ${DESKTOP_RELEASES_JSON_URL}. ${hint}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Could not fetch the latest public Obsidian version: ${DESKTOP_RELEASES_JSON_URL} answered ${String(response.status)}. ${hint}`);
  }

  const desktopReleasesJson = await response.json() as null | Partial<DesktopReleasesJson>;
  const latestVersion = desktopReleasesJson?.latestVersion;
  if (typeof latestVersion !== 'string' || valid(latestVersion) !== latestVersion || prerelease(latestVersion) !== null) {
    throw new Error(`${DESKTOP_RELEASES_JSON_URL} has no valid public latestVersion (got ${JSON.stringify(latestVersion) ?? 'undefined'}). ${hint}`);
  }

  return latestVersion;
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
  const isPreReleaseVersion = isPreRelease(newVersion);
  if (isPreReleaseVersion) {
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
    const resolvedMinAppVersion = minAppVersion ?? await getLatestPublicObsidianVersion();
    const apiVersionReport = shouldCheckApiVersion ? await analyzePluginApiVersion() : undefined;
    const requiredMinAppVersion = apiVersionReport?.requiredMinAppVersion;
    if (requiredMinAppVersion !== undefined && gt(requiredMinAppVersion, resolvedMinAppVersion)) {
      throw new Error(
        minAppVersion === undefined
          ? `The source requires Obsidian ${requiredMinAppVersion}, above the latest public version ${resolvedMinAppVersion}. Guard the newer APIs.`
          : `The source requires Obsidian ${requiredMinAppVersion}, above --min-app-version=${minAppVersion}. Raise the minimum or guard the newer APIs.`
      );
    }

    await editJson<Manifest>({
      editFunction: (manifest) => {
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

  await copyUpdatedManifest(isPreReleaseVersion ? ObsidianPluginRepoPaths.ManifestBetaJson : ObsidianPluginRepoPaths.ManifestJson);
}
