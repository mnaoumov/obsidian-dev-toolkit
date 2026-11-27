/**
 * @file
 *
 * The Claude Code plugin this repository ships for plugin authors: `.claude-plugin/marketplace.json` at the root and
 * the plugin in `plugins/obsidian-dev-toolkit/`, with one skill per area (build, test, release, demo vault) and one
 * skill-selection eval per skill. The skill set and the eval format are re-implemented after
 * `obsidian-plugin-dev-kit`'s `plugins/opdk/` (v0.4.0, MIT).
 *
 * The skills are hand-written from the guides, so this module holds what keeps them honest instead: the release
 * writes the package version into `plugin.json` (Claude Code updates an installed plugin only when that string
 * changes), and {@link findClaudePluginProblems} reports every skill, link, command and import that no longer matches
 * the package.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

/**
 * The plugin's folder, relative to the repository root.
 */
export const CLAUDE_PLUGIN_FOLDER = 'plugins/obsidian-dev-toolkit';

const PACKAGE_NAME = '@mnaoumov/obsidian-dev-toolkit';
/**
 * The folder `claude plugin eval` writes its local reports into, beside the cases. It is gitignored and holds no case.
 */
const EVAL_RESULTS_FOLDER = 'results';
const DOCS_SITE_GUIDES_URL = 'https://mnaoumov.dev/obsidian-dev-toolkit/guides/';
const GUIDES_FOLDER = 'docs/src/content/docs/guides';
const PLUGIN_MANIFEST_PATH = `${CLAUDE_PLUGIN_FOLDER}/.claude-plugin/plugin.json`;
const VERSION_PROPERTY_REGEXP = /"version":\s*"[^"]*"/u;

interface MarketplaceJson {
  readonly name: string;
  readonly plugins: readonly MarketplacePlugin[];
}

interface MarketplacePlugin {
  readonly name: string;
  readonly source: string;
}

interface PackageJson {
  readonly bin: Readonly<Record<string, string>>;
  readonly version: string;
}

interface PluginJson {
  readonly name: string;
  readonly version?: string;
}

/**
 * Lists every problem that makes the Claude Code plugin disagree with the package it describes.
 *
 * @param rootDirectory - The repository root.
 * @returns The problems, one line each; empty when the plugin is consistent.
 */
export function findClaudePluginProblems(rootDirectory: string): string[] {
  const problems: string[] = [];
  const packageJson = readJson(join(rootDirectory, 'package.json')) as PackageJson;
  const pluginJson = readJson(join(rootDirectory, PLUGIN_MANIFEST_PATH)) as PluginJson;
  const marketplaceJson = readJson(join(rootDirectory, '.claude-plugin/marketplace.json')) as MarketplaceJson;

  if (pluginJson.version !== packageJson.version) {
    problems.push(`${PLUGIN_MANIFEST_PATH}: version ${String(pluginJson.version)} differs from package.json ${packageJson.version}.`);
  }

  const listed = marketplaceJson.plugins.find((plugin) => plugin.name === pluginJson.name);
  if (listed === undefined) {
    problems.push(`.claude-plugin/marketplace.json does not list the plugin ${pluginJson.name}.`);
  } else if (join(rootDirectory, listed.source) !== join(rootDirectory, CLAUDE_PLUGIN_FOLDER)) {
    problems.push(`.claude-plugin/marketplace.json: ${pluginJson.name} has source ${listed.source}, not ./${CLAUDE_PLUGIN_FOLDER}.`);
  }

  const skillNames = listFolders(join(rootDirectory, CLAUDE_PLUGIN_FOLDER, 'skills'));
  if (skillNames.length === 0) {
    problems.push(`${CLAUDE_PLUGIN_FOLDER}/skills has no skill.`);
  }

  for (const skillName of skillNames) {
    problems.push(...findSkillProblems(rootDirectory, skillName, packageJson));
  }

  problems.push(...findEvalProblems(rootDirectory, skillNames));
  return problems;
}

/**
 * Turns a heading into the anchor the documentation site gives it.
 *
 * @param heading - The heading text, without its `#` marks.
 * @returns The anchor, without the `#`.
 */
