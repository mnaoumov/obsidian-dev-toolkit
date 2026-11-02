import process from 'node:process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  parseCheckPluginArguments,
  runCheckPluginCli
} from './plugin-check-cli.ts';

const { mockRunScannerCheck, mockValidatePluginRelease } = vi.hoisted(() => ({
  mockRunScannerCheck: vi.fn(),
  mockValidatePluginRelease: vi.fn()
}));

vi.mock('./plugin-release-checks.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./plugin-release-checks.ts')>(),
  validatePluginRelease: mockValidatePluginRelease
}));

vi.mock('./plugin-scanner-check.ts', () => ({
  runScannerCheck: mockRunScannerCheck
}));

describe('parseCheckPluginArguments', () => {
  it('should leave every option out by default', () => {
    expect(parseCheckPluginArguments([], {})).toEqual({ releaseParams: {}, scannerParams: undefined });
  });

  it('should map every flag to its option', () => {
    expect(parseCheckPluginArguments(
      ['--tag=1.0.0', '--dist=out', '--require-assets', '--scanner', '--scanner-version=v1.3.0', '--no-strict', '--repository=jane/tabs'],
      {}
    )).toEqual({
      releaseParams: { distFolder: 'out', repository: 'jane/tabs', shouldRequireAssets: true, tag: '1.0.0' },
      scannerParams: { repository: 'jane/tabs', shouldBeStrict: false, version: 'v1.3.0' }
    });
  });

  it('should take the tag and the repository from a GitHub Actions run', () => {
    expect(parseCheckPluginArguments(['--scanner'], { GITHUB_REF: 'refs/tags/2.0.0', GITHUB_REPOSITORY: 'jane/tabs' })).toEqual({
      releaseParams: { repository: 'jane/tabs', tag: '2.0.0' },
      scannerParams: { repository: 'jane/tabs' }
    });
    expect(parseCheckPluginArguments([], { GITHUB_REF: 'refs/heads/main' })).toEqual({ releaseParams: {}, scannerParams: undefined });
  });

  it('should read process.env by default', () => {
    vi.stubEnv('GITHUB_REF', 'refs/tags/3.0.0');
    try {
      expect(parseCheckPluginArguments([]).releaseParams).toEqual({ tag: '3.0.0' });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('runCheckPluginCli', () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    mockValidatePluginRelease.mockReset();
    mockRunScannerCheck.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass when nothing is found', async () => {
    mockValidatePluginRelease.mockResolvedValue([]);
    expect(await runCheckPluginCli([])).toBe(0);
    expect(stdout.join('')).toBe('Manifest and release checks passed.\n');
    expect(mockRunScannerCheck).not.toHaveBeenCalled();
  });

  it('should pass on warnings and fail on errors', async () => {
    mockValidatePluginRelease.mockResolvedValue([{ level: 'warning', message: 'w', ruleId: 'r' }]);
    expect(await runCheckPluginCli([])).toBe(0);
    expect(stdout.join('')).toBe('warning: w (r)\n');

    mockValidatePluginRelease.mockResolvedValue([{ level: 'error', message: 'e', ruleId: 'r' }]);
    expect(await runCheckPluginCli([])).toBe(1);
  });

  it('should run the scanner when asked and fail on its exit code', async () => {
    mockValidatePluginRelease.mockResolvedValue([]);
    mockRunScannerCheck.mockResolvedValue({ exitCode: 0, output: 'clean' });
    expect(await runCheckPluginCli(['--scanner'])).toBe(0);
    expect(stdout.join('')).toContain('clean\n');

    mockRunScannerCheck.mockResolvedValue({ exitCode: 1, output: 'error: x' });
    expect(await runCheckPluginCli(['--scanner'])).toBe(1);
  });

  it('should print a failure to stderr', async () => {
    mockValidatePluginRelease.mockRejectedValue(new Error('boom'));
    expect(await runCheckPluginCli([])).toBe(1);
    mockValidatePluginRelease.mockRejectedValue('plain');
    expect(await runCheckPluginCli([])).toBe(1);
    expect(stderr).toEqual(['boom\n', 'plain\n']);
  });
});
