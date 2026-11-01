/**
 * @file
 *
 * The `deploy-to-device` command: reads its arguments, runs {@link deployToDevice} and turns the result into an exit
 * code. A plugin runs it after `npm run build` to try the build on a phone.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import type { DeployToDeviceParams } from './device-deployment.ts';

import { deployToDevice } from './device-deployment.ts';

/**
 * The environment variable read when `--vault` is not given.
 */
export const OBSIDIAN_DEVICE_VAULT_PATH_ENV_NAME = 'OBSIDIAN_DEVICE_VAULT_PATH';

/**
 * Parses the command line of `deploy-to-device`: `--vault=<device path>` (or the
 * {@link OBSIDIAN_DEVICE_VAULT_PATH_ENV_NAME} environment variable), and the optional `--device=<id>`,
 * `--dist=<folder>`, `--app-id=<id>` and `--no-restart`.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @param env - The environment to read {@link OBSIDIAN_DEVICE_VAULT_PATH_ENV_NAME} from.
 * @returns The {@link DeployToDeviceParams}.
 * @throws When an argument is unknown, or no vault is given.
 */
export function parseDeployToDeviceArguments($arguments: string[], env: NodeJS.ProcessEnv = process.env): DeployToDeviceParams {
  const { values } = parseArgs({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
    args: $arguments,
    options: {
      'app-id': { type: 'string' },
      'device': { type: 'string' },
      'dist': { type: 'string' },
      'no-restart': { type: 'boolean' },
      'vault': { type: 'string' }
    }
  });

  const deviceVaultPath = values.vault ?? env[OBSIDIAN_DEVICE_VAULT_PATH_ENV_NAME];
  if (!deviceVaultPath) {
    throw new Error(
      `No vault on the device given. Pass --vault=<folder on the device>, such as --vault=/sdcard/Documents/MyVault, or set ${OBSIDIAN_DEVICE_VAULT_PATH_ENV_NAME}.`
    );
  }

  return {
    deviceVaultPath,
    ...(values['app-id'] !== undefined && { appId: values['app-id'] }),
    ...(values.device !== undefined && { deviceId: values.device }),
    ...(values.dist !== undefined && { distFolder: values.dist }),
    ...(values['no-restart'] === true && { shouldRestart: false })
  };
}

/**
 * Runs `deploy-to-device`.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns A {@link Promise} that resolves to the exit code: `0` once the build is deployed, `1` on any failure, which
 *   is printed to stderr.
 */
export async function runDeployToDeviceCli($arguments: string[]): Promise<number> {
  try {
    const result = await deployToDevice(parseDeployToDeviceArguments($arguments));
    const restartNote = result.wasRestarted ? 'and restarted Obsidian' : 'without restarting Obsidian';
    process.stdout.write(
      `Deployed ${result.pluginId} (${result.fileNames.join(', ')}) to ${result.pluginFolder} on ${result.deviceId}, ${restartNote}.\n`
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
