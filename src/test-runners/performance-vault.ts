/**
 * @file
 *
 * Deterministic, exactly sized markdown corpora for performance measurements.
 */

/**
The target used by link and unlinked-mention fixtures.
 */
export const PERFORMANCE_VAULT_TARGET = 'target.md';
/**
Folder containing the link fixtures.
 */
export const PERFORMANCE_VAULT_LINKER_FOLDER = 'links';
/**
Folder containing the unlinked-mention fixtures.
 */
export const PERFORMANCE_VAULT_MENTION_FOLDER = 'mentions';
/**
Folder containing unrelated prose notes.
 */
export const PERFORMANCE_VAULT_FILLER_FOLDER = 'big';
/**
Separate target used by the deletion fixtures.
 */
export const PERFORMANCE_VAULT_DELETE_TARGET = 'delete-target.md';
/**
First of two identical deletion fixture folders.
 */
export const PERFORMANCE_VAULT_DELETE_FOLDER_A = 'to-delete-a';
/**
Second deletion fixture folder.
 */
export const PERFORMANCE_VAULT_DELETE_FOLDER_B = 'to-delete-b';

/**
Options for an exactly sized performance corpus.
 */
export interface GeneratePerformanceVaultOptions {
  /**
  Fraction of filler notes using Cyrillic prose, rounded down. Defaults to 0.25.
   */
  readonly cyrillicShare?: number;
  /**
  Notes in EACH deletion folder. Defaults to 1000.
   */
  readonly deletionCount?: number;
  /**
  Filler notes per directory. Defaults to 30.
   */
  readonly filesPerFolder?: number;
  /**
  Notes linking to target.md. Defaults to 50.
   */
  readonly linkerCount?: number;
  /**
  Notes containing prose and periodic unlinked mentions. Defaults to 1000.
   */
  readonly mentionCount?: number;
  /**
  Every nth mention note names the target. Defaults to 25.
   */
  readonly mentionInterval?: number;
  /**
  Total markdown note count, INCLUDING fixtures. Defaults to 37,000.
   */
  readonly noteCount?: number;
  /**
  Exact UTF-8 CONTENT bytes, INCLUDING fixtures. Defaults to 110,000,000 (decimal MB).
   */
  readonly totalBytes?: number;
}

const ENGLISH_PROSE = 'A day of reading and writing brings new ideas about books, meetings and ordinary life. ';
const CYRILLIC_PROSE = '\u{414}\u{435}\u{43D}\u{44C} \u{447}\u{438}\u{442}\u{430}\u{43D}\u{43D}\u{44F} \u{456} \u{43F}\u{438}\u{441}\u{44C}\u{43C}\u{430} \u{43F}\u{440}\u{438}\u{43D}\u{43E}\u{441}\u{438}\u{442}\u{44C} \u{43D}\u{43E}\u{432}\u{456} \u{456}\u{434}\u{435}\u{457} \u{43F}\u{440}\u{43E} \u{43A}\u{43D}\u{438}\u{433}\u{438} \u{442}\u{430} \u{436}\u{438}\u{442}\u{442}\u{44F}. ';
const ENCODER = new TextEncoder();
const DEFAULT_CYRILLIC_SHARE = 0.25;
const DEFAULT_DELETION_COUNT = 1000;
const DEFAULT_FILES_PER_FOLDER = 30;
const DEFAULT_LINKER_COUNT = 50;
const DEFAULT_MENTION_COUNT = 1000;
const DEFAULT_MENTION_INTERVAL = 25;
const DEFAULT_NOTE_COUNT = 37_000;
const DEFAULT_TOTAL_BYTES = 110_000_000;
const DEFAULT_OPTIONS = {
  cyrillicShare: DEFAULT_CYRILLIC_SHARE,
  deletionCount: DEFAULT_DELETION_COUNT,
  filesPerFolder: DEFAULT_FILES_PER_FOLDER,
  linkerCount: DEFAULT_LINKER_COUNT,
  mentionCount: DEFAULT_MENTION_COUNT,
  mentionInterval: DEFAULT_MENTION_INTERVAL,
  noteCount: DEFAULT_NOTE_COUNT,
  totalBytes: DEFAULT_TOTAL_BYTES
};
const TARGET_COUNT = 2;
const DELETION_FOLDER_COUNT = 2;
const MENTION_PROSE_REPEAT_COUNT = 12;

