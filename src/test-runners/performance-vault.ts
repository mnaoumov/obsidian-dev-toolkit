/**
 * @file
 *
 * Deterministic, exactly sized markdown corpora for performance measurements.
 */

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

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

const PLANTED_TERM_COUNT = 4;
const PLANTED_TERM_INTERVAL_BASE = 10;

/**
A term planted in `'varied'` filler notes at a fixed document frequency.
 */
export interface PerformanceVaultPlantedTerm {
  /**
  The term is planted in every filler note whose index is a multiple of this.
   */
  readonly interval: number;
  /**
  The planted word. No vocabulary word contains `q` or a digit, so the corpus never produces it otherwise.
   */
  readonly term: string;
}

/**
How filler notes are written: one repeated sentence, or seeded Zipf-distributed words.
 */
export type PerformanceVaultProse = 'repeated' | 'varied';

/**
Rare terms planted in `'varied'` filler notes: filler note `i` contains each term whose `interval` divides `i`, so a
term occurs in exactly `Math.ceil(fillerCount / interval)` notes, once in each.
 */
export const PERFORMANCE_VAULT_PLANTED_TERMS: readonly PerformanceVaultPlantedTerm[] = Array.from({ length: PLANTED_TERM_COUNT }, (_, index) => {
  // 10, 100, 1,000 and 10,000, spelled zq10x, zq100x, zq1000x and zq10000x.
  const interval = PLANTED_TERM_INTERVAL_BASE ** (index + 1);
  return { interval, term: `zq${String(interval)}x` };
});

/**
Distinct words in each language's `'varied'` vocabulary.
 */
export const PERFORMANCE_VAULT_VOCABULARY_SIZE = 20_000;

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
  How filler notes are written. `'repeated'` (the default) repeats one sentence per language. `'varied'` samples
  seeded, Zipf-distributed words from a synthetic vocabulary per language and plants {@link PERFORMANCE_VAULT_PLANTED_TERMS}.
   */
  readonly prose?: PerformanceVaultProse;
  /**
  Seed of the `'varied'` prose. Defaults to 1. Ignored for `'repeated'` prose.
   */
  readonly proseSeed?: number;
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
const DEFAULT_PROSE_SEED = 1;
const DEFAULT_TOTAL_BYTES = 110_000_000;
const DEFAULT_OPTIONS: Required<GeneratePerformanceVaultOptions> = {
  cyrillicShare: DEFAULT_CYRILLIC_SHARE,
  deletionCount: DEFAULT_DELETION_COUNT,
  filesPerFolder: DEFAULT_FILES_PER_FOLDER,
  linkerCount: DEFAULT_LINKER_COUNT,
  mentionCount: DEFAULT_MENTION_COUNT,
  mentionInterval: DEFAULT_MENTION_INTERVAL,
  noteCount: DEFAULT_NOTE_COUNT,
  prose: 'repeated',
  proseSeed: DEFAULT_PROSE_SEED,
  totalBytes: DEFAULT_TOTAL_BYTES
};
const TARGET_COUNT = 2;
const DELETION_FOLDER_COUNT = 2;
const MENTION_PROSE_REPEAT_COUNT = 12;
const PROSE_KINDS: readonly string[] = ['repeated', 'varied'] satisfies PerformanceVaultProse[];
// One UTF-16 unit per letter, and no `q` and no digit, so no vocabulary word can spell a planted term.
const ENGLISH_CONSONANTS = 'bcdfghjklmnprstvwy';
const ENGLISH_VOWELS = 'aeiou';
const CYRILLIC_CONSONANTS = '\u{431}\u{432}\u{433}\u{434}\u{436}\u{437}\u{43A}\u{43B}\u{43C}\u{43D}\u{43F}\u{440}\u{441}\u{442}\u{445}\u{446}\u{447}\u{448}';
const CYRILLIC_VOWELS = '\u{430}\u{435}\u{438}\u{456}\u{43E}\u{443}\u{44F}\u{44E}';
const ENGLISH_VOCABULARY_SALT = 1;
const CYRILLIC_VOCABULARY_SALT = 2;
const MINIMUM_SENTENCE_WORDS = 6;
const SENTENCE_WORD_SPREAD = 12;
const MAXIMUM_SYLLABLES = 4;
const NOTE_SEED_SALT = 3;
const BISECTION_PARTS = 2;
const UINT32_RANGE = 0x1_00_00_00_00;

interface Vocabulary {
  readonly cumulativeWeights: Float64Array;
  readonly entries: readonly VocabularyEntry[];
  readonly totalWeight: number;
}

