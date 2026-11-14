import { join } from '@mnaoumov/typescript-lib/path';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import {
  homedir,
  tmpdir
} from 'node:os';
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
  formatObsidianVaultList,
  getObsidianUserDataFolderCandidates,
  readObsidianVaultRegistry
} from './obsidian-vault-registry.ts';

describe('obsidian-vault-registry', () => {
  let folder = '';
  const originalPlatform = process.platform;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'obsidian-vault-registry-'));
  });

  afterEach(() => {
    rmSync(folder, { force: true, recursive: true });
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
  });

  function writeRegistry(content: string): void {
    writeFileSync(join(folder, 'obsidian.json'), content);
  }

  describe('readObsidianVaultRegistry', () => {
    it('returns no vault when there is no obsidian.json', async () => {
      await expect(readObsidianVaultRegistry({ obsidianUserDataFolder: folder })).resolves.toEqual([]);
    });

    it('reads the vaults, most recently opened first, skipping entries without a path', async () => {
      writeRegistry(JSON.stringify({
        cli: true,
        vaults: {
          a: { path: 'C:\\Vaults\\Old', ts: 1 },
          b: { open: true, path: '/home/me/Notes/', ts: 3 },
          c: { path: '/home/me/NoTimestamp' },
          d: { ts: 5 },
          emptyPath: { path: '', ts: 6 },
          f: null
        }
      }));

      await expect(readObsidianVaultRegistry({ obsidianUserDataFolder: folder })).resolves.toEqual([
        { id: 'b', isOpen: true, lastOpenedAt: 3, name: 'Notes', path: '/home/me/Notes/' },
        { id: 'a', isOpen: false, lastOpenedAt: 1, name: 'Old', path: 'C:\\Vaults\\Old' },
        { id: 'c', isOpen: false, lastOpenedAt: 0, name: 'NoTimestamp', path: '/home/me/NoTimestamp' }
      ]);
    });

    it('names a root path by the path itself', async () => {
      writeRegistry(JSON.stringify({ vaults: { a: { path: '/', ts: 1 } } }));

      const [vault] = await readObsidianVaultRegistry({ obsidianUserDataFolder: folder });

      expect(vault?.name).toBe('/');
    });

    it('returns no vault when obsidian.json has no vault list', async () => {
      writeRegistry('{}');

      await expect(readObsidianVaultRegistry({ obsidianUserDataFolder: folder })).resolves.toEqual([]);
    });

    it('fails on an obsidian.json that is not JSON, naming the file', async () => {
      writeRegistry('{ not json');

      await expect(readObsidianVaultRegistry({ obsidianUserDataFolder: folder })).rejects.toThrow(
        `Could not read the Obsidian vault list from ${join(folder, 'obsidian.json')}`
      );
    });

    it('reads the first candidate folder that holds obsidian.json by default', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('APPDATA', folder);
      const userDataFolder = join(folder, 'obsidian');
      mkdirSync(userDataFolder);
      writeFileSync(join(userDataFolder, 'obsidian.json'), JSON.stringify({ vaults: { a: { open: true, path: '/v/Mine', ts: 1 } } }));

      await expect(readObsidianVaultRegistry()).resolves.toEqual([
        { id: 'a', isOpen: true, lastOpenedAt: 1, name: 'Mine', path: '/v/Mine' }
      ]);
    });
  });

  describe('getObsidianUserDataFolderCandidates', () => {
    it('uses APPDATA on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('APPDATA', '/app-data');

      expect(getObsidianUserDataFolderCandidates()).toEqual([join('/app-data', 'obsidian')]);
    });

    it('falls back to AppData/Roaming on Windows without APPDATA', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('APPDATA', undefined);

      expect(getObsidianUserDataFolderCandidates()).toEqual([join(homedir(), 'AppData', 'Roaming', 'obsidian')]);
    });

    it('uses Application Support on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(getObsidianUserDataFolderCandidates()).toEqual([join(homedir(), 'Library', 'Application Support', 'obsidian')]);
    });

    it('uses XDG_CONFIG_HOME, then Flatpak and Snap, on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.stubEnv('XDG_CONFIG_HOME', '/xdg');

      expect(getObsidianUserDataFolderCandidates()).toEqual([
        join('/xdg', 'obsidian'),
        join(homedir(), '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian'),
        join(homedir(), 'snap', 'obsidian', 'current', '.config', 'obsidian')
      ]);
    });

    it('falls back to ~/.config on Linux without XDG_CONFIG_HOME', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.stubEnv('XDG_CONFIG_HOME', undefined);

      expect(getObsidianUserDataFolderCandidates()[0]).toBe(join(homedir(), '.config', 'obsidian'));
    });
  });

  describe('formatObsidianVaultList', () => {
    it('lists each vault on its own line, marking the open ones', () => {
      expect(formatObsidianVaultList([
        { id: 'a', isOpen: true, lastOpenedAt: 2, name: 'Work', path: '/v/Work' },
        { id: 'b', isOpen: false, lastOpenedAt: 1, name: 'Home', path: '/v/Home' }
      ])).toBe('  - Work: /v/Work (open)\n  - Home: /v/Home');
    });

    it('says so when Obsidian knows no vault', () => {
      expect(formatObsidianVaultList([])).toBe('  (Obsidian knows no vault on this machine)');
    });
  });
});
