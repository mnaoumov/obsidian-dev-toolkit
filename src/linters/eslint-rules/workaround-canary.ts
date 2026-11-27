/**
 * @file
 *
 * ESLint rule: workaround-canary
 *
 * Pairs every Obsidian workaround marker with the canary test that proves the workaround is still needed (see
 * `obsidian-workarounds.ts`). In a module, a marker ``Obsidian workaround `<id>`, seen in Obsidian `<version>` `` is
 * reported when no `*.integration.test.ts` under the project's source folder holds a canary titled
 * `workaround canary <id>: ...`, and when the same id is marked again elsewhere. In an integration test, a canary is
 * reported when no module marks its id.
 *
 * Only a file that holds a marker or a canary reads the rest of the source folder, so linting the many files with
 * neither costs one regular-expression pass each. The file being linted is checked in its in-memory text, so an
 * editor's unsaved buffer counts. The source folder is resolved against ESLint's working directory.
 */

import type { Rule } from 'eslint';
import type { SourceLocation } from 'estree';

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { relative } from 'node:path';

import type { WorkaroundLocation } from '../../obsidian-workarounds.ts';

import {
  DEFAULT_WORKAROUND_SOURCE_FOLDER,
  findWorkaroundCanaries,
  findWorkaroundMarkers,
  groupPathsById,
  readWorkaroundSourceFiles,
  toPosixPath,
  WORKAROUND_CANARY_TEST_NAME_PREFIX
} from '../../obsidian-workarounds.ts';

/**
 * Message ID reported for a marker whose id has no canary.
 */
export const MISSING_CANARY_MESSAGE_ID = 'missingCanary';

/**
 * Message ID reported for a marker whose id is marked more than once.
 */
export const DUPLICATE_MARKER_MESSAGE_ID = 'duplicateMarker';

/**
 * Message ID reported for a canary whose id no module marks.
 */
export const ORPHAN_CANARY_MESSAGE_ID = 'orphanCanary';

/**
 * Options of the rule.
 */
export interface WorkaroundCanaryOptions {
  /**
   * The folder, relative to ESLint's working directory, whose `.ts` files hold the markers and the canaries.
   */
  readonly sourceFolder?: string;
}

/**
 * ESLint rule pairing every Obsidian workaround marker with its canary test.
 */
export const workaroundCanary: Rule.RuleModule = {
  create(context) {
    const sourceCode = context.sourceCode;
    const path = toPosixPath(relative(context.cwd, context.filename));
    const currentFile = { content: sourceCode.text, path };
    const markers = findWorkaroundMarkers([currentFile]);
    const canaries = findWorkaroundCanaries([currentFile]);
    if (markers.length === 0 && canaries.length === 0) {
      return {};
    }

    const options = (context.options[0] ?? {}) as WorkaroundCanaryOptions;
    const sourceFolder = options.sourceFolder ?? DEFAULT_WORKAROUND_SOURCE_FOLDER;
    const otherFiles = readWorkaroundSourceFiles(context.cwd, sourceFolder).filter((file) => file.path !== path);
    const allFiles = [currentFile, ...otherFiles];
    const markerPathsById = groupPathsById(findWorkaroundMarkers(allFiles));
    const canaryIds = new Set(findWorkaroundCanaries(allFiles).map((canary) => canary.id));

    return {
      Program(): void {
        for (const marker of markers) {
          const loc = getMatchLoc(sourceCode, marker);
          if (!canaryIds.has(marker.id)) {
            context.report({
              data: { id: marker.id, prefix: WORKAROUND_CANARY_TEST_NAME_PREFIX, sourceFolder },
              loc,
              messageId: MISSING_CANARY_MESSAGE_ID
            });
          }
          const paths = ensureNonNullable(markerPathsById.get(marker.id));
          if (paths.length > 1) {
            context.report({
              data: { id: marker.id, paths: paths.join(', ') },
              loc,
              messageId: DUPLICATE_MARKER_MESSAGE_ID
            });
          }
        }
        for (const canary of canaries) {
          if (!markerPathsById.has(canary.id)) {
            context.report({
              data: { id: canary.id },
              loc: getMatchLoc(sourceCode, canary),
              messageId: ORPHAN_CANARY_MESSAGE_ID
            });
          }
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Pair every Obsidian workaround marker with a canary integration test that proves it is still needed'
    },
    messages: {
      [DUPLICATE_MARKER_MESSAGE_ID]: 'Obsidian workaround `{{id}}` is marked more than once: {{paths}}. Mark it once, where the workaround lives.',
      [MISSING_CANARY_MESSAGE_ID]: 'Obsidian workaround `{{id}}` has no canary: add an integration test under `{{sourceFolder}}` titled \'{{prefix}} {{id}}: <the bug, still present>\', which reproduces the bug without the workaround.',
      [ORPHAN_CANARY_MESSAGE_ID]: 'Canary `{{id}}` names no marked Obsidian workaround: mark the workaround, or remove the canary with it.'
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          sourceFolder: { type: 'string' }
        },
        type: 'object'
      }
    ],
    type: 'problem'
  }
};

function getMatchLoc(sourceCode: Rule.RuleContext['sourceCode'], location: WorkaroundLocation): SourceLocation {
  return { end: sourceCode.getLocFromIndex(location.offset + location.length), start: sourceCode.getLocFromIndex(location.offset) };
}
