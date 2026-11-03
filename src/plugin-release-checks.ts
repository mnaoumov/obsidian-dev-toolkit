/**
 * @file
 *
 * Validates an Obsidian plugin's `manifest.json`, `versions.json`, release tag and release assets the way the
 * community directory does, so a release that would be rejected or delisted fails on the developer's machine first.
 *
 * The manifest, `versions.json` and asset rules mirror `obsidianmd/obsidian-workflows` (`src/manifest.ts` and
 * `src/release.ts`, v1.2.3), the action the directory team points to as matching its scanner, and keep its rule ids.
 * The plugin id character set, the numbers-and-dots release version and the tag rules come from the submission bot,
 * `obsidianmd/obsidian-releases`' `validate-plugin-entry.yml`, which looks a release up by the tag equal to
 * `manifest.json`'s `version`. Severities follow the action's `strict: true`, the setting the team recommends, except
 * that a tag differing from the manifest version is an error rather than a warning: the directory then finds no
 * release for the version the manifest names.
 *
 * As in the action, an ID already listed in the directory (`community-plugins.json`) for the same repository is exempt
 * from the banned-word rule, since a listed ID can never change. The directory is fetched only when that rule fires.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { existsSync } from 'node:fs';
import {
  readdir,
  readFile
} from 'node:fs/promises';

import { ObsidianPluginRepoPaths } from './obsidian-plugin-repo-paths.ts';

/**
 * One finding of the plugin checks.
 */
export interface PluginCheckFinding {
  /**
   * `error` fails the check; `warning` is reported only.
   */
  readonly level: PluginCheckFindingLevel;

  /**
   * What is wrong, and where.
   */
  readonly message: string;

  /**
   * The rule id, as `obsidianmd/obsidian-workflows` names it where it has the rule.
   */
  readonly ruleId: string;
}

/**
 * The level of a {@link PluginCheckFinding}.
 */
export type PluginCheckFindingLevel = 'error' | 'warning';

/**
 * Options for {@link validatePluginManifest}.
 */
export interface ValidatePluginManifestOptions {
  /**
   * Whether the ID is already listed in the directory, which exempts it from the banned-word rule. Defaults to
   * `false`.
   */
  readonly isIdListed?: boolean;

  /**
   * Whether to check `version`. Defaults to `true`; a check before the version is bumped turns it off, since an
   * unreleased plugin still carries the `0.0.0` placeholder.
   */
  readonly shouldCheckVersion?: boolean;
}

/**
 * Options for {@link validatePluginRelease}.
 */
export interface ValidatePluginReleaseOptions extends ValidatePluginManifestOptions {
  /**
   * The folder holding the built release assets, relative to the project root. Its assets are checked when it exists,
   * or always when {@link shouldRequireAssets} is set. Defaults to `dist/build`.
   */
  readonly distFolder?: string;

  /**
   * The manifest to check, relative to the project root. Defaults to `manifest.json`; a pre-release checks
   * `manifest-beta.json`.
   */
  readonly manifestFile?: string;

  /**
   * The `owner/repo` of the plugin. A listed ID is exempt from the banned-word rule only when it is listed for this
   * repository; without it, a listed ID is exempt whatever repository lists it.
   */
  readonly repository?: string;

  /**
   * The project root. Defaults to the root of the current working directory's project.
   */
  readonly rootFolder?: string;

  /**
   * Whether to check the release assets in {@link distFolder} at all. Defaults to `true`.
   */
  readonly shouldCheckAssets?: boolean;

  /**
   * Whether a missing {@link distFolder} is an error rather than a reason to skip the asset checks. Defaults to
   * `false`.
   */
  readonly shouldRequireAssets?: boolean;

  /**
   * The release tag to check against the manifest. Not checked when omitted.
   */
  readonly tag?: string;
}

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;
const NUMERIC_VERSION_REGEX = /^[0-9.]+$/;
const BETA_MANIFEST_FILE: string = ObsidianPluginRepoPaths.ManifestBetaJson;
const PLUGIN_ID_REGEX = /^[a-z0-9-_]+$/;
const DISALLOWED_WORDS = ['obsidian', 'plugin'];
const AUTHOR_PLACEHOLDERS = new Set(['anonymous', 'author', 'me', 'plugin author', 'unknown', 'your-name', 'your name']);
const PLUGIN_MANIFEST_FIELDS = new Set(['author', 'authorUrl', 'description', 'fundingUrl', 'id', 'isDesktopOnly', 'minAppVersion', 'name', 'version']);
const PLUGIN_RECOMMENDED_FIELDS = ['author', 'minAppVersion', 'isDesktopOnly'];
const REQUIRED_RELEASE_ASSETS = [ObsidianPluginRepoPaths.MainJs, ObsidianPluginRepoPaths.ManifestJson];
const MAX_DESCRIPTION_LENGTH = 250;
const MAX_NAME_LENGTH = 50;
const MIN_DESCRIPTION_LENGTH = 10;
const EMAIL_REGEX = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const HTTP_URL_REGEX = /https?:\/\/\S+/i;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const MIN_ALL_CAPS_LETTERS = 2;
const GITHUB_REPO_PATH_SEGMENTS = 2;
const COMMUNITY_PLUGINS_JSON_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';

