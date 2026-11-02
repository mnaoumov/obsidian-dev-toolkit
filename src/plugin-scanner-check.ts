/**
 * @file
 *
 * Runs the community directory's scanner checks on the developer's machine, by running `obsidianmd/obsidian-workflows`
 * itself: the GitHub Action the directory team points to as matching its scanner, which carries the scanner's own
 * ESLint and Stylelint rulesets. Running the action, rather than a copy of its rules, is what keeps the local answer
 * the scanner's answer when the rulesets change: only {@link OBSIDIAN_WORKFLOWS_VERSION} moves.
 *
 * The action's bundled `dist/index.js` is downloaded once per version into `node_modules/.cache` and run with Node, in
 * its `pr` mode with the scanner lint and `strict` on and the build off, under the environment variables an Actions
 * runner would set. It installs the scanner's ESLint and Stylelint into a temporary folder on every run, which takes
 * minutes. Its `::error` / `::warning` / `::notice` workflow commands are turned back into plain lines.
 */

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import {
  dirname,
  join
} from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';

/**
 * The `obsidianmd/obsidian-workflows` release whose scanner rulesets are run.
 */
export const OBSIDIAN_WORKFLOWS_VERSION = 'v1.2.3';

/**
 * Parameters for {@link runScannerCheck}.
 */
export interface RunScannerCheckOptions {
  /**
   * The `owner/repo` of the plugin, for the action's `authorUrl` check. Optional.
   */
  readonly repository?: string;

  /**
   * The project root. Defaults to the root of the current working directory's project.
   */
  readonly rootFolder?: string;

  /**
   * Whether policy findings fail the check, as the action's `strict` input. Defaults to `true`, which is what the
   * directory team recommends.
   */
  readonly shouldBeStrict?: boolean;

  /**
   * The `obsidianmd/obsidian-workflows` tag to run. Defaults to {@link OBSIDIAN_WORKFLOWS_VERSION}.
   */
  readonly version?: string;
}

/**
 * The result of {@link runScannerCheck}.
 */
export interface ScannerCheckResult {
  /**
   * The action's exit code: `0` when it passed.
   */
  readonly exitCode: number;

  /**
   * The action's output, its workflow commands turned into plain lines.
   */
  readonly output: string;
}

const WORKFLOW_COMMAND_REGEX = /^::(?<command>[a-z-]+)(?: (?<properties>[^:]*))?::(?<message>.*)$/;
const ANNOTATION_COMMANDS = new Set(['error', 'notice', 'warning']);

/**
 * Turns the workflow commands in a GitHub Action's output into plain lines: an annotation becomes
 * `<level>: <file>:<line> <message>`, a group start its title, and the other commands are dropped.
 *
 * @param output - The action's standard output.
 * @returns The plain lines.
 */
export function formatWorkflowCommandOutput(output: string): string {
  const lines: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    // The action echoes the linters' JSON reports, which it then reports again as annotations.
    if (line.startsWith('[{"filePath"')) {
      continue;
    }

    const match = WORKFLOW_COMMAND_REGEX.exec(line);
    if (!match?.groups) {
      lines.push(line);
      continue;
    }

    const { command = '', message = '', properties = '' } = match.groups;
    if (command === 'group') {
      lines.push(`== ${unescapeWorkflowCommandData(message)}`);
    } else if (ANNOTATION_COMMANDS.has(command)) {
      const props = parseProperties(properties);
      const file = props.get('file');
      const fileLine = props.get('line');
      const location = file === undefined ? '' : `${file}${fileLine === undefined ? '' : `:${fileLine}`} `;
      lines.push(`${command}: ${location}${unescapeWorkflowCommandData(message)}`);
    }
  }
  return lines.join('\n').trim();
}

/**
 * Runs the scanner checks of `obsidianmd/obsidian-workflows` on the plugin. See the `@file` overview.
 *
 * @param options - The {@link RunScannerCheckOptions}.
 * @returns A {@link Promise} that resolves to the {@link ScannerCheckResult}.
 */
export async function runScannerCheck(options: RunScannerCheckOptions = {}): Promise<ScannerCheckResult> {
  const {
    repository,
    rootFolder = ensureNonNullable(getRootFolder(), 'Could not find the project root'),
    shouldBeStrict = true,
    version = OBSIDIAN_WORKFLOWS_VERSION
  } = options;

  const actionPath = join(rootFolder, 'node_modules', '.cache', 'obsidian-dev-toolkit', 'obsidian-workflows', version, 'index.mjs');
  if (!existsSync(actionPath)) {
    const url = `https://raw.githubusercontent.com/obsidianmd/obsidian-workflows/${version}/dist/index.js`;
    // eslint-disable-next-line no-restricted-globals -- We run this outside of Obsidian, so we don't have `requestUrl()`.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not download ${url}: HTTP ${String(response.status)}.`);
    }
    await mkdir(dirname(actionPath), { recursive: true });
    await writeFile(actionPath, await response.text());
  }

  const runnerFolder = await mkdtemp(join(tmpdir(), 'obsidian-scanner-check-'));
  const outputPath = join(runnerFolder, 'output');
  const summaryPath = join(runnerFolder, 'summary.md');
  try {
    // The action appends to both files, and fails when they do not exist.
    await writeFile(outputPath, '');
    await writeFile(summaryPath, '');
    const result = await exec([process.execPath, actionPath], {
      cwd: rootFolder,
      env: {
        ...process.env,
        'GITHUB_OUTPUT': outputPath,
        'GITHUB_STEP_SUMMARY': summaryPath,
        'GITHUB_WORKSPACE': rootFolder,
        'INPUT_BUILD': 'false',
        'INPUT_LINT': 'true',
        'INPUT_MODE': 'pr',
        'INPUT_SCANNER-LINT': 'true',
        'INPUT_STRICT': String(shouldBeStrict),
        'INPUT_TYPE': 'plugin',
        ...(repository !== undefined && { GITHUB_REPOSITORY: repository })
      },
      isQuiet: true,
      shouldIgnoreExitCode: true,
      shouldIncludeDetails: true
    });
    return {
      exitCode: result.exitCode ?? 1,
      output: formatWorkflowCommandOutput(`${result.stdout}\n${result.stderr}`)
    };
  } finally {
    await rm(runnerFolder, { force: true, recursive: true });
  }
}

function parseProperties(properties: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of properties.split(',')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0) {
      map.set(pair.slice(0, separatorIndex), unescapeWorkflowCommandData(pair.slice(separatorIndex + 1)));
    }
  }
  return map;
}

function unescapeWorkflowCommandData(value: string): string {
  return value
    .replaceAll('%0D', '\r')
    .replaceAll('%0A', '\n')
    .replaceAll('%3A', ':')
    .replaceAll('%2C', ',')
    .replaceAll('%25', '%');
}
