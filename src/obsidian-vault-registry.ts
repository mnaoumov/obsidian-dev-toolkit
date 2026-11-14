/**
 * @file
 *
 * Reads the vaults the desktop Obsidian of this machine knows, from its `obsidian.json`. A development build uses it
 * to find the vault it deploys into when `OBSIDIAN_CONFIG_FOLDER` is not set, and to name the candidates when it
 * cannot choose one.
 *
 * Re-implemented after `packages/obsidian-utils/src/vault.ts` of `obsidian-tools` (MIT).
 */

import { join } from '@mnaoumov/typescript-lib/path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import process from 'node:process';

/**
 * A vault Obsidian knows, as its `obsidian.json` records it.
 */
export interface ObsidianVaultRegistryEntry {
  /**
   * The vault id, the key of the entry in `obsidian.json`.
   */
  readonly id: string;

  /**
   * Whether a window of the running Obsidian has the vault open.
   */
  readonly isOpen: boolean;

  /**
   * When the vault was last opened, in milliseconds since the epoch, or `0` when `obsidian.json` does not say.
   */
  readonly lastOpenedAt: number;

  /**
   * The vault's name as Obsidian and its CLI know it, which is the name of the vault's folder.
   */
  readonly name: string;

  /**
   * The absolute path of the vault folder.
   */
  readonly path: string;
}

/**
 * Options for the functions that read the registry.
 */
export interface ReadObsidianVaultRegistryOptions {
  /**
   * The folder holding `obsidian.json`. Defaults to the first of {@link getObsidianUserDataFolderCandidates} that
   * holds one.
   */
  readonly obsidianUserDataFolder?: string;
}

/**
 * The name of the file the desktop Obsidian keeps its vault list in.
 */
export const OBSIDIAN_VAULT_REGISTRY_FILE_NAME = 'obsidian.json';

/**
 * The folder a vault keeps its Obsidian configuration in, unless the vault changed it.
 */
// eslint-disable-next-line obsidianmd/hardcoded-config-path -- The build runs outside Obsidian, with no Vault#configDir to ask; the default folder is the one a vault found in obsidian.json uses.
export const DEFAULT_OBSIDIAN_VAULT_CONFIG_FOLDER_NAME = '.obsidian';

interface ObsidianJson {
  readonly vaults?: Readonly<Record<string, ObsidianJsonVaultEntry | undefined>>;
}

interface ObsidianJsonVaultEntry {
  readonly open?: boolean;
  readonly path?: string;
  readonly ts?: number;
}

/**
 * Formats a vault list for an error or warning message, one vault per line, the open ones marked.
 *
 * @param entries - The vaults.
 * @returns The list, or a line saying Obsidian knows no vault.
 */
export function formatObsidianVaultList(entries: readonly ObsidianVaultRegistryEntry[]): string {
  return entries.length === 0
    ? '  (Obsidian knows no vault on this machine)'
    : entries.map((entry) => `  - ${entry.name}: ${entry.path}${entry.isOpen ? ' (open)' : ''}`).join('\n');
}

/**
 * Lists the folders the desktop Obsidian may keep its user data, `obsidian.json` included, in, most likely first:
 * `%APPDATA%\obsidian` on Windows, `~/Library/Application Support/obsidian` on macOS, and on Linux
 * `$XDG_CONFIG_HOME/obsidian` (or `~/.config/obsidian`), then the Flatpak and Snap locations.
 *
 * @returns The candidate folders.
 */
export function getObsidianUserDataFolderCandidates(): readonly string[] {
  const home = homedir();
  switch (process.platform) {
    case 'darwin': {
      return [join(home, 'Library', 'Application Support', 'obsidian')];
    }
    case 'win32': {
      return [join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'obsidian')];
    }
    default: {
      return [
        join(process.env['XDG_CONFIG_HOME'] ?? join(home, '.config'), 'obsidian'),
        join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian'),
        join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian')
      ];
    }
  }
}

/**
 * Reads the vaults Obsidian knows, most recently opened first.
 *
 * @param options - The {@link ReadObsidianVaultRegistryOptions}.
 * @returns A {@link Promise} resolving to the vaults, empty when there is no `obsidian.json`.
 * @throws When `obsidian.json` exists and is not valid JSON.
 */
export async function readObsidianVaultRegistry(options: ReadObsidianVaultRegistryOptions = {}): Promise<readonly ObsidianVaultRegistryEntry[]> {
  const registryPath = findRegistryPath(options);
  if (registryPath === null) {
    return [];
  }

  let obsidianJson: ObsidianJson;
  try {
    obsidianJson = JSON.parse(await readFile(registryPath, 'utf-8')) as ObsidianJson;
  } catch (error) {
    throw new Error(`Could not read the Obsidian vault list from ${registryPath}`, { cause: error });
  }

  const entries: ObsidianVaultRegistryEntry[] = [];
  for (const [id, vault] of Object.entries(obsidianJson.vaults ?? {})) {
    if (typeof vault?.path !== 'string' || vault.path === '') {
      continue;
    }
    entries.push({
      id,
      isOpen: vault.open === true,
      lastOpenedAt: typeof vault.ts === 'number' ? vault.ts : 0,
      name: getFolderName(vault.path),
      path: vault.path
    });
  }

  return entries.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}

function findRegistryPath(options: ReadObsidianVaultRegistryOptions): null | string {
  const folders = options.obsidianUserDataFolder === undefined ? getObsidianUserDataFolderCandidates() : [options.obsidianUserDataFolder];
  for (const folder of folders) {
    const registryPath = join(folder, OBSIDIAN_VAULT_REGISTRY_FILE_NAME);
    if (existsSync(registryPath)) {
      return registryPath;
    }
  }
  return null;
}

function getFolderName(vaultPath: string): string {
  const segments = vaultPath.split(/[/\\]/).filter(Boolean);
  return segments.at(-1) ?? vaultPath;
}