export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replaceAll(/[`*_]/gu, '')
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replaceAll(/\s/gu, '-');
}

/**
 * Writes a release's version into the plugin manifest, keeping the file's formatting. The release calls it through
 * `updateVersionInExtraFiles`, so the version lands in the release commit.
 *
 * @param rootDirectory - The repository root.
 * @param newVersion - The version being released.
 */
export function updateClaudePluginVersion(rootDirectory: string, newVersion: string): void {
  const manifestPath = join(rootDirectory, PLUGIN_MANIFEST_PATH);
  const text = readFileSync(manifestPath, 'utf-8');
  if (!VERSION_PROPERTY_REGEXP.test(text)) {
    throw new Error(`${PLUGIN_MANIFEST_PATH} has no "version" to update.`);
  }

  writeFileSync(manifestPath, text.replace(VERSION_PROPERTY_REGEXP, () => `"version": "${newVersion}"`));
}

function findCommandProblems(skillPath: string, text: string, packageJson: PackageJson): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(/npx (?<bin>[a-z][a-z-]+)/gu)) {
    const bin = match.groups?.['bin'] ?? '';
    if (bin !== 'vitest' && packageJson.bin[bin] === undefined) {
      problems.push(`${skillPath}: npx ${bin} is not a command of this package.`);
    }
  }

  return problems;
}

function findEvalProblems(rootDirectory: string, skillNames: readonly string[]): string[] {
  const problems: string[] = [];
  const evalsFolder = join(rootDirectory, CLAUDE_PLUGIN_FOLDER, 'evals');
  const evalNames = listFolders(evalsFolder).filter((name) => name !== EVAL_RESULTS_FOLDER);

  for (const skillName of skillNames) {
    if (!evalNames.includes(`select-${skillName}`)) {
      problems.push(`${CLAUDE_PLUGIN_FOLDER}/evals has no select-${skillName} case for the ${skillName} skill.`);
    }
  }

  for (const evalName of evalNames) {
    const skillName = evalName.replace(/^select-/u, '');
    const evalPath = `${CLAUDE_PLUGIN_FOLDER}/evals/${evalName}`;
    if (!skillNames.includes(skillName)) {
      problems.push(`${evalPath} selects ${skillName}, which is not a skill.`);
      continue;
    }

    if (!existsSync(join(evalsFolder, evalName, 'prompt.md'))) {
      problems.push(`${evalPath} has no prompt.md.`);
    }

    const firedPath = join(evalsFolder, evalName, 'graders/skill-fired.md');
    if (!existsSync(firedPath) || !readFileSync(firedPath, 'utf-8').includes(`(?:obsidian-dev-toolkit:)?${skillName}"`)) {
      problems.push(`${evalPath}/graders/skill-fired.md does not check that the ${skillName} skill fired.`);
    }

    const otherPath = join(evalsFolder, evalName, 'graders/no-other-skill.md');
    const otherText = existsSync(otherPath) ? readFileSync(otherPath, 'utf-8') : '';
    const expectedOthers = skillNames.filter((name) => name !== skillName).join('|');
    const namedOthers = /\(\?:obsidian-dev-toolkit:\)\?\(\?:(?<names>[^)]*)\)/u.exec(otherText)?.groups?.['names'] ?? '';
    if (namedOthers.split('|').sort().join('|') !== expectedOthers) {
      problems.push(`${evalPath}/graders/no-other-skill.md does not name exactly the other skills, ${expectedOthers}.`);
    }
  }

  return problems;
}

function findGuideLinkProblems(rootDirectory: string, skillPath: string, text: string): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(/https:\/\/mnaoumov\.dev\/obsidian-dev-toolkit\/guides\/(?<guide>[^/)#]+)\/(?:#(?<anchor>[^)\s]+))?/gu)) {
    const guide = match.groups?.['guide'] ?? '';
    const anchor = match.groups?.['anchor'];
    const guidePath = join(rootDirectory, GUIDES_FOLDER, `${guide}.md`);
    if (!existsSync(guidePath)) {
      problems.push(`${skillPath}: ${DOCS_SITE_GUIDES_URL}${guide}/ names no guide in ${GUIDES_FOLDER}.`);
      continue;
    }

    if (anchor === undefined) {
      continue;
    }

    const anchors = readFileSync(guidePath, 'utf-8')
      .split('\n')
      .map((line) => /^#{2,6} (?<heading>.+)$/u.exec(line)?.groups?.['heading'])
      .filter((heading) => heading !== undefined)
      .map((heading) => slugifyHeading(heading));
    if (!anchors.includes(anchor)) {
      problems.push(`${skillPath}: ${guide}/#${anchor} names no heading of that guide.`);
    }
  }

  return problems;
}

function findSkillProblems(rootDirectory: string, skillName: string, packageJson: PackageJson): string[] {
  const problems: string[] = [];
  const skillPath = `${CLAUDE_PLUGIN_FOLDER}/skills/${skillName}/SKILL.md`;
  const fullPath = join(rootDirectory, skillPath);
  if (!existsSync(fullPath)) {
    return [`${skillPath} is missing.`];
  }

  const text = readFileSync(fullPath, 'utf-8');
  const frontmatter = /^---\n(?<body>[\s\S]*?)\n---\n/u.exec(text)?.groups?.['body'] ?? '';
  if (!new RegExp(`^name: ${skillName}$`, 'mu').test(frontmatter)) {
    problems.push(`${skillPath}: the frontmatter name is not ${skillName}.`);
  }

  if (!/^description: \S/mu.test(frontmatter)) {
    problems.push(`${skillPath}: the frontmatter has no description.`);
  }

  problems.push(
    ...findGuideLinkProblems(rootDirectory, skillPath, text),
    ...findCommandProblems(skillPath, text, packageJson),
    ...findSubpathProblems(rootDirectory, skillPath, text)
  );
  return problems;
}

function findSubpathProblems(rootDirectory: string, skillPath: string, text: string): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(new RegExp(String.raw`${PACKAGE_NAME.replace('/', '\\/')}\/(?<subpath>[a-z][a-z0-9/-]*)`, 'gu'))) {
    const subpath = match.groups?.['subpath'] ?? '';
    // A path into the installed package's templates, which the build copies from `templates/` verbatim.
    if (subpath.startsWith('dist/templates/')) {
      if (!existsSync(join(rootDirectory, subpath.slice('dist/'.length)))) {
        problems.push(`${skillPath}: ${PACKAGE_NAME}/${subpath} is not a template of this package.`);
      }

      continue;
    }

    if (!existsSync(join(rootDirectory, 'src', `${subpath}.ts`))) {
      problems.push(`${skillPath}: ${PACKAGE_NAME}/${subpath} is not a module of this package.`);
    }
  }

  return problems;
}

function listFolders(folder: string): string[] {
  return existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}
