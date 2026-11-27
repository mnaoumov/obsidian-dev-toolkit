import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  findWorkaroundCanaries,
  findWorkaroundMarkers,
  findWorkaroundRegistryProblems,
  groupPathsById,
  readWorkaroundSourceFiles,
  toPosixPath
} from './obsidian-workarounds.ts';

const MARKED_MODULE = {
  content: '/**\n * Obsidian workaround `foo-bar`, seen in Obsidian `1.15.1`: its canary is elsewhere.\n */\n',
  path: 'src/foo.ts'
};
const CANARY_FILE = {
  content: 'it(\'workaround canary foo-bar: the bug is still there\', async () => {});\n',
  path: 'src/foo.desktop.integration.test.ts'
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('findWorkaroundMarkers', () => {
  it('should read a marker with its id, version and offset, skipping test files and declarations', () => {
    expect(findWorkaroundMarkers([MARKED_MODULE, { ...MARKED_MODULE, path: 'src/foo.test.ts' }, { ...MARKED_MODULE, path: 'src/foo.d.ts' }])).toEqual([
      { id: 'foo-bar', length: 'Obsidian workaround `foo-bar`, seen in Obsidian `1.15.1`'.length, offset: MARKED_MODULE.content.indexOf('Obsidian workaround'), path: 'src/foo.ts', seenInVersion: '1.15.1' }
    ]);
  });
});

describe('findWorkaroundCanaries', () => {
  it('should read a canary only from an integration test file', () => {
    expect(findWorkaroundCanaries([CANARY_FILE, { ...CANARY_FILE, path: 'src/foo.test.ts' }])).toEqual([
      { id: 'foo-bar', length: 'it(\'workaround canary foo-bar: '.length, offset: 0, path: 'src/foo.desktop.integration.test.ts' }
    ]);
  });

  it('should read a canary declared with test() and any quote', () => {
    const content = 'test("workaround canary a: x", f);\ntest(`workaround canary b: y`, f);\n';
    expect(findWorkaroundCanaries([{ content, path: 'src/a.integration.test.ts' }]).map((canary) => canary.id)).toEqual(['a', 'b']);
  });
});

describe('findWorkaroundRegistryProblems', () => {
  it('should accept a marker paired with a canary', () => {
    expect(findWorkaroundRegistryProblems([MARKED_MODULE, CANARY_FILE])).toEqual([]);
  });

  it('should report a marker with no canary, a canary with no marker and a duplicate marker', () => {
    const problems = findWorkaroundRegistryProblems([
      MARKED_MODULE,
      { ...MARKED_MODULE, path: 'src/bar.ts' },
      { ...CANARY_FILE, content: CANARY_FILE.content.replace('foo-bar', 'baz') }
    ]);
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('marked more than once');
    expect(problems[1]).toContain('has no canary');
    expect(problems[2]).toContain('names no marked workaround');
  });
});

describe('groupPathsById', () => {
  it('should keep one path per location, in order', () => {
    expect(groupPathsById([{ id: 'a', length: 1, offset: 0, path: 'x' }, { id: 'b', length: 1, offset: 0, path: 'y' }, { id: 'a', length: 1, offset: 1, path: 'x' }])).toEqual(
      new Map([['a', ['x', 'x']], ['b', ['y']]])
    );
  });
});

describe('readWorkaroundSourceFiles', () => {
  it('should read every .ts file under the source folder with root-relative / paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'workarounds-'));
    temporaryDirectories.push(root);
    mkdirSync(join(root, 'src', 'nested'), { recursive: true });
    writeFileSync(join(root, 'src', 'nested', 'a.ts'), 'a');
    writeFileSync(join(root, 'src', 'b.md'), 'b');
    expect(readWorkaroundSourceFiles(root)).toEqual([{ content: 'a', path: 'src/nested/a.ts' }]);
  });

  it('should return no files when the source folder is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'workarounds-'));
    temporaryDirectories.push(root);
    expect(readWorkaroundSourceFiles(root, 'missing')).toEqual([]);
  });

  it('should rethrow any other read error', () => {
    const root = mkdtempSync(join(tmpdir(), 'workarounds-'));
    temporaryDirectories.push(root);
    writeFileSync(join(root, 'src'), 'not a folder');
    expect(() => readWorkaroundSourceFiles(root)).toThrow();
  });
});

describe('toPosixPath', () => {
  it('should replace every backslash', () => {
    expect(toPosixPath('a\\b\\c')).toBe('a/b/c');
  });
});
