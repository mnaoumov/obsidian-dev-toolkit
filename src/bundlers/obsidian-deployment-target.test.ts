import { join } from '@mnaoumov/typescript-lib/path';
import {
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { resolveObsidianDeploymentConfigFolder } from './obsidian-deployment-target.ts';

interface VaultJson {
  readonly open?: boolean;
  readonly path: string;
  readonly ts: number;
}

describe('resolveObsidianDeploymentConfigFolder', () => {
  let folder = '';

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'obsidian-deployment-target-'));
  });

  afterEach(() => {
    rmSync(folder, { force: true, recursive: true });
  });

  function writeVaults(vaults: Record<string, VaultJson>): void {
    writeFileSync(join(folder, 'obsidian.json'), JSON.stringify({ vaults }));
  }

  it('keeps a configured folder, whatever the reload, without reading obsidian.json', async () => {
    writeFileSync(join(folder, 'obsidian.json'), '{ not json');
    const warn = vi.fn();

    for (const reload of ['hot-reload-plugin', 'obsidian-cli', false] as const) {
      await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '/v/Mine/.obsidian', obsidianUserDataFolder: folder, reload, warn }))
        .resolves.toBe('/v/Mine/.obsidian');
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('deploys into the one open vault for obsidian-cli', async () => {
    writeVaults({ a: { path: '/v/Other', ts: 2 }, b: { open: true, path: '/v/Open', ts: 1 } });

    await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload: 'obsidian-cli' }))
      .resolves.toBe(join('/v/Open', '.obsidian'));
  });

  it('fails for obsidian-cli when no vault is open, listing the vaults', async () => {
    writeVaults({ a: { path: '/v/Closed', ts: 1 } });

    await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload: 'obsidian-cli' }))
      .rejects.toThrow(/Obsidian has no vault open\.\n.*OBSIDIAN_CONFIG_FOLDER.*\nVaults Obsidian knows:\n {2}- Closed: \/v\/Closed$/s);
  });

  it('fails for obsidian-cli when several vaults are open, rather than guessing', async () => {
    writeVaults({ a: { open: true, path: '/v/One', ts: 2 }, b: { open: true, path: '/v/Two', ts: 1 } });

    await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload: 'obsidian-cli' }))
      .rejects.toThrow('Obsidian has 2 vaults open.');
  });

  it('fails for obsidian-cli when Obsidian knows no vault', async () => {
    await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload: 'obsidian-cli' }))
      .rejects.toThrow('(Obsidian knows no vault on this machine)');
  });

  it('skips with a warning listing the vaults for the other reloads, even with a vault open', async () => {
    writeVaults({ a: { open: true, path: '/v/Open', ts: 1 } });

    for (const reload of ['hot-reload-plugin', false] as const) {
      const warn = vi.fn();
      await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload, warn })).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not deployed into any vault.*OBSIDIAN_CONFIG_FOLDER.*- Open: \/v\/Open \(open\)/s));
    }
  });

  it('warns through console.warn by default', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(resolveObsidianDeploymentConfigFolder({ obsidianConfigFolder: '', obsidianUserDataFolder: folder, reload: false })).resolves.toBeNull();
      expect(consoleWarn).toHaveBeenCalledTimes(1);
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
