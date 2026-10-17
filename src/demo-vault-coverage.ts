/**
 * @file
 *
 * Static coverage/freshness checks that keep a plugin's in-repo `demo-vault/` in sync with its public surface.
 *
 * A plugin can ship a curated demo vault at `demo-vault/` in its repo root. These helpers reflect the real
 * public API/config/docs straight from source and assert — WITHOUT launching Obsidian — that every feature is
 * demonstrated in the notes and that the notes reference no API member that no longer exists (rename drift).
 * The runtime behavior of the plugin is covered by its other integration tests, not by the demo vault; the
 * vault is a learning resource, and these checks only guard that it stays truthful.
 *
 * They also guard the vault's own `.obsidian/app.json`: the settings listed in
 * {@link DEMO_VAULT_APP_JSON_SETTINGS} belong to `obsidian-dev-utils`, which writes them into the archived
 * vault at release time, so a vault that commits any of them is keeping a second copy nothing reconciles.
 *
 * They also enforce the demo-vault AUTHORING convention — every note opens with an `# H1` and a plain
 * prose paragraph, every note is reachable from the start note, and no note uses a `[[wikilink]]` or a
 * `[Docs](…)` line. These checks are unconditional: the demo vault is the published documentation, read
 * in Obsidian AND on GitHub (where a wikilink does not render), so a note that breaks the convention is
 * broken for real readers. `authoring` only tunes them (which note is the start, which notes sit outside
 * the learning path); it cannot switch them off.
 *
 * Only `rootFolder` is required, so a plugin with no settings and no public API to reflect registers the
 * suite with that alone and still gets every authoring check — the checks have nothing to do with what the
 * plugin exposes. Each reflection spec (`configInterfaces`, `interfaces`, `nonTrivialGuard`) adds the checks
 * it describes when supplied. The vault is guarded against being empty either way: with no notes to read,
 * every authoring check would pass by having nothing to look at.
 *
 * The one exception is a note whose SUBJECT is the wikilink — an embed spelling the reader is being taught
 * to type, a frontmatter property value that exists to contrast with a Markdown link, a fixture that must
 * keep the wikilink a command is supposed to leave alone, a link the reader clicks while it still resolves
 * to nothing. Such a note says so itself, stating why, in one of two forms modelled on ESLint's.
 *
 * Per line or per region, written as an HTML comment so it is invisible in Obsidian AND on GitHub — the
 * spelling these vaults already use for `markdownlint-disable-next-line`:
 *
 * ```markdown
 * <!-- obsidian-dev-utils-disable-next-line demo-vault-validation/no-wikilinks -- Clicking a link to a note that does not exist yet IS the feature. -->
 * 2. Click this link: [[Projects/Fresh idea]].
 *
 * <!-- obsidian-dev-utils-disable demo-vault-validation/no-wikilinks -- The wikilink embed is the syntax this note teaches. -->
 * ![[basic.html|400]]
 * <!-- obsidian-dev-utils-enable demo-vault-validation/no-wikilinks -->
 * ```
 *
 * Per note, in the note's own frontmatter — the only form that can reach a wikilink INSIDE frontmatter,
 * where a comment cannot go:
 *
 * ```yaml
 * ---
 * obsidian-dev-utils:
 *   demo-vault-validation:
 *     allow-wikilinks: The `wikilink` property value is the contrast this note is built around.
 * ---
 * ```
 *
 * Either way the declaration travels with the note rather than sitting in a list somewhere else, it carries
 * its justification, and it exempts only the WIKILINK check — the H1, prose, reachability and `[Docs]`
 * checks still apply. A declaration with no reason, one covering no wikilink, a region never enabled again,
 * or a misspelled directive all fail: an exemption nobody can justify, that nothing needs any more, or that
 * silently does nothing is worse than no exemption at all.
 *
 * They also check that every `Try it` section — a heading of any level starting `Try it`, up to the next
 * heading of the same or a higher level — holds a `code-button` that performs its setup, because a reader
 * asked to configure things by hand is a reader the demo lost. A section whose steps really cannot be
 * scripted says so with the same directive, naming the `demo-vault-validation/try-it-code-button` rule on
 * the heading, and with the same checks on the directive itself:
 *
 * ```markdown
 * <!-- obsidian-dev-utils-disable-next-line demo-vault-validation/try-it-code-button -- Dragging a file in from outside Obsidian cannot be scripted. -->
 * ## Try it
 * ```
 *
 * That check ships as a warning ({@link DemoVaultAuthoringSpec.tryItCodeButtons}), so a vault written
 * before it existed keeps passing while it is brought up to it.
 *
 * Two layers are exposed:
 * - {@link DemoVaultCoverageChecker} — a framework-agnostic core that reads the corpus, parses interface /
 *   class / enum members and exported functions, and returns diagnostic arrays (what is undemonstrated / stale
 *   / unlinked / off-convention).
 * - {@link registerDemoVaultCoverageSuite} — a thin wrapper that registers a `vitest` suite over the core, so
 *   a plugin's `demo-vault.no-app.integration.test.ts` is a single declarative call.
 */

import { normalizeOptionalProperties } from '@mnaoumov/typescript-lib/object-utils';
import {
  dirname,
  join,
  relative
} from '@mnaoumov/typescript-lib/path';
import { getMandatoryNamedGroup } from '@mnaoumov/typescript-lib/reg-exp';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  existsSync,
  readdirSync,
  readFileSync
} from 'node:fs';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  findOwnedDemoVaultAppJsonSettings,
  parseDemoVaultAppJson
} from './demo-vault-app-json.ts';
import { ObsidianPluginRepoPaths } from './obsidian-plugin-repo-paths.ts';

/**
 * Tunes the always-on authoring checks. It cannot disable them — see the file overview.
 */
export interface DemoVaultAuthoringSpec {
  /**
   * The notes (paths relative to the demo vault) that sit outside the learning path and are therefore
   * exempt from every authoring check. Defaults to the vault's own `README.md`, which addresses someone
   * browsing the repo on GitHub rather than a reader working through the vault.
   */
  readonly excludedNotes?: string[];

  /**
   * The note (path relative to the demo vault) every other note must be reachable from. Defaults to
   * `00 Start.md`.
   */
  readonly startNote?: string;

  /**
   * How a `Try it` section with no `code-button` and no directive explaining why is reported: `'warn'`
   * prints the sections and passes, `'error'` fails the suite. Defaults to `'warn'`.
   */
  readonly tryItCodeButtons?: DemoVaultCheckSeverity;
}

/**
 * How a check that is being introduced gradually reports what it finds: `'warn'` prints it and passes,
 * `'error'` fails.
 */
export type DemoVaultCheckSeverity = 'error' | 'warn';

/**
 * Reflects a config interface whose options are demonstrated by their bare name.
 */
export interface DemoVaultConfigInterfaceCoverageSpec {
  /**
   * The name of the `export interface`, `export class`, or `export enum` whose properties are the config
   * options.
   */
  readonly interfaceName: string;

