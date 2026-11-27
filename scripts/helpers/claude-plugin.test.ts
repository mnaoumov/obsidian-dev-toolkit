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

  it('should not read the claude plugin eval results folder as an eval case', () => {
    const rootDirectory = makeManifestRoot('{ "name": "x", "version": "1.0.0" }\n');
    const pluginFolder = join(rootDirectory, CLAUDE_PLUGIN_FOLDER);
    writeFileSync(join(rootDirectory, 'package.json'), '{ "bin": {}, "version": "1.0.0" }\n');
    mkdirSync(join(rootDirectory, '.claude-plugin'));
    writeFileSync(
      join(rootDirectory, '.claude-plugin/marketplace.json'),
      `{ "name": "m", "plugins": [{ "name": "x", "source": "./${CLAUDE_PLUGIN_FOLDER}" }] }\n`
    );
    mkdirSync(join(pluginFolder, 'skills/build'), { recursive: true });
    writeFileSync(join(pluginFolder, 'skills/build/SKILL.md'), '---\nname: build\ndescription: Build.\n---\n');
    mkdirSync(join(pluginFolder, 'evals/select-build/graders'), { recursive: true });
    writeFileSync(join(pluginFolder, 'evals/select-build/prompt.md'), 'Build it.\n');
    writeFileSync(join(pluginFolder, 'evals/select-build/graders/skill-fired.md'), '"(?:obsidian-dev-toolkit:)?build"\n');
    writeFileSync(join(pluginFolder, 'evals/select-build/graders/no-other-skill.md'), '"(?:obsidian-dev-toolkit:)?(?:)"\n');
    mkdirSync(join(pluginFolder, 'evals/results/2026-11-24'), { recursive: true });

    expect(findClaudePluginProblems(rootDirectory)).toEqual([]);
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
