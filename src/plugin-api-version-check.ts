/**
 * @file
 *
 * Derives an API version floor from the project's typed, guard-aware unsupported-API reports.
 */

import type { Linter } from 'eslint';

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import {
  gt,
  valid
} from 'semver';

/**
 * Options for {@link analyzePluginApiVersion}.
 */
export interface AnalyzePluginApiVersionOptions {
  /**
   * Source globs relative to the project root. Tests and declarations are excluded.
   *
   * @default `['src/**\/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']`
   */
  readonly files?: readonly string[];

  /**
   * Project root containing the manifest and a typed ESLint configuration.
   *
   * @default The current project's root.
   */
  readonly rootFolder?: string;
}

/**
 * The comparison returned by {@link analyzePluginApiVersion}.
 */
export interface PluginApiVersionReport {
  /**
   * Unguarded API reports, with source locations.
   */
  readonly apiUsages: readonly string[];
  /**
   * Whether the declared version is lower than the detected API floor.
   */
  readonly hasErrors: boolean;
  /**
   * The version declared in manifest.json.
   */
  readonly minAppVersion: string;
  /**
   * Highest detected API version, or `undefined` when no versioned use was reported.
   */
  readonly requiredMinAppVersion: string | undefined;
  /**
   * A human-readable comparison, including the limits of the analysis.
   */
  readonly summary: string;
}

interface ApiVersionManifest {
  readonly minAppVersion?: string;
}

const RULE_ID = 'obsidianmd/no-unsupported-api';
const REPORT_VERSION_REGEX = / requires Obsidian v(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?), but minAppVersion is 0\.0\.0\.$/;
const SOURCE_FILES = ['src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

/**
 * Runs only the upstream unsupported-API rule with a `0.0.0` baseline, without modifying the manifest.
 * Uses the project's ESLint parser, type information and ignores, but disables inline suppression and caching.
 * APIs unknown to the rule, dependencies and runtime requirements still need a compatibility review.
 *
 * @param options - The project and source files to check.
 * @returns The manifest comparison and the rule's unguarded API usages.
 * @throws If the manifest, typed lint configuration or a diagnostic cannot be read reliably.
 */
export async function analyzePluginApiVersion(options: AnalyzePluginApiVersionOptions = {}): Promise<PluginApiVersionReport> {
  const { files = SOURCE_FILES, rootFolder = ensureNonNullable(getRootFolder()) } = options;
  if (files.length === 0) {
    throw new Error('At least one source glob is required for API compatibility analysis.');
  }
  const { minAppVersion } = JSON.parse(await readFile(join(rootFolder, 'manifest.json'), 'utf-8')) as ApiVersionManifest;
  if (!minAppVersion || !valid(minAppVersion)) {
    throw new Error('manifest.json must declare a valid minAppVersion before checking API compatibility.');
  }

  const eslint = new ESLint({
    allowInlineConfig: false,
    cache: false,
    cwd: rootFolder,
    overrideConfig: [
      { ignores: ['**/*.test.*', '**/*.spec.*', '**/*.d.{ts,mts,cts}'] },
      { rules: { [RULE_ID]: ['error', { minAppVersion: '0.0.0' }] } }
    ],
    ruleFilter: ({ ruleId }): boolean => ruleId === RULE_ID
  });
  const results = await eslint.lintFiles([...files]);
  if (results.length === 0) {
    throw new Error('No source files were checked for API compatibility. Check the source globs and ESLint ignores.');
  }

  const apiUsages: string[] = [];
  let requiredMinAppVersion: string | undefined;
  for (const result of results) {
    for (const message of result.messages) {
      const location = `${result.filePath}:${String(message.line)}:${String(message.column)}`;
      const version = getReportedVersion(message);
      if (!version || !valid(version)) {
        throw new Error(`Could not determine API compatibility: ${location}: ${message.message}`);
      }
      apiUsages.push(`${location}: ${message.message}`);
      if (!requiredMinAppVersion || gt(version, requiredMinAppVersion)) {
        requiredMinAppVersion = version;
      }
    }
  }

  const hasErrors = requiredMinAppVersion !== undefined && gt(requiredMinAppVersion, minAppVersion);
  let comparison = 'No versioned API usages were detected; no API floor could be derived.';
  if (requiredMinAppVersion) {
    comparison = `Detected API floor: ${requiredMinAppVersion}.`;
    if (hasErrors) {
      comparison += ' Raise minAppVersion or guard the newer APIs.';
    } else if (gt(minAppVersion, requiredMinAppVersion)) {
      comparison += ' minAppVersion could be lowered after reviewing other compatibility requirements.';
    }
  }
  return {
    apiUsages,
    hasErrors,
    minAppVersion,
    requiredMinAppVersion,
    summary: `manifest.json minAppVersion: ${minAppVersion}. ${comparison} This checks only APIs recognized by obsidianmd/no-unsupported-api.`
  };
}

function getReportedVersion(message: Linter.LintMessage): string | undefined {
  return message.ruleId === RULE_ID && message.messageId === 'apiNotAvailable'
    ? REPORT_VERSION_REGEX.exec(message.message)?.groups?.['version']
    : undefined;
}
