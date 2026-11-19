/**
 * @file
 *
 * Unit tests for `obsidianmd-eslint-nesting.ts`, including a probe of the packages installed in this repository.
 */

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  describeEslintMajorMismatch,
  getMajorVersion,
  readObsidianmdEslintVersion,
  readProjectEslintVersion,
  warnOnEslintMajorMismatch
} from './obsidianmd-eslint-nesting.ts';

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  getRootFolder: vi.fn(() => null)
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMajorVersion', () => {
  it('reads the major of a version', () => {
    expect(getMajorVersion('9.39.4')).toBe(9);
    expect(getMajorVersion(' v10.1.0 ')).toBe(10);
  });

  it('returns null for text that is not a version', () => {
    expect(getMajorVersion('latest')).toBeNull();
  });
});

describe('describeEslintMajorMismatch', () => {
  it('returns null when the majors agree', () => {
    expect(describeEslintMajorMismatch({ obsidianmdEslintVersion: '10.0.0', runningEslintVersion: '10.11.0' })).toBeNull();
  });

  it('returns null when a version cannot be read', () => {
    expect(describeEslintMajorMismatch({ obsidianmdEslintVersion: 'latest', runningEslintVersion: '10.11.0' })).toBeNull();
    expect(describeEslintMajorMismatch({ obsidianmdEslintVersion: '9.39.4', runningEslintVersion: 'latest' })).toBeNull();
  });

  it('names both versions, the newer major and the fix', () => {
    const message = describeEslintMajorMismatch({ obsidianmdEslintVersion: '9.39.4', runningEslintVersion: '10.11.0' });
    expect(message).toContain('ESLint 9.39.4');
    expect(message).toContain('ESLint 10.11.0 runs');
    expect(message).toContain('only ESLint 10 recommends');
    expect(message).toContain('"overrides": { "eslint": "$eslint" }');
  });
});

describe('warnOnEslintMajorMismatch', () => {
  it('warns on a mismatch', () => {
    const warn = vi.fn();
    warnOnEslintMajorMismatch({ readObsidianmdEslintVersion: () => '9.39.4', readRunningEslintVersion: () => '10.11.0', warn });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ESLint 9.39.4'));
  });

  it('stays silent when the majors agree', () => {
    const warn = vi.fn();
    warnOnEslintMajorMismatch({ readObsidianmdEslintVersion: () => '10.0.0', readRunningEslintVersion: () => '10.11.0', warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent when the project has no eslint of its own', () => {
    const warn = vi.fn();
    const readObsidianmdEslintVersionMock = vi.fn(() => '9.39.4');
    warnOnEslintMajorMismatch({ readObsidianmdEslintVersion: readObsidianmdEslintVersionMock, readRunningEslintVersion: () => null, warn });
    expect(warn).not.toHaveBeenCalled();
    expect(readObsidianmdEslintVersionMock).not.toHaveBeenCalled();
  });

  it('reports a probe that throws an Error', () => {
    const warn = vi.fn();
    warnOnEslintMajorMismatch({
      readObsidianmdEslintVersion: () => {
        throw new Error('no plugin');
      },
      readRunningEslintVersion: () => '10.11.0',
      warn
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('would go unnoticed: no plugin'));
  });

  it('reports a probe that throws a non-Error', () => {
    const warn = vi.fn();
    warnOnEslintMajorMismatch({
      readObsidianmdEslintVersion: () => '9.39.4',
      readRunningEslintVersion: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- The case under test is a thrown non-Error.
        throw 'boom';
      },
      warn
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('would go unnoticed: boom'));
  });

  it('agrees on the packages installed here, which carry the override', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    warnOnEslintMajorMismatch();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the installed-package probes', () => {
  let temporaryFolder: null | string = null;

  afterEach(() => {
    if (temporaryFolder === null) {
      return;
    }

    rmSync(temporaryFolder, { force: true, recursive: true });
    temporaryFolder = null;
  });

  it('read the same major in this repository', () => {
    const projectVersion = readProjectEslintVersion();
    expect(projectVersion).not.toBeNull();
    expect(getMajorVersion(readObsidianmdEslintVersion())).toBe(getMajorVersion(projectVersion ?? ''));
  });

  it('return null for a project without eslint', () => {
    temporaryFolder = mkdtempSync(join(tmpdir(), 'obsidianmd-eslint-nesting-'));
    writeFileSync(join(temporaryFolder, 'package.json'), '{}');
    vi.spyOn(process, 'cwd').mockReturnValue(temporaryFolder);
    expect(readProjectEslintVersion()).toBeNull();
  });

  it('throw on an eslint package.json without a version', () => {
    temporaryFolder = mkdtempSync(join(tmpdir(), 'obsidianmd-eslint-nesting-'));
    writeFileSync(join(temporaryFolder, 'package.json'), '{}');
    const eslintFolder = join(temporaryFolder, 'node_modules', 'eslint');
    mkdirSync(eslintFolder, { recursive: true });
    writeFileSync(join(eslintFolder, 'package.json'), '{"name":"eslint"}');
    vi.spyOn(process, 'cwd').mockReturnValue(temporaryFolder);
    expect(() => readProjectEslintVersion()).toThrow('has no version');
  });
});