  /**
   * The source file path (relative to the repo root) that declares the interface, class, or enum.
   */
  readonly sourcePath: string;
}

/**
 * The parameters for the {@link DemoVaultCoverageChecker} constructor.
 */
export interface DemoVaultCoverageCheckerConstructorParams {
  /**
   * The notes (paths relative to the demo vault) exempt from the authoring checks. Defaults to the
   * vault's own `README.md`.
   */
  readonly excludedNotes?: string[];

  /**
   * The absolute path of the plugin repo root — the folder containing `demo-vault/` and the source being
   * reflected. Callers typically pass `getRootFolder() ?? process.cwd()`.
   */
  readonly rootFolder: string;
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.findStaleReferences}.
 */
export interface DemoVaultCoverageCheckerFindStaleReferencesParams {
  /**
   * The receiver whose `` `${receiver}.<member>` `` references are scanned for in the demo corpus.
   */
  readonly receiver: string;

  /**
   * The members that currently exist on the receiver; any referenced member not in this set is stale.
   */
  readonly validMembers: string[];
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.findUndemonstratedMembers}.
 */
export interface DemoVaultCoverageCheckerFindUndemonstratedMembersParams {
  /**
   * The member names that must each appear in the demo corpus.
   */
  readonly members: string[];

  /**
   * When set, a member is demonstrated only if `` `${receiver}.${member}` `` appears (e.g. a context object's
   * methods); when absent, the bare member name is looked up (e.g. a config option).
   */
  readonly receiver?: string;
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.findUnlinkedFeatureDocs}.
 */
export interface DemoVaultCoverageCheckerFindUnlinkedFeatureDocsParams {
  /**
   * The docs folder (relative to the repo root) whose top-level `*.md` files are the feature docs.
   */
  readonly docsFolder: string;

  /**
   * The doc basenames (without `.md`) that are NOT per-feature pages and so need no linking demo note.
   */
  readonly nonFeatureDocs: string[];
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.findUnreachableNotes}.
 */
export interface DemoVaultCoverageCheckerFindUnreachableNotesParams {
  /**
   * The note (path relative to the demo vault) the walk starts from, e.g. `00 Start.md`.
   */
  readonly startNote: string;
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.getExportedFunctionNames}.
 */
export interface DemoVaultCoverageCheckerGetExportedFunctionNamesParams {
  /**
   * The source file path (relative to the repo root) whose `export function`s are parsed.
   */
  readonly sourcePath: string;
}

/**
 * The parameters for {@link DemoVaultCoverageChecker.getInterfaceMembers}.
 */
export interface DemoVaultCoverageCheckerGetInterfaceMembersParams {
  /**
   * The name of the `export interface`, `export class`, or `export enum` to parse.
   */
  readonly interfaceName: string;

  /**
   * The source file path (relative to the repo root) that declares the interface, class, or enum.
   */
  readonly sourcePath: string;
}

/**
 * Configures the feature-doc linking check.
 */
export interface DemoVaultDocsCoverageSpec {
  /**
   * The docs folder (relative to the repo root) whose top-level `*.md` files are the feature docs.
   */
  readonly folder: string;

  /**
   * The doc basenames (without `.md`) that are NOT per-feature pages and so need no linking demo note.
   */
  readonly nonFeatureDocs: string[];
}

/**
 * Reflects a module's exported functions, each demonstrated by its bare name in the demo corpus.
 */
export interface DemoVaultFunctionsCoverageSpec {
  /**
   * The source file path (relative to the repo root) whose `export function`s must each be demonstrated.
   */
  readonly sourcePath: string;
}

/**
 * Reflects a single interface's members and demonstrates them via `` `${receiver}.<member>` `` references.
 */
export interface DemoVaultInterfaceCoverageSpec {
  /**
   * The name of the `export interface`, `export class`, or `export enum` to reflect.
   */
  readonly interfaceName: string;

  /**
   * Whether the demonstrated members are the reflected type's methods or its properties (enum members count as
   * properties).
   */
  readonly kind: DemoVaultInterfaceMemberKind;

  /**
   * The identifier the notes call the members on (e.g. `codeButtonContext`).
   */
  readonly receiver: string;

  /**
   * The source file path (relative to the repo root) that declares the interface, class, or enum.
   */
  readonly sourcePath: string;
}

/**
 * Whether an interface's demonstrated members are its methods or its properties.
 */
export type DemoVaultInterfaceMemberKind = 'methods' | 'properties';

/**
 * Configures the guard that the reflected surface is non-trivial (protects against a parsing regression
 * silently emptying every other check).
 */
export interface DemoVaultNonTrivialGuardSpec {
  /**
   * A demo note (path relative to the demo vault) that must be present.
   */
  readonly expectDemoNote: string;

  /**
   * A member that must be reflected from {@link DemoVaultNonTrivialGuardSpec.interfaceName}.
   */
  readonly expectMember: string;

  /**
   * The name of the `export interface`, `export class`, or `export enum` whose members are re-parsed for the
   * guard.
   */
  readonly interfaceName: string;

  /**
   * The source file path (relative to the repo root) that declares the interface, class, or enum.
   */
  readonly sourcePath: string;
}

/**
 * A single demo note, as read from the demo vault.
 */
export interface DemoVaultNote {
  /**
   * The note's raw Markdown content.
   */
  readonly content: string;

  /**
   * The note's path relative to the demo vault folder, e.g. `00 Start.md`.
   */
  readonly relativePath: string;
}

/**
 * What a note's inline `obsidian-dev-utils-disable…` directives allow, rule by rule, and what is wrong with
 * them.
 */
export interface DirectiveScan {
  /**
   * For each rule, the zero-based line numbers a directive exempts from it.
   */
  readonly allowedLineIndexesByRule: ReadonlyMap<string, ReadonlySet<number>>;

  /**
   * The directive mistakes found, each phrased for a failing assertion.
   */
  readonly problems: string[];
}

/**
 * The running state of a directive scan, threaded through the per-line helpers.
 */
export interface DirectiveScanState {
  /**
   * For each rule, the lines a directive has exempted from it so far.
   */
  readonly allowedLineIndexesByRule: Map<string, Set<number>>;

  /**
   * For each rule, the region currently open, and whether it has covered a target yet.
   */
  readonly openRegionsByRule: Map<string, OpenDirectiveRegion>;

  /**
   * For each rule, the line a `disable-next-line` was read on, while it still waits for the line it covers.
   */
  readonly pendingNextLineIndexesByRule: Map<string, number>;

  /**
   * The directive mistakes found so far.
   */
  readonly problems: string[];

  /**
   * For each rule, the lines of the note that break it — the lines a directive for it has to cover to be
   * doing any work.
   */
  readonly targetLineIndexesByRule: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * The parsed members of a source interface, class, or enum.
 */
export interface InterfaceMembers {
  /**
   * Every member — {@link InterfaceMembers.methods} followed by {@link InterfaceMembers.properties}.
   */
  readonly all: string[];

