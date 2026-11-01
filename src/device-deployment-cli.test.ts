import process from 'node:process';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  parseDeployToDeviceArguments,
  runDeployToDeviceCli
} from './device-deployment-cli.ts';

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- A device-side path the stubbed deployment reports back, not a lookup against a live vault.
const PLUGIN_FOLDER = '/v/.obsidian/plugins/p';

const { mockDeployToDevice } = vi.hoisted(() => ({
  mockDeployToDevice: vi.fn()
}));

vi.mock('./device-deployment.ts', () => ({
  deployToDevice: mockDeployToDevice
}));

describe('parseDeployToDeviceArguments', () => {
  it('should take the vault from --vault and leave every other option out', () => {
    expect(parseDeployToDeviceArguments(['--vault=/sdcard/Documents/V'], {})).toEqual({ deviceVaultPath: '/sdcard/Documents/V' });
  });

  it('should map every flag to its option', () => {
    expect(parseDeployToDeviceArguments(['--vault=/v', '--device=phone-1', '--dist=dist/dev', '--app-id=md.obsidian.beta', '--no-restart'], {})).toEqual({
      appId: 'md.obsidian.beta',
      deviceId: 'phone-1',
      deviceVaultPath: '/v',
      distFolder: 'dist/dev',
      shouldRestart: false
    });
  });

  it('should fall back to OBSIDIAN_DEVICE_VAULT_PATH', () => {
    expect(parseDeployToDeviceArguments([], { OBSIDIAN_DEVICE_VAULT_PATH: '/env/vault' })).toEqual({ deviceVaultPath: '/env/vault' });
  });

  it('should read process.env by default', () => {
    vi.stubEnv('OBSIDIAN_DEVICE_VAULT_PATH', '/process/vault');
    try {
      expect(parseDeployToDeviceArguments([])).toEqual({ deviceVaultPath: '/process/vault' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should refuse when no vault is given', () => {
    expect(() => parseDeployToDeviceArguments([], {})).toThrow('No vault on the device given');
  });

  it('should refuse an unknown flag', () => {
    expect(() => parseDeployToDeviceArguments(['--vault=/v', '--color=red'], {})).toThrow();
  });
});

describe('runDeployToDeviceCli', () => {
  let stdout = '';
  let stderr = '';

  beforeEach(() => {
    stdout = '';
    stderr = '';
    mockDeployToDevice.mockReset();
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });
  });

  it('should report a deployment with a restart and exit 0', async () => {
    mockDeployToDevice.mockResolvedValue({
      deviceId: 'phone-1',
      fileNames: ['main.js', 'manifest.json'],
      pluginFolder: PLUGIN_FOLDER,
      pluginId: 'p',
      wasRestarted: true
    });

    expect(await runDeployToDeviceCli(['--vault=/v'])).toBe(0);
    expect(stdout).toBe(`Deployed p (main.js, manifest.json) to ${PLUGIN_FOLDER} on phone-1, and restarted Obsidian.\n`);
  });

  it('should report a deployment without a restart', async () => {
    mockDeployToDevice.mockResolvedValue({
      deviceId: 'phone-1',
      fileNames: ['main.js'],
      pluginFolder: PLUGIN_FOLDER,
      pluginId: 'p',
      wasRestarted: false
    });

    expect(await runDeployToDeviceCli(['--vault=/v', '--no-restart'])).toBe(0);
    expect(stdout).toContain('without restarting Obsidian');
  });

  it('should print a failure and exit 1', async () => {
    mockDeployToDevice.mockRejectedValue(new Error('no device'));

    expect(await runDeployToDeviceCli(['--vault=/v'])).toBe(1);
    expect(stderr).toBe('no device\n');
  });

  it('should print a non-Error failure', async () => {
    mockDeployToDevice.mockRejectedValue('boom');

    expect(await runDeployToDeviceCli(['--vault=/v'])).toBe(1);
    expect(stderr).toBe('boom\n');
  });
});
