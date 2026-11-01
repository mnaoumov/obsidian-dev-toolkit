import type { ExecResult } from '@mnaoumov/typescript-dev-toolkit/exec';

import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  addPluginIdToCommunityPlugins,
  deployToDevice,
  parseSingleDeviceId,
  quoteForDeviceShell
} from './device-deployment.ts';

interface ResolvePathFromRootParams {
  readonly path: string;
}

const mocks = vi.hoisted(() => ({
  exec: vi.fn()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/exec', () => ({
  exec: mocks.exec
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  resolvePathFromRoot: ({ path }: ResolvePathFromRootParams): string => path
}));

const VAULT = '/sdcard/Documents/My Vault';
const PLUGIN_FOLDER = `${VAULT}/.obsidian/plugins/my-plugin`;
const COMMUNITY_PLUGINS = `'${VAULT}/.obsidian/community-plugins.json'`;

interface FakeDevice {
  readonly communityPlugins?: string;
  readonly devices?: string;
  readonly hasVault?: boolean;
}

function adbCalls(): string[] {
  return mocks.exec.mock.calls.map(([command]) => (command as string[]).join(' '));
}

function fakeDevice(device: FakeDevice = {}): void {
  mocks.exec.mockImplementation((command: string[]): ExecResult => {
    const joined = command.join(' ');
    if (joined === 'adb devices') {
      return result(device.devices ?? 'List of devices attached\nphone-1\tdevice\n');
    }
    if (joined.includes('test -d')) {
      return result(device.hasVault === false ? 'no\n' : 'yes\n');
    }
    if (joined.includes(`cat ${COMMUNITY_PLUGINS} 2>/dev/null`)) {
      return result(device.communityPlugins ?? '');
    }
    return result('');
  });
}

function result(stdout: string, exitCode: null | number = 0, stderr = ''): ExecResult {
  return { exitCode, exitSignal: null, stderr, stdout };
}

