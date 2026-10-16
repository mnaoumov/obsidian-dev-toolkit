import process from 'node:process';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  parseCoverageBadgeArguments,
  runCoverageBadgeCli
} from './coverage-badge-cli.ts';

const { mockGenerateCoverageBadge } = vi.hoisted(() => ({
  mockGenerateCoverageBadge: vi.fn()
}));

vi.mock('./coverage-badge.ts', () => ({
  generateCoverageBadge: mockGenerateCoverageBadge
}));

describe('parseCoverageBadgeArguments', () => {
  it('should leave every option out when no flag is given', () => {
    expect(parseCoverageBadgeArguments([])).toEqual({});
  });

  it('should map every flag to its option', () => {
    expect(parseCoverageBadgeArguments(['--label=tests', '--lcov=a/lcov.info', '--metric=lowest', '--output=b.svg'])).toEqual({
      label: 'tests',
      lcovPath: 'a/lcov.info',
      metric: 'lowest',
      outputPath: 'b.svg'
    });
  });

  it('should refuse an unknown metric', () => {
    expect(() => parseCoverageBadgeArguments(['--metric=statements'])).toThrow('Unknown --metric \'statements\'');
  });

  it('should refuse an unknown flag', () => {
    expect(() => parseCoverageBadgeArguments(['--color=red'])).toThrow();
  });
});

describe('runCoverageBadgeCli', () => {
  let stdout = '';
  let stderr = '';

  beforeEach(() => {
    stdout = '';
    stderr = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((text) => {
      stdout += String(text);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((text) => {
      stderr += String(text);
      return true;
    });
    mockGenerateCoverageBadge.mockReset();
  });

  it('should write the badge and exit 0', async () => {
    mockGenerateCoverageBadge.mockResolvedValue({ outputPath: '/repo/coverage/coverage-badge.svg', percent: 97.5 });
    expect(await runCoverageBadgeCli(['--metric=branches'])).toBe(0);
    expect(mockGenerateCoverageBadge).toHaveBeenCalledWith({ metric: 'branches' });
    expect(stdout).toBe('Wrote the coverage badge (97.5%) to /repo/coverage/coverage-badge.svg\n');
  });

  it('should print a failure and exit 1', async () => {
    mockGenerateCoverageBadge.mockRejectedValue(new Error('No report.'));
    expect(await runCoverageBadgeCli([])).toBe(1);
    expect(stderr).toBe('No report.\n');
  });

  it('should print a thrown non-error and exit 1', async () => {
    mockGenerateCoverageBadge.mockRejectedValue('bare');
    expect(await runCoverageBadgeCli([])).toBe(1);
    expect(stderr).toBe('bare\n');
  });

  it('should exit 1 on a bad argument without generating anything', async () => {
    expect(await runCoverageBadgeCli(['--metric=bad'])).toBe(1);
    expect(mockGenerateCoverageBadge).not.toHaveBeenCalled();
  });
});