/**
 * Formats findings one per line, errors first.
 *
 * @param findings - The findings.
 * @returns The lines, joined by newlines.
 */
export function formatPluginCheckFindings(findings: readonly PluginCheckFinding[]): string {
  return [...findings]
    .sort((a, b) => Number(a.level === 'warning') - Number(b.level === 'warning'))
    .map((finding) => `${finding.level}: ${finding.message} (${finding.ruleId})`)
    .join('\n');
}

/**
 * Tells whether any finding is an error.
 *
 * @param findings - The findings.
 * @returns Whether any of them fails the check.
 */
export function hasPluginCheckErrors(findings: readonly PluginCheckFinding[]): boolean {
  return findings.some((finding) => finding.level === 'error');
}

/**
 * Validates a plugin's `manifest.json` content.
 *
 * @param manifest - The parsed `manifest.json`.
 * @param options - The {@link ValidatePluginManifestOptions}.
 * @returns The findings, empty when the manifest passes.
 */
export function validatePluginManifest(manifest: unknown, options: ValidatePluginManifestOptions = {}): PluginCheckFinding[] {
  if (!isRecord(manifest)) {
    return [error('manifest-invalid-json', 'manifest.json must be a single JSON object.')];
  }

  const { isIdListed = false, shouldCheckVersion = true } = options;
  const findings: PluginCheckFinding[] = [];
  const id = readRequiredString(manifest, 'id', findings);
  if (id !== undefined) {
    findings.push(...validateId(id, isIdListed));
  }

  const name = readRequiredString(manifest, 'name', findings);
  if (name !== undefined) {
    findings.push(...validateName(name));
  }

  if (shouldCheckVersion) {
    const version = readRequiredString(manifest, 'version', findings);
    if (version !== undefined) {
      findings.push(...validateVersion(version));
    }
  }

  const description = readRequiredString(manifest, 'description', findings);
  if (description !== undefined) {
    findings.push(...validateDescription(description, name ?? ''));
  }

  findings.push(...validateOptionalFields(manifest));
  return findings;
}

/**
 * Validates the whole plugin: the manifest and `versions.json` in the project root, the release tag when one is given,
 * and the release assets when the dist folder exists or is required.
 *
 * @param options - The {@link ValidatePluginReleaseOptions}.
 * @returns A {@link Promise} that resolves to the findings, empty when everything passes.
 */
export async function validatePluginRelease(options: ValidatePluginReleaseOptions = {}): Promise<PluginCheckFinding[]> {
  const {
    manifestFile = ObsidianPluginRepoPaths.ManifestJson,
    rootFolder = ensureNonNullable(getRootFolder(), 'Could not find the project root'),
    shouldCheckAssets = true,
    tag
  } = options;

  const manifest = await readJsonFile(join(rootFolder, manifestFile));
  if (manifest === undefined) {
    return [error('manifest-invalid-json', `${manifestFile} not found or is not valid JSON.`)];
  }

  const findings = await validateManifestExemptingListedId(manifest, options);
  findings.push(...await validateVersionsJsonFile(join(rootFolder, ObsidianPluginRepoPaths.VersionsJson)));

  const manifestVersion = readVersion(manifest);
  if (
    manifestFile !== BETA_MANIFEST_FILE
    && (options.shouldCheckVersion ?? true)
    && manifestVersion !== undefined
    && !NUMERIC_VERSION_REGEX.test(manifestVersion)
  ) {
    findings.push(
      error(
        'manifest-version-not-numeric',
        `${manifestFile} version "${manifestVersion}" must contain only numbers and dots. Put pre-release versions in manifest-beta.json.`
      )
    );
  }
  if (tag !== undefined) {
    findings.push(...validateReleaseTag(tag, manifestVersion));
  }

  if (shouldCheckAssets) {
    findings.push(...await validateDistFolder(rootFolder, manifestVersion, options));
  }

  return findings;
}

