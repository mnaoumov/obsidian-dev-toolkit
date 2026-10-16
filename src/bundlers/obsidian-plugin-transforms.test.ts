import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import {
  appendInlineSourceMap,
  getCssModuleCode,
  getWasmModuleCode,
  loadPostcssConfig,
  transformCss,
  transformJsx,
  transformSolid,
  transformSvelte
} from './obsidian-plugin-transforms.ts';

const REPO_ROOT = join(import.meta.dirname, '../..');

// Inside the repository's `node_modules`, so the packages a transform imports from the project resolve from there.
const TEMP_PARENT_FOLDER = join(REPO_ROOT, 'node_modules/.cache/obsidian-dev-toolkit-tests');

const MARKER_POSTCSS_CONFIG = `export default {
  plugins: [
    {
      postcssPlugin: 'marker',
      Once(root, { decl, rule }) {
        root.append(rule({ selector: '.marker' }).append(decl({ prop: 'color', value: 'green' })));
      }
    }
  ]
};
`;

const TAILWIND_POSTCSS_CONFIG = `import tailwind from '@tailwindcss/postcss';

export default { plugins: [tailwind()] };
`;

describe('obsidian-plugin-transforms', () => {
  let markerProjectFolder = '';
  let tailwindProjectFolder = '';
  let emptyProjectFolder = '';

  beforeAll(() => {
    mkdirSync(TEMP_PARENT_FOLDER, { recursive: true });
    markerProjectFolder = mkdtempSync(join(TEMP_PARENT_FOLDER, 'marker-'));
    writeFileSync(join(markerProjectFolder, 'postcss.config.mjs'), MARKER_POSTCSS_CONFIG);
    tailwindProjectFolder = mkdtempSync(join(TEMP_PARENT_FOLDER, 'tailwind-'));
    writeFileSync(join(tailwindProjectFolder, 'postcss.config.mjs'), TAILWIND_POSTCSS_CONFIG);
    writeFileSync(join(tailwindProjectFolder, 'source.ts'), 'export const className = \'text-red-500\';\n');
    emptyProjectFolder = mkdtempSync(join(TEMP_PARENT_FOLDER, 'empty-'));
  });

  afterAll(() => {
    for (const folder of [markerProjectFolder, tailwindProjectFolder, emptyProjectFolder]) {
      if (folder) {
        rmSync(folder, { force: true, recursive: true });
      }
    }
  });

  describe('appendInlineSourceMap', () => {
    it('returns the code alone when there is no source map', () => {
      expect(appendInlineSourceMap({ code: 'a;', map: undefined })).toBe('a;');
    });

    it('puts the source map inline as a base64 comment', () => {
      const map = { mappings: 'AAAA', sources: ['a.ts'], version: 3 };
      const base64 = Buffer.from(JSON.stringify(map)).toString('base64');
      expect(appendInlineSourceMap({ code: 'a;', map })).toBe(`a;\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}\n`);
    });
  });

  it('exports a CSS module\'s scoped names as the default export', () => {
    expect(getCssModuleCode({ card: '_card_1' })).toBe('export default {"card":"_card_1"};\n');
  });

  it('puts a WebAssembly module inline as its bytes', () => {
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    const code = getWasmModuleCode(bytes);
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval -- Evaluates the generated module body to check the bytes it yields.
    const evaluate = new Function(code.replace('export default bytes;', 'return bytes;')) as () => Uint8Array;
    expect(evaluate()).toEqual(bytes);
  });

  describe('loadPostcssConfig', () => {
    it('loads no plugin when neither postcss nor tailwind is on', async () => {
      expect(await loadPostcssConfig({ isProductionBuild: true, styles: { cssModules: true } })).toEqual({ dependencies: [], options: {}, plugins: [] });
    });

    it('loads the project\'s PostCSS configuration', async () => {
      const config = await loadPostcssConfig({ isProductionBuild: false, projectFolder: markerProjectFolder, styles: { postcss: true } });
      expect(config.plugins).toHaveLength(1);
      expect(config.dependencies).toEqual([join(markerProjectFolder, 'postcss.config.mjs')]);
    });

    it('fails when postcss is on and the project has no configuration', async () => {
      await expect(loadPostcssConfig({ isProductionBuild: true, projectFolder: emptyProjectFolder, styles: { postcss: true } })).rejects.toThrow(
        'The `styles.postcss` build option needs a PostCSS configuration'
      );
    });

    it('looks for the configuration from the working folder by default', async () => {
      await expect(loadPostcssConfig({ isProductionBuild: true, styles: { postcss: true } })).rejects.toThrow('needs a PostCSS configuration');
    });

    it('puts Tailwind ahead of the configuration\'s plugins', async () => {
      const config = await loadPostcssConfig({ isProductionBuild: true, projectFolder: markerProjectFolder, styles: { postcss: true, tailwind: true } });
      expect(config.plugins).toHaveLength(2);
      expect(config.plugins[0]).toMatchObject({ postcssPlugin: '@tailwindcss/postcss' });
    });

    it('adds no second Tailwind when the configuration already runs it', async () => {
      const config = await loadPostcssConfig({ isProductionBuild: true, projectFolder: tailwindProjectFolder, styles: { postcss: true, tailwind: true } });
      expect(config.plugins).toHaveLength(1);
    });

    it('resolves Tailwind from the project root by default', async () => {
      const config = await loadPostcssConfig({ isProductionBuild: false, styles: { tailwind: true } });
      expect(config.plugins).toHaveLength(1);
    });
  });

  describe('transformCss', () => {
    const SOURCE = '.card { color: blue; }';

    it('leaves a stylesheet alone when no plugin applies', async () => {
      const result = await transformCss({ filePath: '/src/main.css', isCssModuleScoped: true, isProductionBuild: true, source: SOURCE, styles: {} });
      expect(result).toEqual({ css: SOURCE, dependencies: [], moduleExports: undefined });
    });

    it('scopes a CSS module and exports its names', async () => {
      const result = await transformCss({ filePath: '/src/card.module.css', isCssModuleScoped: true, isProductionBuild: true, source: SOURCE, styles: { cssModules: true } });
      expect(result.moduleExports?.['card']).toMatch(/^_card_/u);
      expect(result.css).toContain(`.${result.moduleExports?.['card'] ?? ''}`);
    });

    it('leaves the scoping to the bundler when it scopes CSS modules itself', async () => {
      const result = await transformCss({ filePath: '/src/card.module.css', isCssModuleScoped: false, isProductionBuild: true, source: SOURCE, styles: { cssModules: true } });
      expect(result.moduleExports).toBeUndefined();
    });

    it('scopes only a `*.module.css` file', async () => {
      const result = await transformCss({ filePath: '/src/card.css', isCssModuleScoped: true, isProductionBuild: true, source: SOURCE, styles: { cssModules: true } });
      expect(result.moduleExports).toBeUndefined();
    });

    it('runs the project\'s configuration and reports the files it depends on', async () => {
      const filePath = join(markerProjectFolder, 'main.css');

      const result = await transformCss({
        filePath,
        isCssModuleScoped: true,
        isProductionBuild: true,
        projectFolder: markerProjectFolder,
        source: SOURCE,
        styles: { postcss: true }
      });
      expect(result.css).toContain('.marker');
      expect(result.dependencies).toEqual([join(markerProjectFolder, 'postcss.config.mjs')]);
    });

    it('expands Tailwind\'s utilities from the sources it scans', async () => {
      const result = await transformCss({
        filePath: join(tailwindProjectFolder, 'main.css'),
        isCssModuleScoped: true,
        isProductionBuild: false,
        projectFolder: tailwindProjectFolder,
        source: '@import "tailwindcss/theme.css";\n@import "tailwindcss/utilities.css";\n@source "./";\n',
        styles: { postcss: true }
      });
      expect(result.css).toContain('.text-red-500');
      expect(result.dependencies.some((dependency) => dependency.endsWith('theme.css'))).toBe(true);
    });
  });

  describe('transformJsx', () => {
    it('compiles TSX with the automatic runtime of the given package', async () => {
      const result = await transformJsx({
        code: 'const name: string = \'x\'; export const view = <p>{name}</p>;',
        filePath: '/src/view.tsx',
        isProductionBuild: true,
        jsxImportSource: 'preact'
      });
      expect(result.code).toContain('from "preact/jsx-runtime"');
      expect(result.map?.sources).toEqual(['/src/view.tsx']);
    });

    it('compiles JSX', async () => {
      const result = await transformJsx({ code: 'export const view = <p />;', filePath: '/src/view.jsx', isProductionBuild: true, jsxImportSource: 'react' });
      expect(result.code).toContain('from "react/jsx-runtime"');
    });
  });

  describe('transformSolid', () => {
    it('compiles TSX into DOM expressions', async () => {
      const result = await transformSolid({
        code: 'const name: string = \'x\'; export const View = () => <p class="a">{name}</p>;',
        filePath: '/src/view.tsx',
        isProductionBuild: true
      });
      expect(result.code).toContain('from "solid-js/web"');
      expect(result.code).toContain('_$template(');
      expect(result.code).not.toContain(': string');
      expect(result.map).toBeDefined();
    });

    it('compiles JSX, resolving the packages from a given folder', async () => {
      const result = await transformSolid({ code: 'export const View = () => <p />;', filePath: '/src/view.jsx', isProductionBuild: false, projectFolder: REPO_ROOT });
      expect(result.code).toContain('from "solid-js/web"');
    });
  });

  describe('transformSvelte', () => {
    it('compiles a component with its styles injected', async () => {
      const result = await transformSvelte({
        code: '<script lang="ts">const name: string = \'x\';</script><p>{name}</p><style>p { color: red; }</style>',
        filePath: '/src/Greeting.svelte',
        isProductionBuild: true
      });
      expect(result.code).toContain('svelte/internal/client');
      expect(result.code).toContain('$.append_styles');
    });

    it('compiles a TypeScript module, stripping its types first', async () => {
      const result = await transformSvelte({
        code: 'export function create(initial: number) { let count = $state(initial); return { get count(): number { return count; } }; }',
        filePath: '/src/counter.svelte.ts',
        isProductionBuild: false,
        projectFolder: REPO_ROOT
      });
      expect(result.code).toContain('svelte/internal/client');
      expect(result.code).not.toContain('$state(');
    });

    it('compiles a JavaScript module', async () => {
      const result = await transformSvelte({
        code: 'export function create(initial) { let count = $state(initial); return { get count() { return count; } }; }',
        filePath: '/src/counter.svelte.js',
        isProductionBuild: true
      });
      expect(result.code).toContain('svelte/internal/client');
      expect(result.code).not.toContain('$state(');
    });
  });
});
