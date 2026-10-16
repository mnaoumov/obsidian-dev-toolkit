import process from 'node:process';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { runArchiveDemoVaultCli } from './demo-vault-cli.ts';

const { mockArchivePluginDemoVault } = vi.hoisted(() => ({
  mockArchivePluginDemoVault: vi.fn<() => Promise<null | string>>()
}));

vi.mock('./demo-vault.ts', () => ({
  archivePluginDemoVault: mockArchivePluginDemoVault
}));

describe('runArchiveDemoVaultCli', () => {
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
  });

  it('should archive the demo vault and exit 0', async () => {
    mockArchivePluginDemoVault.mockResolvedValue('/repo/dist/build/sample-demo-vault.zip');
    expect(await runArchiveDemoVaultCli()).toBe(0);
    expect(stdout).toBe('Archived the demo vault to /repo/dist/build/sample-demo-vault.zip\n');
  });

  it('should exit 0 when there is no demo vault', async () => {
    mockArchivePluginDemoVault.mockResolvedValue(null);
    expect(await runArchiveDemoVaultCli()).toBe(0);
    expect(stdout).toBe('No demo-vault/ folder: nothing to archive.\n');
  });

  it('should print a failure and exit 1', async () => {
    mockArchivePluginDemoVault.mockRejectedValue(new Error('No manifest.'));
    expect(await runArchiveDemoVaultCli()).toBe(1);
    expect(stderr).toBe('No manifest.\n');
  });

  it('should print a thrown non-error and exit 1', async () => {
    mockArchivePluginDemoVault.mockRejectedValue('bare');
    expect(await runArchiveDemoVaultCli()).toBe(1);
    expect(stderr).toBe('bare\n');
  });
});