/**
 * Validates the files of a release.
 *
 * @param fileNames - The names of the files in the release.
 * @param folderLabel - How the folder holding them is named in a finding.
 * @returns The findings, empty when `main.js` and `manifest.json` are both there.
 */
export function validateReleaseAssets(fileNames: readonly string[], folderLabel = 'the release'): PluginCheckFinding[] {
  return REQUIRED_RELEASE_ASSETS.filter((assetName) => !fileNames.includes(assetName)).map((assetName) =>
    error(
      assetName === ObsidianPluginRepoPaths.MainJs ? 'release-asset-main-js-missing' : 'release-asset-manifest-missing',
      `Release asset ${assetName} not found in ${folderLabel}. Did the build step complete successfully?`
    )
  );
}

/**
 * Validates a release tag against the manifest version: the directory looks the release up by a tag equal to
 * `manifest.json`'s `version`, so a `v` prefix or any other difference leaves it with no release to install.
 *
 * @param tag - The release tag.
 * @param manifestVersion - The `version` of `manifest.json`, or `undefined` when it has none.
 * @returns The findings, empty when the tag is the manifest version.
 */
export function validateReleaseTag(tag: string, manifestVersion: string | undefined): PluginCheckFinding[] {
  const findings: PluginCheckFinding[] = [];
  if (/^v\d/i.test(tag)) {
    findings.push(error('release-tag-v-prefix', `Release tag "${tag}" must not start with "v": the directory looks the release up by the bare version.`));
  }
  if (manifestVersion !== undefined && manifestVersion !== tag) {
    findings.push(error('release-manifest-version-mismatch', `manifest.json version "${manifestVersion}" does not match the release tag "${tag}".`));
  }
  if (!NUMERIC_VERSION_REGEX.test(tag)) {
    findings.push(
      warning(
        'release-tag-not-numeric',
        `Release tag "${tag}" is not numbers and dots only. The directory accepts only such a version in manifest.json; a pre-release belongs in manifest-beta.json.`
      )
    );
  }
  return findings;
}

/**
 * Validates a plugin's `versions.json` content.
 *
 * @param versions - The parsed `versions.json`.
 * @returns The findings, empty when it maps semver plugin versions to semver app versions.
 */
export function validateVersionsJson(versions: unknown): PluginCheckFinding[] {
  if (!isRecord(versions) || Array.isArray(versions)) {
    return [error('versions-invalid-format', 'versions.json must be a JSON object mapping plugin versions to minimum app versions.')];
  }

  const findings: PluginCheckFinding[] = [];
  for (const [pluginVersion, minAppVersion] of Object.entries(versions)) {
    if (!SEMVER_REGEX.test(pluginVersion)) {
      findings.push(warning('versions-invalid-semver', `versions.json key "${pluginVersion}" is not valid semver.`));
    }
    if (typeof minAppVersion !== 'string' || !SEMVER_REGEX.test(minAppVersion)) {
      findings.push(warning('versions-invalid-semver', `versions.json value for "${pluginVersion}" is not a valid semver string.`));
    }
  }
  return findings;
}

function error(ruleId: string, message: string): PluginCheckFinding {
  return { level: 'error', message, ruleId };
}

function isAllCaps(value: string): boolean {
  const uppercaseLetters = value.match(/[A-Z]/g)?.length ?? 0;
  return uppercaseLetters >= MIN_ALL_CAPS_LETTERS && value === value.toUpperCase();
}

