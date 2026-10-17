import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  CreateRollupCompatibleFeaturePluginParams,
  FeaturePluginContext
} from './rollup-compatible-features.ts';

import {
  createRollupCompatibleFeaturePlugin,
  createUnpluginVuePlugin
} from './rollup-compatible-features.ts';

const WASM_PATH = join(import.meta.dirname, '../../test-fixtures/features/wasm/src/answer.wasm');

// The first case of each framework pays for the cold load of its compiler (Babel with `babel-preset-solid`, Svelte, PostCSS with Tailwind), which takes more than vitest's default 5 s under a loaded gate.
const COLD_LOAD_TIMEOUT_IN_MILLISECONDS = 60_000;

vi.setConfig({ testTimeout: COLD_LOAD_TIMEOUT_IN_MILLISECONDS });

function createContext(): FeaturePluginContext {
  return {
    addWatchFile: vi.fn(),
    emitFile: vi.fn(() => 'reference')
  };
}

function createPlugin(params: Partial<CreateRollupCompatibleFeaturePluginParams>): ReturnType<typeof createRollupCompatibleFeaturePlugin> {
  return createRollupCompatibleFeaturePlugin({
    features: {},
    isProductionBuild: () => true,
    shouldCompileStylesheets: true,
    shouldReplaceDefines: true,
    ...params
  });
}

describe('rollup-compatible features', () => {
  it('loads a `.wasm` module as its bytes when wasm is on', async () => {
    const plugin = createPlugin({ features: { wasm: true } });
    const code = await plugin.load.handler.call(createContext(), WASM_PATH);
    expect(code).toContain(Buffer.from(await readFile(WASM_PATH)).toString('base64'));
  });

  it('loads nothing when wasm is off or the module is no `.wasm`', async () => {
    expect(await createPlugin({}).load.handler.call(createContext(), WASM_PATH)).toBeNull();
    expect(await createPlugin({ features: { wasm: true } }).load.handler.call(createContext(), '/src/main.ts')).toBeNull();
  });

  it('compiles Solid JSX only for Solid', async () => {
    const solid = await createPlugin({ features: { framework: 'solid' } }).transform.handler.call(createContext(), 'export const v = <p />;', '/src/v.tsx');
    expect(solid?.code).toContain('solid-js/web');
    const react = await createPlugin({ features: { framework: 'react' } }).transform.handler.call(createContext(), 'export const v = <p />;', '/src/v.tsx');
    expect(react).toBeNull();
  });

  it('compiles Svelte only for Svelte', async () => {
    const svelte = await createPlugin({ features: { framework: 'svelte' } }).transform.handler.call(createContext(), '<p>a</p>', '/src/A.svelte');
    expect(svelte?.code).toContain('svelte/internal/client');
    expect(await createPlugin({}).transform.handler.call(createContext(), '<p>a</p>', '/src/A.svelte')).toBeNull();
  });

  it('emits a stylesheet and exports a CSS module\'s names', async () => {
    const context = createContext();
    const plugin = createPlugin({ features: { styles: { cssModules: true } } });
    const result = await plugin.transform.handler.call(context, '.card { color: blue; }', '/src/card.module.css');
    expect(result?.code).toMatch(/^export default \{"card":"_card_/u);
    expect(context.emitFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'styles.css', type: 'asset' }));
  });

  it('exports nothing from an ordinary stylesheet, and watches what it depends on', async () => {
    const context = createContext();
    const plugin = createPlugin({ features: { styles: { tailwind: true } }, isProductionBuild: () => false });
    const result = await plugin.transform.handler.call(context, '@import "tailwindcss/theme.css";', join(import.meta.dirname, 'main.css'));
    expect(result?.code).toBe('export default undefined;\n');
    expect(context.addWatchFile).toHaveBeenCalledWith(expect.stringContaining('theme.css'));
  });

  it('leaves stylesheets to the bundler when told to, or without styles', async () => {
    expect(await createPlugin({ features: { styles: {} }, shouldCompileStylesheets: false }).transform.handler.call(createContext(), 'a{}', '/a.css')).toBeNull();
    expect(await createPlugin({}).transform.handler.call(createContext(), 'a{}', '/a.css')).toBeNull();
  });

  it('replaces the framework\'s constants in any module', async () => {
    const plugin = createPlugin({ features: { framework: 'react' } });
    const result = await plugin.transform.handler.call(createContext(), 'if (process.env.NODE_ENV !== "x") {}', '/node_modules/react/index.js');
    expect(result).toEqual({ code: 'if ("production" !== "x") {}', map: undefined });
    expect(await plugin.transform.handler.call(createContext(), 'const a = 1;', '/src/a.ts')).toBeNull();
  });

  it('replaces the constants in the compiled code too, keeping its source map', async () => {
    const plugin = createPlugin({ features: { framework: 'solid' } });
    const result = await plugin.transform.handler.call(createContext(), 'export const v = process.env.NODE_ENV;', '/src/v.tsx');
    expect(result?.code).toContain('"production"');
    expect(result?.map).toBeDefined();
  });

  it('replaces nothing when the bundler defines the constants itself', async () => {
    const plugin = createPlugin({ features: { framework: 'react' }, shouldReplaceDefines: false });
    expect(await plugin.transform.handler.call(createContext(), 'process.env.NODE_ENV', '/a.js')).toBeNull();
  });

  it('creates unplugin-vue only for Vue', async () => {
    expect(await createUnpluginVuePlugin({ bundler: 'rollup', features: {} })).toBeNull();
    expect(await createUnpluginVuePlugin({ bundler: 'rollup', features: { framework: 'vue' } })).toMatchObject({ name: 'unplugin-vue' });
    expect(await createUnpluginVuePlugin({ bundler: 'vite', features: { framework: 'vue' } })).toMatchObject({ name: 'unplugin-vue' });
  });
});
