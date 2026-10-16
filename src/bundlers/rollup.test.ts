import type { OutputOptions } from 'rollup';

import {
  describe,
  expect,
  it
} from 'vitest';

import type { ObsidianPluginBuildContext } from './obsidian-plugin-build.ts';

import {
  applyRollupInputDefaults,
  applyRollupOutputDefaults,
  obsidianPluginRollup
} from './rollup.ts';

type ExternalFunction = (source: string, importer: string | undefined, isResolved: boolean) => unknown;

const PRODUCTION_CONTEXT: ObsidianPluginBuildContext = {
  distFolder: '/project/dist/build',
  entryPoint: '/project/src/main.ts',
  isProductionBuild: true,
  mainJsPath: '/project/dist/build/main.js',
  obsidianConfigFolder: '',
  pluginName: 'my-plugin'
};

const DEVELOPMENT_CONTEXT: ObsidianPluginBuildContext = {
  ...PRODUCTION_CONTEXT,
  distFolder: '/project/dist/dev',
  isProductionBuild: false,
  mainJsPath: '/project/dist/dev/main.js'
};
describe('rollup', () => {
  it('creates a plugin', () => {
    expect(obsidianPluginRollup().name).toBe('obsidian-plugin');
  });

  it('fills in the input and keeps Obsidian\'s modules external', () => {
    const inputOptions = applyRollupInputDefaults({ buildContext: PRODUCTION_CONTEXT, inputOptions: {} });
    expect(inputOptions.input).toBe('/project/src/main.ts');
    expect((inputOptions.external as ExternalFunction)('obsidian', undefined, false)).toBe(true);
  });

  it('keeps the consumer\'s input', () => {
    expect(applyRollupInputDefaults({ buildContext: PRODUCTION_CONTEXT, inputOptions: { input: 'src/other.ts' } }).input).toBe('src/other.ts');
  });

  it('fills in a production output', () => {
    expect(applyRollupOutputDefaults({ buildContext: PRODUCTION_CONTEXT, outputOptions: {} })).toEqual({
      banner: expect.stringContaining('BY ROLLUP') as unknown,
      file: '/project/dist/build/main.js',
      format: 'cjs',
      inlineDynamicImports: true,
      sourcemap: false
    });
  });

  it('fills in a development output, keeping what the consumer set', () => {
    const outputOptions: OutputOptions = {
      banner: '/* mine */',
      // eslint-disable-next-line unicorn/name-replacements -- `dir` is the name rollup's API reads.
      dir: 'out',
      format: 'es'
    };
    expect(applyRollupOutputDefaults({ buildContext: DEVELOPMENT_CONTEXT, outputOptions })).toEqual({
      ...outputOptions,
      inlineDynamicImports: true,
      sourcemap: 'inline'
    });
  });
});