describe('deployToDevice', () => {
  let distFolder = '';

  beforeEach(async () => {
    mocks.exec.mockReset();
    distFolder = await mkdtemp(join(tmpdir(), 'device-deployment-'));
    await writeFile(join(distFolder, 'manifest.json'), JSON.stringify({ id: 'my-plugin' }));
    await writeFile(join(distFolder, 'main.js'), '');
    await writeFile(join(distFolder, 'styles.css'), '');
    await writeFile(join(distFolder, '.hotreload'), '');
  });

  afterEach(async () => {
    await rm(distFolder, { force: true, recursive: true });
  });

  it('should push the build, enable the plugin and restart Obsidian on the vault', async () => {
    fakeDevice({ communityPlugins: '["other"]' });

    const deployResult = await deployToDevice({ deviceVaultPath: `${VAULT}/`, distFolder });

    expect(deployResult).toEqual({
      deviceId: 'phone-1',
      fileNames: ['main.js', 'manifest.json', 'styles.css'],
      pluginFolder: PLUGIN_FOLDER,
      pluginId: 'my-plugin',
      wasRestarted: true
    });
    const posixDistFolder = distFolder.replaceAll('\\', '/');
    expect(adbCalls()).toEqual([
      'adb devices',
      `adb -s phone-1 shell test -d '${VAULT}/.obsidian' && echo yes || echo no`,
      'adb -s phone-1 shell am force-stop md.obsidian',
      `adb -s phone-1 shell mkdir -p '${PLUGIN_FOLDER}'`,
      `adb -s phone-1 push ${posixDistFolder}/main.js ${PLUGIN_FOLDER}/`,
      `adb -s phone-1 push ${posixDistFolder}/manifest.json ${PLUGIN_FOLDER}/`,
      `adb -s phone-1 push ${posixDistFolder}/styles.css ${PLUGIN_FOLDER}/`,
      `adb -s phone-1 shell cat ${COMMUNITY_PLUGINS} 2>/dev/null || true`,
      `adb -s phone-1 shell cat > ${COMMUNITY_PLUGINS}`,
      'adb -s phone-1 shell am start -a android.intent.action.VIEW -d \'obsidian://open?vault=My%20Vault\' md.obsidian'
    ]);
    expect(mocks.exec.mock.calls[8]?.[1]).toMatchObject({ stdin: JSON.stringify(['other', 'my-plugin'], null, 2) });
  });

  it('should leave community-plugins.json alone when the plugin is already enabled', async () => {
    fakeDevice({ communityPlugins: '["my-plugin"]' });

    await deployToDevice({ appId: 'md.obsidian.beta', deviceId: 'phone-2', deviceVaultPath: VAULT, distFolder });

    expect(adbCalls()).not.toContain(`adb -s phone-2 shell cat > ${COMMUNITY_PLUGINS}`);
    expect(adbCalls()).not.toContain('adb devices');
    expect(adbCalls()).toContain('adb -s phone-2 shell am force-stop md.obsidian.beta');
  });

  it('should only push the build when told not to restart', async () => {
    fakeDevice();

    const deployResult = await deployToDevice({ deviceVaultPath: VAULT, distFolder, shouldRestart: false });

    expect(deployResult.wasRestarted).toBe(false);
    expect(adbCalls().some((call) => call.includes(' am '))).toBe(false);
    expect(adbCalls().some((call) => call.includes('community-plugins.json'))).toBe(false);
  });

  it('should default to dist/build', async () => {
    fakeDevice();

    await expect(deployToDevice({ deviceVaultPath: VAULT })).rejects.toThrow('No build to deploy: dist/build/manifest.json cannot be read');
  });

  it('should refuse a vault that is not on the device', async () => {
    fakeDevice({ hasVault: false });

    await expect(deployToDevice({ deviceVaultPath: VAULT, distFolder })).rejects.toThrow(`No Obsidian vault at '${VAULT}' on device 'phone-1'`);
  });

  it('should refuse a manifest without an id', async () => {
    await writeFile(join(distFolder, 'manifest.json'), '{"name":"My Plugin"}');

    await expect(deployToDevice({ deviceVaultPath: VAULT, distFolder })).rejects.toThrow('has no plugin id');
  });

  it('should refuse a manifest with an empty id', async () => {
    await writeFile(join(distFolder, 'manifest.json'), JSON.stringify({ id: '' }));

    await expect(deployToDevice({ deviceVaultPath: VAULT, distFolder })).rejects.toThrow('has no plugin id');
  });

  it('should explain when adb cannot be started', async () => {
    mocks.exec.mockRejectedValue(new Error('spawn adb ENOENT'));

    await expect(deployToDevice({ deviceVaultPath: VAULT, distFolder })).rejects.toThrow('`adb` could not be started');
  });

  it('should report a failed adb command with its output', async () => {
    mocks.exec.mockResolvedValue(result('', 1, 'error: device offline'));

    await expect(deployToDevice({ deviceId: 'phone-1', deviceVaultPath: VAULT, distFolder })).rejects.toThrow('failed: error: device offline');
  });

  it('should report a failed adb command with no output by its exit code', async () => {
    mocks.exec.mockResolvedValue(result('', null));

    await expect(deployToDevice({ deviceId: 'phone-1', deviceVaultPath: VAULT, distFolder })).rejects.toThrow('failed: exit code null');
  });

  it('should push a subfolder of the build as a whole', async () => {
    await mkdir(join(distFolder, 'assets'));
    fakeDevice();

    const deployResult = await deployToDevice({ deviceVaultPath: VAULT, distFolder, shouldRestart: false });

    expect(deployResult.fileNames).toContain('assets');
  });
});

describe('parseSingleDeviceId', () => {
  it('should pick the one ready device', () => {
    expect(parseSingleDeviceId('List of devices attached\r\nemulator-5554\toffline\r\nphone-1\tdevice\r\n\r\n')).toBe('phone-1');
  });

  it('should refuse when no device is ready', () => {
    expect(() => parseSingleDeviceId('List of devices attached\nphone-1\tunauthorized\n')).toThrow('No Android device is attached and ready');
  });

  it('should refuse when several devices are ready', () => {
    expect(() => parseSingleDeviceId('List of devices attached\nphone-1\tdevice\nphone-2\tdevice\n')).toThrow('More than one Android device is attached (phone-1, phone-2)');
  });
});

describe('quoteForDeviceShell', () => {
  it('should single-quote a value and escape its single quotes', () => {
    expect(quoteForDeviceShell('it\'s here')).toBe('\'it\'\\\'\'s here\'');
  });
});

describe('addPluginIdToCommunityPlugins', () => {
  it('should start a list when the file does not exist', () => {
    expect(addPluginIdToCommunityPlugins('\n', 'my-plugin')).toBe('[\n  "my-plugin"\n]');
  });

  it('should leave a list that already has the id', () => {
    expect(addPluginIdToCommunityPlugins('["my-plugin"]', 'my-plugin')).toBeNull();
  });

  it('should refuse content that is not a list of ids', () => {
    expect(() => addPluginIdToCommunityPlugins('{"my-plugin":true}', 'my-plugin')).toThrow('is not a JSON array of plugin ids');
    expect(() => addPluginIdToCommunityPlugins('[1]', 'my-plugin')).toThrow('is not a JSON array of plugin ids');
  });
});
