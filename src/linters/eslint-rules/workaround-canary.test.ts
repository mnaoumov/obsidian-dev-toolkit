import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it,
  vi
} from 'vitest';

import type { WorkaroundSourceFile } from '../../obsidian-workarounds.ts';

import {
  DUPLICATE_MARKER_MESSAGE_ID,
  MISSING_CANARY_MESSAGE_ID,
  ORPHAN_CANARY_MESSAGE_ID,
  workaroundCanary
} from './workaround-canary.ts';

const MARKER = '// Obsidian workaround `foo-bar`, seen in Obsidian `1.15.1`.\nexport const x = 1;\n';
const CANARY = 'it(\'workaround canary foo-bar: still broken\', () => {});\n';
const MODULE_PATH = 'src/foo.ts';
const CANARY_PATH = 'src/foo.desktop.integration.test.ts';

/*
 * Each case names its fixture project through the rule's `sourceFolder` option, and the mocked reader returns that
 * fixture's files, so the cases need no files on disk.
 */
const mocks = vi.hoisted(() => ({ fixtures: new Map<string, WorkaroundSourceFile[]>() }));

vi.mock('../../obsidian-workarounds.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../obsidian-workarounds.ts')>();
  return {
    ...original,
    readWorkaroundSourceFiles: (_rootDirectory: string, sourceFolder: string): WorkaroundSourceFile[] => mocks.fixtures.get(sourceFolder) ?? []
  };
});

mocks.fixtures.set('paired', [{ content: MARKER, path: MODULE_PATH }, { content: CANARY, path: CANARY_PATH }]);
mocks.fixtures.set('duplicate', [{ content: MARKER, path: 'src/bar.ts' }, { content: CANARY, path: CANARY_PATH }]);
mocks.fixtures.set('src', [{ content: CANARY, path: CANARY_PATH }]);

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

// A relative filename is resolved against the tester's working directory, which the rule reads as `context.cwd`.
const ruleTester = new RuleTester();

ruleTester.run('workaround-canary', toRuleTesterModule(workaroundCanary), {
  invalid: [
    {
      code: MARKER,
      errors: [{ data: { id: 'foo-bar', prefix: 'workaround canary', sourceFolder: 'empty' }, line: 1, messageId: MISSING_CANARY_MESSAGE_ID }],
      filename: MODULE_PATH,
      name: 'a marker with no canary',
      options: [{ sourceFolder: 'empty' }]
    },
    {
      code: MARKER,
      errors: [{ data: { id: 'foo-bar', paths: `${MODULE_PATH}, src/bar.ts` }, messageId: DUPLICATE_MARKER_MESSAGE_ID }],
      filename: MODULE_PATH,
      name: 'a marker whose id is marked in another module',
      options: [{ sourceFolder: 'duplicate' }]
    },
    {
      code: `${MARKER}\n${MARKER}`,
      errors: [
        { messageId: MISSING_CANARY_MESSAGE_ID },
        { messageId: DUPLICATE_MARKER_MESSAGE_ID },
        { messageId: MISSING_CANARY_MESSAGE_ID },
        { messageId: DUPLICATE_MARKER_MESSAGE_ID }
      ],
      filename: MODULE_PATH,
      name: 'one module marking the same id twice, with no canary',
      options: [{ sourceFolder: 'empty' }]
    },
    {
      code: `\n${CANARY}`,
      errors: [{ data: { id: 'foo-bar' }, line: 2, messageId: ORPHAN_CANARY_MESSAGE_ID }],
      filename: CANARY_PATH,
      name: 'a canary naming no marker',
      options: [{ sourceFolder: 'empty' }]
    }
  ],
  valid: [
    { code: MARKER, filename: MODULE_PATH, name: 'a marker with its canary', options: [{ sourceFolder: 'paired' }] },
    { code: CANARY, filename: CANARY_PATH, name: 'a canary with its marker', options: [{ sourceFolder: 'paired' }] },
    { code: MARKER, filename: MODULE_PATH, name: 'the default source folder' },
    { code: 'export const y = 2;', filename: 'src/other.ts', name: 'a file with neither' },
    { code: MARKER, filename: 'src/foo.test.ts', name: 'a marker in a unit test file is not read' }
  ]
});
