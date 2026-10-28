import { createHash } from 'node:crypto';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { PerformanceVaultProse } from './performance-vault.ts';

import {
  generatePerformanceVault,
  PERFORMANCE_VAULT_PLANTED_TERMS,
  PERFORMANCE_VAULT_VOCABULARY_SIZE
} from './performance-vault.ts';

const SMALL_OPTIONS = { deletionCount: 2, linkerCount: 3, mentionCount: 4, mentionInterval: 2, noteCount: 20, totalBytes: 10_000 };

function fingerprint(files: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const [path, text] of Object.entries(files)) {
    hash.update(path).update('\0').update(text).update('\0');
  }
  return hash.digest('hex');
}

describe('generatePerformanceVault', () => {
  it('preserves configurable link, unlinked mention and identical deletion scenarios', () => {
    const files = generatePerformanceVault(SMALL_OPTIONS);
    expect(Object.keys(files)).toHaveLength(20);
    expect(files['target.md']).toBe('');
    expect(files['links/link-2.md']).toBe('[[target]]\n');
    expect(files['mentions/note-0.md']).toContain('about the target');
    expect(files['mentions/note-1.md']).not.toContain('target');
    expect(files['mentions/note-2.md']).toContain('about the target');
    expect(files['to-delete-a/del-1.md']).toBe('[[delete-target]]\n');
    expect(files['to-delete-b/del-1.md']).toBe(files['to-delete-a/del-1.md']);
    expect(Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0)).toBe(10_000);
  });

  it('generates exactly 37,000 notes and 110 decimal MB deterministically', () => {
    const files = generatePerformanceVault();
    expect(Object.keys(files)).toHaveLength(37_000);
    expect(Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0)).toBe(110_000_000);
    const first = fingerprint(files);
    expect(fingerprint(generatePerformanceVault())).toBe(first);
    // The corpus 7.1.0 shipped: the default must not drift, or measurements stop being comparable across versions.
    expect(first).toBe('8508851ffe3dc4557493811af93c4b812b3878d72e64cb20b8b2bd5b14dea5f1');
    expect(fingerprint(generatePerformanceVault({ prose: 'repeated', proseSeed: 42 }))).toBe(first);
  });

  it('generates varied prose with realistic term diversity', () => {
    // Large enough to plant every term and draw most of both vocabularies, small enough for an instrumented run.
    const options = { ...SMALL_OPTIONS, noteCount: 12_000, prose: 'varied', totalBytes: 3_000_000 } as const;
    const files = generatePerformanceVault(options);
    expect(fingerprint(generatePerformanceVault(options))).toBe(fingerprint(files));
    const filler = Object.entries(files).filter(([path]) => path.startsWith('big/'));
    const terms = new Set<string>();
    for (const [, text] of filler) {
      for (const term of text.toLowerCase().split(/[\s.]+/u)) {
        if (term) {
          terms.add(term);
        }
      }
    }
    expect(terms.size).toBeGreaterThan(PERFORMANCE_VAULT_VOCABULARY_SIZE);
    expect(terms.size).toBeLessThanOrEqual(2 * PERFORMANCE_VAULT_VOCABULARY_SIZE + PERFORMANCE_VAULT_PLANTED_TERMS.length);
    for (const { interval, term } of PERFORMANCE_VAULT_PLANTED_TERMS) {
      expect(filler.filter(([, text]) => text.split(' ').includes(term))).toHaveLength(Math.ceil(filler.length / interval));
    }
  });

  it('keeps fixtures and byte totals while the seed changes only varied filler notes', () => {
    const repeated = generatePerformanceVault(SMALL_OPTIONS);
    const first = generatePerformanceVault({ ...SMALL_OPTIONS, prose: 'varied' });
    const second = generatePerformanceVault({ ...SMALL_OPTIONS, prose: 'varied', proseSeed: Number.MAX_SAFE_INTEGER });
    for (const files of [first, second]) {
      expect(Object.keys(files)).toEqual(Object.keys(repeated));
      expect(Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0)).toBe(10_000);
      for (const [path, text] of Object.entries(files)) {
        if (!path.startsWith('big/')) {
          expect(text).toBe(repeated[path]);
        }
      }
    }
    expect(fingerprint(second)).not.toBe(fingerprint(first));
    expect(first['big/dir-0/file-0.md']).toMatch(/^\p{Lu}\p{Ll}* zq10x zq100x zq1000x zq10000x /u);
    expect(first['big/dir-0/file-1.md']).not.toContain('zq');
  });

  it.each([0, 1])('writes varied filler notes in the requested language for Cyrillic share %s', (cyrillicShare) => {
    const files = generatePerformanceVault({ ...SMALL_OPTIONS, cyrillicShare, prose: 'varied' });
    const filler = Object.entries(files).filter(([path]) => path.startsWith('big/'));
    for (const [, text] of filler) {
      const words = text.replaceAll(/zq\d+x/gu, '').match(/\p{L}+/gu) ?? [];
      expect(words.length).toBeGreaterThan(0);
      expect(words.every((word) => /\p{Script=Cyrillic}/u.test(word) === (cyrillicShare === 1))).toBe(true);
    }
  });

  it.each([0, 0.5, 1])('uses the requested Cyrillic share %s without changing byte totals', (cyrillicShare) => {
    const files = generatePerformanceVault({ ...SMALL_OPTIONS, cyrillicShare });
    const filler = Object.entries(files).filter(([path]) => path.startsWith('big/'));
    expect(filler.filter(([, text]) => /\p{Script=Cyrillic}/u.test(text))).toHaveLength(Math.floor(filler.length * cyrillicShare));
    expect(Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0)).toBe(10_000);
  });

  it('supports no scenario notes and creates deterministic directory boundaries', () => {
    const files = generatePerformanceVault({ deletionCount: 0, filesPerFolder: 1, linkerCount: 0, mentionCount: 0, noteCount: 4, totalBytes: 1001 });
    expect(Object.keys(files)).toEqual(['delete-target.md', 'target.md', 'big/dir-0/file-0.md', 'big/dir-1/file-0.md']);
    expect(Buffer.byteLength(files['big/dir-0/file-0.md'] ?? '')).toBe(501);
    expect(Buffer.byteLength(files['big/dir-1/file-0.md'] ?? '')).toBe(500);
  });

  it.each([
    { noteCount: 0 },
    { noteCount: -1 },
    { noteCount: 3.5 },
    { noteCount: NaN },
    { totalBytes: Infinity },
    { totalBytes: Number.MAX_SAFE_INTEGER + 1 },
    { totalBytes: 1 },
    { deletionCount: -1 },
    { linkerCount: -1 },
    { mentionCount: -1 },
    { filesPerFolder: 0 },
    { mentionInterval: 0 },
    { cyrillicShare: -0.1 },
    { cyrillicShare: 1.1 },
    { cyrillicShare: NaN },
    { prose: 'random' as PerformanceVaultProse },
    { proseSeed: -1 },
    { proseSeed: 0.5 }
  ])('rejects invalid corpus dimensions %j', (options) => {
    expect(() => generatePerformanceVault({ ...SMALL_OPTIONS, ...options })).toThrow(RangeError);
  });
});