  /**
   * The method members (declared as `name(...)`).
   */
  readonly methods: string[];

  /**
   * The property members (declared as `name?: ...`).
   */
  readonly properties: string[];
}

/**
 * A note line paired with the line number it came from, so a check that skips fenced blocks can still
 * report — and an inline directive can still name — the line as the reader sees it.
 */
export interface NoteLine {
  /**
   * The zero-based line number within the note.
   */
  readonly index: number;

  /**
   * The line's raw text.
   */
  readonly line: string;
}

/**
 * A `disable` region that has been opened and not yet enabled again.
 */
export interface OpenDirectiveRegion {
  /**
   * Whether the region has covered a line breaking its rule, which is what stops it being reported as
   * pointless.
   */
  isUsed: boolean;

  /**
   * The line the region was opened on.
   */
  readonly lineIndex: number;
}

/**
 * A `disable` region that has been opened and not yet enabled again.
 *
 * @deprecated Use {@link OpenDirectiveRegion}: the directives now serve more than the wikilink rule.
 */
export interface OpenWikilinkDirectiveRegion {
  /**
   * Whether the region has covered a wikilink, which is what stops it being reported as pointless.
   */
  isUsed: boolean;

  /**
   * The line the region was opened on.
   */
  readonly lineIndex: number;
}

/**
 * The parameters for {@link registerDemoVaultCoverageSuite}.
 */
export interface RegisterDemoVaultCoverageSuiteParams {
  /**
   * Tunes the always-on authoring checks, or `undefined` to take their defaults. It cannot disable them.
   */
  readonly authoring?: DemoVaultAuthoringSpec;

  /**
   * The config interfaces whose options must each be demonstrated by their bare name, or `undefined` when the
   * plugin has no settings.
   */
  readonly configInterfaces?: DemoVaultConfigInterfaceCoverageSpec[];

  /**
   * The feature-doc linking check, or `undefined` when the plugin ships no `docs/` folder.
   */
  readonly docs?: DemoVaultDocsCoverageSpec;

  /**
   * The modules whose `export function`s must each be demonstrated by their bare name, or `undefined` when the
   * plugin exposes no such module to check.
   */
  readonly functionModules?: DemoVaultFunctionsCoverageSpec[];

  /**
   * The interfaces whose members must each be demonstrated (and referenced without drift), or `undefined` when
   * the plugin exposes no public API surface to reflect.
   */
  readonly interfaces?: DemoVaultInterfaceCoverageSpec[];

  /**
   * The guard that keeps the reflected surface non-trivial, or `undefined` when there is no reflected surface
   * to guard. The vault is checked for being non-empty either way.
   */
  readonly nonTrivialGuard?: DemoVaultNonTrivialGuardSpec;

  /**
   * The absolute path of the plugin repo root. Callers typically pass `getRootFolder() ?? process.cwd()`.
   */
  readonly rootFolder: string;
}

/**
 * What a note's inline `obsidian-dev-utils-disable…` directives allow, and what is wrong with them.
 *
 * @deprecated Use {@link DirectiveScan}: the directives now serve more than the wikilink rule.
 */
export interface WikilinkDirectiveScan {
  /**
   * The zero-based line numbers a directive allows a wikilink on.
   */
  readonly allowedLineIndexes: ReadonlySet<number>;

  /**
   * The directive mistakes found, each phrased for a failing assertion.
   */
  readonly problems: string[];
}

/**
 * The running state of a directive scan, threaded through the per-line helpers.
 *
 * @deprecated Use {@link DirectiveScanState}: the directives now serve more than the wikilink rule.
 */
export interface WikilinkDirectiveScanState {
  /**
   * The lines a directive has allowed a wikilink on so far.
   */
  readonly allowedLineIndexes: Set<number>;

  /**
   * The region currently open, and whether it has covered a wikilink yet.
   */
  openRegion: null | OpenDirectiveRegion;

  /**
   * The line a `disable-next-line` was read on, while it still waits for the line it covers.
   */
  pendingNextLineIndex: null | number;

  /**
   * The directive mistakes found so far.
   */
  readonly problems: string[];

  /**
   * The lines of the note that carry a wikilink.
   */
  readonly wikilinkLineIndexes: ReadonlySet<number>;
}

/**
 * A `Try it` section being read, from its heading to the next heading of the same or a higher level.
 */
interface TryItSection {
  hasCodeButton: boolean;
  readonly level: number;
  readonly lineIndex: number;
}

/**
 * Reflects a plugin's public surface from source and checks its in-repo `demo-vault/` stays in sync with it.
 *
 * Every method is a pure query over files under the repo root (the demo corpus is read once and cached), so
 * the checker is trivially unit-testable against a fixture repo and carries no test-framework dependency.
 */
export class DemoVaultCoverageChecker {
  private cachedCorpus: null | string = null;
  private cachedNotes: DemoVaultNote[] | null = null;
  private readonly demoVaultFolder: string;
  private readonly excludedNotes: Set<string>;
  private readonly rootFolder: string;

  /**
   * Creates a checker rooted at a plugin repo.
   *
   * @param params - The parameters for the constructor.
   */
  public constructor(params: DemoVaultCoverageCheckerConstructorParams) {
    this.rootFolder = params.rootFolder;
    this.demoVaultFolder = join(this.rootFolder, ObsidianPluginRepoPaths.DemoVault);
    this.excludedNotes = new Set(params.excludedNotes ?? DEFAULT_EXCLUDED_NOTES);
  }

  /**
   * Collects the demo notes as paths relative to the demo vault folder (for a non-trivial-surface guard).
   *
   * @returns The relative paths of every `*.md` note in the demo vault.
   */
  public collectDemoNoteRelativePaths(): string[] {
    return this.collectNotes().map((note) => note.relativePath);
  }

  /**
   * Reads and caches every demo note individually — the per-note view the authoring checks work on, as
   * opposed to the concatenated {@link DemoVaultCoverageChecker.readCorpus}.
   *
   * @returns Every `*.md` note in the demo vault, excluded ones included.
   */
  public collectNotes(): DemoVaultNote[] {
    this.cachedNotes ??= this.collectMarkdownFiles(this.demoVaultFolder).map((file) => ({
      content: readFileSync(file, 'utf-8'),
      relativePath: relative(this.demoVaultFolder, file)
    }));
    return this.cachedNotes;
  }

  /**
   * Finds the `.obsidian/app.json` settings the vault commits that `obsidian-dev-utils` owns and writes
   * into the archived vault itself. A committed one is a second copy of a setting nothing reconciles, and
   * it is the copy that goes stale — so the convention is that the vault commits none of them.
   *
   * @returns The names of the owned settings the committed `app.json` sets. A vault that commits no
   * `app.json` at all is fine, and yields none.
   */
  public findCommittedAppJsonSettings(): string[] {
    const appJsonPath = join(this.demoVaultFolder, ObsidianPluginRepoPaths.DotObsidian, ObsidianPluginRepoPaths.AppJson);
    const content = existsSync(appJsonPath) ? readFileSync(appJsonPath, 'utf-8') : null;
    return findOwnedDemoVaultAppJsonSettings({ appJson: parseDemoVaultAppJson({ content, path: appJsonPath }) });
  }

