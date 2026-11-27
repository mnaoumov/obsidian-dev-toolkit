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
  findAgentSkillProblems,
  SKILLS_PLUGIN_FOLDER,
  slugifyHeading,
  updateSkillsPluginVersion
} from './agent-skills.ts';

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));

const temporaryFolders: string[] = [];

afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { force: true, recursive: true });
  }
});

function makeManifestRoot(manifestText: string): string {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'agent-skills-'));
  temporaryFolders.push(rootDirectory);
  mkdirSync(join(rootDirectory, SKILLS_PLUGIN_FOLDER, '.claude-plugin'), { recursive: true });
  writeFileSync(join(rootDirectory, SKILLS_PLUGIN_FOLDER, '.claude-plugin/plugin.json'), manifestText);
  return rootDirectory;
}

describe('findAgentSkillProblems', () => {
  it('should find no problem in the shipped plugin', () => {
    expect(findAgentSkillProblems(ROOT_DIR)).toEqual([]);
  });

  it('should not read the claude plugin eval results folder as an eval case', () => {
    const rootDirectory = makeManifestRoot('{ "name": "x", "version": "1.0.0" }\n');
    const pluginFolder = join(rootDirectory, SKILLS_PLUGIN_FOLDER);
    writeFileSync(join(rootDirectory, 'package.json'), '{ "bin": {}, "version": "1.0.0" }\n');
    mkdirSync(join(rootDirectory, '.claude-plugin'));
    writeFileSync(
      join(rootDirectory, '.claude-plugin/marketplace.json'),
      `{ "name": "m", "plugins": [{ "name": "x", "source": "./${SKILLS_PLUGIN_FOLDER}" }] }\n`
    );
    mkdirSync(join(pluginFolder, 'skills/build'), { recursive: true });
    writeFileSync(join(pluginFolder, 'skills/build/SKILL.md'), '---\nname: build\ndescription: Build.\n---\n');
    mkdirSync(join(pluginFolder, 'evals/select-build/graders'), { recursive: true });
    writeFileSync(join(pluginFolder, 'evals/select-build/prompt.md'), 'Build it.\n');
    writeFileSync(join(pluginFolder, 'evals/select-build/graders/skill-fired.md'), '"(?:obsidian-dev-toolkit:)?build"\n');
    writeFileSync(join(pluginFolder, 'evals/select-build/graders/no-other-skill.md'), '"(?:obsidian-dev-toolkit:)?(?:)"\n');
    mkdirSync(join(pluginFolder, 'evals/results/2026-11-24'), { recursive: true });

    expect(findAgentSkillProblems(rootDirectory)).toEqual([]);
  });

  it('should report a skill that names one agent outside an agent-specific section', () => {
    const rootDirectory = makeSkillRoot([
      '---',
      'name: build',
      'description: Build.',
      '---',
      '',
      'Add it to CLAUDE.md.',
      '',
      '## Codex',
      '',
      '<!-- agent-specific: Codex -->',
      '### In Codex',
      '',
      'Run /skills in Codex.',
      '',
      '### Back to every agent',
      '',
      'Use the AskUserQuestion tool.',
      ''
    ]);

    expect(findAgentSkillProblems(rootDirectory)).toEqual([
      `${SKILLS_PLUGIN_FOLDER}/skills/build/SKILL.md:6: "CLAUDE.md" is specific to one agent; reword it, or put it in a section opened by <!-- agent-specific: <agent> -->.`,
      `${SKILLS_PLUGIN_FOLDER}/skills/build/SKILL.md:8: "Codex" is specific to one agent; reword it, or put it in a section opened by <!-- agent-specific: <agent> -->.`,
      `${SKILLS_PLUGIN_FOLDER}/skills/build/SKILL.md:17: "AskUserQuestion" is specific to one agent; reword it, or put it in a section opened by <!-- agent-specific: <agent> -->.`
    ]);
  });

  it('should report a frontmatter field not every agent reads', () => {
    const rootDirectory = makeSkillRoot(['---', 'name: build', 'description: Build.', 'allowed-tools: Read', '---', '']);

    expect(findAgentSkillProblems(rootDirectory)).toEqual([
      `${SKILLS_PLUGIN_FOLDER}/skills/build/SKILL.md: the frontmatter field allowed-tools is not one every agent reads; keep only description and name.`
    ]);
  });
});

function makeSkillRoot(skillLines: readonly string[]): string {
  const rootDirectory = makeManifestRoot('{ "name": "x", "version": "1.0.0" }\n');
  const pluginFolder = join(rootDirectory, SKILLS_PLUGIN_FOLDER);
  writeFileSync(join(rootDirectory, 'package.json'), '{ "bin": {}, "version": "1.0.0" }\n');
  mkdirSync(join(rootDirectory, '.claude-plugin'));
  writeFileSync(
    join(rootDirectory, '.claude-plugin/marketplace.json'),
    `{ "name": "m", "plugins": [{ "name": "x", "source": "./${SKILLS_PLUGIN_FOLDER}" }] }\n`
  );
  mkdirSync(join(pluginFolder, 'skills/build'), { recursive: true });
  writeFileSync(join(pluginFolder, 'skills/build/SKILL.md'), skillLines.join('\n'));
  mkdirSync(join(pluginFolder, 'evals/select-build/graders'), { recursive: true });
  writeFileSync(join(pluginFolder, 'evals/select-build/prompt.md'), 'Build it.\n');
  writeFileSync(join(pluginFolder, 'evals/select-build/graders/skill-fired.md'), '"(?:obsidian-dev-toolkit:)?build"\n');
  writeFileSync(join(pluginFolder, 'evals/select-build/graders/no-other-skill.md'), '"(?:obsidian-dev-toolkit:)?(?:)"\n');
  return rootDirectory;
}

describe('slugifyHeading', () => {
  it('should match the documentation site anchors', () => {
    expect(slugifyHeading('Check Against the Community Directory')).toBe('check-against-the-community-directory');
    expect(slugifyHeading('The `demo-vault-helper` bootstrap plugin')).toBe('the-demo-vault-helper-bootstrap-plugin');
  });
});

describe('updateSkillsPluginVersion', () => {
  it('should replace only the version and keep the formatting', () => {
    const rootDirectory = makeManifestRoot('{\n  "name": "x",\n  "version": "1.0.0",\n  "keywords": ["a", "b"]\n}\n');
    updateSkillsPluginVersion(rootDirectory, '2.3.4');
    expect(readFileSync(join(rootDirectory, SKILLS_PLUGIN_FOLDER, '.claude-plugin/plugin.json'), 'utf-8'))
      .toBe('{\n  "name": "x",\n  "version": "2.3.4",\n  "keywords": ["a", "b"]\n}\n');
  });

  it('should throw when the manifest has no version', () => {
    const rootDirectory = makeManifestRoot('{ "name": "x" }\n');
    expect(() => {
      updateSkillsPluginVersion(rootDirectory, '2.3.4');
    }).toThrow('has no "version"');
  });
});
