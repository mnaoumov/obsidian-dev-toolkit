import dedent from 'dedent';
import { fileURLToPath } from 'node:url';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  findOutdatedReferences,
  findOutdatedReferencesInText,
  formatOutdatedReferences
} from './outdated-references.ts';

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));

describe('findOutdatedReferencesInText', () => {
  it('should flag the retired package used as an address', () => {
    const text = dedent`
      See \`obsidian-dev-utils/obsidian/markdown\`.
      import { loop } from 'obsidian-dev-utils';
      __obsidianDevUtils.sharedAbortController.value.abort();
      https://github.com/mnaoumov/obsidian-dev-utils/releases/latest/download/styles.css
      <!-- obsidian-dev-utils-disable-next-line demo-vault-validation/no-wikilinks -- Why. -->
      <!-- obsidian-dev-utils-enable demo-vault-validation/no-wikilinks -->
      obsidian-dev-utils:
      globalThis.__obsidianDevUtils.pluginApiRegistry.value.records[pluginId]
      window.__obsidianDevUtilsModule.__merged
      import { resetObsidianDevUtilsState } from '@mnaoumov/obsidian-lib/obsidian-dev-utils-state';
    `;
    expect(findOutdatedReferencesInText('a.md', text).map((reference) => reference.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('should not flag the bare package name', () => {
    const text = dedent`
      window.DEBUG.enable('*:obsidian-dev-utils:*');
      .alpha-bravo.obsidian-dev-utils :invalid {
      It replaces [\`obsidian-dev-utils\`](https://github.com/mnaoumov/obsidian-dev-utils).
    `;
    expect(findOutdatedReferencesInText('a.md', text)).toEqual([]);
  });

  it('should honour the allow marker on the same line', () => {
    expect(findOutdatedReferencesInText('a.md', 'Was `obsidian-dev-utils/obsidian/loop`. <!-- outdated-reference-ok -->')).toEqual([]);
  });
});

describe('findOutdatedReferences', () => {
  it('should find no outdated reference in the package', async () => {
    expect(formatOutdatedReferences(await findOutdatedReferences(ROOT_DIR))).toBe('');
  });
});