  /**
   * Finds notes carrying a `[Docs](…)` link line. The note IS the documentation, so a line pointing
   * elsewhere for the real explanation is the shape this convention exists to remove.
   *
   * @returns The relative paths of the offending notes.
   */
  public findNotesWithDocsLinks(): string[] {
    return this.collectCheckableNotes()
      .filter((note) => getLinesOutsideFences(note.content).some((line) => DOCS_LINK_REG_EXP.test(line)))
      .map((note) => note.relativePath);
  }

  /**
   * Finds notes that do not open with an `# H1` (frontmatter aside).
   *
   * @returns The relative paths of the offending notes.
   */
  public findNotesWithoutH1(): string[] {
    return this.collectCheckableNotes()
      .filter((note) => !hasH1(note.content))
      .map((note) => note.relativePath);
  }

  /**
   * Finds notes with no prose paragraph before their first code fence — the 1-3 sentences saying what the
   * feature does and why a reader would want it, without which the note is a button with no lesson.
   *
   * @returns The relative paths of the offending notes.
   */
  public findNotesWithoutIntroProse(): string[] {
    return this.collectCheckableNotes()
      .filter((note) => !hasIntroProse(note.content))
      .map((note) => note.relativePath);
  }

  /**
   * Finds notes whose exemptions are not doing any work — a wikilink allowance or an inline directive for
   * any rule declared without a reason, misspelled, or covering nothing that breaks its rule. All of them
   * are drift: an exemption nobody can justify, and one nothing needs any more, which would go on hiding
   * the next mistake somebody makes by accident.
   *
   * @returns One `<note>: <problem>` entry per problem found.
   */
  public findNotesWithUnjustifiedWikilinkAllowance(): string[] {
    return this.collectCheckableNotes().flatMap((note) => {
      const scan = scanDirectives(note.content);
      const problems = [...scan.problems];
      const reason = readWikilinkAllowanceReason(note.content);
      if (reason !== null) {
        if (reason.trim() === '') {
          problems.push('a note-level allowance with no reason');
        } else if (!hasWikilink(note.content)) {
          problems.push('a note-level allowance covering no wikilink');
        } else if (getAllowedLineIndexes(scan, WIKILINK_RULE).size > 0) {
          problems.push('inline directives the note-level allowance already covers');
        }
      }
      return problems.map((problem) => `${note.relativePath}: ${problem}`);
    });
  }

  /**
   * Finds notes using an Obsidian `[[wikilink]]` outside a code fence. The demo vault is also read on
   * GitHub, where a wikilink renders as literal brackets and leads nowhere. A wikilink shown INSIDE a
   * fence is sample text, not navigation, so fenced blocks are skipped, as is a note that declares in its
   * frontmatter why its wikilinks are the point — see the file overview.
   *
   * @returns The relative paths of the offending notes.
   */
  public findNotesWithWikilinks(): string[] {
    return this.collectCheckableNotes()
      .filter((note) => {
        if (readWikilinkAllowanceReason(note.content) !== null) {
          return false;
        }
        const allowedLineIndexes = getAllowedLineIndexes(scanDirectives(note.content), WIKILINK_RULE);
        return findWikilinkLineIndexes(note.content).some((lineIndex) => !allowedLineIndexes.has(lineIndex));
      })
      .map((note) => note.relativePath);
  }

  /**
   * Finds members that the demo notes reference on a receiver but that no longer exist on it (rename drift).
   *
   * @param params - The parameters for the lookup.
   * @returns The distinct stale member names referenced in the demo corpus.
   */
  public findStaleReferences(params: DemoVaultCoverageCheckerFindStaleReferencesParams): string[] {
    const validMembers = new Set(params.validMembers);
    const referenced = [...this.readCorpus().matchAll(new RegExp(String.raw`${params.receiver}\.(?<member>\w+)`, 'g'))]
      .map((match) => getMandatoryNamedGroup(match, 'member'));
    return [...new Set(referenced)].filter((member) => !validMembers.has(member));
  }

  /**
   * Finds `Try it` sections with no `code-button` in them. A `Try it` section is a heading of any level
   * starting `Try it`, up to the next heading of the same or a higher level; the setup it asks for is
   * what a button is for, so a section that leaves the reader to do it by hand is the shape this check
   * rejects. A section whose heading a `demo-vault-validation/try-it-code-button` directive covers has
   * stated why it cannot be scripted, and is skipped — see the file overview.
   *
   * @returns One `<note>: line <n>` entry per offending section, naming the line of its heading.
   */
  public findTryItSectionsWithoutCodeButton(): string[] {
    return this.collectCheckableNotes().flatMap((note) => {
      const allowedLineIndexes = getAllowedLineIndexes(scanDirectives(note.content), TRY_IT_RULE);
      return findTryItLineIndexesWithoutCodeButton(note.content)
        .filter((lineIndex) => !allowedLineIndexes.has(lineIndex))
        .map((lineIndex) => `${note.relativePath}: ${formatLineNumber(lineIndex)}`);
    });
  }

  /**
   * Finds members that are not demonstrated anywhere in the demo corpus.
   *
   * @param params - The parameters for the lookup.
   * @returns The member names with no demonstration.
   */
  public findUndemonstratedMembers(params: DemoVaultCoverageCheckerFindUndemonstratedMembersParams): string[] {
    const corpus = this.readCorpus();
    return params.members.filter((member) => {
      const needle = params.receiver === undefined ? member : `${params.receiver}.${member}`;
      return !corpus.includes(needle);
    });
  }