/**
 * Generates a deterministic corpus without reading environment variables or writing files.
 * Fixture counts may be zero; at least one filler note must remain to absorb the byte budget.
 *
 * @param options - Corpus dimensions and scenario counts.
 * @returns Vault-relative markdown paths mapped to text, suitable for TemporaryVault.populate().
 */
export function generatePerformanceVault(options: GeneratePerformanceVaultOptions = {}): Record<string, string> {
  const {
    cyrillicShare,
    deletionCount,
    filesPerFolder,
    linkerCount,
    mentionCount,
    mentionInterval,
    noteCount,
    totalBytes
  } = resolveOptions(options);
  const fixtureCount = TARGET_COUNT + linkerCount + mentionCount + DELETION_FOLDER_COUNT * deletionCount;
  if (fixtureCount >= noteCount) {
    throw new RangeError('noteCount must leave at least one filler note after fixtures');
  }
  const files: Record<string, string> = {
    [PERFORMANCE_VAULT_DELETE_TARGET]: '',
    [PERFORMANCE_VAULT_TARGET]: ''
  };
  for (let index = 0; index < linkerCount; index++) {
    files[`${PERFORMANCE_VAULT_LINKER_FOLDER}/link-${String(index)}.md`] = '[[target]]\n';
  }
  for (const folder of [PERFORMANCE_VAULT_DELETE_FOLDER_A, PERFORMANCE_VAULT_DELETE_FOLDER_B]) {
    for (let index = 0; index < deletionCount; index++) {
      files[`${folder}/del-${String(index)}.md`] = '[[delete-target]]\n';
    }
  }
  for (let index = 0; index < mentionCount; index++) {
    files[`${PERFORMANCE_VAULT_MENTION_FOLDER}/note-${String(index)}.md`] = `${ENGLISH_PROSE.repeat(MENTION_PROSE_REPEAT_COUNT)}\n${index % mentionInterval === 0 ? 'This note is about the target, without linking to it.\n' : ''}`;
  }
  const fillerCount = noteCount - fixtureCount;
  const remainingBytes = totalBytes - Object.values(files).reduce((sum, text) => sum + ENCODER.encode(text).length, 0);
  const cyrillicCount = Math.floor(fillerCount * cyrillicShare);
  const minimumBytes = ENCODER.encode(CYRILLIC_PROSE).length;
  if (Math.floor(remainingBytes / fillerCount) < minimumBytes) {
    throw new RangeError('totalBytes must leave enough space for prose in every filler note');
  }
  for (let index = 0; index < fillerCount; index++) {
    const size = Math.floor(remainingBytes / fillerCount) + (index < remainingBytes % fillerCount ? 1 : 0);
    const prose = index < cyrillicCount ? CYRILLIC_PROSE : ENGLISH_PROSE;
    const proseBytes = ENCODER.encode(prose).length;
    files[`${PERFORMANCE_VAULT_FILLER_FOLDER}/dir-${String(Math.floor(index / filesPerFolder))}/file-${String(index % filesPerFolder)}.md`] = prose.repeat(Math.floor(size / proseBytes)) + ' '.repeat(size % proseBytes);
  }
  return files;
}

function resolveOptions(options: GeneratePerformanceVaultOptions): Required<GeneratePerformanceVaultOptions> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const { cyrillicShare, filesPerFolder, mentionInterval, ...counts } = resolved;
  for (const [name, value] of Object.entries({ ...counts, filesPerFolder, mentionInterval })) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a nonnegative safe integer`);
    }
  }
  if (filesPerFolder === 0 || mentionInterval === 0) {
    throw new RangeError('filesPerFolder and mentionInterval must be positive');
  }
  if (!Number.isFinite(cyrillicShare) || cyrillicShare < 0 || cyrillicShare > 1) {
    throw new RangeError('cyrillicShare must be between zero and one');
  }
  return resolved;
}
