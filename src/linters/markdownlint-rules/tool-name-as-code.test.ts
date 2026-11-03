import type { LintError } from 'markdownlint';

import { applyFixes } from 'markdownlint';
import { lint } from 'markdownlint/promise';
import {
  describe,
  expect,
  it
} from 'vitest';

import { obsidianMarkdownlintCli2Config } from '../markdownlint-cli2-config.ts';
import { TOOL_NAMES } from '../tool-names.ts';
import { toolNameAsCodeRule } from './tool-name-as-code.ts';

async function fixMarkdown(markdown: string): Promise<string> {
  return applyFixes(markdown, await lintMarkdown(markdown));
}

async function lintMarkdown(markdown: string, ruleConfig: unknown = true): Promise<LintError[]> {
  const results = await lint({
    config: { 'default': false, 'tool-name-as-code': ruleConfig },
    customRules: [toolNameAsCodeRule],
    strings: { content: markdown }
  });
  return results['content'] ?? [];
}

describe('tool-name-as-code', () => {
  it('should be enabled in the shared configuration', () => {
    expect(obsidianMarkdownlintCli2Config.config?.['tool-name-as-code']).toBe(true);
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it.each([
    ['Build with esbuild, Vite, Rollup, Webpack or Parcel.', 'Build with `esbuild`, `Vite`, `Rollup`, `Webpack` or `Parcel`.'],
    ['Pick React, Preact, Vue, Svelte, Solid or Lit.', 'Pick `React`, `Preact`, `Vue`, `Svelte`, `Solid` or `Lit`.'],
    ['Test with Vitest or Jest, lint with ESLint, format with Prettier or dprint.', 'Test with `Vitest` or `Jest`, lint with `ESLint`, format with `Prettier` or `dprint`.'],
    ['Style with PostCSS, SCSS, Tailwind CSS or CSS Modules, templated by EJS.', 'Style with `PostCSS`, `SCSS`, `Tailwind CSS` or `CSS Modules`, templated by `EJS`.'],
    ['Post it on Discord or Telegram, and run it in PowerShell, cmd or bash.', 'Post it on `Discord` or `Telegram`, and run it in `PowerShell`, `cmd` or `bash`.'],
    ['GitHub Actions deploys GitHub Pages; your GitHub username.', '`GitHub Actions` deploys `GitHub Pages`; your `GitHub` username.'],
    ['A solid default, lit by a parcel of changes in one rollup.', 'A solid default, lit by a parcel of changes in one rollup.'],
    ['Do not jest; a sass reply would react badly, and prettier output is not the point.', 'Do not jest; a sass reply would react badly, and prettier output is not the point.'],
    ['Lightning struck the tailwind of a husky dog.', 'Lightning struck the tailwind of a `husky` dog.'],
    ['*npm* and **Vite**', '*`npm`* and **`Vite`**'],
    ['- npm\n\n| tool |\n| --- |\n| Vite |', '- `npm`\n\n| tool |\n| --- |\n| `Vite` |'],
    ['[x npm', '[x `npm`'],
    ['[npm]', '[`npm`]']
  ])('should port the original matching behavior for %s', async (markdown, expected) => {
    expect(await fixMarkdown(markdown)).toBe(expected);
    expect(await fixMarkdown(expected)).toBe(expected);
  });

  it.each([
    ['front matter', '---\ndescription: npm needs a separator.\n---\n'],
    ['an ATX heading', '## Using npm with Vite\n'],
    ['a setext heading', 'Using npm\n========\n'],
    ['inline code', '`pnpm`, `yarn` and `bun` work too.'],
    ['fenced code and its language', '```bash\nnpm create @mnaoumov/obsidian-plugin\n```'],
    ['tilde fences', '~~~bash\nnpm install\n~~~'],
    ['indented code', 'Example:\n\n    npm install\n'],
    ['a multiline code span', 'A span that wraps, `npm run\nbuild`, is code too.'],
    ['a multi-backtick span', 'Use ``npm `install` Vite`` here.'],
    ['links and autolinks', '[npm docs](https://docs.npmjs.com/) and <https://git-scm.com/>'],
    ['reference links', '[npm][ref]\n\n[ref]: https://example.com/Vite'],
    ['an image', '![npm](Vite.png)'],
    ['URLs and handles', 'See https://example.com/Vite, @GitHub and GitHubs.'],
    ['longer tokens', 'Node.js ships npm.ps1, @mnaoumov/obsidian-lib and git-annex; nodes are not node.js.'],
    ['package and file names', 'vite.config.ts, @rollup/plugin-babel, eslint-plugin-obsidianmd and create-vue are other names.'],
    ['paths', 'Use /npm/path, C:\\npm\\file and npm/file.'],
    ['quoted text', 'See "On the framework presets every bundler is an obsidian-dev-toolkit adapter" and “npm install”.'],
    ['a block quotation', '> npm said to use Vite.'],
    ['template tags', 'Rendered by <%= answers.bundler === \'vite\' ? \'Vite\' : \'esbuild\' %> at build time.'],
    ['HTML', '<div>\nnpm\n</div>'],
    ['inline HTML code', 'Use <code>npm</code> here.'],
    ['wikilinks', 'See [[npm]] now.'],
    ['math', 'See $npm$ now.']
  ])('should preserve %s because it is not editable prose', async (_label, markdown) => {
    expect(await lintMarkdown(markdown)).toEqual([]);
  });

  it('should honor additions, exclusions, empty spellings and literal regex characters', async () => {
    const errors = await lintMarkdown('Custom Tool and npm.', { additionalToolNames: ['Custom Tool', 'npm', ''], excludedToolNames: ['npm'] });
    expect(errors.map((error) => error.errorDetail)).toEqual(['Wrap `Custom Tool` in backticks']);
    expect(await lintMarkdown('Use C++.', { additionalToolNames: ['C++'] })).toHaveLength(1);
    expect(await lintMarkdown('npm', { excludedToolNames: TOOL_NAMES })).toEqual([]);
    expect(await lintMarkdown('npm', false)).toEqual([]);
  });

  it('should report and fix bare commands with exact positions', async () => {
    const markdown = 'Then run npm install.\npnpm, yarn and bun work too.\n';
    const errors = await lintMarkdown(markdown);
    expect(errors.map((error) => [error.lineNumber, error.errorRange, error.errorDetail])).toEqual([
      [1, [10, 3], 'Wrap `npm` in backticks'],
      [2, [1, 4], 'Wrap `pnpm` in backticks'],
      [2, [7, 4], 'Wrap `yarn` in backticks'],
      [2, [16, 3], 'Wrap `bun` in backticks']
    ]);
    expect(await fixMarkdown(markdown)).toBe('Then run `npm` install.\n`pnpm`, `yarn` and `bun` work too.\n');
  });
});
