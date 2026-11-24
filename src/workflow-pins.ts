/**
 * @file
 *
 * Keeps a plugin's calls to this package's reusable workflows (`uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/<file>@<ref>`)
 * on the release of `@mnaoumov/obsidian-dev-toolkit` the plugin installs. The workflows run the package's own commands
 * (`generate-coverage-badge`, `archive-demo-vault`) from the plugin's `node_modules`, so a pin left at an older release
 * runs an older release workflow against newer commands, and misses every fix made to the workflow since.
 *
 * {@link validateProjectWorkflowPins} reports each pin that names another release; {@link updateWorkflowPins} moves them all.
 * A pin is a release tag (`@13.0.0`, the form the guide gives) or a full commit SHA with the release in its comment
 * (`@<sha> # 13.0.0`). A SHA pin is compared through its comment only, since the check reads no network.
 *
 * Re-implemented after `obsidian-plugin-dev-kit`'s `src/kit/pins.ts`, `src/release/kit-check.ts` and
 * `src/kit/upgrade.ts` (v0.4.0, MIT).
 */

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  readdir,
  readFile,
  writeFile
} from 'node:fs/promises';

import type {
  PluginCheckFinding,
  PluginPackageVersionSources
} from './plugin-release-checks.ts';

/**
 * The npm name of this package, which a plugin installs.
 */
export const TOOLKIT_PACKAGE_NAME = '@mnaoumov/obsidian-dev-toolkit';

/**
 * The `GitHub` repository of this package, which holds the reusable workflows.
 */
export const TOOLKIT_REPOSITORY = 'mnaoumov/obsidian-dev-toolkit';

/**
 * The folder of a repository's workflows, relative to its root.
 */
export const WORKFLOWS_FOLDER = '.github/workflows';

/**
 * The result of {@link rewriteWorkflowPins} on one file.
 */
export interface RewrittenWorkflow {
  /**
   * The one-based numbers of the lines that changed.
   */
  readonly changedLines: readonly number[];

  /**
   * The new text.
   */
  readonly text: string;
}

/**
 * Options for {@link updateWorkflowPins}.
 */
export interface UpdateWorkflowPinsOptions {
  /**
   * Whether to report the changes without writing them. Defaults to `false`.
   */
  readonly isDryRun?: boolean;

  /**
   * Looks up the commit a release tag of this package points to, for a pin written as a commit SHA. Defaults to
   * {@link resolveToolkitTagCommit}, which asks `GitHub` through `git ls-remote`. Called only when such a pin exists.
   */
  readonly resolveTagCommit?: (tag: string) => Promise<string>;

  /**
   * The project root. Defaults to the root of the current working directory's project.
   */
  readonly rootFolder?: string;

  /**
   * The release to move the pins to. Defaults to the installed `@mnaoumov/obsidian-dev-toolkit` version.
   */
  readonly version?: string;
}

/**
 * Options for {@link validateProjectWorkflowPins}.
 */
export interface ValidateProjectWorkflowPinsOptions {
  /**
   * The project root. Defaults to the root of the current working directory's project.
   */
  readonly rootFolder?: string;
}

/**
 * One workflow file of a plugin.
 */
export interface WorkflowFile {
  /**
   * The path relative to the project root, with `/` separators.
   */
  readonly path: string;

  /**
   * The file's text.
   */
  readonly text: string;
}

/**
 * One `uses:` line that calls a reusable workflow of this package.
 */
export interface WorkflowPin {
  /**
   * The release the trailing comment names (`# 13.0.0`, `# v13.0.0`), without a `v`, or `null` when the comment names
   * none or there is no comment.
   */
  readonly commentVersion: null | string;

  /**
   * The workflow file, relative to the project root.
   */
  readonly file: string;

  /**
   * The one-based line number.
   */
  readonly line: number;

  /**
   * The ref after `@`: a release tag, a full commit SHA, or something else, such as a branch.
   */
  readonly ref: string;

  /**
   * The called workflow, e.g. `obsidian-plugin-release.yml`.
   */
  readonly workflow: string;
}

/**
 * One file {@link updateWorkflowPins} changed, or would change on a dry run.
 */
export interface WorkflowPinChange {
  /**
   * The workflow file, relative to the project root.
   */
  readonly file: string;

  /**
   * The changed lines, as `<line>: <old> -> <new>`.
   */
  readonly lines: readonly string[];
}

/**
 * The result of {@link updateWorkflowPins}.
 */
export interface WorkflowPinUpdate {
  /**
   * The changed files; empty when every pin was already at {@link version}.
   */
  readonly changes: readonly WorkflowPinChange[];

  /**
   * The release the pins were moved to.
   */
  readonly version: string;
}

