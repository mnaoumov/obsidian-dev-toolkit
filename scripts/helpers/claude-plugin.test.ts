import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  CLAUDE_PLUGIN_FOLDER,
  findClaudePluginProblems,
  slugifyHeading,
  updateClaudePluginVersion
} from './claude-plugin.ts';

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { force: true, recursive: true });
  }
});

function makeManifestRoot(manifestText: string): string {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'claude-plugin-'));
  temporaryFolders.push(rootDirectory);
  mkdirSync(join(rootDirectory, CLAUDE_PLUGIN_FOLDER, '.claude-plugin'), { recursive: true });
  writeFileSync(join(rootDirectory, CLAUDE_PLUGIN_FOLDER, '.claude-plugin/plugin.json'), manifestText);
  return rootDirectory;
}

describe('findClaudePluginProblems', () => {
  it('should find no problem in the shipped plugin', () => {
    expect(findClaudePluginProblems(ROOT_DIR)).toEqual([]);
  });
});

describe('slugifyHeading', () => {
  it('should match the documentation site anchors', () => {
    expect(slugifyHeading('Check Against the Community Directory')).toBe('check-against-the-community-directory');
    expect(slugifyHeading('The `demo-vault-helper` bootstrap plugin')).toBe('the-demo-vault-helper-bootstrap-plugin');
  });
});

describe('updateClaudePluginVersion', () => {
  it('should replace only the version and keep the formatting', () => {
    const rootDirectory = makeManifestRoot('{\n  "name": "x",\n  "version": "1.0.0",\n  "keywords": ["a", "b"]\n}\n');
    updateClaudePluginVersion(rootDirectory, '2.3.4');
    expect(readFileSync(join(rootDirectory, CLAUDE_PLUGIN_FOLDER, '.claude-plugin/plugin.json'), 'utf-8'))
      .toBe('{\n  "name": "x",\n  "version": "2.3.4",\n  "keywords": ["a", "b"]\n}\n');
  });

  it('should throw when the manifest has no version', () => {
    const rootDirectory = makeManifestRoot('{ "name": "x" }\n');
    expect(() => {
      updateClaudePluginVersion(rootDirectory, '2.3.4');
    }).toThrow('has no "version"');
  });
});
