import type { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';

import { join } from 'node:path';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  getFeatureFileKind,
  getFrameworkDefines,
  getJsxImportSource,
  importOptionalPeer,
  isCssModuleFile,
  isPostcssNeeded,
  replaceDefines,
  requireOptionalPeer,
  resolveOptionalPeer
} from './obsidian-plugin-features.ts';

const mockGetRootFolder = vi.hoisted(() => vi.fn<typeof getRootFolder>());

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => {
  const actual = await importOriginal<RootModule>();
  mockGetRootFolder.mockImplementation(actual.getRootFolder);
  return { ...actual, getRootFolder: mockGetRootFolder };
});

const REPO_ROOT = join(import.meta.dirname, '../..');

interface RootModule {
  readonly getRootFolder: typeof getRootFolder;
}

interface SemverModule {
  readonly valid: (version: string) => null | string;
}

interface SemverModuleNamespace {
  readonly default: SemverModule;
}

describe('obsidian-plugin-features', () => {
  it('defines nothing without a framework', () => {
    expect(getFrameworkDefines({ framework: undefined, isProductionBuild: true })).toEqual({});
  });

  it('defines NODE_ENV for every framework, by build mode', () => {
    expect(getFrameworkDefines({ framework: 'react', isProductionBuild: true })).toEqual({ 'process.env.NODE_ENV': '"production"' });
    expect(getFrameworkDefines({ framework: 'svelte', isProductionBuild: false })).toEqual({ 'process.env.NODE_ENV': '"development"' });
  });

  it('defines Vue\'s feature flags for Vue', () => {
    expect(getFrameworkDefines({ framework: 'vue', isProductionBuild: true })).toEqual({
      '__VUE_OPTIONS_API__': 'true',
      '__VUE_PROD_DEVTOOLS__': 'false',
      '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false',
      'process.env.NODE_ENV': '"production"'
    });
  });

  it.each(
    [
      ['react', 'react'],
      ['preact', 'preact'],
      ['solid', undefined],
      ['svelte', undefined],
      ['vue', undefined],
      [undefined, undefined]
    ] as const
  )('takes the JSX runtime of %s from %s', (framework, expected) => {
    expect(getJsxImportSource(framework)).toBe(expected);
  });

  it.each([
    ['/src/card.module.css', true],
    ['/src/card.module.SCSS', true],
    ['/src/card.module.sass', true],
    ['/src/card.module.pcss', true],
    ['/src/card.css', false],
    ['/src/module.css', false]
  ])('tells whether %s is a CSS module', (filePath, expected) => {
    expect(isCssModuleFile(filePath)).toBe(expected);
  });

  it('runs PostCSS for postcss or tailwind only', () => {
    expect(isPostcssNeeded(undefined)).toBe(false);
    expect(isPostcssNeeded({ cssModules: true })).toBe(false);
    expect(isPostcssNeeded({ postcss: true })).toBe(true);
    expect(isPostcssNeeded({ tailwind: true })).toBe(true);
  });

  it.each([
    ['/src/main.css', 'stylesheet'],
    ['/src/main.pcss', 'stylesheet'],
    ['/src/Greeting.vue?vue&type=style&index=0&lang.css', 'stylesheet'],
    ['/src/Greeting.svelte', 'svelte'],
    ['/src/counter.svelte.ts', 'svelte'],
    ['/src/counter.svelte.js', 'svelte'],
    ['/src/view.tsx', 'jsx'],
    ['/src/view.jsx?query', 'jsx'],
    ['/src/module.wasm', 'wasm'],
    ['/src/main.ts', undefined],
    ['\0virtual.css', undefined]
  ])('tells the kind of %s', (id, expected) => {
    expect(getFeatureFileKind(id)).toBe(expected);
  });

  it('replaces a define only where the whole expression stands alone', () => {
    const defines = { '__FLAG__': 'true', 'process.env.NODE_ENV': '"production"' };
    expect(replaceDefines('if (process.env.NODE_ENV === "x" && __FLAG__) {}', defines)).toBe('if ("production" === "x" && true) {}');
    expect(replaceDefines('myProcess.env.NODE_ENV; a.process.env.NODE_ENV; process.env.NODE_ENV_X; __FLAG__S', defines))
      .toBe('myProcess.env.NODE_ENV; a.process.env.NODE_ENV; process.env.NODE_ENV_X; __FLAG__S');
  });

  it('imports, requires and resolves a package from the project', async () => {
    const params = { feature: 'test', packageName: 'semver', projectFolder: REPO_ROOT };
    expect(resolveOptionalPeer(params)).toContain('semver');
    expect((requireOptionalPeer(params) as SemverModule).valid('1.2.3')).toBe('1.2.3');
    const imported = await importOptionalPeer<SemverModuleNamespace>(params);
    expect(imported.default.valid('1.2.3')).toBe('1.2.3');
  });

  it('resolves a specifier other than the package name', () => {
    expect(resolveOptionalPeer({ feature: 'test', packageName: 'semver', projectFolder: REPO_ROOT, specifier: 'semver/functions/valid' })).toContain('valid');
  });

  it('falls back to the working folder when there is no project root', () => {
    mockGetRootFolder.mockReturnValueOnce(null);
    expect(resolveOptionalPeer({ feature: 'test', packageName: 'semver' })).toContain('semver');
  });

  it('defaults the project folder to the project root', () => {
    expect(resolveOptionalPeer({ feature: 'test', packageName: 'semver' })).toContain('semver');
    expect((requireOptionalPeer({ feature: 'test', packageName: 'semver' }) as SemverModule).valid('x')).toBeNull();
  });

  it('names the option and the install command when the package is missing', async () => {
    const params = { feature: 'framework: \'solid\'', packageName: 'no-such-package-for-the-test' };
    const message = 'The `framework: \'solid\'` build option needs `no-such-package-for-the-test`, which this project does not have. '
      + 'Install it with: npm install --save-dev no-such-package-for-the-test';
    expect(() => resolveOptionalPeer(params)).toThrow(message);
    await expect(importOptionalPeer(params)).rejects.toThrow(message);
  });
});