async function isIdListedInDirectory(id: string, repository: string | undefined): Promise<boolean | undefined> {
  try {
    // eslint-disable-next-line no-restricted-globals -- We run this outside of Obsidian, so we don't have `requestUrl()`.
    const response = await fetch(COMMUNITY_PLUGINS_JSON_URL);
    const entries = response.ok ? await response.json() : undefined;
    return Array.isArray(entries)
      ? entries.some((entry: unknown) =>
        isRecord(entry)
        && entry['id'] === id
        && (repository === undefined || (typeof entry['repo'] === 'string' && entry['repo'].toLowerCase() === repository.toLowerCase()))
      )
      : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

function readRequiredString(manifest: Record<string, unknown>, field: string, findings: PluginCheckFinding[]): string | undefined {
  const value = manifest[field];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  findings.push(error('manifest-missing-required-field', `Plugin manifest is missing required field: ${field}.`));
  return undefined;
}

function readVersion(manifest: unknown): string | undefined {
  return isRecord(manifest) && typeof manifest['version'] === 'string' ? manifest['version'] : undefined;
}

function validateAuthor(author: string): PluginCheckFinding[] {
  const findings: PluginCheckFinding[] = [];
  const trimmed = author.trim();
  if (AUTHOR_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    findings.push(error('manifest-author-placeholder', `Plugin manifest author must not use the placeholder "${trimmed}".`));
  }
  if (EMAIL_REGEX.test(trimmed)) {
    findings.push(error('manifest-author-email', 'Plugin manifest author must not contain an email address.'));
  }
  if (HTTP_URL_REGEX.test(trimmed)) {
    findings.push(error('manifest-author-url', 'Plugin manifest author must not contain an HTTP or HTTPS URL.'));
  }
  return findings;
}

function validateDescription(description: string, name: string): PluginCheckFinding[] {
  const findings: PluginCheckFinding[] = [];
  const trimmed = description.trim();
  const lower = trimmed.toLowerCase();
  const lowerName = name.trim().toLowerCase();

  if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
    findings.push(
      warning('manifest-description-too-short', `Description is too short (${String(trimmed.length)} chars). Provide a meaningful description (10+ chars).`)
    );
  }
  if (lower === lowerName) {
    findings.push(error('manifest-description-equals-name', 'Plugin description must not be the same as its name.'));
  }
  if (lowerName.length > 0 && lower.startsWith(lowerName)) {
    findings.push(warning('manifest-description-starts-with-name', 'Plugin description should not start with the plugin name.'));
  }
  if (/\b(?:this plugin|a plugin that|the plugin)\b/i.test(trimmed)) {
    findings.push(warning('manifest-description-self-reference', 'Plugin description should not refer to itself as a plugin.'));
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    findings.push(
      error(
        'manifest-description-too-long',
        `Plugin description is too long (${String(trimmed.length)} chars). The maximum is ${String(MAX_DESCRIPTION_LENGTH)} characters.`
      )
    );
  }
  if (!/[.!?]$/.test(trimmed)) {
    findings.push(warning('manifest-description-punctuation', 'Plugin description should end with a period, exclamation mark, or question mark.'));
  }
  if (/obsidian/i.test(trimmed)) {
    findings.push(error('manifest-description-brand-name', 'Plugin description must not contain the Obsidian brand name.'));
  }
  return findings;
}

function validateDisallowedWords(value: string, field: string, ruleId: string): PluginCheckFinding[] {
  const lower = value.toLowerCase();
  return DISALLOWED_WORDS.filter((word) => lower.includes(word)).map((word) => error(ruleId, `${field} must not contain "${word}". Found in: "${value}".`));
}

async function validateDistFolder(
  rootFolder: string,
  manifestVersion: string | undefined,
  options: ValidatePluginReleaseOptions
): Promise<PluginCheckFinding[]> {
  const { distFolder = ObsidianPluginRepoPaths.DistBuild, shouldRequireAssets = false } = options;
  const distFolderPath = join(rootFolder, distFolder);
  if (!existsSync(distFolderPath)) {
    return shouldRequireAssets
      ? [error('release-assets-missing', `The release asset folder ${distFolder} does not exist. Did the build step complete successfully?`)]
      : [];
  }

  const findings = validateReleaseAssets(await readdir(distFolderPath), distFolder);
  const distManifestVersion = readVersion(await readJsonFile(join(distFolderPath, ObsidianPluginRepoPaths.ManifestJson)));
  if (distManifestVersion !== undefined && manifestVersion !== undefined && distManifestVersion !== manifestVersion) {
    findings.push(
      error(
        'release-asset-manifest-stale',
        `${distFolder}/manifest.json has version "${distManifestVersion}" but manifest.json has "${manifestVersion}". Rebuild before releasing.`
      )
    );
  }
  return findings;
}

function validateId(id: string, isIdListed: boolean): PluginCheckFinding[] {
  const findings = isIdListed ? [] : validateDisallowedWords(id, 'Plugin ID', 'manifest-id-banned-word');
  if (!PLUGIN_ID_REGEX.test(id)) {
    findings.push(error('manifest-id-invalid', `Plugin ID "${id}" may hold only lowercase letters, digits, dashes and underscores.`));
  }
  return findings;
}

async function validateManifestExemptingListedId(manifest: unknown, options: ValidatePluginReleaseOptions): Promise<PluginCheckFinding[]> {
  const findings = validatePluginManifest(manifest, options);
  const id = isRecord(manifest) ? manifest['id'] : undefined;
  if (typeof id !== 'string' || findings.every((finding) => finding.ruleId !== 'manifest-id-banned-word')) {
    return findings;
  }

  const isIdListed = await isIdListedInDirectory(id, options.repository);
  if (isIdListed === undefined) {
    findings.push(warning('registry-unavailable', 'The community directory could not be read, so a listed plugin ID could not be exempted.'));
    return findings;
  }
  return isIdListed ? validatePluginManifest(manifest, { ...options, isIdListed }) : findings;
}

function validateName(name: string): PluginCheckFinding[] {
  const findings = validateDisallowedWords(name, 'Plugin name', 'manifest-disallowed-name');
  if (name.length > MAX_NAME_LENGTH) {
    findings.push(warning('manifest-name-too-long', `Plugin name is too long (${String(name.length)} chars). The maximum is ${String(MAX_NAME_LENGTH)}.`));
  }
  if (isAllCaps(name)) {
    findings.push(warning('manifest-name-all-caps', 'Plugin name should not be written in all caps.'));
  }
  return findings;
}

function validateOptionalFields(manifest: Record<string, unknown>): PluginCheckFinding[] {
  const findings: PluginCheckFinding[] = [];
  const { author, authorUrl, fundingUrl, isDesktopOnly, minAppVersion } = manifest;
  if (typeof minAppVersion === 'string' && minAppVersion) {
    findings.push(...validateSemver(minAppVersion, 'minAppVersion'));
  }
  if (typeof author === 'string') {
    findings.push(...validateAuthor(author));
  }
  if (Object.hasOwn(manifest, 'isDesktopOnly') && typeof isDesktopOnly !== 'boolean') {
    findings.push(error('manifest-is-desktop-only-type', 'Plugin manifest field isDesktopOnly must be a boolean.'));
  }

  findings.push(...validateUrl(authorUrl, 'authorUrl'));
  if (isRecord(fundingUrl)) {
    for (const [platform, url] of Object.entries(fundingUrl)) {
      findings.push(...validateUrl(url, `fundingUrl.${platform}`));
    }
  } else {
    findings.push(...validateUrl(fundingUrl, 'fundingUrl'));
  }

  for (const field of Object.keys(manifest)) {
    if (!PLUGIN_MANIFEST_FIELDS.has(field)) {
      findings.push(warning('manifest-unknown-field', `Plugin manifest contains unknown field: ${field}.`));
    }
  }
  for (const field of PLUGIN_RECOMMENDED_FIELDS) {
    if (!Object.hasOwn(manifest, field)) {
      findings.push(warning('manifest-missing-recommended-field', `Plugin manifest is missing recommended field: ${field}.`));
    }
  }
  return findings;
}

function validateSemver(version: string, field: string): PluginCheckFinding[] {
  return SEMVER_REGEX.test(version) ? [] : [error('manifest-invalid-semver', `${field} "${version}" is not valid semver (expected X.Y.Z).`)];
}

function validateUrl(url: unknown, field: string): PluginCheckFinding[] {
  if (typeof url !== 'string') {
    return [];
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [error('manifest-url-invalid', `${field} is not a valid URL: "${url}".`)];
  }

  const findings: PluginCheckFinding[] = [];
  if (parsed.protocol !== 'https:') {
    findings.push(error('manifest-url-non-https', `${field} must use HTTPS. Got: "${url}".`));
  }
  if (IPV4_REGEX.test(parsed.hostname)) {
    findings.push(error('manifest-url-raw-ip', `${field} must not use a bare IPv4 address.`));
  }
  if (parsed.hostname === 'obsidian.md' || parsed.hostname === 'www.obsidian.md') {
    findings.push(error('manifest-url-obsidian', `${field} must not point to obsidian.md.`));
  }
  if (
    field === 'authorUrl'
    && (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com')
    && parsed.pathname.split('/').filter(Boolean).length >= GITHUB_REPO_PATH_SEGMENTS
  ) {
    findings.push(warning('manifest-author-url-repo', 'authorUrl should link to an author profile rather than a GitHub repository.'));
  }
  return findings;
}

function validateVersion(version: string): PluginCheckFinding[] {
  const findings = validateSemver(version, 'version');
  if (version === '0.0.0') {
    findings.push(error('manifest-version-placeholder', 'Plugin version must not use the 0.0.0 placeholder.'));
  }
  return findings;
}

async function validateVersionsJsonFile(versionsJsonPath: string): Promise<PluginCheckFinding[]> {
  if (!existsSync(versionsJsonPath)) {
    return [];
  }
  const versions = await readJsonFile(versionsJsonPath);
  return versions === undefined ? [error('versions-invalid-json', 'versions.json is not valid JSON.')] : validateVersionsJson(versions);
}

function warning(ruleId: string, message: string): PluginCheckFinding {
  return { level: 'warning', message, ruleId };
}
