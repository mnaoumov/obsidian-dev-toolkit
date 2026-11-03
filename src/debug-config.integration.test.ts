/**
 * @file
 *
 * Verifies the Obsidian debugger configuration workflow.
 */

import { build } from 'esbuild';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expect,
  it
} from 'vitest';

import { fixSourceMapsPlugin } from './bundlers/esbuild-impl/fix-source-maps-plugin.ts';
import { createObsidianDebugConfig } from './debug-config.ts';

interface DevelopmentSourceMap {
  readonly sources: string[];
  readonly sourcesContent: string[];
}

it('should map a real development bundle source back to the original TypeScript', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'obsidian-debug-'));
  try {
    await mkdir(join(folder, 'src'));
    await mkdir(join(folder, 'dist/dev'), { recursive: true });
    const source = 'export function answer(): number { return 42; }';
    await writeFile(join(folder, 'src/main.ts'), source);
    const outfile = join(folder, 'dist/dev/main.js');
    const pluginName = '@example/different-from-manifest-id';
    await build({
      // eslint-disable-next-line unicorn/name-replacements -- esbuild's API names this property `absWorkingDir`.
      absWorkingDir: folder,
      bundle: true,
      entryPoints: ['src/main.ts'],
      format: 'cjs',
      outfile,
      plugins: [fixSourceMapsPlugin({ distPaths: [outfile], isProductionBuild: false, pluginName })],
      sourcemap: 'inline'
    });
    const bundle = await readFile(outfile, 'utf-8');
    const encoded = bundle.split('sourceMappingURL=data:application/json;base64,', 2)[1]?.split('\n', 1)[0] ?? '';
    const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8')) as DevelopmentSourceMap;
    expect(map.sourcesContent).toContain(source);
    expect(bundle).toContain('/* nosourcemap */');
    const config = createObsidianDebugConfig({ pluginName });
    const overrides = config.configurations[0]?.sourceMapPathOverrides ?? {};
    const prefix = `app://obsidian.md/plugin:${pluginName}/`;
    // eslint-disable-next-line no-template-curly-in-string -- This is a literal VS Code substitution variable.
    expect(overrides[`${prefix}*`]).toBe('${workspaceFolder}/*');
    expect(map.sources).toContain(`${prefix}src/main.ts`);
    expect(map.sources.map((path) => path.replace(prefix, () => `${folder}/`))).toContain(`${folder}/src/main.ts`);
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
});
