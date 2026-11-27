/**
 * @file
 *
 * Ties every Obsidian workaround in a project's `src/` to the canary test that proves it is still needed.
 *
 * A workaround is marked in its module's comments as ``Obsidian workaround `<id>`, seen in Obsidian `<version>` ``.
 * Its canary is an integration test titled `workaround canary <id>: <the bug, still present>`, which reproduces the
 * bug WITHOUT the workaround and asserts the bug is still there. When an Obsidian release fixes the bug, the canary
 * goes red and names the id, so the workaround can be retired instead of living forever.
 *
 * The `obsidian-dev-toolkit/workaround-canary` ESLint rule reports a marker with no canary, a duplicate marker and a
 * canary naming no marker; `testWorkaroundCanaries()` from `test-runners/workaround-canaries` runs only the canaries.
 * Moved here from `@mnaoumov/obsidian-lib`, where the convention started.
 */

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  readdirSync,
  readFileSync
} from 'node:fs';
import {
  join,
  relative
} from 'node:path';

/**
 * The text every canary test title starts with, and the `--testNamePattern` filter that runs only the canaries.
 */
export const WORKAROUND_CANARY_TEST_NAME_PREFIX = 'workaround canary';

/**
 * The folder, relative to the project root, whose `.ts` files hold the markers and the canaries.
 */
export const DEFAULT_WORKAROUND_SOURCE_FOLDER = 'src';

const ID_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';
const MARKER_REG_EXP = new RegExp(`Obsidian workaround \`(?<id>${ID_PATTERN})\`, seen in Obsidian \`(?<version>\\d+\\.\\d+\\.\\d+)\``, 'g');
const CANARY_REG_EXP = new RegExp(`\\b(?:it|test)\\(\\s*['"\`]${WORKAROUND_CANARY_TEST_NAME_PREFIX} (?<id>${ID_PATTERN}): `, 'g');
const INTEGRATION_TEST_SUFFIX = '.integration.test.ts';

/**
 * Where an id was found.
 */
export interface WorkaroundLocation {
  /**
   * The workaround id.
   */
  readonly id: string;

  /**
   * The length of the match in the file's text.
   */
  readonly length: number;

  /**
   * The offset of the match in the file's text.
   */
  readonly offset: number;

  /**
   * The file it was found in.
   */
  readonly path: string;
}

/**
 * A workaround marker.
 */
export interface WorkaroundMarker extends WorkaroundLocation {
  /**
   * The Obsidian version the bug was seen on.
   */
  readonly seenInVersion: string;
}

/**
 * One source file, as read for the check.
 */
export interface WorkaroundSourceFile {
  /**
   * The file's text.
   */
  readonly content: string;

  /**
   * The file's path relative to the project root, with `/` separators.
   */
  readonly path: string;
}

/**
 * Finds the canary tests in the integration test files (`*.integration.test.ts`).
 *
 * @param files - The files to scan.
 * @returns The canaries, in file order.
 */
export function findWorkaroundCanaries(files: readonly WorkaroundSourceFile[]): WorkaroundLocation[] {
  return files
    .filter((file) => file.path.endsWith(INTEGRATION_TEST_SUFFIX))
    .flatMap((file) => Array.from(file.content.matchAll(CANARY_REG_EXP), (match) => ({ id: getGroup(match, 'id'), length: match[0].length, offset: match.index, path: file.path })));
}

/**
 * Finds the workaround markers in the modules, skipping test files and `.d.ts` declarations, which repeat each
 * module's comments.
 *
 * @param files - The files to scan.
 * @returns The markers, in file order.
 */
export function findWorkaroundMarkers(files: readonly WorkaroundSourceFile[]): WorkaroundMarker[] {
  return files
    .filter((file) => isWorkaroundModulePath(file.path))
    .flatMap((file) =>
      Array.from(file.content.matchAll(MARKER_REG_EXP), (match) => ({
        id: getGroup(match, 'id'),
        length: match[0].length,
        offset: match.index,
        path: file.path,
        seenInVersion: getGroup(match, 'version')
      }))
    );
}

/**
 * Finds where markers and canaries fail to pair up: each id must be marked once and have at least one canary, and each
 * canary must name a marked id.
 *
 * @param files - The files to check.
 * @returns One line per problem; empty when the registry is consistent.
 */
export function findWorkaroundRegistryProblems(files: readonly WorkaroundSourceFile[]): string[] {
  const markers = findWorkaroundMarkers(files);
  const canaries = findWorkaroundCanaries(files);
  const problems: string[] = [];
  const markerPathsById = groupPathsById(markers);
  const canaryIds = new Set(canaries.map((canary) => canary.id));

  for (const [id, paths] of markerPathsById) {
    if (paths.length > 1) {
      problems.push(`Workaround \`${id}\` is marked more than once: ${paths.join(', ')}. Mark it once, where the workaround lives.`);
    }
    if (!canaryIds.has(id)) {
      problems.push(`Workaround \`${id}\` (${paths.join(', ')}) has no canary: add an integration test titled '${WORKAROUND_CANARY_TEST_NAME_PREFIX} ${id}: ...'.`);
    }
  }
  for (const canary of canaries) {
    if (!markerPathsById.has(canary.id)) {
      problems.push(`Canary \`${canary.id}\` (${canary.path}) names no marked workaround: mark the workaround, or remove the canary with it.`);
    }
  }
  return problems;
}

/**
 * Groups the paths of the given locations by id.
 *
 * @param locations - The locations.
 * @returns The paths of each id, in input order, one entry per location.
 */
export function groupPathsById(locations: readonly WorkaroundLocation[]): Map<string, string[]> {
  const pathsById = new Map<string, string[]>();
  for (const location of locations) {
    const paths = pathsById.get(location.id);
    if (paths) {
      paths.push(location.path);
    } else {
      pathsById.set(location.id, [location.path]);
    }
  }
  return pathsById;
}

/**
 * Tells whether a path may hold workaround markers: a `.ts` module that is neither a test nor a declaration.
 *
 * @param path - The path.
 * @returns Whether markers are read from it.
 */
export function isWorkaroundModulePath(path: string): boolean {
  return !path.endsWith('.test.ts') && !path.endsWith('.d.ts');
}

/**
 * Reads every `.ts` file under the source folder.
 *
 * @param rootDirectory - The project root.
 * @param sourceFolder - The folder to read, relative to the root.
 * @returns The files, with root-relative `/` paths; empty when the folder does not exist.
 */
export function readWorkaroundSourceFiles(rootDirectory: string, sourceFolder = DEFAULT_WORKAROUND_SOURCE_FOLDER): WorkaroundSourceFile[] {
  const sourceDirectory = join(rootDirectory, sourceFolder);
  let entries;
  try {
    entries = readdirSync(sourceDirectory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
  const files: WorkaroundSourceFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }
    const fullPath = join(entry.parentPath, entry.name);
    files.push({ content: readFileSync(fullPath, 'utf-8'), path: toPosixPath(relative(rootDirectory, fullPath)) });
  }
  return files;
}

/**
 * Turns a path into one with `/` separators.
 *
 * @param path - The path.
 * @returns The path with every `\` replaced by `/`.
 */
export function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function getGroup(match: RegExpExecArray, name: string): string {
  // Both patterns declare their groups, so groups is always there.
  return ensureNonNullable(castTo<Partial<Record<string, string>>>(match.groups)[name], `The workaround pattern has no group '${name}'.`);
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
