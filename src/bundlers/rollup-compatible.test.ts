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
    const isExternal = combineExternal(undefined);
    expect(isExternal('obsidian', undefined, false)).toBe(true);
    expect(isExternal('node:fs', undefined, false)).toBe(true);
    expect(isExternal('fflate', undefined, false)).toBe(false);
  });

  it('keeps the consumer\'s function form', () => {
    const isExternal = combineExternal((source) => source === 'my-external' || undefined);
    expect(isExternal('my-external', undefined, false)).toBe(true);
    expect(isExternal('fflate', undefined, false)).toBe(false);
  });

  it('keeps the consumer\'s string and RegExp forms', () => {
    expect(combineExternal('my-external')('my-external', undefined, false)).toBe(true);
    expect(combineExternal(/^virtual:/u)('virtual:thing', undefined, false)).toBe(true);
    const isExternal = combineExternal(['a', /^b/u]);
    expect(isExternal('a', undefined, false)).toBe(true);
    expect(isExternal('bee', undefined, false)).toBe(true);
    expect(isExternal('c', undefined, false)).toBe(false);
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
