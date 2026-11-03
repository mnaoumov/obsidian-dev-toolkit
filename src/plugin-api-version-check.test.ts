import type { ESLint } from 'eslint';

import { readFile } from 'node:fs/promises';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { analyzePluginApiVersion } from './plugin-api-version-check.ts';

const { mockEslint, mockGetRootFolder, mockLintFiles } = vi.hoisted(() => ({
  mockEslint: vi.fn(),
  mockGetRootFolder: vi.fn(() => '/project'),
  mockLintFiles: vi.fn<(...arguments_: unknown[]) => Promise<ESLint.LintResult[]>>()
}));

vi.mock('eslint', () => ({
  ESLint: class {
    public lintFiles = mockLintFiles;
    public constructor(options: unknown) {
      mockEslint(options);
    }
  }
}));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({ getRootFolder: mockGetRootFolder }));

function results(versions: string[]): ESLint.LintResult[] {
  return [{
    errorCount: versions.length,
    fatalErrorCount: 0,
    filePath: '/project/src/main.ts',
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    messages: versions.map((version) => ({
      column: 2,
      line: 3,
      message: `'App.api' requires Obsidian v${version}, but minAppVersion is 0.0.0.`,
      messageId: 'apiNotAvailable',
      ruleId: 'obsidianmd/no-unsupported-api',
      severity: 2
    })),
    suppressedMessages: [],
    usedDeprecatedRules: [],
    warningCount: 0
  }];
}

describe('analyzePluginApiVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockResolvedValue('{"minAppVersion":"1.5.0"}');
    mockLintFiles.mockResolvedValue(results(['1.4.0', '1.10.0', '1.9.0']));
  });

  it('should take the semantic maximum and fail an insufficient manifest', async () => {
    expect(await analyzePluginApiVersion()).toMatchObject({ hasErrors: true, minAppVersion: '1.5.0', requiredMinAppVersion: '1.10.0' });
    const options = mockEslint.mock.calls[0]?.[0] as ESLint.Options;
    expect(options).toMatchObject({ allowInlineConfig: false, cache: false, cwd: '/project' });
    expect(options.ruleFilter?.({ ruleId: 'obsidianmd/no-unsupported-api', severity: 2 })).toBe(true);
    expect(options.ruleFilter?.({ ruleId: 'other', severity: 2 })).toBe(false);
    const report = await analyzePluginApiVersion();
    expect(report.summary).toContain('Raise minAppVersion');
    expect(report.apiUsages[0]).toContain('/project/src/main.ts:3:2:');
  });

  it.each(['1.10.0', '1.11.0'])('should pass a sufficient manifest %s', async (version) => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ minAppVersion: version }));
    const report = await analyzePluginApiVersion({ files: ['lib/**/*.ts'], rootFolder: '/other' });
    expect(report.hasErrors).toBe(false);
    expect(mockLintFiles).toHaveBeenCalledWith(['lib/**/*.ts']);
    expect(report.summary.includes('could be lowered')).toBe(version === '1.11.0');
  });

  it('should not invent a minimum when no versioned API was found', async () => {
    mockLintFiles.mockResolvedValue(results([]));
    expect(await analyzePluginApiVersion()).toMatchObject({ hasErrors: false, requiredMinAppVersion: undefined });
    const report = await analyzePluginApiVersion();
    expect(report.summary).toContain('no API floor could be derived');
  });

  it.each(['{}', '{"minAppVersion":"invalid"}'])('should reject an invalid manifest %s', async (manifest) => {
    vi.mocked(readFile).mockResolvedValue(manifest);
    await expect(analyzePluginApiVersion()).rejects.toThrow('valid minAppVersion');
  });

  it('should refuse an empty scan', async () => {
    mockLintFiles.mockResolvedValue([]);
    await expect(analyzePluginApiVersion()).rejects.toThrow('No source files were checked');
  });

  it('should refuse empty source globs rather than lint the working directory', async () => {
    await expect(analyzePluginApiVersion({ files: [] })).rejects.toThrow('At least one source glob');
    expect(mockLintFiles).not.toHaveBeenCalled();
  });

  it.each([
    { message: 'Parsing error', messageId: undefined, ruleId: null },
    { message: 'Unexpected diagnostic', messageId: 'apiNotAvailable', ruleId: 'other' },
    { message: 'Unknown report', messageId: 'other', ruleId: 'obsidianmd/no-unsupported-api' },
    { message: 'Changed upstream format', messageId: 'apiNotAvailable', ruleId: 'obsidianmd/no-unsupported-api' },
    { message: '\'x\' requires Obsidian v01.0.0, but minAppVersion is 0.0.0.', messageId: 'apiNotAvailable', ruleId: 'obsidianmd/no-unsupported-api' }
  ])('should refuse an unreliable diagnostic $message', async (message) => {
    const scan = results(['1.0.0']);
    for (const result of scan) {
      result.messages = [{ ...result.messages[0], column: 1, line: 1, severity: 2, ...message }];
    }
    mockLintFiles.mockResolvedValue(scan);
    await expect(analyzePluginApiVersion()).rejects.toThrow('Could not determine API compatibility');
  });
});
