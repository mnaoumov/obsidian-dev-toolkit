import type {
  OnLoadArgs,
  OnLoadOptions,
  OnLoadResult,
  OnResolveArgs,
  OnResolveOptions,
  OnResolveResult,
  PluginBuild
} from 'esbuild';
import type { LoaderContext } from 'webpack';

import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  expect,
  it,
  vi
} from 'vitest';

import type { ObsidianPluginWebpackLoaderOptions } from './obsidian-plugin-webpack-loader.ts';

import { getEsbuildFeaturePlugins } from './esbuild-impl/feature-options.ts';
import { bundleInlineWorker } from './inline-worker.ts';
import { getFeatureFileKind } from './obsidian-plugin-features.ts';
import obsidianPluginWebpackLoader from './obsidian-plugin-webpack-loader.ts';
import { getParcelConfigFiles } from './parcel.ts';
import { createRollupCompatibleFeaturePlugin } from './rollup-compatible-features.ts';
import { getWebpackFeatureRules } from './webpack.ts';

vi.mock('./inline-worker.ts', () => ({ bundleInlineWorker: vi.fn() }));

const RESULT = { code: 'export default "postMessage(42)";', dependencies: ['/src/answer.ts'] };

it('recognizes worker entries with and without the source query', () => {
  expect(getFeatureFileKind('/src/compute.worker.ts?worker-source')).toBe('worker');
  expect(getFeatureFileKind('/src/compute.worker.js')).toBe('worker');
});

it('resolves explicit worker source and registers its dependencies in esbuild', async () => {
  vi.mocked(bundleInlineWorker).mockResolvedValue(RESULT);
  const plugins = await getEsbuildFeaturePlugins({ features: { workers: true }, isProductionBuild: true });
  const onLoad = vi.fn<(arguments_: OnLoadArgs) => null | OnLoadResult | Promise<null | OnLoadResult | undefined> | undefined>();
  const onResolve = vi.fn<(arguments_: OnResolveArgs) => null | OnResolveResult | Promise<null | OnResolveResult | undefined> | undefined>();
  const resolve = vi.fn().mockResolvedValue({ path: '/src/compute.worker.ts' });
  await plugins[0]?.setup(strictProxy<PluginBuild>({
    onLoad: (_options: OnLoadOptions, callback) => {
      onLoad.mockImplementation(callback);
    },
    onResolve: (_options: OnResolveOptions, callback) => {
      onResolve.mockImplementation(callback);
    },
    resolve
  }));
  // eslint-disable-next-line unicorn/name-replacements -- `resolveDir` is esbuild's argument name.
  expect(await onResolve(strictProxy<OnResolveArgs>({ kind: 'import-statement', path: './compute.worker.ts?worker-source', resolveDir: '/src' })))
    .toEqual({ namespace: 'obsidian-inline-worker', path: '/src/compute.worker.ts' });
  // eslint-disable-next-line unicorn/name-replacements -- `resolveDir` is esbuild's option name.
  expect(resolve).toHaveBeenCalledWith('./compute.worker.ts', { kind: 'import-statement', resolveDir: '/src' });
  expect(await onLoad(strictProxy<OnLoadArgs>({ path: '/src/compute.worker.ts' }))).toEqual({ contents: RESULT.code, loader: 'js', watchFiles: RESULT.dependencies });
});

it('resolves workers through the project resolver and watches their imports in rollup and vite', async () => {
  vi.mocked(bundleInlineWorker).mockResolvedValue(RESULT);
  const plugin = createRollupCompatibleFeaturePlugin({ features: { workers: true }, isProductionBuild: () => true, shouldCompileStylesheets: false, shouldReplaceDefines: false });
  const resolve = vi.fn().mockResolvedValue({ id: '/src/compute.worker.ts' });
  const disabled = createRollupCompatibleFeaturePlugin({ features: {}, isProductionBuild: () => true, shouldCompileStylesheets: false, shouldReplaceDefines: false });
  expect(await disabled.resolveId.handler.call({ resolve }, './compute.worker.ts?worker-source')).toBeNull();
  expect(await plugin.resolveId.handler.call({ resolve }, './compute.worker.ts?worker-source', '/src/main.ts')).toBe('/src/compute.worker.ts?worker-source');
  expect(await plugin.resolveId.handler.call({ resolve }, './main.ts')).toBeNull();
  resolve.mockResolvedValue(null);
  expect(await plugin.resolveId.handler.call({ resolve }, './compute.worker.ts?worker-source')).toBeNull();
  const addWatchFile = vi.fn();
  expect(await plugin.load.handler.call({ addWatchFile, emitFile: vi.fn() }, '/src/main.ts')).toBeNull();
  expect(await plugin.load.handler.call({ addWatchFile, emitFile: vi.fn() }, '/src/compute.worker.ts?worker-source')).toBe(RESULT.code);
  expect(addWatchFile).toHaveBeenCalledWith('/src/answer.ts');
});

it('enables worker loaders in webpack and keeps parcel JavaScript parsing after the worker transform', () => {
  expect(getWebpackFeatureRules({ cssLoaderPath: '', features: { workers: true }, isProductionBuild: true, loaderPath: '/loader', miniCssExtractLoaderPath: '' }))
    .toEqual([expect.objectContaining({ resourceQuery: /^\?worker-source$/u, use: [{ loader: '/loader', options: { isProductionBuild: true, kind: 'worker' } }] })]);
  const files = getParcelConfigFiles({ consumerParcelrcPath: undefined, features: { workers: true } });
  expect(JSON.parse(files['.parcelrc'] ?? '')).toMatchObject({ transformers: { '*.worker.{js,ts}': ['./obsidian-plugin-features.cjs', '...'] } });
});

it('returns bundled worker source and registers dependencies in webpack', async () => {
  vi.mocked(bundleInlineWorker).mockResolvedValue(RESULT);
  const addDependency = vi.fn();
  const code = await new Promise<string | undefined>((resolve, reject) => {
    obsidianPluginWebpackLoader.call(
      strictProxy<LoaderContext<ObsidianPluginWebpackLoaderOptions>>({
        addDependency,
        async: () => (error, result): void => {
          if (error) {
            reject(error);
          } else {
            resolve(result?.toString());
          }
        },
        getOptions: () => ({ isProductionBuild: true, kind: 'worker' }),
        resourcePath: '/src/compute.worker.ts'
      }),
      Buffer.from('')
    );
  });
  expect(code).toBe(RESULT.code);
  expect(addDependency).toHaveBeenCalledWith('/src/answer.ts');
});