  /**
   * Finds feature docs that no demo note links to.
   *
   * @param params - The parameters for the lookup.
   * @returns The feature-doc basenames (without `.md`) not linked from any demo note.
   */
  public findUnlinkedFeatureDocs(params: DemoVaultCoverageCheckerFindUnlinkedFeatureDocsParams): string[] {
    const nonFeatureDocs = new Set(params.nonFeatureDocs);
    const featureDocs = readdirSync(join(this.rootFolder, params.docsFolder))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''))
      .filter((name) => !nonFeatureDocs.has(name));
    const linkedDocs = new Set(
      [...this.readCorpus().matchAll(/docs\/(?<doc>[\w-]+)\.md/g)].map((match) => getMandatoryNamedGroup(match, 'doc'))
    );
    return featureDocs.filter((doc) => !linkedDocs.has(doc));
  }

  /**
   * Finds notes that cannot be reached from the start note by following Markdown links between notes.
   *
   * The walk starts at {@link DemoVaultCoverageCheckerFindUnreachableNotesParams.startNote} and follows
   * every `[Text](<./NN Name.md>)` link outside a code fence, transitively. A note nothing links to is
   * one a reader can only find by browsing the file list — which is exactly what the grouped index in the
   * start note is meant to replace. When the start note itself is missing, EVERY note is unreachable,
   * because there is nowhere to start from.
   *
   * @param params - The parameters for the walk.
   * @returns The relative paths of the unreachable notes.
   */
  public findUnreachableNotes(params: DemoVaultCoverageCheckerFindUnreachableNotesParams): string[] {
    const notesByRelativePath = new Map(this.collectNotes().map((note) => [note.relativePath, note]));
    const reachedNotes = new Set<string>();
    const pendingNotes = [params.startNote];

    while (pendingNotes.length > 0) {
      const notePath = ensureNonNullable(pendingNotes.pop());
      const note = notesByRelativePath.get(notePath);
      if (!note || reachedNotes.has(notePath)) {
        continue;
      }
      reachedNotes.add(notePath);
      pendingNotes.push(...collectNoteLinkTargets(note));
    }

    return this.collectCheckableNotes()
      .map((note) => note.relativePath)
      .filter((notePath) => !reachedNotes.has(notePath));
  }

  /**
   * Parses the names of the `export function`s (including `async` and generator declarations) in a source file.
   *
   * @param params - The parameters for the lookup.
   * @returns The exported function names in source order.
   */
  public getExportedFunctionNames(params: DemoVaultCoverageCheckerGetExportedFunctionNamesParams): string[] {
    const source = readFileSync(join(this.rootFolder, params.sourcePath), 'utf-8');
    return [...source.matchAll(/^export (?:async )?function\*? (?<name>\w+)/gm)]
      .map((match) => getMandatoryNamedGroup(match, 'name'));
  }

  /**
   * Parses the members of an `export interface`, `export class`, or `export enum` declared in a source file.
   *
   * @param params - The parameters for the lookup.
   * @returns The parsed {@link InterfaceMembers}.
   * @throws When the interface, class, or enum cannot be found in the source file.
   */
  public getInterfaceMembers(params: DemoVaultCoverageCheckerGetInterfaceMembersParams): InterfaceMembers {
    const source = readFileSync(join(this.rootFolder, params.sourcePath), 'utf-8');
    const match = new RegExp(String.raw`export (?<keyword>interface|class|enum) ${params.interfaceName}\b[^{]*\{(?<body>[\s\S]*?)\n\}`).exec(source);
    if (!match) {
      throw new Error(`Could not find interface ${params.interfaceName}`);
    }
    return parseMembers(getMandatoryNamedGroup(match, 'keyword'), getMandatoryNamedGroup(match, 'body'));
  }

  /**
   * Reads and caches the demo corpus — every `*.md` note in the demo vault joined into one string.
   *
   * @returns The concatenated demo-note contents.
   */
  public readCorpus(): string {
    this.cachedCorpus ??= this.collectNotes()
      .map((note) => note.content)
      .join('\n');
    return this.cachedCorpus;
  }

  // The notes the authoring checks apply to: every note except the ones declared outside the learning
  // path (the vault's own `README.md` by default).
  private collectCheckableNotes(): DemoVaultNote[] {
    return this.collectNotes().filter((note) => !this.excludedNotes.has(note.relativePath));
  }

  private collectMarkdownFiles(folder: string): string[] {
    const result: string[] = [];
    // `readdirSync` returns entries in the file system's own order: by name on NTFS, but by hash on ext4, so
    // sort them so every check reports its notes in the same order on every platform.
    const entries = readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === ObsidianPluginRepoPaths.NodeModules as string) {
          continue;
        }
        result.push(...this.collectMarkdownFiles(join(folder, entry.name)));
      } else if (entry.name.endsWith('.md')) {
        result.push(join(folder, entry.name));
      }
    }
    return result;
  }
}

/**
 * Registers a `vitest` suite that keeps a plugin's in-repo `demo-vault/` in sync with its public surface.
 *
 * Call it once from a plugin's `demo-vault.no-app.integration.test.ts`; it registers one test per check,
 * delegating to {@link DemoVaultCoverageChecker}.
 *
 * @param params - The declarative coverage specification.
 */
export function registerDemoVaultCoverageSuite(params: RegisterDemoVaultCoverageSuiteParams): void {
  const checker = new DemoVaultCoverageChecker(normalizeOptionalProperties<DemoVaultCoverageCheckerConstructorParams>({
    excludedNotes: params.authoring?.excludedNotes,
    rootFolder: params.rootFolder
  }));
  const startNote = params.authoring?.startNote ?? DEFAULT_START_NOTE;
  const tryItCodeButtons = params.authoring?.tryItCodeButtons ?? DEFAULT_TRY_IT_CODE_BUTTONS_SEVERITY;

  describe('demo-vault coverage', () => {
    for (const spec of params.interfaces ?? []) {
      it(`demonstrates every ${spec.interfaceName} ${spec.kind}`, () => {
        const members = checker.getInterfaceMembers(spec);
        const demonstrated = members[spec.kind];
        expect(demonstrated.length).toBeGreaterThan(0);
        expect(checker.findUndemonstratedMembers({ members: demonstrated, receiver: spec.receiver })).toEqual([]);
      });

      it(`references no ${spec.interfaceName} member that no longer exists`, () => {
        const members = checker.getInterfaceMembers(spec);
        expect(checker.findStaleReferences({ receiver: spec.receiver, validMembers: members.all })).toEqual([]);
      });
    }

    for (const spec of params.configInterfaces ?? []) {
      it(`demonstrates every ${spec.interfaceName} option`, () => {
        const members = checker.getInterfaceMembers(spec);
        expect(members.properties.length).toBeGreaterThan(0);
        expect(checker.findUndemonstratedMembers({ members: members.properties })).toEqual([]);
      });
    }

    for (const spec of params.functionModules ?? []) {
      it(`demonstrates every exported function in ${spec.sourcePath}`, () => {
        const functionNames = checker.getExportedFunctionNames(spec);
        expect(functionNames.length).toBeGreaterThan(0);
        expect(checker.findUndemonstratedMembers({ members: functionNames })).toEqual([]);
      });
    }

    const docs = params.docs;
    if (docs) {
      it('links a demo note for every feature doc', () => {
        expect(checker.findUnlinkedFeatureDocs({ docsFolder: docs.folder, nonFeatureDocs: docs.nonFeatureDocs }))
          .toEqual([]);
      });
    }

    it('opens every note with an H1', () => {
      expect(checker.findNotesWithoutH1()).toEqual([]);
    });

    it('opens every note with a prose paragraph before its first code block', () => {
      expect(checker.findNotesWithoutIntroProse()).toEqual([]);
    });

    it(`reaches every note from ${startNote}`, () => {
      expect(checker.findUnreachableNotes({ startNote })).toEqual([]);
    });

    it('uses no wikilinks, which do not render on GitHub', () => {
      expect(checker.findNotesWithWikilinks()).toEqual([]);
    });

    it('justifies every wikilink allowance and directive, and declares none it no longer needs', () => {
      expect(checker.findNotesWithUnjustifiedWikilinkAllowance()).toEqual([]);
    });

    it('gives every Try it section a code button, or a stated reason it has none', () => {
      const sections = checker.findTryItSectionsWithoutCodeButton();
      if (tryItCodeButtons === 'error') {
        expect(sections).toEqual([]);
        return;
      }
      if (sections.length > 0) {
        console.warn(formatTryItWarning(sections));
      }
    });

    it('carries no Docs link line, because the note is the docs', () => {
      expect(checker.findNotesWithDocsLinks()).toEqual([]);
    });

    it('commits none of the app.json settings obsidian-dev-utils injects at release time', () => {
      expect(checker.findCommittedAppJsonSettings()).toEqual([]);
    });

    // With no notes to read, every authoring check above passes by having nothing to look at, so a vault
    // that stopped being found would go on reporting itself clean. This is the half of the non-trivial
    // guard that still applies when the plugin exposes nothing to reflect.
    it('reads a non-empty demo vault', () => {
      expect(checker.collectDemoNoteRelativePaths().length).toBeGreaterThan(0);
    });

    const guard = params.nonTrivialGuard;
    if (guard) {
      it('keeps the reflected surface non-trivial', () => {
        const members = checker.getInterfaceMembers(guard);
        expect(members.all).toContain(guard.expectMember);
        expect(checker.collectDemoNoteRelativePaths()).toContain(guard.expectDemoNote);
      });
    }
  });
}

