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
  The planted word. No generated word or token contains `q`, so the corpus never produces it otherwise.
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
  Fraction of `'varied'` prose words, after the first of each sentence, replaced by a rare token: half id-like tokens
  (hashes, dates, slugs) and half words of letters drawn by frequency rather than by syllable. They give the corpus the
  long tail of rare trigrams a real vault's names, links and numbers add. Defaults to 0.02. `0` reproduces the
  `'varied'` corpus of 7.2.0 byte for byte. Ignored for `'repeated'` prose.
   */
  readonly rareTokenShare?: number;
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
const DEFAULT_RARE_TOKEN_SHARE = 0.02;
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
  rareTokenShare: DEFAULT_RARE_TOKEN_SHARE,
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
// Letters by descending frequency, without `q`; `weightLetters` turns each into a frequency-weighted pool.
const ENGLISH_LETTERS_BY_FREQUENCY = 'etaoinshrdlcumwfgypbvkjxz';
const CYRILLIC_LETTERS_BY_FREQUENCY = '\u{43E}\u{430}\u{43D}\u{438}\u{456}\u{442}\u{435}\u{432}\u{440}\u{441}\u{43B}\u{43A}\u{443}\u{434}\u{43F}\u{43C}\u{437}\u{44F}\u{44C}\u{433}\u{431}\u{447}\u{445}\u{439}\u{446}\u{436}\u{448}\u{44E}\u{454}\u{457}\u{449}\u{444}\u{491}';
const LETTER_WEIGHT_SCALE = 12;
const HEX_DIGITS = '0123456789abcdef';
const DECIMAL_DIGITS = '0123456789';
const SLUG_CHARACTERS = 'abcdefghijklmnoprstuvwxyz0123456789';
const SLUG_SEPARATORS = '-_';
const MINIMUM_RARE_WORD_LENGTH = 3;
const RARE_WORD_LENGTH_SPREAD = 8;
const MINIMUM_HASH_LENGTH = 7;
const HASH_LENGTH_SPREAD = 6;
const MINIMUM_SLUG_CHUNKS = 2;
const SLUG_CHUNK_SPREAD = 2;
const MINIMUM_SLUG_CHUNK_LENGTH = 2;
const SLUG_CHUNK_LENGTH_SPREAD = 5;
const FIRST_YEAR = 1990;
const YEAR_SPREAD = 40;
const MONTHS = 12;
const DAYS = 28;
const DATE_PART_WIDTH = 2;
const ID_TOKEN_KIND_COUNT = 3;
const ID_TOKEN_SHARE = 0.5;
const NOTE_SEED_SALT = 3;
const BISECTION_PARTS = 2;
const UINT32_RANGE = 0x1_00_00_00_00;

interface GenerateVariedProseParams {
  readonly plantedTerms: readonly string[];
  readonly rareTokenShare: number;
  readonly seed: number;
  readonly size: number;
  readonly vocabulary: Vocabulary;
}

interface Vocabulary {
  readonly cumulativeWeights: Float64Array;
  readonly entries: readonly VocabularyEntry[];
  readonly rareLetters: string;
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
    rareTokenShare,
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
      cyrillic: buildVocabulary(CYRILLIC_CONSONANTS, CYRILLIC_VOWELS, CYRILLIC_LETTERS_BY_FREQUENCY, mixSeed(proseSeed, CYRILLIC_VOCABULARY_SALT)),
      english: buildVocabulary(ENGLISH_CONSONANTS, ENGLISH_VOWELS, ENGLISH_LETTERS_BY_FREQUENCY, mixSeed(proseSeed, ENGLISH_VOCABULARY_SALT))
    }
    : null;
  const noteSeed = mixSeed(proseSeed, NOTE_SEED_SALT);
  for (let index = 0; index < fillerCount; index++) {
    const size = Math.floor(remainingBytes / fillerCount) + (index < remainingBytes % fillerCount ? 1 : 0);
    const isCyrillic = index < cyrillicCount;
    let text: string;
    if (vocabularies) {
      const plantedTerms = PERFORMANCE_VAULT_PLANTED_TERMS.filter(({ interval }) => index % interval === 0).map(({ term }) => term);
      text = generateVariedProse({
        plantedTerms,
        rareTokenShare,
        seed: mixSeed(noteSeed, index),
        size,
        vocabulary: isCyrillic ? vocabularies.cyrillic : vocabularies.english
      });
    } else {
      const sentence = isCyrillic ? CYRILLIC_PROSE : ENGLISH_PROSE;
      const sentenceBytes = ENCODER.encode(sentence).length;
      text = sentence.repeat(Math.floor(size / sentenceBytes)) + ' '.repeat(size % sentenceBytes);
    }
    files[`${PERFORMANCE_VAULT_FILLER_FOLDER}/dir-${String(Math.floor(index / filesPerFolder))}/file-${String(index % filesPerFolder)}.md`] = text;
  }
  return files;
}

