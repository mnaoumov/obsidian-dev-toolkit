import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { BuildMode } from './obsidian-plugin-build.ts';
import {
  getWebpackBuildMode,
  obsidianPluginWebpackExternals,
  ObsidianPluginWebpackPlugin
} from './webpack.ts';

describe('webpack', () => {
  it('creates a plugin', () => {
    expect(new ObsidianPluginWebpackPlugin()).toBeInstanceOf(ObsidianPluginWebpackPlugin);
  });

  it.each(
    [
      [{ watch: false }, BuildMode.Production],
      [{ mode: 'production', watch: true }, BuildMode.Development],
      [{ mode: 'development', watch: false }, BuildMode.Development]
    ] as const
  )('decides the build mode of %o', (options, expected) => {
    expect(getWebpackBuildMode(options)).toBe(expected);
  });

  it('leaves Obsidian\'s modules to require()', () => {
    const callback = vi.fn();
    obsidianPluginWebpackExternals({ request: '@codemirror/view' }, callback);
    expect(callback).toHaveBeenCalledWith(null, 'commonjs2 @codemirror/view');
  });

  it('bundles everything else', () => {
    const callback = vi.fn();
    obsidianPluginWebpackExternals({ request: 'fflate' }, callback);
    obsidianPluginWebpackExternals({}, callback);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1);
    expect(callback).toHaveBeenNthCalledWith(2);
  });
});