const CLASS_MEMBER_MODIFIERS = String.raw`(?:(?:public|private|protected|readonly|static|abstract|override)\s+)*`;
const ABSOLUTE_URL_REG_EXP = /^[a-z][\w+.-]*:/i;
const ARROW_REG_EXP = /^\s*=>/;
const FUNCTION_TYPE_PARAMETERS_REG_EXP = /^<[^>]*>\s*/;
const ANGLE_BRACKETS_REG_EXP = /^<|>$/g;
const CODE_BUTTON_FENCE_REG_EXP = /^\s*(?:```|~~~)\s*code-button\b/;
const CODE_FENCE_REG_EXP = /^\s*(?:```|~~~)/;
const DEFAULT_EXCLUDED_NOTES = ['README.md'];
const DEFAULT_START_NOTE = '00 Start.md';
// A warning while existing vaults are brought up to the check; it becomes an error once they are.
const DEFAULT_TRY_IT_CODE_BUTTONS_SEVERITY: DemoVaultCheckSeverity = 'warn';
const DOCS_LINK_REG_EXP = /^\s*\[Docs]\(/;
const FRONTMATTER_REG_EXP = /^---\r?\n[\s\S]*?\r?\n---[^\S\n]*\r?\n?/;
const H1_REG_EXP = /^# \S/;
const HEADING_LEVEL_REG_EXP = /^ {0,3}(?<hashes>#{1,6})(?:\s|$)/;
const HEADING_REG_EXP = /^#{1,6} /;
const INLINE_CODE_REG_EXP = /`[^`\n]*`/g;
const MARKDOWN_LINK_REG_EXP = /\[[^\]]*]\((?<target>[^)]+)\)/g;
// An inline directive, shaped after ESLint's and written as an HTML comment so it is invisible BOTH in
// Obsidian and on GitHub — the same spelling the vaults already use for `markdownlint-disable-next-line`.
// An Obsidian `%% … %%` comment would show up as literal text on GitHub, which is half the readership.
const DIRECTIVE_REG_EXP = /^\s*<!--\s*obsidian-dev-utils-(?<action>disable-next-line|disable|enable)\s+(?<rule>[\w-]+\/[\w-]+)(?:\s+--\s+(?<reason>.*?))?\s*-->\s*$/;
// Catches a directive that was MEANT to be one but is misspelled: it would otherwise read as an ordinary
// comment and silently do nothing, which is the failure mode a suppression syntax must never have.
const DIRECTIVE_PROBE_REG_EXP = /<!--\s*obsidian-dev-utils-/;
const TRY_IT_HEADING_REG_EXP = /^ {0,3}#{1,6}\s+Try it\b/i;
const TRY_IT_RULE = 'demo-vault-validation/try-it-code-button';
const WIKILINK_RULE = 'demo-vault-validation/no-wikilinks';
// Every rule a directive may name, with what a line breaking it is called in a problem message.
const DIRECTIVE_RULE_TARGETS = new Map([
  [TRY_IT_RULE, 'Try it section without a code button'],
  [WIKILINK_RULE, 'wikilink']
]);
// The `obsidian-dev-utils > demo-vault-validation > allow-wikilinks` frontmatter path, at any indentation:
// The keys must nest in that order, and any line between them has to stay indented, so a dedent to the
// document's own top level ends the match rather than reaching a same-named key under another parent.
const WIKILINK_ALLOWANCE_REG_EXP = /^obsidian-dev-utils:[^\S\n]*\n(?:[^\S\n]+.*\n)*?[^\S\n]+demo-vault-validation:[^\S\n]*\n(?:[^\S\n]+.*\n)*?[^\S\n]+allow-wikilinks:(?<reason>.*)$/m;
const WIKILINK_REG_EXP = /\[\[[^\]]+]]/;

// Applies one parsed directive to the scan. Each rule keeps its own region and its own pending
// `disable-next-line`, so a directive for one rule never exempts a line from another.
function applyDirective(state: DirectiveScanState, lineIndex: number, match: RegExpExecArray): void {
  const action = getMandatoryNamedGroup(match, 'action');
  const rule = getMandatoryNamedGroup(match, 'rule');
  const reason = match.groups?.['reason']?.trim() ?? '';
  const target = DIRECTIVE_RULE_TARGETS.get(rule);
  if (target === undefined) {
    state.problems.push(`an unknown rule "${rule}" on ${formatLineNumber(lineIndex)}`);
    return;
  }
  if (action !== 'enable' && reason === '') {
    state.problems.push(`a directive with no reason on ${formatLineNumber(lineIndex)}`);
    return;
  }

  if (action === 'disable-next-line') {
    state.pendingNextLineIndexesByRule.set(rule, lineIndex);
    return;
  }

  const openRegion = state.openRegionsByRule.get(rule);
  if (action === 'disable') {
    if (openRegion) {
      state.problems.push(`a disable on ${formatLineNumber(lineIndex)} inside the region opened on ${formatLineNumber(openRegion.lineIndex)}`);
      return;
    }
    state.openRegionsByRule.set(rule, { isUsed: false, lineIndex });
    return;
  }

  if (!openRegion) {
    state.problems.push(`an enable on ${formatLineNumber(lineIndex)} with no region open`);
    return;
  }
  if (!openRegion.isUsed) {
    state.problems.push(`a region opened on ${formatLineNumber(openRegion.lineIndex)} covering no ${target}`);
  }
  state.openRegionsByRule.delete(rule);
}

// Applies one ordinary line to the scan, rule by rule: an open region covers it, and a pending
// `disable-next-line` claims the first line with content on it — the directive and its target are usually a
// blank line apart.
function applyDirectiveScanLine(state: DirectiveScanState, lineIndex: number, line: string): void {
  for (const [rule, target] of DIRECTIVE_RULE_TARGETS) {
    const isTarget = ensureNonNullable(state.targetLineIndexesByRule.get(rule)).has(lineIndex);
    const openRegion = state.openRegionsByRule.get(rule);
    if (openRegion) {
      getOrCreateLineIndexes(state.allowedLineIndexesByRule, rule).add(lineIndex);
      openRegion.isUsed ||= isTarget;
      continue;
    }
    const pendingNextLineIndex = state.pendingNextLineIndexesByRule.get(rule);
    if (pendingNextLineIndex === undefined || line.trim() === '') {
      continue;
    }
    getOrCreateLineIndexes(state.allowedLineIndexesByRule, rule).add(lineIndex);
    if (!isTarget) {
      state.problems.push(`a disable-next-line on ${formatLineNumber(pendingNextLineIndex)} covering no ${target}`);
    }
    state.pendingNextLineIndexesByRule.delete(rule);
  }
}

function buildMembers(methods: string[], properties: string[]): InterfaceMembers {
  return {
    all: [...methods, ...properties],
    methods,
    properties
  };
}

// Resolves the notes a note links to: every Markdown link outside a code fence whose target is a `.md`
// file, made relative to the demo vault so it can be looked up in the note map. External URLs and
// non-note targets (images, scripts) are not part of the learning path and are skipped; a `#anchor` is
// dropped, since it addresses a place inside an already-resolved note.
// Returns the note's lines with fenced code blocks removed (the fence lines included), paired with the
// line number each came from, so a check never mistakes sample code for prose — a `[[wikilink]]`
// demonstrated inside a fence is text, not navigation — and an inline directive can still name a line.
function collectLinesOutsideFences(content: string): NoteLine[] {
  const noteLines: NoteLine[] = [];
  let isInsideFence = false;
  for (const [index, line] of content.split('\n').entries()) {
    if (CODE_FENCE_REG_EXP.test(line)) {
      isInsideFence = !isInsideFence;
      continue;
    }
    if (!isInsideFence) {
      noteLines.push({ index, line });
    }
  }
  return noteLines;
}

function collectNoteLinkTargets(note: DemoVaultNote): string[] {
  const targets: string[] = [];
  for (const line of getLinesOutsideFences(note.content)) {
    for (const match of stripInlineCode(line).matchAll(MARKDOWN_LINK_REG_EXP)) {
      const target = getMandatoryNamedGroup(match, 'target').replaceAll(ANGLE_BRACKETS_REG_EXP, '');
      const [notePath = ''] = target.split('#', 1);
      if (ABSOLUTE_URL_REG_EXP.test(notePath) || !notePath.toLowerCase().endsWith('.md')) {
        continue;
      }
      targets.push(join(dirname(note.relativePath), tryDecodeUriComponent(notePath)));
    }
  }
  return targets;
}

function extractClassMethodNames(classBody: string): string[] {
  return [...classBody.matchAll(new RegExp(String.raw`^ {2}(?<modifiers>${CLASS_MEMBER_MODIFIERS})(?<name>\w+)(?:<[^>]*>)?\(`, 'gm'))]
    .filter((match) => !isNonPublicMember(getMandatoryNamedGroup(match, 'modifiers')))
    .map((match) => getMandatoryNamedGroup(match, 'name'));
}

function extractClassPropertyNames(classBody: string): string[] {
  return [...classBody.matchAll(new RegExp(String.raw`^ {2}(?<modifiers>${CLASS_MEMBER_MODIFIERS})(?<name>\w+)\s*\??\s*[:=]`, 'gm'))]
    .filter((match) => !isNonPublicMember(getMandatoryNamedGroup(match, 'modifiers')))
    .map((match) => getMandatoryNamedGroup(match, 'name'));
}

function extractEnumMemberNames(enumBody: string): string[] {
  return [...enumBody.matchAll(/^ {2}(?<name>\w+)/gm)].map((match) => getMandatoryNamedGroup(match, 'name'));
}

// A method is callable surface however it is written: a method signature (`foo(bar: string): void;`) or a
// property signature whose type is a function type (`foo: (bar: string) => void;`). The shared ESLint config
// runs `@typescript-eslint/method-signature-style` at its `property` default, so `lint:fix` rewrites the
// first shape into the second — reading only the first reported zero methods for every such interface.
function extractMethodNames(interfaceBody: string): string[] {
  const methodSignatureNames = [...interfaceBody.matchAll(/^ {2}(?<name>\w+)(?:<[^>]*>)?\(/gm)].map((match) => getMandatoryNamedGroup(match, 'name'));
  const functionPropertyNames = matchPropertySignatures(interfaceBody)
    .filter((match) => isFunctionType(interfaceBody, match))
    .map((match) => getMandatoryNamedGroup(match, 'name'));
  return [...methodSignatureNames, ...functionPropertyNames];
}

// Every property signature whose type is not a function type, so methods and properties stay a partition.
function extractPropertyNames(interfaceBody: string): string[] {
  return matchPropertySignatures(interfaceBody)
    .filter((match) => !isFunctionType(interfaceBody, match))
    .map((match) => getMandatoryNamedGroup(match, 'name'));
}

// The heading lines of the `Try it` sections that hold no `code-button`. A section runs to the next heading
// of the same or a higher level, so a `### Step 1` inside a `## Try it` stays part of it. Headings and
// fences inside a fenced block are sample text, so only a fence that OPENS a block can be the button.
function findTryItLineIndexesWithoutCodeButton(content: string): number[] {
  const lineIndexes: number[] = [];
  let section: null | TryItSection = null;
  let isInsideFence = false;
  for (const [index, line] of content.split('\n').entries()) {
    if (CODE_FENCE_REG_EXP.test(line)) {
      if (!isInsideFence && section && CODE_BUTTON_FENCE_REG_EXP.test(line)) {
        section.hasCodeButton = true;
      }
      isInsideFence = !isInsideFence;
      continue;
    }
    const hashes = isInsideFence ? undefined : HEADING_LEVEL_REG_EXP.exec(line)?.groups?.['hashes'];
    if (hashes === undefined) {
      continue;
    }
    if (section && hashes.length <= section.level) {
      if (!section.hasCodeButton) {
        lineIndexes.push(section.lineIndex);
      }
      section = null;
    }
    if (!section && TRY_IT_HEADING_REG_EXP.test(line)) {
      section = { hasCodeButton: false, level: hashes.length, lineIndex: index };
    }
  }
  if (section && !section.hasCodeButton) {
    lineIndexes.push(section.lineIndex);
  }
  return lineIndexes;
}

// The line numbers carrying a wikilink that is navigation rather than sample text.
function findWikilinkLineIndexes(content: string): number[] {
  return collectLinesOutsideFences(content)
    .filter((noteLine) => WIKILINK_REG_EXP.test(stripInlineCode(noteLine.line)))
    .map((noteLine) => noteLine.index);
}

function formatLineNumber(lineIndex: number): string {
  return `line ${String(lineIndex + 1)}`;
}

function formatTryItWarning(sections: string[]): string {
  return [
    `demo-vault coverage: ${String(sections.length)} Try it section(s) have no code-button to perform their setup.`,
    `Add one, or state why the steps cannot be scripted with <!-- obsidian-dev-utils-disable-next-line ${TRY_IT_RULE} -- <reason> --> above the heading.`,
    ...sections.map((section) => `  ${section}`)
  ].join('\n');
}

function getAllowedLineIndexes(scan: DirectiveScan, rule: string): ReadonlySet<number> {
  return scan.allowedLineIndexesByRule.get(rule) ?? new Set();
}

function getLinesOutsideFences(content: string): string[] {
  return collectLinesOutsideFences(content).map((noteLine) => noteLine.line);
}

function getOrCreateLineIndexes(lineIndexesByRule: Map<string, Set<number>>, rule: string): Set<number> {
  let lineIndexes = lineIndexesByRule.get(rule);
  if (!lineIndexes) {
    lineIndexes = new Set();
    lineIndexesByRule.set(rule, lineIndexes);
  }
  return lineIndexes;
}

// Whether the note's first content line (frontmatter and blank lines aside) is an `# H1`.
function hasH1(content: string): boolean {
  for (const line of stripFrontmatter(content).split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      continue;
    }
    return H1_REG_EXP.test(trimmedLine);
  }
  return false;
}

// Whether a plain prose line appears before the note's first code fence. Headings are not prose — a note
// that goes straight from its title to a button is exactly the shape this check rejects.
function hasIntroProse(content: string): boolean {
  for (const line of stripFrontmatter(content).split('\n')) {
    if (CODE_FENCE_REG_EXP.test(line)) {
      return false;
    }
    const trimmedLine = line.trim();
    if (trimmedLine === '' || HEADING_REG_EXP.test(trimmedLine)) {
      continue;
    }
    return true;
  }
  return false;
}

// Whether the note navigates with an Obsidian `[[wikilink]]`. Fenced blocks and inline code are sample
// text rather than navigation, so they are removed before looking.
function hasWikilink(content: string): boolean {
  return findWikilinkLineIndexes(content).length > 0;
}

// Whether the property signature's type, starting right after its `:`, is a function type: an optional type
// parameter list, a parameter list, then `=>`. The parameter list is walked by bracket depth rather than by a
// regular expression, so a parenthesized non-function type (`(string | number)[]`) and a parameter whose own
// type holds parentheses (`(callback: () => void) => void`) are both read correctly, across lines too.
function isFunctionType(interfaceBody: string, match: RegExpExecArray): boolean {
  let index = match.index + match[0].length;
  index += FUNCTION_TYPE_PARAMETERS_REG_EXP.exec(interfaceBody.slice(index))?.[0].length ?? 0;
  if (interfaceBody[index] !== '(') {
    return false;
  }
  let depth = 0;
  for (; index < interfaceBody.length; index++) {
    const character = interfaceBody[index];
    if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
      if (depth === 0) {
        return ARROW_REG_EXP.test(interfaceBody.slice(index + 1));
      }
    }
  }
  return false;
}

