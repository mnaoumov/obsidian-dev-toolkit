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
 */

import type { Plugin as RollupPlugin } from 'rollup';

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { join } from '@mnaoumov/typescript-lib/path';
import process from 'node:process';

import { build as buildWithEsbuild } from '../../src/bundlers/esbuild.ts';
import { BuildMode } from '../../src/bundlers/obsidian-plugin-build.ts';
import { build as buildWithParcel } from '../../src/bundlers/parcel.ts';
import { obsidianPluginRollup } from '../../src/bundlers/rollup.ts';
import { obsidianPluginVite } from '../../src/bundlers/vite.ts';
import { ObsidianPluginWebpackPlugin } from '../../src/bundlers/webpack.ts';

const BUNDLER_ARGUMENT_INDEX = 2;
const MODE_ARGUMENT_INDEX = 3;

await wrapCliTask(async () => {
  const bundler = process.argv[BUNDLER_ARGUMENT_INDEX];
  const mode = process.argv[MODE_ARGUMENT_INDEX] === 'development' ? BuildMode.Development : BuildMode.Production;
  switch (bundler) {
    case 'esbuild': {
      assertProduction(mode, bundler);
      await buildWithEsbuild();
      break;
    }
    case 'parcel': {
      assertProduction(mode, bundler);
      await buildWithParcel();
      break;
    }
    case 'rollup': {
      await buildWithRollup(mode);
      break;
    }
    case 'vite': {
      await buildWithVite(mode);
      break;
    }
    case 'webpack': {
      await buildWithWebpack(mode);
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

async function buildWithRollup(mode: BuildMode): Promise<void> {
  const { rollup } = await import('rollup');
  const bundle = await rollup({ plugins: [cssAsAssetRollupPlugin(), obsidianPluginRollup({ mode })] });
  // No output options of our own: the plugin's `outputOptions` hook fills in `main.js` and the rest.
  await bundle.write({});
  await bundle.close();
}

async function buildWithVite(mode: BuildMode): Promise<void> {
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'warn',
    plugins: [obsidianPluginVite({ mode })],
    root: process.cwd()
  });
}

async function buildWithWebpack(mode: BuildMode): Promise<void> {
  const { default: webpack } = await import('webpack');
  const { default: MiniCssExtractPlugin } = await import('mini-css-extract-plugin');
  const compiler = webpack({
    context: process.cwd(),
    module: {
      rules: [
        {
          test: /\.css$/u,
          use: [MiniCssExtractPlugin.loader, 'css-loader']
        }
      ]
    },
    plugins: [new ObsidianPluginWebpackPlugin({ mode }), new MiniCssExtractPlugin()],
    // The fixture has no `node_modules` of its own, so the loaders resolve from this repository's.
    resolveLoader: {
      modules: [join(import.meta.dirname, '../../node_modules')]
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
