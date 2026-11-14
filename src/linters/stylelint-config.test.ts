import stylelint from 'stylelint';
import {
  describe,
  expect,
  it
} from 'vitest';

import { obsidianTokenOnlyStylelintConfig } from './stylelint-config.ts';

async function lintCss(code: string): Promise<string[]> {
  const result = await stylelint.lint({
    code,
    config: obsidianTokenOnlyStylelintConfig
  });
  const [lintResult] = result.results;
  expect(lintResult?.invalidOptionWarnings).toEqual([]);
  return (lintResult?.warnings ?? []).map((warning) => warning.rule);
}

describe('obsidianTokenOnlyStylelintConfig', () => {
  it.each([
    'color: var(--text-normal);',
    'color: currentColor;',
    'background-color: var(--background-primary, var(--background-secondary));',
    'background: transparent;',
    'padding: 0 var(--size-4-2);',
    'margin: 0 0 var(--size-4-1) auto;',
    'gap: calc(var(--size-4-1) * 2);',
    'border: var(--border-width) solid var(--background-modifier-border);',
    'border-top-color: var(--color-accent);',
    'outline: none;',
    'box-shadow: inset 0 0 0 var(--border-width) var(--color-accent), var(--shadow-s);',
    'color: color-mix(in srgb, var(--color-accent) 50%, transparent);',
    'font-size: var(--font-ui-small);',
    'font-family: var(--font-monospace);',
    'z-index: 2;',
    'z-index: var(--layer-popover);',
    'width: var(--my-cover-width);',
    'width: 50%;',
    '--my-cover-width: 64px;'
  ])('should allow `%s`', async (declaration) => {
    expect(await lintCss(`.my-plugin { ${declaration} }`)).toEqual([]);
  });

  it.each([
    ['color: #fff;', 'color-no-hex'],
    ['--my-accent: #ff0000;', 'color-no-hex'],
    ['color: red;', 'color-named'],
    ['color: rgb(0 0 0);', 'function-disallowed-list'],
    ['background-color: hsla(0, 0%, 0%, 0.5);', 'function-disallowed-list'],
    ['display: block !important;', 'declaration-no-important'],
    ['width: 64px;', 'declaration-property-unit-disallowed-list'],
    ['max-height: 10px;', 'declaration-property-unit-disallowed-list'],
    ['padding: 4px;', 'declaration-property-value-allowed-list'],
    ['font-size: 12px;', 'declaration-property-value-allowed-list'],
    ['color: var(--text-normal, 12px);', 'declaration-property-value-allowed-list'],
    ['gap: calc(var(--size-4-1) + 2px);', 'declaration-property-value-allowed-list'],
    ['border: 1px solid var(--background-modifier-border);', 'declaration-property-value-allowed-list'],
    ['z-index: 10;', 'declaration-property-value-allowed-list']
  ])('should report `%s` through %s', async (declaration, rule) => {
    expect(await lintCss(`.my-plugin { ${declaration} }`)).toContain(rule);
  });
});
