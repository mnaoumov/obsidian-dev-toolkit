/**
 * @file
 *
 * The plugin names the plugin-name lint rules look for, and the matcher they share.
 *
 * Whenever text mentions an Obsidian plugin by name, the name is marked as code: backticks in markdown and in code
 * comments, `appendCodeBlock()` in UI. The ESLint rules `plugin-name-as-code` / `plugin-name-as-code-in-ui` and the
 * markdownlint rule `plugin-name-as-code` all read the one list here, so a name added to it is checked everywhere at
 * once.
 *
 * The list is the display name (`manifest.json` `name`) of every `mnaoumov/obsidian-*` plugin, plus the third-party
 * plugins those repositories mention. A few third-party names (`Linter`, `Projects`, `Copilot`) are left out on
 * purpose: they are ordinary words, so matching them bare reports prose rather than plugin names. A project adds its
 * own `manifest.json` `name` automatically, can extend the list through each rule's `additionalPluginNames` option,
 * and can take a name out of it through `excludedPluginNames`: that is the escape for a plugin whose own name is an
 * ordinary word too, such as `Patterns`, which its own text uses as a noun and as a UI label far more often than as
 * the plugin's name. An exclusion wins over every source, the project's own name and `additionalPluginNames`
 * included.
 */

import {
  existsSync,
  readFileSync
} from 'node:fs';
import { join } from 'node:path';

/**
 * The display names of the `mnaoumov/obsidian-*` plugins.
 */
export const MNAOUMOV_PLUGIN_NAMES: readonly string[] = [
  'Advanced Debug Mode',
  'Advanced Exclude',
  'Advanced Markdown Export',
  'Advanced Metadata Cache',
  'Advanced Note Composer',
  'Advanced Rename and Delete Handler',
  'Alias Quick Switcher',
  'App Update Notifier',
  'Backlink Cache',
  'Backlink Full Path',
  'Better Markdown Links',
  'CodeScript Toolkit',
  'Consistent Attachments and Links',
  'Custom Attachment Location',
  'Edit Link Alias',
  'Email to Vault',
  'Embed HTML',
  'Explorer Multi-Select',
  'External Rename Handler',
  'File Bundles',
  'File Explorer Reload',
  'Fix Tab Size',
  'Frontmatter Markdown Links',
  'Insert Multiple Attachments',
  'Labelled Links',
  'Link Picker',
  'More Events',
  'Nested Properties',
  'New Note Fixer',
  'Preserve Frontmatter Formatting',
  'Refresh Any View',
  'Root Folder Context Menu',
  'Sample Plugin Extended',
  'Sibling Notes',
  'Smart Rename'
];

/**
 * The display names of the third-party plugins the `mnaoumov/obsidian-*` repositories mention.
 */
export const THIRD_PARTY_PLUGIN_NAMES: readonly string[] = [
  'Advanced Tables',
  'Advanced URI',
  'Dataview',
  'Excalidraw',
  'Folder Notes',
  'Hover Editor',
  'Kanban',
  'Make.md',
  'Natural Language Dates',
  'Obsidian Git',
  'Omnisearch',
  'Periodic Notes',
  'QuickAdd',
  'Smart Connections',
  'Style Settings',
  'Templater',
  'Text Generator'
];

/**
 * Params for {@link getPluginNames}.
 */
export interface GetPluginNamesParams {
  /**
   * Names to check on top of the shared list.
   */
  readonly additionalPluginNames?: readonly string[] | undefined;

  /**
   * The project root, whose `manifest.json` `name` is added to the list when it has one.
   */
  readonly cwd: string;

  /**
   * Names to leave out of the list, whichever source adds them.
   */
  readonly excludedPluginNames?: readonly string[] | undefined;
}

/**
 * A plugin name found in a text.
 */
export interface PluginNameMatch {
  /**
   * The offset of the name in the text.
   */
  readonly index: number;

  /**
   * The name found.
   */
  readonly name: string;
}

/**
 * Options of a rule that checks plugin names.
 */
export interface PluginNameRuleOptions {
  /**
   * Names to check on top of the shared list.
   */
  readonly additionalPluginNames?: readonly string[];

  /**
   * Names to leave out of the list, whichever source adds them: the shared list, the project's own `manifest.json`
   * `name` or `additionalPluginNames`.
   */
  readonly excludedPluginNames?: readonly string[];
}

/**
 * Characters that, right before a name, make it part of a longer token: a word, a code span, a kebab-case
 * identifier, a path or a member access.
 */
const LEADING_BOUNDARY = String.raw`(?<![\w\`./\\-])`;

/**
 * Characters that, right after a name, make it part of a longer token. A `.` or `/` is a boundary only when a word
 * follows it, so a name ending a sentence still matches.
 */
const TRAILING_BOUNDARY = String.raw`(?![\w\`-]|[./\\]\w)`;

/**
 * Finds every whole-word occurrence of a plugin name in a text, skipping those inside a range an excluded pattern
 * matches.
 *
 * Matching is case-sensitive, so the lowercase `dataview` of an identifier or a package name is not a plugin name. A
 * longer name wins over a shorter one it contains.
 *
 * @param text - The text to search.
 * @param pluginNames - The names to look for.
 * @param excludedPatterns - Global patterns whose matches hide the names inside them: a code span, a link, a URL.
 * @returns The names found, in text order.
 */
export function findPluginNameMatches(text: string, pluginNames: readonly string[], excludedPatterns: readonly RegExp[] = []): PluginNameMatch[] {
  if (pluginNames.length === 0) {
    return [];
  }

  const excludedRanges = excludedPatterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (match) => [match.index, match.index + match[0].length] as const));
  const alternatives = [...pluginNames].sort((a, b) => b.length - a.length).map((name) => escapeRegExp(name)).join('|');
  const nameRegExp = new RegExp(`${LEADING_BOUNDARY}(?:${alternatives})${TRAILING_BOUNDARY}`, 'g');

  return Array.from(text.matchAll(nameRegExp), (match) => ({ index: match.index, name: match[0] }))
    .filter((match) => excludedRanges.every(([start, end]) => match.index >= end || match.index + match.name.length <= start));
}

/**
 * Builds the list of plugin names a project checks: the shared list, the project's own `manifest.json` `name`, and
 * any names the project adds, less any names the project excludes.
 *
 * @param params - The {@link GetPluginNamesParams}.
 * @returns The names, without duplicates.
 */
export function getPluginNames(params: GetPluginNamesParams): string[] {
  const names = new Set([...MNAOUMOV_PLUGIN_NAMES, ...THIRD_PARTY_PLUGIN_NAMES, ...params.additionalPluginNames ?? []]);
  const ownName = readManifestName(params.cwd);
  if (ownName) {
    names.add(ownName);
  }
  for (const name of params.excludedPluginNames ?? []) {
    names.delete(name);
  }
  return [...names];
}

/**
 * Escapes a string for use as a literal inside a regular expression.
 *
 * @param text - The text to escape.
 * @returns The escaped text.
 */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/**
 * Reads the `name` of the project's `manifest.json`.
 *
 * @param cwd - The project root.
 * @returns The name, or `null` when there is no manifest, it does not parse, or its `name` is not a non-empty string.
 */
function readManifestName(cwd: string): null | string {
  const manifestPath = join(cwd, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const name = (manifest as null | Partial<Record<string, unknown>>)?.['name'];
    return typeof name === 'string' && name !== '' ? name : null;
  } catch {
    return null;
  }
}
