import type { LoaderContext } from 'webpack';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ObsidianPluginWebpackLoaderOptions } from './obsidian-plugin-webpack-loader.ts';

import obsidianPluginWebpackLoader, { raw } from './obsidian-plugin-webpack-loader.ts';

// The first case of each framework pays for the cold load of its compiler (Babel with `babel-preset-solid`, Svelte, PostCSS with Tailwind), which takes more than vitest's default 5 s under a loaded gate.
const COLD_LOAD_TIMEOUT_IN_MILLISECONDS = 60_000;

vi.setConfig({ testTimeout: COLD_LOAD_TIMEOUT_IN_MILLISECONDS });

interface LoaderRun {
  readonly code: string | undefined;
  readonly dependencies: readonly string[];
  readonly error: Error | null | undefined;
  readonly map: unknown;
}

async function runLoader(options: ObsidianPluginWebpackLoaderOptions, resourcePath: string, source: Buffer | string): Promise<LoaderRun> {
  const dependencies: string[] = [];
  return await new Promise<LoaderRun>((resolve) => {
    const context = castTo<LoaderContext<ObsidianPluginWebpackLoaderOptions>>({
      addDependency: vi.fn((dependency: string) => {
        dependencies.push(dependency);
      }),
      async: () => (error: Error | null | undefined, code?: string, map?: unknown): void => {
        resolve({ code, dependencies, error, map });
      },
      getOptions: () => options,
      resourcePath
    });
    obsidianPluginWebpackLoader.call(context, typeof source === 'string' ? Buffer.from(source) : source);
  });
}

describe('obsidian-plugin-webpack-loader', () => {
  it('takes the module as bytes', () => {
    expect(raw).toBe(true);
  });

  it('compiles Solid JSX', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'jsx' }, '/src/v.tsx', 'export const v = <p />;');
    expect(result.code).toContain('solid-js/web');
    expect(result.map).toBeDefined();
  });

  it('compiles a Svelte component', async () => {
    const result = await runLoader({ isProductionBuild: false, kind: 'svelte' }, '/src/A.svelte', '<p>a</p>');
    expect(result.code).toContain('svelte/internal/client');
  });

  it('runs a stylesheet through PostCSS and reports what it depends on', async () => {
    const result = await runLoader(
      { isProductionBuild: true, kind: 'stylesheet', styles: { tailwind: true } },
      join(import.meta.dirname, 'main.css'),
      '@import "tailwindcss/theme.css";'
    );
    expect(result.code).toContain('tailwindcss');
    expect(result.dependencies.some((dependency) => dependency.endsWith('theme.css'))).toBe(true);
  });

  it('passes a stylesheet through without stylesheet options', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'stylesheet' }, '/src/a.css', 'a { color: red; }');
    expect(result.code).toBe('a { color: red; }');
  });

  it('strips the types of a Vue component\'s script block', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'typescript' }, '/src/A.vue?vue&type=script&lang.ts', 'const a: number = 1;');
    expect(result.code).toBe('const a = 1;\n');
    expect(JSON.parse(String(result.map))).toMatchObject({ version: 3 });
  });

  it('turns a WebAssembly module into its bytes', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'wasm' }, '/src/a.wasm', Buffer.from([0, 97, 115, 109]));
    expect(result.code).toContain('"AGFzbQ=="');
  });

  it('reports a transform\'s failure through the callback', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'typescript' }, '/src/a.ts', 'const = ;');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('rejects an unknown kind', async () => {
    const result = await runLoader({ isProductionBuild: true, kind: 'unknown' as ObsidianPluginWebpackLoaderOptions['kind'] }, '/src/a.ts', '');
    expect(result.error?.message).toBe('Unknown loader kind: unknown');
  });
});
