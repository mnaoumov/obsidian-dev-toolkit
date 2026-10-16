import type { Mock } from 'vitest';

import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  AssetEmitter,
  BundleOutputLike
} from './rollup-compatible.ts';

import {
  combineExternal,
  renameCssAssets
} from './rollup-compatible.ts';

describe('combineExternal', () => {
  it('keeps Obsidian\'s modules external with no external option of the consumer\'s', () => {
    const external = combineExternal(undefined);
    expect(external('obsidian', undefined, false)).toBe(true);
    expect(external('node:fs', undefined, false)).toBe(true);
    expect(external('fflate', undefined, false)).toBe(false);
  });

  it('keeps the consumer\'s function form', () => {
    const external = combineExternal((source) => source === 'my-external' || undefined);
    expect(external('my-external', undefined, false)).toBe(true);
    expect(external('fflate', undefined, false)).toBe(false);
  });

  it('keeps the consumer\'s string and RegExp forms', () => {
    expect(combineExternal('my-external')('my-external', undefined, false)).toBe(true);
    expect(combineExternal(/^virtual:/u)('virtual:thing', undefined, false)).toBe(true);
    const external = combineExternal(['a', /^b/u]);
    expect(external('a', undefined, false)).toBe(true);
    expect(external('bee', undefined, false)).toBe(true);
    expect(external('c', undefined, false)).toBe(false);
  });
});

interface MockAssetEmitter extends AssetEmitter {
  readonly emitFile: Mock<AssetEmitter['emitFile']>;
}

describe('renameCssAssets', () => {
  function createEmitter(): MockAssetEmitter {
    return { emitFile: vi.fn<AssetEmitter['emitFile']>(() => 'reference-id') };
  }

  it('moves every CSS asset into styles.css', () => {
    const emitter = createEmitter();
    const bundle: Record<string, BundleOutputLike> = {
      'chunk.css': { fileName: 'chunk.css', source: new TextEncoder().encode('b{}'), type: 'asset' },
      'main.css': { fileName: 'main.css', source: 'a{}', type: 'asset' },
      'main.js': { fileName: 'main.js', type: 'chunk' }
    };

    renameCssAssets(emitter, bundle);

    expect(Object.keys(bundle)).toEqual(['main.js']);
    expect(emitter.emitFile).toHaveBeenCalledWith({ fileName: 'styles.css', source: 'b{}\na{}', type: 'asset' });
  });

  it('leaves a bundle without CSS alone', () => {
    const emitter = createEmitter();
    const bundle: Record<string, BundleOutputLike> = {
      'main.js': { fileName: 'main.js', type: 'chunk' }
    };

    renameCssAssets(emitter, bundle);

    expect(Object.keys(bundle)).toEqual(['main.js']);
    expect(emitter.emitFile).not.toHaveBeenCalled();
  });
});
