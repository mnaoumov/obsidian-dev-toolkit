/**
 * @file
 *
 * The agent skills this repository ships for plugin authors: one skill per area (build, test, release, demo vault) in
 * the open Agent Skills format, under `plugins/obsidian-dev-toolkit/skills/`, the only copy. The same folder is the
 * plugin that `.claude-plugin/marketplace.json` at the root lists, which both Claude Code and Codex install, and it
 * holds one skill-selection eval per skill. The skill set and the eval format are re-implemented after
 * `obsidian-plugin-dev-kit`'s `plugins/opdk/` (v0.4.0, MIT).
 *
 * The skills are hand-written from the guides, so this module holds what keeps them honest instead: the release
 * writes the package version into `plugin.json` (an agent updates an installed plugin only when that string changes),
 * and {@link findAgentSkillProblems} reports every skill, link, command and import that no longer matches the package,
 * and every skill that stops being agent-neutral.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

/**
 * The skills plugin's folder, relative to the repository root.
 */
export const SKILLS_PLUGIN_FOLDER = 'plugins/obsidian-dev-toolkit';

/**
 * The comment that opens a section of a skill written for one agent only. The section runs to the next heading of the
 * same or a higher level, and the agent-neutral check skips it.
 */
const AGENT_SPECIFIC_MARKER_REGEXP = /^<!-- agent-specific: \S[^>]*-->$/u;

/**
 * What only one agent has: agent names, their own memory files and folders, their slash commands and argument
 * placeholders, and tool names that exist in one agent only. A skill names none of them outside an agent-specific
 * section, so it reads the same in every agent.
 */
const AGENT_SPECIFIC_TERM_REGEXP = /\b(?:Claude|Codex|Cursor|Gemini|Copilot|Windsurf|AskUserQuestion|TodoWrite|WebFetch|apply_patch)\b|CLAUDE\.md|GEMINI\.md|\.claude\/|\.codex\/|\.cursor\/|\$ARGUMENTS|(?:^|\s)\/(?:plugin|skills?|mcp|clear|compact|init)\b/u;

/**
 * The frontmatter fields every agent reads. Others, such as a tool allow-list, are honored by some agents only.
 */
const NEUTRAL_FRONTMATTER_FIELDS = ['description', 'name'];

const PACKAGE_NAME = '@mnaoumov/obsidian-dev-toolkit';
/**
 * The folder `claude plugin eval` writes its local reports into, beside the cases. It is gitignored and holds no case.
 */
const EVAL_RESULTS_FOLDER = 'results';
const DOCS_SITE_GUIDES_URL = 'https://mnaoumov.dev/obsidian-dev-toolkit/guides/';
const GUIDES_FOLDER = 'docs/src/content/docs/guides';
const PLUGIN_MANIFEST_PATH = `${SKILLS_PLUGIN_FOLDER}/.claude-plugin/plugin.json`;
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
 * Lists every problem that makes the agent skills disagree with the package they describe, or stop being agent-neutral.
 *
 * @param rootDirectory - The repository root.
 * @returns The problems, one line each; empty when the plugin is consistent.
 */
export function findAgentSkillProblems(rootDirectory: string): string[] {
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
  } else if (join(rootDirectory, listed.source) !== join(rootDirectory, SKILLS_PLUGIN_FOLDER)) {
    problems.push(`.claude-plugin/marketplace.json: ${pluginJson.name} has source ${listed.source}, not ./${SKILLS_PLUGIN_FOLDER}.`);
  }

  const skillNames = listFolders(join(rootDirectory, SKILLS_PLUGIN_FOLDER, 'skills'));
  if (skillNames.length === 0) {
    problems.push(`${SKILLS_PLUGIN_FOLDER}/skills has no skill.`);
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
export function updateSkillsPluginVersion(rootDirectory: string, newVersion: string): void {
  const manifestPath = join(rootDirectory, PLUGIN_MANIFEST_PATH);
  const text = readFileSync(manifestPath, 'utf-8');
  if (!VERSION_PROPERTY_REGEXP.test(text)) {
    throw new Error(`${PLUGIN_MANIFEST_PATH} has no "version" to update.`);
  }

  writeFileSync(manifestPath, text.replace(VERSION_PROPERTY_REGEXP, () => `"version": "${newVersion}"`));
}

function findAgentSpecificProblems(skillPath: string, text: string): string[] {
  const problems: string[] = [];
  const body = text.replace(/^---\n[\s\S]*?\n---\n/u, (frontmatter) => '\n'.repeat(frontmatter.split('\n').length - 1));
  let agentSpecificLevel: null | number = null;
  let isPendingMarker = false;
  let isInFence = false;
  for (const [index, line] of body.split('\n').entries()) {
    if (/^(?:```|~~~)/u.test(line)) {
      isInFence = !isInFence;
    }

    const headingLevel = isInFence ? undefined : /^(?<marks>#{1,6}) /u.exec(line)?.groups?.['marks']?.length;
    if (headingLevel !== undefined) {
      if (isPendingMarker) {
        agentSpecificLevel = headingLevel;
        isPendingMarker = false;
        continue;
      }

      if (agentSpecificLevel !== null && headingLevel <= agentSpecificLevel) {
        agentSpecificLevel = null;
      }
    }

    if (!isInFence && AGENT_SPECIFIC_MARKER_REGEXP.test(line)) {
      isPendingMarker = true;
      continue;
    }

    if (agentSpecificLevel !== null) {
      continue;
    }

    const match = AGENT_SPECIFIC_TERM_REGEXP.exec(line);
    if (match !== null) {
      problems.push(
        `${skillPath}:${String(index + 1)}: "${match[0].trim()}" is specific to one agent; reword it, or put it in a section opened by <!-- agent-specific: <agent> -->.`
      );
    }
  }

  return problems;
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
  const evalsFolder = join(rootDirectory, SKILLS_PLUGIN_FOLDER, 'evals');
  const evalNames = listFolders(evalsFolder).filter((name) => name !== EVAL_RESULTS_FOLDER);

  for (const skillName of skillNames) {
    if (!evalNames.includes(`select-${skillName}`)) {
      problems.push(`${SKILLS_PLUGIN_FOLDER}/evals has no select-${skillName} case for the ${skillName} skill.`);
    }
  }

  for (const evalName of evalNames) {
    const skillName = evalName.replace(/^select-/u, '');
    const evalPath = `${SKILLS_PLUGIN_FOLDER}/evals/${evalName}`;
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
  const skillPath = `${SKILLS_PLUGIN_FOLDER}/skills/${skillName}/SKILL.md`;
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

  for (const line of frontmatter.split('\n')) {
    const field = /^(?<field>[\w-]+):/u.exec(line)?.groups?.['field'];
    if (field !== undefined && !NEUTRAL_FRONTMATTER_FIELDS.includes(field)) {
      problems.push(`${skillPath}: the frontmatter field ${field} is not one every agent reads; keep only ${NEUTRAL_FRONTMATTER_FIELDS.join(' and ')}.`);
    }
  }

  problems.push(
    ...findAgentSpecificProblems(skillPath, text),
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
