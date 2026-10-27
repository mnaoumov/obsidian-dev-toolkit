import type { SourceMapMappings } from '@jridgewell/sourcemap-codec';

import {
  decode,
  encode
} from '@jridgewell/sourcemap-codec';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { SourceMap } from './ignore-list-source-map-plugin.ts';

import {
  addIgnoreList,
  createIgnoreListOnlySourceMap
} from './ignore-list-source-map-plugin.ts';

const OWN_SOURCE = '../../src/plugin.ts';
const WRAPPER_SOURCE = '../../node_modules/monkey-around/index.js';
const SECOND_WRAPPER_SOURCE = '../../node_modules/monkey-around/helpers.js';

function makeSourceMap(sources: string[], mappings: SourceMapMappings): SourceMap {
  return { mappings: encode(mappings), names: [], sources, version: 3 };
}

describe('addIgnoreList', () => {
  it('should preserve source content and existing ignores when adding wrapper indices', () => {
    const sourceMap = {
      ...makeSourceMap([OWN_SOURCE, WRAPPER_SOURCE, SECOND_WRAPPER_SOURCE], [[[0, 0, 0, 0]]]),
      ignoreList: [0, 1],
      sourcesContent: ['own', 'wrapper', 'second']
    };
    expect(addIgnoreList(sourceMap, (source) => source !== OWN_SOURCE)).toEqual({ ...sourceMap, ignoreList: [0, 1, 2] });
    expect(sourceMap.ignoreList).toEqual([0, 1]);
  });

  it('should leave ordinary sources visible when there are no wrappers', () => {
    expect(addIgnoreList(makeSourceMap([OWN_SOURCE], []), () => false).ignoreList).toEqual([]);
  });
});

describe('createIgnoreListOnlySourceMap', () => {
  function getListedSourceName(source: string): null | string {
    return source === OWN_SOURCE ? null : source;
  }

  it('should omit a production map when no generated code belongs to a wrapper', () => {
    expect(createIgnoreListOnlySourceMap(makeSourceMap([OWN_SOURCE], [[[0, 0, 0, 0]]]), getListedSourceName)).toBeNull();
  });

  it('should keep caller regions unmapped and end wrapper regions at their boundaries', () => {
    const result = createIgnoreListOnlySourceMap(
      makeSourceMap([OWN_SOURCE, WRAPPER_SOURCE], [
        [[0, 0, 0, 0], [10, 1, 5, 2], [20, 1, 6, 0], [30, 0, 9, 0], [40, 0, 10, 0]],
        [[0, 1, 1, 0], [5, 1, 1, 5]],
        [[0, 1, 2, 0], [8, 0, 0, 0]],
        [[0, 0, 1, 0]],
        [[0, 1, 0, 0], [6], [9, 1, 0, 9]]
      ]),
      getListedSourceName
    );

    expect(result).toMatchObject({ ignoreList: [0], names: [], sources: [WRAPPER_SOURCE], version: 3 });
    expect(result).not.toHaveProperty('sourcesContent');
    expect(decode(result?.mappings ?? '')).toEqual([
      [[10, 0, 5, 2], [30]],
      [[0, 0, 1, 0]],
      [[0, 0, 2, 0], [8]],
      [],
      [[0, 0, 0, 0], [6], [9, 0, 0, 9]]
    ]);
  });

  it('should collapse package sources under one name so large bundled libraries have small maps', () => {
    const result = createIgnoreListOnlySourceMap(
      makeSourceMap([WRAPPER_SOURCE, SECOND_WRAPPER_SOURCE, OWN_SOURCE], [
        [[0, 0, 12, 3], [7, 1, 40, 1], [15, 2, 0, 0]]
      ]),
      (source) => source === OWN_SOURCE ? null : 'ignored'
    );
    expect(result?.sources).toEqual(['ignored']);
    expect(decode(result?.mappings ?? '')).toEqual([[[0, 0, 0, 0], [15]]]);
  });
});