interface VocabularyEntry {
  readonly byteLength: number;
  readonly capitalized: string;
  readonly word: string;
}

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
    prose,
    proseSeed,
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
  const vocabularies = prose === 'varied'
    ? {
      cyrillic: buildVocabulary(CYRILLIC_CONSONANTS, CYRILLIC_VOWELS, mixSeed(proseSeed, CYRILLIC_VOCABULARY_SALT)),
      english: buildVocabulary(ENGLISH_CONSONANTS, ENGLISH_VOWELS, mixSeed(proseSeed, ENGLISH_VOCABULARY_SALT))
    }
    : null;
  const noteSeed = mixSeed(proseSeed, NOTE_SEED_SALT);
  for (let index = 0; index < fillerCount; index++) {
    const size = Math.floor(remainingBytes / fillerCount) + (index < remainingBytes % fillerCount ? 1 : 0);
    const isCyrillic = index < cyrillicCount;
    let text: string;
    if (vocabularies) {
      const plantedTerms = PERFORMANCE_VAULT_PLANTED_TERMS.filter(({ interval }) => index % interval === 0).map(({ term }) => term);
      text = generateVariedProse(size, isCyrillic ? vocabularies.cyrillic : vocabularies.english, plantedTerms, mixSeed(noteSeed, index));
    } else {
      const sentence = isCyrillic ? CYRILLIC_PROSE : ENGLISH_PROSE;
      const sentenceBytes = ENCODER.encode(sentence).length;
      text = sentence.repeat(Math.floor(size / sentenceBytes)) + ' '.repeat(size % sentenceBytes);
    }
    files[`${PERFORMANCE_VAULT_FILLER_FOLDER}/dir-${String(Math.floor(index / filesPerFolder))}/file-${String(index % filesPerFolder)}.md`] = text;
  }
  return files;
}

function buildVocabulary(consonants: string, vowels: string, seed: number): Vocabulary {
  const random = createRandom(seed);
  const words: string[] = [];
  const seen = new Set<string>();
  while (words.length < PERFORMANCE_VAULT_VOCABULARY_SIZE) {
    // Frequent words are short: ranks 0-8 take one syllable, 9-98 two, 99-998 three, the rest four.
    const syllableCount = Math.min(MAXIMUM_SYLLABLES, 1 + Math.floor(Math.log10(words.length + 1)));
    let word = '';
    for (let syllable = 0; syllable < syllableCount; syllable++) {
      word += pick(consonants, random) + pick(vowels, random);
    }
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    words.push(word);
  }
  const cumulativeWeights = new Float64Array(words.length);
  let total = 0;
  for (let rank = 0; rank < words.length; rank++) {
    total += 1 / (rank + 1);
    cumulativeWeights[rank] = total;
  }
  return {
    cumulativeWeights,
    entries: words.map((word) => ({
      byteLength: ENCODER.encode(word).length,
      capitalized: word.charAt(0).toUpperCase() + word.slice(1),
      word
    })),
    totalWeight: total
  };
}

/* eslint-disable no-bitwise, no-magic-numbers -- Mulberry32 and a murmur3-style finalizer are defined by their 32-bit operations and constants. */
// Mulberry32: tiny, fast and identical on every platform, which is all a reproducible corpus needs.
function createRandom(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state + 0x6D_2B_79_F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function generateVariedProse(size: number, vocabulary: Vocabulary, plantedTerms: readonly string[], seed: number): string {
  const random = createRandom(seed);
  const { cumulativeWeights, entries, totalWeight } = vocabulary;
  const parts: string[] = [];
  let bytes = 0;
  let wordsLeftInSentence = 0;
  let plantedIndex = 0;
  for (;;) {
    let word: string;
    let wordBytes: number;
    const isSentenceStart = wordsLeftInSentence === 0;
    if (isSentenceStart) {
      wordsLeftInSentence = MINIMUM_SENTENCE_WORDS + Math.floor(random() * SENTENCE_WORD_SPREAD);
    }
    const plantedTerm = isSentenceStart ? undefined : plantedTerms[plantedIndex];
    if (plantedTerm === undefined) {
      const entry = ensureNonNullable(entries[sampleRank(cumulativeWeights, random() * totalWeight)]);
      word = isSentenceStart ? entry.capitalized : entry.word;
      wordBytes = entry.byteLength;
    } else {
      plantedIndex++;
      word = plantedTerm;
      wordBytes = plantedTerm.length;
    }
    wordsLeftInSentence--;
    const separator = wordsLeftInSentence === 0 ? '. ' : ' ';
    if (bytes + wordBytes + separator.length > size) {
      break;
    }
    parts.push(word, separator);
    bytes += wordBytes + separator.length;
  }
  return parts.join('') + ' '.repeat(size - bytes);
}

function mixSeed(seed: number, salt: number): number {
  let value = Math.imul((seed % UINT32_RANGE) ^ Math.floor(seed / UINT32_RANGE), 0x9E_37_79_B1) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x85_EB_CA_6B);
  return (value ^ (value >>> 13)) >>> 0;
}
/* eslint-enable no-bitwise, no-magic-numbers -- End of the 32-bit hashing. */

function pick(letters: string, random: () => number): string {
  return letters.charAt(Math.floor(random() * letters.length));
}

function resolveOptions(options: GeneratePerformanceVaultOptions): Required<GeneratePerformanceVaultOptions> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const { cyrillicShare, filesPerFolder, mentionInterval, prose, ...counts } = resolved;
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
  if (!PROSE_KINDS.includes(prose)) {
    throw new RangeError(`prose must be one of: ${PROSE_KINDS.join(', ')}`);
  }
  return resolved;
}

// Index of the first cumulative weight above `target`.
function sampleRank(cumulativeWeights: Float64Array, target: number): number {
  let low = 0;
  let high = cumulativeWeights.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / BISECTION_PARTS);
    // `middle` is always in range; `Number()` only drops the `undefined` the index type admits, without a call or a branch on this hot path.
    if (Number(cumulativeWeights[middle]) > target) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}
