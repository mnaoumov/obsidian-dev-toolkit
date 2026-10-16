/**
 * @file
 *
 * The `archive-demo-vault` command: runs {@link archivePluginDemoVault} on the built plugin and turns the result into
 * an exit code. The `obsidian-plugin-release.yml` reusable workflow runs it after the build, so a release made in CI
 * carries the same demo vault archive as one made with `npm run version`.
 */

import process from 'node:process';

import { archivePluginDemoVault } from './demo-vault.ts';

/**
 * Runs `archive-demo-vault`. A plugin without a `demo-vault/` folder is not a failure: there is nothing to archive.
 *
 * @returns A {@link Promise} that resolves to the exit code: `0` once the archive is written or when there is no demo
 *   vault, `1` on any failure, which is printed to stderr.
 */
export async function runArchiveDemoVaultCli(): Promise<number> {
  try {
    const zipPath = await archivePluginDemoVault();
    process.stdout.write(zipPath === null ? 'No demo-vault/ folder: nothing to archive.\n' : `Archived the demo vault to ${zipPath}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
