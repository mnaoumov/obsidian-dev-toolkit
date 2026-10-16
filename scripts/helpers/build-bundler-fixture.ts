/**
 * @file
 *
 * Builds the fixture plugin in the current working directory with one bundler, through that bundler's own
 * API and the toolkit's adapter for it. The bundler integration test runs it once per case, each in a
 * process of its own, because every adapter finds the project from the working directory.
 *
 * Usage: `jiti scripts/helpers/build-bundler-fixture.ts <esbuild|parcel|rollup|vite|webpack> [development]`,
 * run from the fixture's folder. `development` builds once in development mode without watching, which
 * only the adapters with a `mode` option can do; esbuild's and parcel's `dev()` always watch.
 *
 * A `features.json` in the fixture's folder holds the build feature options every adapter is given. With it, rollup
 * and webpack get what a project would add for TypeScript and dependencies: `rollup-plugin-esbuild`, node-resolve
 * and CommonJS for rollup, `esbuild-loader` for webpack.
 */

import type {
  InputPluginOption,
  Plugin as RollupPlugin
} from 'rollup';
import type { RuleSetRule } from 'webpack';

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { extractDefaultExportInterop } from '@mnaoumov/typescript-lib/object-utils';
import { join } from '@mnaoumov/typescript-lib/path';
import {
  existsSync,
  readFileSync
} from 'node:fs';
import process from 'node:process';

import type { ObsidianPluginFeatureOptions } from '../../src/bundlers/obsidian-plugin-features.ts';

import { build as buildWithEsbuild } from '../../src/bundlers/esbuild.ts';
import { BuildMode } from '../../src/bundlers/obsidian-plugin-build.ts';
import { build as buildWithParcel } from '../../src/bundlers/parcel.ts';
import { obsidianPluginRollup } from '../../src/bundlers/rollup.ts';
import { obsidianPluginVite } from '../../src/bundlers/vite.ts';
import { ObsidianPluginWebpackPlugin } from '../../src/bundlers/webpack.ts';

const BUNDLER_ARGUMENT_INDEX = 2;
const MODE_ARGUMENT_INDEX = 3;
const FEATURES_FILE_NAME = 'features.json';
const REPO_NODE_MODULES = join(import.meta.dirname, '../../node_modules');

await wrapCliTask(async () => {
  const bundler = process.argv[BUNDLER_ARGUMENT_INDEX];
  const mode = process.argv[MODE_ARGUMENT_INDEX] === 'development' ? BuildMode.Development : BuildMode.Production;
  const features = readFeatures();
  switch (bundler) {
    case 'esbuild': {
      assertProduction(mode, bundler);
      await buildWithEsbuild(features);
      break;
    }
    case 'parcel': {
      assertProduction(mode, bundler);
      await buildWithParcel(features);
      break;
    }
    case 'rollup': {
      await buildWithRollup(mode, features);
      break;
    }
    case 'vite': {
      await buildWithVite(mode, features);
      break;
    }
    case 'webpack': {
      await buildWithWebpack(mode, features);
      break;
    }
    default: {
      throw new Error(`Unknown bundler: ${String(bundler)}`);
    }
  }
});

function assertProduction(mode: BuildMode, bundler: string): void {
  if (mode !== BuildMode.Production) {
    throw new Error(`The ${bundler} adapter's development build always watches, so it cannot build once.`);
  }
}

async function buildWithRollup(mode: BuildMode, features: ObsidianPluginFeatureOptions | undefined): Promise<void> {
  const { rollup } = await import('rollup');
  const plugins: InputPluginOption[] = [obsidianPluginRollup({ mode, ...features })];
  if (features) {
    const { default: esbuild } = await import('rollup-plugin-esbuild');
    const commonjsModule = await import('@rollup/plugin-commonjs');
    const commonjs = extractDefaultExportInterop(commonjsModule.default);
    const { nodeResolve } = await import('@rollup/plugin-node-resolve');
    plugins.push(
      esbuild({ tsconfig: 'tsconfig.json' }),
      nodeResolve({ browser: true, exportConditions: ['svelte'], extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'] }),
      commonjs()
    );
  }
  if (!features?.styles) {
    plugins.push(cssAsAssetRollupPlugin());
  }
  const bundle = await rollup({ plugins });
  // No output options of our own: the plugin's `outputOptions` hook fills in `main.js` and the rest.
  await bundle.write({});
  await bundle.close();
}

async function buildWithVite(mode: BuildMode, features: ObsidianPluginFeatureOptions | undefined): Promise<void> {
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'warn',
    plugins: [obsidianPluginVite({ mode, ...features })],
    root: process.cwd()
  });
}

async function buildWithWebpack(mode: BuildMode, features: ObsidianPluginFeatureOptions | undefined): Promise<void> {
  const { default: webpack } = await import('webpack');
  const { default: MiniCssExtractPlugin } = await import('mini-css-extract-plugin');
  const rules: RuleSetRule[] = [];
  if (!features?.styles) {
    rules.push({
      test: /\.css$/u,
      use: [MiniCssExtractPlugin.loader, 'css-loader']
    });
  }
  if (features) {
    rules.push({
      loader: 'esbuild-loader',
      options: { tsconfig: 'tsconfig.json' },
      test: /\.[jt]sx?$/u
    });
  }
  const compiler = webpack({
    context: process.cwd(),
    module: { rules },
    plugins: [new ObsidianPluginWebpackPlugin({ mode, ...features }), new MiniCssExtractPlugin()],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '...']
    },
    // The fixture has no `node_modules` of its own, so the loaders resolve from this repository's.
    resolveLoader: {
      modules: [REPO_NODE_MODULES]
    }
  });
  await new Promise<void>((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => {
        if (error) {
          reject(error);
          return;
        }
        if (stats?.hasErrors()) {
          reject(new Error(stats.toString('errors-only')));
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Stands in for whichever CSS plugin a consumer would pick: turns every imported `.css` file into an
 * emitted asset, which is the shape rollup's CSS plugins hand over.
 *
 * @returns The rollup plugin.
 */
function cssAsAssetRollupPlugin(): RollupPlugin {
  return {
    name: 'css-as-asset',
    transform(code, id): string | undefined {
      if (!id.endsWith('.css')) {
        return undefined;
      }
      this.emitFile({ name: 'main.css', source: code, type: 'asset' });
      return 'export default undefined;';
    }
  };
}

function readFeatures(): ObsidianPluginFeatureOptions | undefined {
  return existsSync(FEATURES_FILE_NAME) ? (JSON.parse(readFileSync(FEATURES_FILE_NAME, 'utf-8')) as ObsidianPluginFeatureOptions) : undefined;
}
