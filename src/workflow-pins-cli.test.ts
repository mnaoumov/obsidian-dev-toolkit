import process from 'node:process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { runUpdateWorkflowPinsCli } from './workflow-pins-cli.ts';

const { mockUpdateWorkflowPins } = vi.hoisted(() => ({ mockUpdateWorkflowPins: vi.fn() }));

vi.mock('./workflow-pins.ts', () => ({ updateWorkflowPins: mockUpdateWorkflowPins }));

describe('runUpdateWorkflowPinsCli', () => {
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
    mockUpdateWorkflowPins.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should say when nothing changes', async () => {
    mockUpdateWorkflowPins.mockResolvedValue({ changes: [], version: '13.0.0' });
    expect(await runUpdateWorkflowPinsCli([])).toBe(0);
    expect(mockUpdateWorkflowPins).toHaveBeenCalledWith({ isDryRun: false });
    expect(stdout.join('')).toBe('Every workflow pin is already at 13.0.0; nothing to change.\n');
  });

  it('should print the changed lines, for a write and for a dry run', async () => {
    mockUpdateWorkflowPins.mockResolvedValue({ changes: [{ file: 'ci.yml', lines: ['2: a -> b'] }], version: '12.0.0' });
    expect(await runUpdateWorkflowPinsCli([])).toBe(0);
    expect(stdout.join('')).toBe('ci.yml\n  2: a -> b\nMoved the workflow pins of 1 file(s) to 12.0.0. Nothing was committed: review the diff and commit it.\n');

    stdout.length = 0;
    expect(await runUpdateWorkflowPinsCli(['--dry-run', '--version=12.0.0'])).toBe(0);
    expect(mockUpdateWorkflowPins).toHaveBeenLastCalledWith({ isDryRun: true, version: '12.0.0' });
    expect(stdout.join('')).toContain('Dry run: nothing was written. Without --dry-run, 1 workflow file(s) move to 12.0.0.\n');
  });

  it('should print a failure to stderr', async () => {
    mockUpdateWorkflowPins.mockRejectedValue(new Error('boom'));
    expect(await runUpdateWorkflowPinsCli([])).toBe(1);
    mockUpdateWorkflowPins.mockRejectedValue('plain');
    expect(await runUpdateWorkflowPinsCli([])).toBe(1);
    expect(stderr).toEqual(['boom\n', 'plain\n']);
  });
});
