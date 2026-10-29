import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/auto';
import dedent from 'dedent';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  join
} from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { defineObsidianPluginJestConfig } from './jest-config.ts';

// Real jest, run through the auto runner on a throwaway ESM plugin. What a mock cannot show is whether the whole chain
// holds together: jest-environment-jsdom loads, `obsidian` resolves onto the mocks, the mocks' setup installs
// Obsidian's DOM helpers, and this package's setup registers its hooks after the framework is installed.
const REPOSITORY_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JEST_RUN_TIMEOUT_IN_MILLISECONDS = 120_000;
const OWN_JEST_SETUP_SPECIFIER = '@mnaoumov/obsidian-dev-toolkit/jest-setup';

let fixtureFolder = '';
let originalCwd = '';

function writeFixtureFile(relativePath: string, content: string): void {
  const path = join(fixtureFolder, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeAll(() => {
  originalCwd = process.cwd();
  fixtureFolder = mkdtempSync(join(tmpdir(), 'obsidian-jest-'));
  // A junction, so jest, ts-jest and the mocks resolve from the fixture without an install; Windows needs no privilege for one.
  symlinkSync(join(REPOSITORY_FOLDER, 'node_modules'), join(fixtureFolder, 'node_modules'), 'junction');
  writeFixtureFile('package.json', JSON.stringify({ name: 'obsidian-jest-fixture', type: 'module' }));
  writeFixtureFile(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        allowImportingTsExtensions: true,
        lib: ['dom', 'es2022'],
        module: 'nodenext',
        noEmit: true,
        rewriteRelativeImportExtensions: true,
        strict: true,
        target: 'es2022',
        types: []
      },
      include: ['src']
    })
  );
  writeFixtureFile(
    'src/heading.ts',
    'import { Notice } from \'obsidian\';\n\nexport function renderHeading(parent: HTMLElement, text: string): HTMLElement {\n  new Notice(text);\n  return parent.createEl(\'h1\', { text });\n}\n'
  );
  writeFixtureFile(
    'src/heading.test.ts',
    dedent`
      import { expect, it } from '@jest/globals';

      import { renderHeading } from './heading.ts';

      it('renders through the mocks', () => {
        const heading = renderHeading(document.body, 'Hello');
        expect(heading.tagName).toBe('H1');
        expect(document.body.textContent).toContain('Hello');
        expect(app).toBeDefined();
      });\n
    `
  );
  // Must never run: integration tests belong to obsidian-integration-testing.
  writeFixtureFile('src/vault.integration.test.ts', 'throw new Error(\'jest ran an integration test\');\n');
  process.chdir(fixtureFolder);
  const config = defineObsidianPluginJestConfig();
  // The package cannot install itself into the fixture, so its setup file is taken from the source. Jest checks that
  // every setup file resolves before it reads `moduleNameMapper`, so the entry itself is swapped.
  const setupFilesAfterEnv = (config.setupFilesAfterEnv ?? []).map((setupFile) => setupFile === OWN_JEST_SETUP_SPECIFIER ? join(REPOSITORY_FOLDER, 'src', 'jest-setup.ts') : setupFile);
  writeFixtureFile('jest.config.json', JSON.stringify({ ...config, setupFilesAfterEnv }));
});

afterAll(() => {
  process.chdir(originalCwd);
  // The link alone, before the folder: the repository's own `node_modules` is on the other side of it.
  unlinkSync(join(fixtureFolder, 'node_modules'));
  rmSync(fixtureFolder, { force: true, recursive: true });
});

describe('defineObsidianPluginJestConfig', () => {
  it('should run a plugin suite against the mocks', async () => {
    await expect(test()).resolves.toBeUndefined();
  }, JEST_RUN_TIMEOUT_IN_MILLISECONDS);
});
