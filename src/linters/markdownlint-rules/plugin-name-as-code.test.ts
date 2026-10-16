import type { LintError } from 'markdownlint';

import { applyFixes } from 'markdownlint';
import { lint } from 'markdownlint/promise';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PLUGIN_NAME_AS_CODE_RULE_NAME,
  pluginNameAsCodeRule
} from './plugin-name-as-code.ts';

async function fixMarkdown(markdown: string): Promise<string> {
  return applyFixes(markdown, await lintMarkdown(markdown));
}

async function lintMarkdown(markdown: string, ruleConfig: unknown = true): Promise<LintError[]> {
  const results = await lint({
    config: { default: false, [PLUGIN_NAME_AS_CODE_RULE_NAME]: ruleConfig },
    customRules: [pluginNameAsCodeRule],
    strings: { content: markdown }
  });
  return results['content'] ?? [];
}

describe('plugin-name-as-code', () => {
  it('should report a name in a paragraph with its position', async () => {
    const errors = await lintMarkdown('Use Dataview here.\n');
    expect(errors.map((error) => [error.lineNumber, error.errorRange, error.errorDetail])).toEqual([[1, [5, 8], 'Wrap `Dataview` in backticks']]);
  });

  it('should fix every name on a line', async () => {
    expect(await fixMarkdown('Dataview, Templater and Advanced Note Composer.\n')).toBe('`Dataview`, `Templater` and `Advanced Note Composer`.\n');
  });

  it('should fix names in lists, tables and emphasis', async () => {
    expect(await fixMarkdown('- Dataview\n\n| a |\n| - |\n| Templater |\n\n*Kanban*\n')).toBe('- `Dataview`\n\n| a |\n| - |\n| `Templater` |\n\n*`Kanban`*\n');
  });

  it('should report a name micromark splits across adjacent text tokens', async () => {
    expect(await fixMarkdown('[x Dataview\n')).toBe('[x `Dataview`\n');
  });

  it('should report a name in an undefined reference once, as the plain text it renders as', async () => {
    expect(await fixMarkdown('See [Dataview] now.\n')).toBe('See [`Dataview`] now.\n');
  });

  it('should read the names a project adds', async () => {
    expect(await fixMarkdown('My Plugin is here.\n')).toBe('My Plugin is here.\n');
    expect(await lintMarkdown('My Plugin is here.\n', { additionalPluginNames: ['My Plugin'] })).toHaveLength(1);
  });

  it.each([
    ['a code span', 'Use `Dataview` here.\n'],
    ['fenced code', '```\nDataview\n```\n'],
    ['indented code', 'Text.\n\n    Dataview\n'],
    ['an ATX heading', '# Dataview\n'],
    ['a setext heading', 'Dataview\n========\n'],
    ['a block quote', '> Dataview said so.\n'],
    ['a link label and target', '[Dataview](https://example.com/Dataview)\n'],
    ['an image', '![Dataview](Dataview.png)\n'],
    ['a reference definition', '[ref]: https://example.com/Dataview\n'],
    ['a full reference link', 'See [Dataview][x].\n\n[x]: https://example.com\n'],
    ['an autolink', '<https://example.com/Dataview>\n'],
    ['a bare URL', 'See https://example.com/Dataview now.\n'],
    ['a wikilink', 'See [[Dataview]] now.\n'],
    ['an inline code element', 'See <code>Dataview</code> now.\n'],
    ['HTML', '<div>\nDataview\n</div>\n'],
    ['math', 'See $Dataview$ now.\n'],
    ['a lowercase package name', 'See obsidian-dataview now.\n']
  ])('should leave a name in %s alone', async (_label, markdown) => {
    expect(await lintMarkdown(markdown)).toEqual([]);
  });
});
