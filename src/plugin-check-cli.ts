/**
 * @file
 *
 * The `check-plugin` command: runs {@link validatePluginRelease} and, with `--scanner`, {@link runScannerCheck}, prints
 * what they found and turns it into an exit code. A plugin runs it before a release, or to reproduce a scanner finding
 * on its own machine.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import type { ValidatePluginReleaseOptions } from './plugin-release-checks.ts';
import type { RunScannerCheckOptions } from './plugin-scanner-check.ts';

import {
  formatPluginCheckFindings,
  hasPluginCheckErrors,
  validatePluginRelease
} from './plugin-release-checks.ts';
import { runScannerCheck } from './plugin-scanner-check.ts';

/**
 * The parsed command line of `check-plugin`.
 */
export interface CheckPluginArguments {
  /**
   * The {@link ValidatePluginReleaseOptions} of the release checks.
   */
  readonly releaseParams: ValidatePluginReleaseOptions;

  /**
   * The {@link RunScannerCheckOptions} of the scanner checks, or `undefined` when `--scanner` was not given.
   */
  readonly scannerParams: RunScannerCheckOptions | undefined;
}

const TAG_REF_PREFIX = 'refs/tags/';

/**
 * Parses the command line of `check-plugin`: `--tag=<tag>` (defaulting to the tag of `GITHUB_REF` when that is a tag
 * ref), `--dist=<folder>`, `--require-assets`, `--scanner`, `--scanner-version=<tag>`, `--no-strict` and
 * `--repository=<owner/repo>` (defaulting to `GITHUB_REPOSITORY`).
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @param env - The environment to read `GITHUB_REF` and `GITHUB_REPOSITORY` from.
 * @returns The {@link CheckPluginArguments}.
 * @throws When an argument is unknown.
 */
export function parseCheckPluginArguments($arguments: string[], env: NodeJS.ProcessEnv = process.env): CheckPluginArguments {
  const { values } = parseArgs({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
    args: $arguments,
    options: {
      'dist': { type: 'string' },
      'no-strict': { type: 'boolean' },
      'repository': { type: 'string' },
      'require-assets': { type: 'boolean' },
      'scanner': { type: 'boolean' },
      'scanner-version': { type: 'string' },
      'tag': { type: 'string' }
    }
  });

  const githubRef = env['GITHUB_REF'];
  const tag = values.tag ?? (githubRef?.startsWith(TAG_REF_PREFIX) ? githubRef.slice(TAG_REF_PREFIX.length) : undefined);
  const repository = values.repository ?? env['GITHUB_REPOSITORY'];

  return {
    releaseParams: {
      ...(values.dist !== undefined && { distFolder: values.dist }),
      ...(repository !== undefined && { repository }),
      ...(values['require-assets'] === true && { shouldRequireAssets: true }),
      ...(tag !== undefined && { tag })
    },
    scannerParams: values.scanner === true
      ? {
        ...(repository !== undefined && { repository }),
        ...(values['no-strict'] === true && { shouldBeStrict: false }),
        ...(values['scanner-version'] !== undefined && { version: values['scanner-version'] })
      }
      : undefined
  };
}

/**
 * Runs `check-plugin`.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns A {@link Promise} that resolves to the exit code: `0` when every check passed, `1` when any reported an
 *   error or could not run, which is printed to stderr.
 */
export async function runCheckPluginCli($arguments: string[]): Promise<number> {
  try {
    const { releaseParams, scannerParams } = parseCheckPluginArguments($arguments);
    const findings = await validatePluginRelease(releaseParams);
    const hasErrors = hasPluginCheckErrors(findings);
    process.stdout.write(findings.length === 0 ? 'Manifest and release checks passed.\n' : `${formatPluginCheckFindings(findings)}\n`);

    let scannerExitCode = 0;
    if (scannerParams) {
      process.stdout.write('Running the community scanner checks (obsidianmd/obsidian-workflows); installing its linters takes a few minutes...\n');
      const scannerResult = await runScannerCheck(scannerParams);
      process.stdout.write(`${scannerResult.output}\n`);
      scannerExitCode = scannerResult.exitCode;
    }

    return hasErrors || scannerExitCode !== 0 ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
