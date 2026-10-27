import type {
  BuildOptions,
  BuildResult,
  Message,
  PluginBuild
} from 'esbuild';

import { encode } from '@jridgewell/sourcemap-codec';
import { assertNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { SourceMap } from './ignore-list-source-map-plugin.ts';

import { ignoreListSourceMapPlugin } from './ignore-list-source-map-plugin.ts';

const { files, readFile, rm, writeFile } = vi.hoisted(() => {
  const contents = new Map<string, string>();
  return {
    files: contents,
    readFile: vi.fn((path: string) => Promise.resolve(contents.get(path))),
    rm: vi.fn((path: string) => Promise.resolve(contents.delete(path))),
    writeFile: vi.fn((path: string, text: string) => Promise.resolve(contents.set(path, text)))
  };
});

vi.mock('node:fs', () => ({ existsSync: (path: string): boolean => files.has(path) }));
vi.mock('node:fs/promises', () => ({ readFile, rm, writeFile }));

const OUTFILE = '/dist/main.js';
const MAP_PATH = `${OUTFILE}.map`;
const PREFIX = '\n//# sourceMappingURL=data:application/json;base64,';
const MARKER = '\n/* nosourcemap */';
const WRAPPER = '../../node_modules/@mnaoumov/typescript-lib/src/debug.ts';
const OWN_SOURCE = '../../src/plugin.ts';

interface CapturedHooks {
  onEnd?: (result: BuildResult) => Promise<void> | void;
}

function inlineBundle(map: SourceMap): string {
  return `bundle${PREFIX}${Buffer.from(JSON.stringify(map)).toString('base64')}`;
}

function makeMap(sources = [WRAPPER, OWN_SOURCE]): SourceMap {
  return { mappings: encode([[[0, 0, 0, 0], [5, 1, 0, 0]]]), names: [], sources, sourcesContent: ['wrapper', 'caller'], version: 3 };
}

function readInlineMap(): SourceMap {
  const encoded = (files.get(OUTFILE) ?? '').split(PREFIX)[1]?.split('\n', 1)[0] ?? '';
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as SourceMap;
}

async function setup(options?: BuildOptions, sources: readonly RegExp[] = []): Promise<(errors?: Message[]) => Promise<void>> {
  const initialOptions = options ?? { outfile: OUTFILE };
  initialOptions.sourcemap ??= false;
  const hooks: CapturedHooks = {};
  await ignoreListSourceMapPlugin(sources).setup(strictProxy<PluginBuild>({
    initialOptions,
    onEnd(callback: (result: BuildResult) => Promise<void> | void): void {
      hooks.onEnd = callback;
    }
  }));
  assertNonNullable(hooks.onEnd);
  const callback = hooks.onEnd;
  return async (errors = []): Promise<void> => {
    await callback(strictProxy<BuildResult>({ errors }));
  };
}

describe('ignoreListSourceMapPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    files.set(OUTFILE, 'bundle');
    files.set(MAP_PATH, JSON.stringify(makeMap()));
  });

  it('should request temporary maps and emit only ignored regions for a production build', async () => {
    const options: BuildOptions = { outfile: OUTFILE };
    const finish = await setup(options);
    expect(options).toMatchObject({ sourcemap: 'external', sourcesContent: false });
    await finish();
    expect(readInlineMap()).toEqual({ ignoreList: [0], mappings: 'AAAA,K', names: [], sources: ['obsidian-dev-toolkit:ignored'], version: 3 });
    expect(files.get(OUTFILE)?.endsWith(MARKER)).toBe(true);
    expect(rm).toHaveBeenCalledWith(MAP_PATH, { force: true });
    expect(rm).toHaveBeenCalledWith('/dist/main.css.map', { force: true });
  });

  it('should retain upstream production ignores even when our defaults match no source', async () => {
    files.set(MAP_PATH, JSON.stringify({ ...makeMap(['custom-wrapper', OWN_SOURCE]), ignoreList: [0] }));
    await (await setup())();
    expect(readInlineMap().ignoreList).toEqual([0]);
  });

  it('should omit the map when ordinary plugin code has no ignored regions', async () => {
    files.set(MAP_PATH, JSON.stringify(makeMap([OWN_SOURCE, OWN_SOURCE])));
    await (await setup())();
    expect(files.get(OUTFILE)).toBe('bundle');
    expect(writeFile).not.toHaveBeenCalled();
    expect(files.has(MAP_PATH)).toBe(false);
  });

  it.each([false, true])('should preserve full inline maps and existing ignores with marker present %s', async (hasMarker) => {
    const map = { ...makeMap(), ignoreList: [1] };
    files.set(OUTFILE, inlineBundle(map) + (hasMarker ? MARKER : ''));
    await (await setup({ outfile: OUTFILE, sourcemap: 'inline' }))();
    expect(readInlineMap()).toEqual({ ...map, ignoreList: [1, 0] });
    expect(files.get(OUTFILE)?.split(MARKER)).toHaveLength(2);
    expect(rm).not.toHaveBeenCalled();
  });

  it('should avoid rewriting an inline map already prepared by an earlier plugin', async () => {
    const content = inlineBundle({ ...makeMap(), ignoreList: [0] }) + MARKER;
    files.set(OUTFILE, content);
    await (await setup({ outfile: OUTFILE, sourcemap: 'inline' }))();
    expect(files.get(OUTFILE)).toBe(content);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it.each(['external', 'linked'] as const)('should retain explicitly requested %s maps with full caller mappings', async (sourcemap) => {
    const map = makeMap();
    await (await setup({ outfile: OUTFILE, sourcemap }))();
    expect(JSON.parse(files.get(MAP_PATH) ?? '')).toEqual({ ...map, ignoreList: [0] });
    expect(files.get(OUTFILE)).toBe('bundle');
    expect(rm).not.toHaveBeenCalled();
  });

  it('should update both map copies when the consumer requests both', async () => {
    files.set(OUTFILE, inlineBundle(makeMap()));
    await (await setup({ outfile: OUTFILE, sourcemap: 'both' }))();
    expect(JSON.parse(files.get(MAP_PATH) ?? '')).toEqual(readInlineMap());
  });

  it('should still update an inline map when a consumer removes its external copy', async () => {
    files.set(OUTFILE, inlineBundle(makeMap()));
    files.delete(MAP_PATH);
    await (await setup({ outfile: OUTFILE, sourcemap: 'both' }))();
    expect(readInlineMap().ignoreList).toEqual([0]);
    expect(files.has(MAP_PATH)).toBe(false);
  });

  it('should normalize backslashes and match repeated rebuilds without changing consumer regex state', async () => {
    const pattern = /src\/plugin\.ts$/g;
    pattern.lastIndex = 10;
    const finish = await setup({ outfile: OUTFILE, sourcemap: 'inline' }, [pattern]);
    for (let index = 0; index < 2; index++) {
      files.set(OUTFILE, inlineBundle(makeMap([String.raw`..\src\plugin.ts`, OWN_SOURCE])));
      await finish();
      expect(readInlineMap().ignoreList).toEqual([0, 1]);
    }
    expect(pattern.lastIndex).toBe(10);
  });

  it('should reject a missing outfile because the deployment needs a disk bundle', async () => {
    await expect(setup({ outfile: '' })).rejects.toThrow('needs the esbuild outfile option');
  });

  it('should leave the last successful bundle untouched on compilation errors', async () => {
    await (await setup())([strictProxy<Message>({})]);
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });

  it('should skip disk processing when the bundler has no disk output', async () => {
    files.delete(OUTFILE);
    await (await setup())();
    expect(readFile).not.toHaveBeenCalled();
    expect(files.has(OUTFILE)).toBe(false);
  });

  it('should preserve the bundle when an earlier consumer plugin removes its source map', async () => {
    files.delete(MAP_PATH);
    await (await setup())();
    expect(files.get(OUTFILE)).toBe('bundle');
    expect(writeFile).not.toHaveBeenCalled();
  });
});