interface UsesLineMatch {
  readonly comment: null | string;
  readonly commentSeparator: null | string;
  readonly prefix: string;
  readonly quote: string;
  readonly ref: string;
  readonly workflow: string;
}

// `uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/<file>@<ref> # comment`, optionally quoted and in a list item.
// GitHub names are case-insensitive.
const USES_LINE_REGEX = /^(?<prefix>\s*(?:-\s+)?uses:\s*)(?<quote>['"]?)mnaoumov\/obsidian-dev-toolkit\/\.github\/workflows\/(?<workflow>[^\s@#'"]+)@(?<ref>[^\s#'"]+)\k<quote>(?:(?<commentSeparator>\s+#\s*)(?<comment>.*?))?\s*$/i;
const RELEASE_VERSION_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;
const COMMENT_VERSION_REGEX = /^v?(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)(?![\w.])/;
const FULL_SHA_REGEX = /^[0-9a-f]{40}$/;
const PACKAGE_SPEC_VERSION_REGEX = /^[\^~]?(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)$/;
const WORKFLOW_FILE_REGEX = /\.ya?ml$/i;
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const SHORT_SHA_LENGTH = 7;
// A `git ls-remote` line is `<sha>\t<ref>`.
const LS_REMOTE_FIELD_COUNT = 2;
const FIX_COMMAND = 'npx update-workflow-pins';

/**
 * Reads the installed `@mnaoumov/obsidian-dev-toolkit` version: the lockfile's
 * `packages["node_modules/@mnaoumov/obsidian-dev-toolkit"].version`, else the exact, `^` or `~` version `package.json`
 * asks for.
 *
 * @param sources - The parsed package files.
 * @returns The version, or `null` when neither names one.
 */
export function readToolkitVersion(sources: PluginPackageVersionSources): null | string {
  const packages = readRecord(sources.packageLockJson)?.['packages'];
  const lockVersion = readRecord(readRecord(packages)?.[`node_modules/${TOOLKIT_PACKAGE_NAME}`])?.['version'];
  if (typeof lockVersion === 'string') {
    return lockVersion;
  }

  const packageJson = readRecord(sources.packageJson);
  for (const section of DEPENDENCY_SECTIONS) {
    const spec = readRecord(packageJson?.[section])?.[TOOLKIT_PACKAGE_NAME];
    const version = typeof spec === 'string' ? PACKAGE_SPEC_VERSION_REGEX.exec(spec)?.groups?.['version'] : undefined;
    if (version !== undefined) {
      return version;
    }
  }
  return null;
}

/**
 * Reads the workflow files (`*.yml`, `*.yaml`) of `.github/workflows`.
 *
 * @param rootFolder - The project root.
 * @returns A {@link Promise} that resolves to the files, sorted by path; empty when the folder does not exist.
 */
export async function readWorkflowFiles(rootFolder: string): Promise<WorkflowFile[]> {
  let names: string[];
  try {
    names = await readdir(join(rootFolder, WORKFLOWS_FOLDER));
  } catch {
    return [];
  }

  const files: WorkflowFile[] = [];
  for (const name of names.filter((fileName) => WORKFLOW_FILE_REGEX.test(fileName)).sort()) {
    const path = `${WORKFLOWS_FOLDER}/${name}`;
    files.push({ path, text: await readFile(join(rootFolder, path), 'utf-8') });
  }
  return files;
}

/**
 * Finds every `uses:` line that calls a reusable workflow of this package.
 *
 * @param files - The workflow files.
 * @returns The pins, in file and line order.
 */
export function readWorkflowPins(files: readonly WorkflowFile[]): WorkflowPin[] {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((rawLine, index) => {
      const match = matchUsesLine(stripCarriageReturn(rawLine));
      if (match === null) {
        return [];
      }
      return {
        commentVersion: readCommentVersion(match.comment),
        file: path,
        line: index + 1,
        ref: match.ref,
        workflow: match.workflow
      };
    })
  );
}

/**
 * Asks `GitHub` which commit a release tag of this package points to, through `git ls-remote`. An annotated tag is
 * peeled to its commit.
 *
 * @param tag - The release tag, e.g. `13.0.0`.
 * @returns A {@link Promise} that resolves to the full commit SHA.
 * @throws When `git` fails or the tag does not exist.
 */
export async function resolveToolkitTagCommit(tag: string): Promise<string> {
  const stdout = await exec(['git', 'ls-remote', `https://github.com/${TOOLKIT_REPOSITORY}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
    isQuiet: true,
    shouldFailIfCalledFromOutsideRoot: false
  });
  const refs = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/, LS_REMOTE_FIELD_COUNT);
    if (sha !== undefined && ref !== undefined) {
      refs.set(ref, sha);
    }
  }
  const commit = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
  if (commit === undefined) {
    throw new Error(`${TOOLKIT_REPOSITORY} has no release tag ${tag}.`);
  }
  return commit;
}

/**
 * Points every `uses:` line of one workflow file that calls this package's workflows at `version`. A tag pin becomes
 * `@<version>`; a SHA pin becomes `@<commit> # <version>`, keeping any text after the version in its comment. A comment
 * on a tag pin that starts with a version follows it. The rest of the text, line endings included, stays as it is.
 *
 * @param text - The workflow file's text.
 * @param version - The release to point at.
 * @param commit - The commit of that release, needed only for SHA pins; a SHA pin is left alone without it.
 * @returns The {@link RewrittenWorkflow}.
 */
export function rewriteWorkflowPins(text: string, version: string, commit: null | string = null): RewrittenWorkflow {
  const changedLines: number[] = [];
  const lines = text.split('\n').map((rawLine, index) => {
    const line = stripCarriageReturn(rawLine);
    const lineEnding = rawLine.slice(line.length);
    const match = matchUsesLine(line);
    if (match === null) {
      return rawLine;
    }

    const isShaPin = FULL_SHA_REGEX.test(match.ref);
    if (isShaPin && commit === null) {
      return rawLine;
    }

    const ref = isShaPin ? ensureNonNullable(commit) : version;
    const newLine = `${match.prefix}${match.quote}${TOOLKIT_REPOSITORY}/${WORKFLOWS_FOLDER}/${match.workflow}@${ref}${match.quote}${rewriteComment(match, version, isShaPin)}`;
    if (newLine === line) {
      return rawLine;
    }
    changedLines.push(index + 1);
    return `${newLine}${lineEnding}`;
  });
  return { changedLines, text: lines.join('\n') };
}

/**
 * Moves every workflow pin of a plugin to one release of this package, the installed one by default. Writes only the
 * workflow files, and commits nothing.
 *
 * @param options - The {@link UpdateWorkflowPinsOptions}.
 * @returns A {@link Promise} that resolves to the {@link WorkflowPinUpdate}.
 * @throws When no version is given and none is installed, or when a SHA pin's commit cannot be looked up.
 */
export async function updateWorkflowPins(options: UpdateWorkflowPinsOptions = {}): Promise<WorkflowPinUpdate> {
  const {
    isDryRun = false,
    resolveTagCommit = resolveToolkitTagCommit
  } = options;
  const rootFolder = options.rootFolder ?? ensureNonNullable(getRootFolder(), 'Could not find the project root');
  const version = options.version ?? readToolkitVersion(await readPackageSources(rootFolder));
  if (version === null) {
    throw new Error(
      `Could not tell which ${TOOLKIT_PACKAGE_NAME} release is installed: neither package-lock.json nor package.json names a version. Pass --version=<version>.`
    );
  }
  if (!RELEASE_VERSION_REGEX.test(version)) {
    throw new Error(`"${version}" is not a release version of ${TOOLKIT_PACKAGE_NAME}, such as 13.0.0.`);
  }

  const files = await readWorkflowFiles(rootFolder);
  const hasShaPins = readWorkflowPins(files).some((pin) => FULL_SHA_REGEX.test(pin.ref));
  const commit = hasShaPins ? await resolveTagCommit(version) : null;

  const changes: WorkflowPinChange[] = [];
  for (const file of files) {
    const rewritten = rewriteWorkflowPins(file.text, version, commit);
    if (rewritten.changedLines.length === 0) {
      continue;
    }
    const oldLines = file.text.split('\n');
    const newLines = rewritten.text.split('\n');
    changes.push({
      file: file.path,
      lines: rewritten.changedLines.map((line) => `${String(line)}: ${stripCarriageReturn(ensureNonNullable(oldLines[line - 1])).trim()} -> ${stripCarriageReturn(ensureNonNullable(newLines[line - 1])).trim()}`)
    });
    if (!isDryRun) {
      await writeFile(join(rootFolder, file.path), rewritten.text);
    }
  }
  return { changes, version };
}

/**
 * Checks a plugin's workflow pins against its installed `@mnaoumov/obsidian-dev-toolkit`, reading
 * `package.json`, `package-lock.json` and `.github/workflows`.
 *
 * @param options - The {@link ValidateProjectWorkflowPinsOptions}.
 * @returns A {@link Promise} that resolves to the findings of {@link validateWorkflowPins}.
 */
export async function validateProjectWorkflowPins(options: ValidateProjectWorkflowPinsOptions = {}): Promise<PluginCheckFinding[]> {
  const rootFolder = options.rootFolder ?? ensureNonNullable(getRootFolder(), 'Could not find the project root');
  const pins = readWorkflowPins(await readWorkflowFiles(rootFolder));
  return validateWorkflowPins(pins, readToolkitVersion(await readPackageSources(rootFolder)));
}

/**
 * Validates that every workflow pin names the installed release of this package. A tag pin must be that release; a SHA
 * pin must carry it in its comment, since the commit itself is not looked up; any other ref, such as a branch, is an
 * error.
 *
 * @param pins - The pins, from {@link readWorkflowPins}.
 * @param toolkitVersion - The installed version, from {@link readToolkitVersion}, or `null` when unknown.
 * @returns The findings, empty when there are no pins or they all agree.
 */
export function validateWorkflowPins(pins: readonly WorkflowPin[], toolkitVersion: null | string): PluginCheckFinding[] {
  if (pins.length === 0) {
    return [];
  }
  if (toolkitVersion === null) {
    return [{
      level: 'error',
      message: `${describePin(ensureNonNullable(pins[0]))} calls a workflow of ${TOOLKIT_PACKAGE_NAME}, but neither package-lock.json nor package.json names the installed version to compare it with. Install the package with an exact, ^ or ~ version.`,
      ruleId: 'workflow-pin-toolkit-version-unknown'
    }];
  }

  const findings: PluginCheckFinding[] = [];
  for (const pin of pins) {
    const where = describePin(pin);
    const fix = `Run \`${FIX_COMMAND}\` to move every pin to ${toolkitVersion}.`;
    if (RELEASE_VERSION_REGEX.test(pin.ref)) {
      if (pin.ref !== toolkitVersion) {
        findings.push(error(
          'workflow-pin-version-mismatch',
          `${where} calls ${pin.workflow} at ${pin.ref}, but ${TOOLKIT_PACKAGE_NAME} ${toolkitVersion} is installed. ${fix}`
        ));
      }
    } else if (FULL_SHA_REGEX.test(pin.ref)) {
      if (pin.commentVersion === null) {
        findings.push(warning(
          'workflow-pin-comment-missing',
          `${where} pins ${pin.workflow} to commit ${pin.ref.slice(0, SHORT_SHA_LENGTH)} with no \`# <version>\` comment, so it cannot be compared with the installed ${toolkitVersion}. ${fix}`
        ));
      } else if (pin.commentVersion !== toolkitVersion) {
        findings.push(error(
          'workflow-pin-version-mismatch',
          `${where} calls ${pin.workflow} at commit ${pin.ref.slice(0, SHORT_SHA_LENGTH)} (# ${pin.commentVersion}), but ${TOOLKIT_PACKAGE_NAME} ${toolkitVersion} is installed. ${fix}`
        ));
      }
    } else {
      findings.push(error(
        'workflow-pin-not-release',
        `${where} calls ${pin.workflow} at "${pin.ref}", which is neither a release tag nor a commit SHA, so the workflow changes under the plugin. ${fix}`
      ));
    }
  }
  return findings;
}

function describePin(pin: WorkflowPin): string {
  return `${pin.file}:${String(pin.line)}`;
}

function error(ruleId: string, message: string): PluginCheckFinding {
  return { level: 'error', message, ruleId };
}

function matchUsesLine(line: string): null | UsesLineMatch {
  const groups = USES_LINE_REGEX.exec(line)?.groups;
  if (groups === undefined) {
    return null;
  }
  return {
    comment: groups['comment'] ?? null,
    commentSeparator: groups['commentSeparator'] ?? null,
    prefix: ensureNonNullable(groups['prefix']),
    quote: ensureNonNullable(groups['quote']),
    ref: ensureNonNullable(groups['ref']),
    workflow: ensureNonNullable(groups['workflow'])
  };
}

function readCommentVersion(comment: null | string): null | string {
  return comment === null ? null : COMMENT_VERSION_REGEX.exec(comment)?.groups?.['version'] ?? null;
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

async function readPackageSources(rootFolder: string): Promise<PluginPackageVersionSources> {
  return {
    packageJson: await readJsonFile(join(rootFolder, 'package.json')),
    packageLockJson: await readJsonFile(join(rootFolder, 'package-lock.json'))
  };
}

function readRecord(value: unknown): null | Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function rewriteComment(match: UsesLineMatch, version: string, isShaPin: boolean): string {
  const separator = match.commentSeparator ?? ' # ';
  const comment = match.comment ?? '';
  const commentVersionMatch = COMMENT_VERSION_REGEX.exec(comment);
  if (commentVersionMatch !== null) {
    return `${separator}${version}${comment.slice(commentVersionMatch[0].length)}`;
  }
  if (isShaPin) {
    return comment === '' ? ` # ${version}` : `${separator}${version} ${comment}`;
  }
  return match.comment === null ? '' : `${separator}${comment}`;
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function warning(ruleId: string, message: string): PluginCheckFinding {
  return { level: 'warning', message, ruleId };
}
