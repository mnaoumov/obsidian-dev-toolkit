/**
 * @file
 *
 * Verifies the Obsidian debugger configuration workflow.
 */

import { readPackageJson } from '@mnaoumov/typescript-dev-toolkit/npm';
import {
  mkdir,
  writeFile
} from 'node:fs/promises';
import process from 'node:process';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { runGenerateVsCodeDebugConfigCli } from './vscode-debug-config-cli.ts';

vi.mock('@mnaoumov/typescript-dev-toolkit/npm', () => ({ readPackageJson: vi.fn() }));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));

describe('runGenerateVsCodeDebugConfigCli', () => {
  beforeEach(() => {
    vi.mocked(readPackageJson).mockResolvedValue({ name: '@example/plugin' });
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('should create a launch file using the package name and the default port', async () => {
    expect(await runGenerateVsCodeDebugConfigCli([])).toBe(0);
    expect(mkdir).toHaveBeenCalledWith('.vscode', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('.vscode/launch.json', expect.stringContaining('plugin:@example/plugin/*'), { flag: 'wx' });
    expect(writeFile).toHaveBeenCalledWith('.vscode/launch.json', expect.stringContaining('"port": 9222'), { flag: 'wx' });
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Created .vscode/launch.json'));
  });

  it('should accept an explicit port', async () => {
    expect(await runGenerateVsCodeDebugConfigCli(['--port=9333'])).toBe(0);
    expect(writeFile).toHaveBeenCalledWith('.vscode/launch.json', expect.stringContaining('"port": 9333'), { flag: 'wx' });
    expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('npx start-obsidian-for-debugging --port=9333'));
  });

  it('should preserve existing settings when exclusive creation fails', async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error('EEXIST: launch.json already exists'));
    expect(await runGenerateVsCodeDebugConfigCli([])).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith('EEXIST: launch.json already exists\n');
  });

  it('should refuse a missing package name before writing files', async () => {
    vi.mocked(readPackageJson).mockResolvedValue({});
    expect(await runGenerateVsCodeDebugConfigCli([])).toBe(1);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('should refuse an invalid port before writing files', async () => {
    expect(await runGenerateVsCodeDebugConfigCli(['--port=abc'])).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should refuse unknown arguments', async () => {
    expect(await runGenerateVsCodeDebugConfigCli(['--force'])).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('should report a missing package file', async () => {
    vi.mocked(readPackageJson).mockRejectedValue(new Error('package.json missing'));
    expect(await runGenerateVsCodeDebugConfigCli([])).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith('package.json missing\n');
  });

  it('should report a non-Error failure', async () => {
    vi.mocked(mkdir).mockRejectedValue('permission denied');
    expect(await runGenerateVsCodeDebugConfigCli([])).toBe(1);
    expect(process.stderr.write).toHaveBeenCalledWith('permission denied\n');
  });
});