function buildVocabulary(consonants: string, vowels: string, lettersByFrequency: string, seed: number): Vocabulary {
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
    rareLetters: weightLetters(lettersByFrequency),
    totalWeight: total
  };
}

/* eslint-disable no-bitwise, no-magic-numbers -- Mulberry32 is defined by its 32-bit operations and constants. */
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
/* eslint-enable no-bitwise, no-magic-numbers -- End of Mulberry32. */

// An id-like token always holds a digit, `-` or `_`, so it never passes for a word of either language.
function generateIdToken(random: () => number): string {
  const kind = Math.floor(random() * ID_TOKEN_KIND_COUNT);
  if (kind === 0) {
    return pick(DECIMAL_DIGITS, random) + pickMany(HEX_DIGITS, MINIMUM_HASH_LENGTH - 1 + Math.floor(random() * HASH_LENGTH_SPREAD), random);
  }
  if (kind === 1) {
    const year = FIRST_YEAR + Math.floor(random() * YEAR_SPREAD);
    const month = 1 + Math.floor(random() * MONTHS);
    const day = 1 + Math.floor(random() * DAYS);
    return `${String(year)}-${String(month).padStart(DATE_PART_WIDTH, '0')}-${String(day).padStart(DATE_PART_WIDTH, '0')}`;
  }
  const chunkCount = MINIMUM_SLUG_CHUNKS + Math.floor(random() * SLUG_CHUNK_SPREAD);
  const separator = pick(SLUG_SEPARATORS, random);
  return Array.from(
    { length: chunkCount },
    () => pickMany(SLUG_CHARACTERS, MINIMUM_SLUG_CHUNK_LENGTH + Math.floor(random() * SLUG_CHUNK_LENGTH_SPREAD), random)
  ).join(separator);
}

function generateRareToken(rareLetters: string, random: () => number): string {
  return random() < ID_TOKEN_SHARE ? generateIdToken(random) : pickMany(rareLetters, MINIMUM_RARE_WORD_LENGTH + Math.floor(random() * RARE_WORD_LENGTH_SPREAD), random);
}

function generateVariedProse(params: GenerateVariedProseParams): string {
  const { plantedTerms, rareTokenShare, seed, size, vocabulary } = params;
  const random = createRandom(seed);
  const { cumulativeWeights, entries, rareLetters, totalWeight } = vocabulary;
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
    // A zero share draws nothing, so it leaves the random stream, and the corpus, exactly as 7.2.0 generated it.
    if (plantedTerm === undefined && !isSentenceStart && rareTokenShare > 0 && random() < rareTokenShare) {
      word = generateRareToken(rareLetters, random);
      wordBytes = ENCODER.encode(word).length;
    } else if (plantedTerm === undefined) {
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

/* eslint-disable no-bitwise, no-magic-numbers -- A murmur3-style finalizer is defined by its 32-bit operations and constants. */
function mixSeed(seed: number, salt: number): number {
  let value = Math.imul((seed % UINT32_RANGE) ^ Math.floor(seed / UINT32_RANGE), 0x9E_37_79_B1) ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x85_EB_CA_6B);
  return (value ^ (value >>> 13)) >>> 0;
}
/* eslint-enable no-bitwise, no-magic-numbers -- End of the 32-bit hashing. */

function pick(letters: string, random: () => number): string {
  return letters.charAt(Math.floor(random() * letters.length));
}

function pickMany(letters: string, count: number, random: () => number): string {
  let text = '';
  for (let index = 0; index < count; index++) {
    text += pick(letters, random);
  }
  return text;
}

function resolveOptions(options: GeneratePerformanceVaultOptions): Required<GeneratePerformanceVaultOptions> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const { cyrillicShare, filesPerFolder, mentionInterval, prose, rareTokenShare, ...counts } = resolved;
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
  if (!Number.isFinite(rareTokenShare) || rareTokenShare < 0 || rareTokenShare > 1) {
    throw new RangeError('rareTokenShare must be between zero and one');
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

// The letter of frequency rank `r` appears about `LETTER_WEIGHT_SCALE / (r + 1)` times, so common letters dominate and
// rare ones still occur.
function weightLetters(lettersByFrequency: string): string {
  return Array.from(lettersByFrequency, (letter, rank) => letter.repeat(Math.ceil(LETTER_WEIGHT_SCALE / (rank + 1)))).join('');
}
