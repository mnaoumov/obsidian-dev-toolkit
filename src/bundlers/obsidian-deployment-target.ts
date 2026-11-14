/**
 * @file
 *
 * Decides which Obsidian configuration folder a development build is deployed into. An explicit folder
 * (`obsidianConfigFolder`, or `OBSIDIAN_CONFIG_FOLDER`) always wins. Without one, `reload: 'obsidian-cli'` deploys
 * into the one vault the running Obsidian has open, read from its `obsidian.json`; the other reloads open their own
 * Obsidian instance on the configured vault, so they need it named, and they skip the deployment with a warning that
 * lists the vaults Obsidian knows.
 */

import { join } from '@mnaoumov/typescript-lib/path';

import type { ReadObsidianVaultRegistryOptions } from '../obsidian-vault-registry.ts';
import type { ObsidianPluginReload } from './obsidian-plugin-build.ts';

import {
  DEFAULT_OBSIDIAN_VAULT_CONFIG_FOLDER_NAME,
  formatObsidianVaultList,
  readObsidianVaultRegistry
} from '../obsidian-vault-registry.ts';

/**
 * Parameters for {@link resolveObsidianDeploymentConfigFolder}.
 */
export interface ResolveObsidianDeploymentConfigFolderParams extends ReadObsidianVaultRegistryOptions {
  /**
   * The configured Obsidian configuration folder, or an empty string when none is configured.
   */
  readonly obsidianConfigFolder: string;

  /**
   * How the deployed build is reloaded.
   */
  readonly reload: ObsidianPluginReload;

  /**
   * Reports why the deployment is skipped. Defaults to `console.warn`.
   */
  readonly warn?: (message: string) => void;
}

const SET_CONFIG_FOLDER_HINT = 'Set `OBSIDIAN_CONFIG_FOLDER` (in the environment or in the project\'s `.env` file) to the '
  + `\`${DEFAULT_OBSIDIAN_VAULT_CONFIG_FOLDER_NAME}\` folder of the vault to deploy into, or pass \`obsidianConfigFolder\` to the builder.`;

/**
 * Resolves the Obsidian configuration folder a development build is deployed into.
 *
 * @param params - The {@link ResolveObsidianDeploymentConfigFolderParams}.
 * @returns A {@link Promise} resolving to the folder, or `null` when the deployment is skipped, which it reports
 * through `warn`.
 * @throws For `reload: 'obsidian-cli'` with no folder configured, when the running Obsidian has no vault open, or
 * several, naming the vaults it knows.
 */
export async function resolveObsidianDeploymentConfigFolder(params: ResolveObsidianDeploymentConfigFolderParams): Promise<null | string> {
  if (params.obsidianConfigFolder) {
    return params.obsidianConfigFolder;
  }

  const vaults = await readObsidianVaultRegistry(params);

  if (params.reload !== 'obsidian-cli') {
    const warn = params.warn ?? console.warn;
    warn(
      `The development build is not deployed into any vault: no Obsidian config folder is configured.\n${SET_CONFIG_FOLDER_HINT}\n`
        + `Vaults Obsidian knows:\n${formatObsidianVaultList(vaults)}`
    );
    return null;
  }

  const openVaults = vaults.filter((vault) => vault.isOpen);
  const [openVault] = openVaults;
  if (openVault !== undefined && openVaults.length === 1) {
    return join(openVault.path, DEFAULT_OBSIDIAN_VAULT_CONFIG_FOLDER_NAME);
  }

  const reason = openVault === undefined ? 'Obsidian has no vault open' : `Obsidian has ${String(openVaults.length)} vaults open`;
  throw new Error(
    `\`reload: 'obsidian-cli'\` deploys into the vault the running Obsidian has open when no Obsidian config folder is configured, but ${reason}.\n`
      + `${SET_CONFIG_FOLDER_HINT}\nVaults Obsidian knows:\n${formatObsidianVaultList(vaults)}`
  );
}