function isNonPublicMember(modifiers: string): boolean {
  return /\b(?:private|protected)\b/.test(modifiers);
}

// `readonly` is the only modifier a property signature takes, and a method signature takes none — TypeScript
// rejects `readonly foo(): void;` — so the method-signature regex needs no counterpart.
function matchPropertySignatures(interfaceBody: string): RegExpExecArray[] {
  return [...interfaceBody.matchAll(/^ {2}(?:readonly\s+)?(?<name>\w+)\??:\s*/gm)];
}

function parseMembers(keyword: string, body: string): InterfaceMembers {
  switch (keyword) {
    case 'class': {
      return buildMembers(extractClassMethodNames(body), extractClassPropertyNames(body));
    }
    case 'enum': {
      return buildMembers([], extractEnumMemberNames(body));
    }
    default: {
      return buildMembers(extractMethodNames(body), extractPropertyNames(body));
    }
  }
}

// Reads the note's `obsidian-dev-utils > demo-vault-validation > allow-wikilinks` declaration: the stated
// reason, `''` when the key is present with nothing after it, or `null` when the note declares nothing.
// Read with a regular expression rather than a YAML parser: it is one known key path, and every plugin that
// installs this package would otherwise carry a YAML dependency for it.
function readWikilinkAllowanceReason(content: string): null | string {
  const frontmatter = FRONTMATTER_REG_EXP.exec(content)?.[0];
  if (frontmatter === undefined) {
    return null;
  }
  const reason = WIKILINK_ALLOWANCE_REG_EXP.exec(frontmatter)?.groups?.['reason'];
  return reason === undefined ? null : reason.trim().replace(/^(?<quote>["'])(?<value>[\s\S]*)\k<quote>$/, '$<value>');
}

// Reads the note's inline `obsidian-dev-utils-disable…` directives, returning which lines they exempt from
// each rule and everything wrong with them. A suppression that quietly does nothing is worse than none, so
// a misspelled directive, one with no reason, an unclosed region and one covering nothing that breaks its
// rule are each reported rather than ignored.
function scanDirectives(content: string): DirectiveScan {
  const state: DirectiveScanState = {
    allowedLineIndexesByRule: new Map(),
    openRegionsByRule: new Map(),
    pendingNextLineIndexesByRule: new Map(),
    problems: [],
    targetLineIndexesByRule: new Map([
      [TRY_IT_RULE, new Set(findTryItLineIndexesWithoutCodeButton(content))],
      [WIKILINK_RULE, new Set(findWikilinkLineIndexes(content))]
    ])
  };

  for (const { index, line } of collectLinesOutsideFences(content)) {
    const match = DIRECTIVE_REG_EXP.exec(line);
    if (match) {
      applyDirective(state, index, match);
    } else if (DIRECTIVE_PROBE_REG_EXP.test(line)) {
      state.problems.push(`a malformed directive on ${formatLineNumber(index)}`);
    } else {
      applyDirectiveScanLine(state, index, line);
    }
  }

  for (const openRegion of state.openRegionsByRule.values()) {
    state.problems.push(`a region opened on ${formatLineNumber(openRegion.lineIndex)} that is never enabled again`);
  }
  for (const [rule, pendingNextLineIndex] of state.pendingNextLineIndexesByRule) {
    state.problems.push(`a disable-next-line on ${formatLineNumber(pendingNextLineIndex)} covering no ${ensureNonNullable(DIRECTIVE_RULE_TARGETS.get(rule))}`);
  }
  return { allowedLineIndexesByRule: state.allowedLineIndexesByRule, problems: state.problems };
}

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_REG_EXP, '');
}

function stripInlineCode(line: string): string {
  return line.replaceAll(INLINE_CODE_REG_EXP, '');
}

// A hand-written link may contain a bare `%` (or any other invalid percent-escape), which makes
// `decodeURIComponent` throw. Such a target is meant literally, so it is used as written.
function tryDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
