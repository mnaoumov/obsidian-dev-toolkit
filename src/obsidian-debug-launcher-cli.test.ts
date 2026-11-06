/**
 * @file
 *
 * Verifies the `start-obsidian-for-debugging` command line.
 */

import process from 'node:process';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  parseStartObsidianForDebuggingArguments,
  runStartObsidianForDebuggingCli
} from './obsidian-debug-launcher-cli.ts';
import { startObsidianForDebugging } from './obsidian-debug-launcher.ts';

vi.mock('./obsidian-debug-launcher.ts', () => ({ startObsidianForDebugging: vi.fn() }));

describe('parseStartObsidianForDebuggingArguments', () => {
  it('should default every option', () => {
    expect(parseStartObsidianForDebuggingArguments([])).toEqual({});
  });

  it('should read the port, the executable and the arguments after the separator', () => {
    expect(parseStartObsidianForDebuggingArguments(['--port=9333', '--executable=/opt/obsidian', '--', '--disable-gpu', 'x'])).toEqual({
      executablePath: '/opt/obsidian',
      extraArguments: ['--disable-gpu', 'x'],
      port: 9333
    });
  });

  it('should ignore an empty argument list after the separator', () => {
    expect(parseStartObsidianForDebuggingArguments(['--'])).toEqual({});
  });

  it('should refuse unknown arguments', () => {
    expect(() => parseStartObsidianForDebuggingArguments(['--vault=x'])).toThrow();
  });
});

describe('runStartObsidianForDebuggingCli', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('should report the started executable and its endpoint', async () => {
    vi.mocked(startObsidianForDebugging).mockResolvedValue({
      executablePath: '/opt/obsidian',
      port: 9333,
      userAgent: 'obsidian/1.15.0',
      wasAlreadyListening: false
    });
    expect(await runStartObsidianForDebuggingCli(['--port=9333'])).toBe(0);
    expect(startObsidianForDebugging).toHaveBeenCalledWith({ port: 9333 });
    expect(process.stdout.write).toHaveBeenCalledWith('Started /opt/obsidian; its renderer is listening for a debugger at http://127.0.0.1:9333.\n');
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('attach your IDE'));
  });

  it('should say when nothing was started', async () => {
    vi.mocked(startObsidianForDebugging).mockResolvedValue({
      executablePath: undefined,
      port: 9222,
      userAgent: 'obsidian/1.15.0',
      wasAlreadyListening: true
    });
    expect(await runStartObsidianForDebuggingCli([])).toBe(0);
    expect(process.stdout.write).toHaveBeenCalledWith(
      'Obsidian is already listening for a debugger at http://127.0.0.1:9222 (obsidian/1.15.0); nothing was started.\n'
    );
  });

  it('should print a failure and exit with 1', async () => {
    vi.mocked(startObsidianForDebugging).mockRejectedValue(new Error('Obsidian exited'));
    expect(await runStartObsidianForDebuggingCli([])).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith('Obsidian exited\n');
  });

  it('should print a non-Error failure', async () => {
    vi.mocked(startObsidianForDebugging).mockRejectedValue('denied');
    expect(await runStartObsidianForDebuggingCli([])).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith('denied\n');
  });

  it('should refuse an unknown argument', async () => {
    expect(await runStartObsidianForDebuggingCli(['--force'])).toBe(1);
    expect(startObsidianForDebugging).not.toHaveBeenCalled();
  });
});
