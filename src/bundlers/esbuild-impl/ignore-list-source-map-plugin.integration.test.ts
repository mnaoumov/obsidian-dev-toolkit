import type {
  BuildOptions,
  Plugin
} from 'esbuild';

import { build } from 'esbuild';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import type { SourceMap } from './ignore-list-source-map-plugin.ts';

import { ignoreListSourceMapPlugin } from './ignore-list-source-map-plugin.ts';

describe('ignoreListSourceMapPlugin', () => {
  let folder: string;
  let outfile: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'ignore-list-'));
    outfile = join(folder, 'main.js');
  });

  afterEach(async () => {
    await rm(folder, { recursive: true });
  });

  async function bundle(options: BuildOptions = {}): Promise<string> {
    await build({
      outfile,
      plugins: [ignoreListSourceMapPlugin()],
      stdin: {
        contents: 'export function log() { console.debug("message"); }',
        sourcefile: 'src/plugin.ts'
      },
      ...options
    });
    return await readFile(outfile, 'utf-8');
  }

  function readInlineMap(content: string): SourceMap {
    const encoded = content.split('sourceMappingURL=data:application/json;base64,', 2)[1]?.split('\n', 1)[0] ?? '';
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as SourceMap;
  }

  it('should retain an inline ignore map in production so Obsidian can attribute logs to callers', async () => {
    const content = await bundle({
      minify: true,
      outfile,
      plugins: [ignoreListSourceMapPlugin()],
      stdin: {
        contents: 'export function log() { console.debug("message"); }',
        sourcefile: 'node_modules/@mnaoumov/typescript-lib/src/debug.ts'
      }
    });
    expect(content).toContain('sourceMappingURL=data:application/json;base64,');
    expect(content.endsWith('\n/* nosourcemap */')).toBe(true);
    expect(await readdir(folder)).toEqual(['main.js']);
  });

  it.each([false, true])('should respect upstream ignore lists with inline maps %s', async (inline) => {
    let preparedContent = '';
    const upstreamIgnore: Plugin = {
      name: 'upstream-ignore',
      setup(builder): void {
        builder.onEnd(async () => {
          if (inline) {
            const content = await readFile(outfile, 'utf-8');
            const map = { ...readInlineMap(content), ignoreList: [0] };
            preparedContent = `${content.replace(/base64,[^\n]+/, () => `base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`).trimEnd()}\n/* nosourcemap */`;
            await writeFile(outfile, preparedContent);
          } else {
            const map = JSON.parse(await readFile(`${outfile}.map`, 'utf-8')) as SourceMap;
            await writeFile(`${outfile}.map`, JSON.stringify({ ...map, ignoreList: [0] }));
          }
        });
      }
    };
    const content = await bundle({ plugins: [upstreamIgnore, ignoreListSourceMapPlugin()], sourcemap: inline && 'inline' });
    expect(readInlineMap(content).ignoreList).toEqual([0]);
    if (inline) {
      expect(content).toBe(preparedContent);
    } else {
      expect(readInlineMap(content).sources).toEqual(['obsidian-dev-toolkit:ignored']);
    }
  });

  it.each([
    'node_modules/@mnaoumov/typescript-lib/src/debug.ts',
    '../../node_modules/@mnaoumov/typescript-lib/dist/lib/cjs/debug.cjs',
    '../../node_modules/monkey-around/dist/index.mjs',
    '../../node_modules/@mnaoumov/obsidian-lib/src/components/monkey-around-component.ts',
    String.raw`..\..\node_modules\@mnaoumov\obsidian-lib\dist\lib\esm\components\monkey-around-component.mjs`
  ])('should ignore shared wrapper %s without configuration', async (sourcefile) => {
    const content = await bundle({ sourcemap: 'inline', stdin: { contents: 'console.log("wrapper")', sourcefile } });
    expect(readInlineMap(content).ignoreList).toEqual([0]);
    expect(readInlineMap(content).sourcesContent).toEqual(['console.log("wrapper")']);
    expect(content.endsWith('\n/* nosourcemap */')).toBe(true);
  });

  it('should keep a production bundle free of maps when it has no ignored frames', async () => {
    await writeFile(join(folder, 'unrelated.map'), 'owned elsewhere');
    const content = await bundle();
    expect(content).not.toContain('sourceMappingURL');
    expect(await readdir(folder)).toEqual(['main.js', 'unrelated.map']);
  });

  it('should retain development mappings for ordinary plugin sources', async () => {
    const content = await bundle({ sourcemap: 'inline' });
    expect(readInlineMap(content).ignoreList).toEqual([]);
    expect(readInlineMap(content).sources[0]).toContain('src/plugin.ts');
    expect(readInlineMap(content).mappings).not.toBe('');
  });

  it.each(['external', 'linked', 'both'] as const)('should preserve explicitly requested %s maps', async (sourcemap) => {
    const content = await bundle({ plugins: [ignoreListSourceMapPlugin([/src\/plugin\.ts$/g])], sourcemap });
    const map = JSON.parse(await readFile(`${outfile}.map`, 'utf-8')) as SourceMap;
    expect(map.ignoreList).toEqual([0]);
    expect(map.sourcesContent).toHaveLength(1);
    expect(map.sources[0]).toContain('src/plugin.ts');
    if (sourcemap === 'both') {
      expect(readInlineMap(content).ignoreList).toEqual([0]);
    }
  });

  it('should match every use of a stateful consumer pattern on rebuilds', async () => {
    const pattern = /src\/plugin\.ts$/g;
    pattern.lastIndex = 10;
    const plugins = [ignoreListSourceMapPlugin([pattern])];
    expect(readInlineMap(await bundle({ plugins, sourcemap: 'inline' })).ignoreList).toEqual([0]);
    expect(readInlineMap(await bundle({ plugins, sourcemap: 'inline' })).ignoreList).toEqual([0]);
    expect(pattern.lastIndex).toBe(10);
  });

  it('should report a missing outfile rather than silently skipping ignore maps', async () => {
    await expect(build({ logLevel: 'silent', plugins: [ignoreListSourceMapPlugin()], stdin: { contents: '' } }))
      .rejects.toThrow('needs the esbuild outfile option');
  });

  it('should preserve the last successful bundle after a compilation error', async () => {
    await writeFile(outfile, 'previous build');
    await expect(build({
      logLevel: 'silent',
      outfile,
      plugins: [ignoreListSourceMapPlugin()],
      stdin: { contents: 'invalid syntax !' }
    })).rejects.toThrow();
    expect(await readFile(outfile, 'utf-8')).toBe('previous build');
  });

  it('should leave in-memory output alone because no disk bundle is deployed', async () => {
    const result = await build({ outfile, plugins: [ignoreListSourceMapPlugin()], stdin: { contents: 'console.log(1)' }, write: false });
    expect(result.outputFiles).toHaveLength(2);
    expect(await readdir(folder)).toEqual([]);
  });

  it('should tolerate a map removed by an earlier consumer plugin', async () => {
    const removeMap: Plugin = {
      name: 'remove-map',
      setup(builder): void {
        builder.onEnd(async () => {
          await rm(`${outfile}.map`);
        });
      }
    };
    expect(await bundle({ plugins: [removeMap, ignoreListSourceMapPlugin()] })).not.toContain('sourceMappingURL');
  });
});
