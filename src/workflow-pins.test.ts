import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { join } from '@mnaoumov/typescript-lib/path';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  readToolkitVersion,
  readWorkflowFiles,
  readWorkflowPins,
  resolveToolkitTagCommit,
  rewriteWorkflowPins,
  updateWorkflowPins,
  validateProjectWorkflowPins,
  validateWorkflowPins
} from './workflow-pins.ts';

const { mockGetRootFolder } = vi.hoisted(() => ({
  mockGetRootFolder: vi.fn<() => null | string>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/root')>()),
  getRootFolder: mockGetRootFolder
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/exec', () => ({ exec: vi.fn() }));

// `exec` is overloaded and `vi.mocked` types its last overload, the detailed one; the module calls the string one.
const execMock = vi.mocked(castTo<(command: string[], options: object) => Promise<string>>(exec));

const SHA_OLD = 'a'.repeat(40);
const SHA_NEW = 'b'.repeat(40);
const CI_LINE = '    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@3.0.0';
const RELEASE_LINE = `    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_OLD} # v3.0.0 pinned`;

function mockGit(result: Error | string): void {
  if (typeof result === 'string') {
    execMock.mockResolvedValue(result);
  } else {
    execMock.mockRejectedValue(result);
  }
}

describe('readWorkflowPins', () => {
  it('should read tag and SHA pins, quoted and in list items, and ignore other lines', () => {
    const pins = readWorkflowPins([{
      path: '.github/workflows/ci.yml',
      text: [
        'jobs:',
        CI_LINE,
        `  - uses: "MNaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_OLD}" # 3.0.0\r`,
        '    uses: actions/checkout@v4',
        '    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@main # not a version'
      ].join('\n')
    }]);
    expect(pins).toEqual([
      { commentVersion: null, file: '.github/workflows/ci.yml', line: 2, ref: '3.0.0', workflow: 'obsidian-plugin-ci.yml' },
      { commentVersion: '3.0.0', file: '.github/workflows/ci.yml', line: 3, ref: SHA_OLD, workflow: 'obsidian-plugin-release.yml' },
      { commentVersion: null, file: '.github/workflows/ci.yml', line: 5, ref: 'main', workflow: 'obsidian-plugin-ci.yml' }
    ]);
  });
});

describe('readToolkitVersion', () => {
  it('should prefer the lockfile, then an exact, ^ or ~ package.json spec', () => {
    expect(readToolkitVersion({
      packageJson: { devDependencies: { '@mnaoumov/obsidian-dev-toolkit': '^12.0.0' } },
      packageLockJson: { packages: { 'node_modules/@mnaoumov/obsidian-dev-toolkit': { version: '13.0.0' } } }
    })).toBe('13.0.0');
    expect(readToolkitVersion({
      packageJson: { dependencies: { other: '1.0.0' }, devDependencies: { '@mnaoumov/obsidian-dev-toolkit': '~12.1.0' } },
      packageLockJson: { packages: {} }
    })).toBe('12.1.0');
    expect(readToolkitVersion({ packageJson: { devDependencies: { '@mnaoumov/obsidian-dev-toolkit': 'latest' } }, packageLockJson: undefined })).toBeNull();
    expect(readToolkitVersion({ packageJson: undefined, packageLockJson: null })).toBeNull();
  });
});

describe('validateWorkflowPins', () => {
  const pin = { commentVersion: null, file: 'ci.yml', line: 3, ref: '13.0.0', workflow: 'obsidian-plugin-ci.yml' };

  it('should pass with no pins or with every pin on the installed version', () => {
    expect(validateWorkflowPins([], null)).toEqual([]);
    expect(validateWorkflowPins([pin, { ...pin, commentVersion: '13.0.0', ref: SHA_OLD }], '13.0.0')).toEqual([]);
  });

  it('should report an unknown installed version once', () => {
    expect(validateWorkflowPins([pin, pin], null)).toEqual([
      expect.objectContaining({ level: 'error', ruleId: 'workflow-pin-toolkit-version-unknown' })
    ]);
  });

  it('should report a mismatched tag, a mismatched or missing SHA comment and a branch', () => {
    const findings = validateWorkflowPins([
      { ...pin, ref: '3.0.0' },
      { ...pin, commentVersion: '3.0.0', ref: SHA_OLD },
      { ...pin, ref: SHA_OLD },
      { ...pin, ref: 'main' }
    ], '13.0.0');
    expect(findings.map(({ level, ruleId }) => `${level} ${ruleId}`)).toEqual([
      'error workflow-pin-version-mismatch',
      'error workflow-pin-version-mismatch',
      'warning workflow-pin-comment-missing',
      'error workflow-pin-not-release'
    ]);
    expect(findings[0]?.message).toBe(
      'ci.yml:3 calls obsidian-plugin-ci.yml at 3.0.0, but @mnaoumov/obsidian-dev-toolkit 13.0.0 is installed. Run `npx update-workflow-pins` to move every pin to 13.0.0.'
    );
    expect(findings[1]?.message).toContain('at commit aaaaaaa (# 3.0.0)');
  });
});

describe('rewriteWorkflowPins', () => {
  it('should move tag pins, keep line endings and leave other lines alone', () => {
    const text = `jobs:\r\n${CI_LINE}\r\n    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@3.0.0 # 3.0.0 the CI\r\n    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@main # keep\n`;
    const result = rewriteWorkflowPins(text, '13.0.0');
    expect(result.changedLines).toEqual([2, 3, 4]);
    expect(result.text).toBe(
      `jobs:\r\n${CI_LINE.replace('@3.0.0', '@13.0.0')}\r\n    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@13.0.0 # 13.0.0 the CI\r\n    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@13.0.0 # keep\n`
    );
  });

  it('should leave a line already at the version unchanged', () => {
    const line = CI_LINE.replace('@3.0.0', '@13.0.0');
    expect(rewriteWorkflowPins(line, '13.0.0')).toEqual({ changedLines: [], text: line });
  });

  it('should move SHA pins only with a commit, writing the version into the comment', () => {
    expect(rewriteWorkflowPins(RELEASE_LINE, '13.0.0').changedLines).toEqual([]);
    expect(rewriteWorkflowPins(RELEASE_LINE, '13.0.0', SHA_NEW).text).toBe(
      `    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_NEW} # 13.0.0 pinned`
    );
    const bare = `    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_OLD}`;
    expect(rewriteWorkflowPins(bare, '13.0.0', SHA_NEW).text).toBe(
      `    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_NEW} # 13.0.0`
    );
    expect(rewriteWorkflowPins(`${bare}  #  release`, '13.0.0', SHA_NEW).text).toBe(
      `    uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-release.yml@${SHA_NEW}  #  13.0.0 release`
    );
  });
});

describe('resolveToolkitTagCommit', () => {
  afterEach(() => {
    execMock.mockReset();
  });

  it('should prefer the peeled commit of an annotated tag', async () => {
    mockGit(`${SHA_OLD}\trefs/tags/13.0.0\n${SHA_NEW}\trefs/tags/13.0.0^{}\n`);
    expect(await resolveToolkitTagCommit('13.0.0')).toBe(SHA_NEW);
    expect(execMock.mock.calls[0]?.[0]).toEqual([
      'git',
      'ls-remote',
      'https://github.com/mnaoumov/obsidian-dev-toolkit.git',
      'refs/tags/13.0.0',
      'refs/tags/13.0.0^{}'
    ]);
  });

  it('should take a lightweight tag and fail on a missing one or a git error', async () => {
    mockGit(`${SHA_OLD}\trefs/tags/13.0.0\n\n`);
    expect(await resolveToolkitTagCommit('13.0.0')).toBe(SHA_OLD);
    mockGit('');
    await expect(resolveToolkitTagCommit('99.0.0')).rejects.toThrow('mnaoumov/obsidian-dev-toolkit has no release tag 99.0.0.');
    mockGit(new Error('network'));
    await expect(resolveToolkitTagCommit('13.0.0')).rejects.toThrow('network');
  });
});

describe('on a project folder', () => {
  let rootFolder: string;

  beforeEach(async () => {
    rootFolder = await mkdtemp(join(tmpdir(), 'workflow-pins-'));
    mockGetRootFolder.mockReturnValue(rootFolder);
  });

  afterEach(async () => {
    await rm(rootFolder, { force: true, recursive: true });
    mockGetRootFolder.mockReset();
  });

  async function writeProject(workflows: Record<string, string>, lockVersion: null | string = '13.0.0'): Promise<void> {
    await mkdir(join(rootFolder, '.github/workflows'), { recursive: true });
    for (const [name, text] of Object.entries(workflows)) {
      await writeFile(join(rootFolder, '.github/workflows', name), text);
    }
    await writeFile(join(rootFolder, 'package.json'), JSON.stringify({ devDependencies: { '@mnaoumov/obsidian-dev-toolkit': '^13.0.0' } }));
    if (lockVersion !== null) {
      await writeFile(
        join(rootFolder, 'package-lock.json'),
        JSON.stringify({ packages: { 'node_modules/@mnaoumov/obsidian-dev-toolkit': { version: lockVersion } } })
      );
    }
  }

  it('should read no workflow files when the folder is missing', async () => {
    expect(await readWorkflowFiles(rootFolder)).toEqual([]);
    expect(await validateProjectWorkflowPins()).toEqual([]);
  });

  it('should read only YAML files, sorted', async () => {
    await writeProject({ 'a.yml': 'a', 'b.yaml': 'b', 'notes.md': 'x' });
    expect(await readWorkflowFiles(rootFolder)).toEqual([
      { path: '.github/workflows/a.yml', text: 'a' },
      { path: '.github/workflows/b.yaml', text: 'b' }
    ]);
  });

  it('should check the pins against the installed version', async () => {
    await writeProject({ 'ci.yml': `jobs:\n${CI_LINE}\n` });
    expect(await validateProjectWorkflowPins({ rootFolder })).toEqual([
      expect.objectContaining({ ruleId: 'workflow-pin-version-mismatch' })
    ]);
  });

  it('should move every pin to the installed version, resolving the commit for SHA pins', async () => {
    await writeProject({ 'ci.yml': `jobs:\n${CI_LINE}\n`, 'other.yml': 'jobs: {}\n', 'release.yml': `jobs:\n${RELEASE_LINE}\n` });
    const resolveTagCommit = vi.fn().mockResolvedValue(SHA_NEW);
    const update = await updateWorkflowPins({ resolveTagCommit });
    expect(resolveTagCommit).toHaveBeenCalledWith('13.0.0');
    expect(update.version).toBe('13.0.0');
    expect(update.changes.map(({ file }) => file)).toEqual(['.github/workflows/ci.yml', '.github/workflows/release.yml']);
    expect(update.changes[0]?.lines).toEqual([
      '2: uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@3.0.0 -> uses: mnaoumov/obsidian-dev-toolkit/.github/workflows/obsidian-plugin-ci.yml@13.0.0'
    ]);
    expect(await readFile(join(rootFolder, '.github/workflows/release.yml'), 'utf-8')).toContain(`@${SHA_NEW} # 13.0.0 pinned`);
    expect(await validateProjectWorkflowPins({ rootFolder })).toEqual([]);
  });

  it('should write nothing on a dry run and look up no commit without SHA pins', async () => {
    await writeProject({ 'ci.yml': `jobs:\n${CI_LINE}\n` });
    const resolveTagCommit = vi.fn();
    const update = await updateWorkflowPins({ isDryRun: true, resolveTagCommit, rootFolder, version: '12.2.0' });
    expect(update.changes).toHaveLength(1);
    expect(resolveTagCommit).not.toHaveBeenCalled();
    expect(await readFile(join(rootFolder, '.github/workflows/ci.yml'), 'utf-8')).toContain('@3.0.0');
  });

  it('should refuse an unknown installed version and a version that is not a release', async () => {
    await writeProject({ 'ci.yml': CI_LINE }, null);
    await writeFile(join(rootFolder, 'package.json'), '{}');
    await expect(updateWorkflowPins({ rootFolder })).rejects.toThrow('Pass --version=<version>.');
    await expect(updateWorkflowPins({ rootFolder, version: 'main' })).rejects.toThrow('"main" is not a release version');
    await writeFile(join(rootFolder, 'package.json'), 'not json');
    expect(await validateProjectWorkflowPins({ rootFolder })).toEqual([expect.objectContaining({ ruleId: 'workflow-pin-toolkit-version-unknown' })]);
  });
});
