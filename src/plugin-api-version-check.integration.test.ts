import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  it
} from 'vitest';

import { analyzePluginApiVersion } from './plugin-api-version-check.ts';

// A real typed project proves that the upstream rule runs and retains its guard semantics.
it('should derive the floor across source files and ignore guarded APIs, tests and declarations', async () => {
  const rootFolder = await mkdtemp(join(tmpdir(), 'obsidian-api-version-'));
  try {
    await mkdir(join(rootFolder, 'src'));
    await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(rootFolder, 'node_modules'), 'junction');
    await writeFile(join(rootFolder, 'manifest.json'), '{"minAppVersion":"1.0.0"}');
    await writeFile(join(rootFolder, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"module":"NodeNext","target":"ES2022"},"include":["src"]}');
    await writeFile(
      join(rootFolder, 'eslint.config.mjs'),
      `
      import parser from '@typescript-eslint/parser';
      import obsidianmd from 'eslint-plugin-obsidianmd';
      export default [{ files: ['**/*.ts'], languageOptions: { parser, parserOptions: { projectService: true, tsconfigRootDir: ${JSON.stringify(rootFolder)} } }, plugins: { obsidianmd } }];
    `
    );
    await writeFile(
      join(rootFolder, 'src/main.ts'),
      `
      import { App, requireApiVersion } from 'obsidian';
      declare const app: App;
      if (requireApiVersion('1.10.0')) { app.renderContext; }
      app.vault;
    `
    );
    await writeFile(
      join(rootFolder, 'src/other.ts'),
      `
      import { setTooltip } from 'obsidian';
      // eslint-disable-next-line obsidianmd/no-unsupported-api
      setTooltip(document.body, 'tip');
    `
    );
    await writeFile(join(rootFolder, 'src/ignored.test.ts'), 'import { App } from \'obsidian\'; declare const app: App; app.renderContext;');
    await writeFile(join(rootFolder, 'src/ignored.d.ts'), 'this is not valid TypeScript');
    const report = await analyzePluginApiVersion({ rootFolder });
    expect(report).toMatchObject({ hasErrors: true, requiredMinAppVersion: '1.4.4' });
    expect(report.apiUsages.join('\n')).not.toContain('renderContext');
    expect(report.apiUsages.join('\n')).toContain('setTooltip');
    await writeFile(join(rootFolder, 'manifest.json'), '{"minAppVersion":"1.4.4"}');
    const passingReport = await analyzePluginApiVersion({ rootFolder });
    expect(passingReport.hasErrors).toBe(false);
  } finally {
    await rm(rootFolder, { force: true, recursive: true });
  }
}, 120_000);
