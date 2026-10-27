import { createHash } from 'node:crypto';
import {
  describe,
  expect,
  it
} from 'vitest';

import { generatePerformanceVault } from './performance-vault.ts';

const SMALL_OPTIONS = { deletionCount: 2, linkerCount: 3, mentionCount: 4, mentionInterval: 2, noteCount: 20, totalBytes: 10_000 };

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
    function fingerprint(): string {
      const files = generatePerformanceVault();
      expect(Object.keys(files)).toHaveLength(37_000);
      expect(Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0)).toBe(110_000_000);
      const hash = createHash('sha256');
      for (const [path, text] of Object.entries(files)) {
        hash.update(path).update('\0').update(text).update('\0');
      }
      return hash.digest('hex');
    }
    expect(fingerprint()).toBe(fingerprint());
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
    { cyrillicShare: NaN }
  ])('rejects invalid corpus dimensions %j', (options) => {
    expect(() => generatePerformanceVault({ ...SMALL_OPTIONS, ...options })).toThrow(RangeError);
  });
});
