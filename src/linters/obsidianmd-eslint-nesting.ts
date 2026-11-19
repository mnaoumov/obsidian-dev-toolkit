/**
 * @file
 *
 * Warns when the `eslint` that `eslint-plugin-obsidianmd` resolves is another major than the one that runs the lint.
 *
 * `eslint-plugin-obsidianmd` builds the core half of its `recommended` config from the `builtinRules` of the `eslint`
 * it resolves from its OWN location. When npm nests an ESLint 9 under it while the project runs ESLint 10, the rules
 * only ESLint 10 recommends (`preserve-caught-error`, `no-useless-assignment`, `no-unassigned-vars`) are left out of
 * every lint, and nothing says so. The fix is an `overrides` entry, `"eslint": "$eslint"`, which makes npm install the
 * project's own `eslint` everywhere; `npm dedupe` cannot do it, because other dependencies of the plugin peer on
 * ESLint 9.
 *
 * Re-implemented after `obsidian-plugin-dev-kit`'s `src/scanner/eslint-nesting.ts` (MIT), as a warning the shared
 * config gives on load rather than a scanner step.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

/**
 * The `eslint` versions to compare.
 */
export interface DescribeEslintMajorMismatchParams {
  /**
   * The version of the `eslint` that `eslint-plugin-obsidianmd` resolves.
   */
  readonly obsidianmdEslintVersion: string;

  /**
   * The version of the `eslint` the project runs.
   */
  readonly runningEslintVersion: string;
}

/**
 * Parameters for {@link warnOnEslintMajorMismatch}.
 */
export interface WarnOnEslintMajorMismatchOptions {
  /**
   * Reads the version of the `eslint` that `eslint-plugin-obsidianmd` resolves.
   *
   * @default {@link readObsidianmdEslintVersion}
   */
  readonly readObsidianmdEslintVersion?: () => string;

  /**
   * Reads the version of the `eslint` the project runs, or `null` when the project has none of its own.
   *
   * @default {@link readProjectEslintVersion}
   */
  readonly readRunningEslintVersion?: () => null | string;

  /**
   * Reports the warning.
   *
   * @default `console.warn`
   */
  readonly warn?: (message: string) => void;
}

/**
 * Describes an `eslint` major mismatch.
 *
 * @param params - The versions to compare.
 * @returns The warning, or `null` when both majors agree or either version is not one.
 */
export function describeEslintMajorMismatch(params: DescribeEslintMajorMismatchParams): null | string {
  const runningMajor = getMajorVersion(params.runningEslintVersion);
  const obsidianmdMajor = getMajorVersion(params.obsidianmdEslintVersion);
  return runningMajor === null || obsidianmdMajor === null || runningMajor === obsidianmdMajor ? null : `eslint-plugin-obsidianmd takes ESLint's core rules from its own ESLint ${params.obsidianmdEslintVersion}, but ESLint ${params.runningEslintVersion} runs the lint. Core rules that only ESLint ${String(Math.max(runningMajor, obsidianmdMajor))} recommends (such as preserve-caught-error, no-useless-assignment and no-unassigned-vars) are silently missing from it. Add "overrides": { "eslint": "$eslint" } to package.json and run \`npm install\` (\`npm dedupe\` cannot move it, because other dependencies of the plugin peer on ESLint 9).`;
}

/**
 * Gets the major of a version such as `9.39.4` or `v10.1.0`.
 *
 * @param version - The version.
 * @returns The major, or `null` when the text does not start with one.
 */
export function getMajorVersion(version: string): null | number {
  const match = /^v?(?<major>\d+)\./.exec(version.trim());
  const major = match?.groups?.['major'];
  return major === undefined ? null : Number(major);
}

/**
 * Reads the version of the `eslint` that `eslint-plugin-obsidianmd` resolves, from the copy of the plugin this
 * package's ESLint config imports.
 *
 * @returns The version.
 */
export function readObsidianmdEslintVersion(): string {
  const obsidianmdEntryPath = createRequire(import.meta.url).resolve('eslint-plugin-obsidianmd');
  return readPackageVersion(createRequire(obsidianmdEntryPath).resolve('eslint/package.json'));
}

/**
 * Reads the version of the `eslint` installed in the project root, which is the one `npx eslint` runs.
 *
 * @returns The version, or `null` when the project root resolves no `eslint`.
 */
export function readProjectEslintVersion(): null | string {
  const projectFolder = getRootFolder() ?? process.cwd();
  let packageJsonPath: string;
  try {
    packageJsonPath = createRequire(join(projectFolder, 'package.json')).resolve('eslint/package.json');
  } catch {
    return null;
  }
  return readPackageVersion(packageJsonPath);
}

/**
 * Warns when `eslint-plugin-obsidianmd` resolves an `eslint` of another major than the one the project runs. A probe
 * that fails is reported too, since the check then did not run.
 *
 * @param options - The options.
 */
export function warnOnEslintMajorMismatch(options: WarnOnEslintMajorMismatchOptions = {}): void {
  const warn = options.warn ?? console.warn;
  let message: null | string;
  try {
    const runningEslintVersion = (options.readRunningEslintVersion ?? readProjectEslintVersion)();
    if (runningEslintVersion === null) {
      return;
    }
    message = describeEslintMajorMismatch({
      obsidianmdEslintVersion: (options.readObsidianmdEslintVersion ?? readObsidianmdEslintVersion)(),
      runningEslintVersion
    });
  } catch (error) {
    message = `Could not compare the ESLint that eslint-plugin-obsidianmd resolves with the one the project runs, so a nested ESLint of another major would go unnoticed: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (message !== null) {
    warn(message);
  }
}

function readPackageVersion(packageJsonPath: string): string {
  const packageJson: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson && typeof packageJson.version === 'string') {
    return packageJson.version;
  }
  throw new Error(`${packageJsonPath} has no version`);
}
