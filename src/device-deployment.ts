/**
 * @file
 *
 * Deploys a plugin build to Obsidian Mobile on an Android device connected over `adb`, for manual testing on a phone:
 * pushes the build into a vault's `.obsidian/plugins/<plugin id>/` folder on the device, enables the plugin there, and
 * restarts Obsidian on that vault so the new build is the one running.
 *
 * Obsidian Mobile has no CLI and runs no HotReload, so the reload is a restart of the app. The restart is also what
 * makes enabling a new plugin safe: `community-plugins.json` is edited while the app is stopped, so the app cannot
 * write its own copy over the edit.
 */

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { resolvePathFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';
import {
  basename,
  join,
  toPosixPath
} from '@mnaoumov/typescript-lib/path';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  readdir,
  readFile
} from 'node:fs/promises';

import { ObsidianPluginRepoPaths } from './obsidian-plugin-repo-paths.ts';

/**
 * Parameters for {@link deployToDevice}.
 */
export interface DeployToDeviceParams {
  /**
   * The Android application id of Obsidian. Defaults to {@link OBSIDIAN_MOBILE_APP_ID}.
   */
  readonly appId?: string;

  /**
   * The device to deploy to, as `adb devices` lists it. Defaults to the one device attached, and fails when there is
   * none or more than one.
   */
  readonly deviceId?: string;

  /**
   * The vault folder on the device, e.g. `/sdcard/Documents/My Vault`. Its folder name is the vault name Obsidian
   * opens.
   */
  readonly deviceVaultPath: string;

  /**
   * The folder holding the build to deploy, relative to the project root. Defaults to `dist/build`.
   */
  readonly distFolder?: string;

  /**
   * Whether to restart Obsidian on the vault once the build is pushed. Defaults to `true`. Without the restart the
   * pushed build runs only after Obsidian is restarted by hand, and a new plugin is not enabled.
   */
  readonly shouldRestart?: boolean;
}

/**
 * What {@link deployToDevice} did.
 */
export interface DeployToDeviceResult {
  /**
   * The device the build was pushed to.
   */
  readonly deviceId: string;

  /**
   * The names of the files pushed.
   */
  readonly fileNames: readonly string[];

  /**
   * The plugin folder on the device.
   */
  readonly pluginFolder: string;

  /**
   * The plugin id, from the build's `manifest.json`.
   */
  readonly pluginId: string;

  /**
   * Whether Obsidian was restarted on the vault.
   */
  readonly wasRestarted: boolean;
}

/**
 * The Android application id of Obsidian Mobile.
 */
export const OBSIDIAN_MOBILE_APP_ID = 'md.obsidian';

/**
 * The command `adb` is run as.
 */
export const ADB_COMMAND = 'adb';

interface BuildManifest {
  readonly id?: unknown;
}

const COMMUNITY_PLUGINS_JSON_FILE_NAME = 'community-plugins.json';
// eslint-disable-next-line obsidianmd/hardcoded-config-path -- A vault on a device is reached over adb, with no Vault#configDir to ask; Obsidian Mobile's default config folder is the one to deploy into.
const OBSIDIAN_CONFIG_FOLDER_NAME = '.obsidian';
const DEVICE_STATE = 'device';
const JSON_INDENT = 2;

/**
 * Adds a plugin id to the content of a `community-plugins.json`.
 *
 * @param content - The file content, or an empty string when the file does not exist.
 * @param pluginId - The plugin id.
 * @returns The new content, or `null` when the id is already listed.
 * @throws When the content is not a JSON array of strings.
 */
export function addPluginIdToCommunityPlugins(content: string, pluginId: string): null | string {
  const parsed: unknown = content.trim() === '' ? [] : JSON.parse(content);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${COMMUNITY_PLUGINS_JSON_FILE_NAME} on the device is not a JSON array of plugin ids.`);
  }

  return parsed.includes(pluginId) ? null : JSON.stringify([...parsed, pluginId], null, JSON_INDENT);
}

/**
 * Pushes a plugin build to a vault of Obsidian Mobile on an Android device and restarts Obsidian on that vault.
 *
 * The device's vault must already exist, so the vault is one Obsidian has opened at least once. A vault in Obsidian's
 * app-private storage is out of reach of `adb`; use a vault in shared storage, such as `/sdcard/Documents/<name>`.
 *
 * @param params - The {@link DeployToDeviceParams}.
 * @returns A {@link Promise} that resolves to the {@link DeployToDeviceResult}.
 * @throws When `adb` cannot be run, no single device can be chosen, the vault is not on the device, or the build has
 *   no `manifest.json`.
 */
export async function deployToDevice(params: DeployToDeviceParams): Promise<DeployToDeviceResult> {
  const appId = params.appId ?? OBSIDIAN_MOBILE_APP_ID;
  const shouldRestart = params.shouldRestart ?? true;
  const distFolderPath = params.distFolder ?? ObsidianPluginRepoPaths.DistBuild;
  const distFolder = toPosixPath(ensureNonNullable(resolvePathFromRoot({ path: distFolderPath }), `Could not resolve '${distFolderPath}' against the project root`));
  const deviceVaultPath = toPosixPath(params.deviceVaultPath).replace(/\/+$/, '');
  const pluginId = await readPluginId(distFolder);
  const distFileNames = await readdir(distFolder);
  const fileNames = distFileNames.filter((fileName) => fileName !== ObsidianPluginRepoPaths.HotReload as string).sort();
  const deviceId = params.deviceId ?? await resolveSingleDeviceId();

  const configFolder = `${deviceVaultPath}/${OBSIDIAN_CONFIG_FOLDER_NAME}`;
  if (!await isDeviceFolder(deviceId, configFolder)) {
    throw new Error(
      `No Obsidian vault at '${deviceVaultPath}' on device '${deviceId}': '${configFolder}' does not exist. Open the vault in Obsidian on the device once, and pass its folder in shared storage, such as /sdcard/Documents/<vault name>.`
    );
  }

  if (shouldRestart) {
    await runAdb(deviceId, ['shell', 'am', 'force-stop', appId]);
  }

  const pluginFolder = `${configFolder}/plugins/${pluginId}`;
  await runAdb(deviceId, ['shell', `mkdir -p ${quoteForDeviceShell(pluginFolder)}`]);
  for (const fileName of fileNames) {
    await runAdb(deviceId, ['push', join(distFolder, fileName), `${pluginFolder}/`]);
  }

  if (shouldRestart) {
    await enablePluginOnDevice(deviceId, `${configFolder}/${COMMUNITY_PLUGINS_JSON_FILE_NAME}`, pluginId);
    await runAdb(deviceId, [
      'shell',
      `am start -a android.intent.action.VIEW -d ${quoteForDeviceShell(`obsidian://open?vault=${encodeURIComponent(basename(deviceVaultPath))}`)} ${appId}`
    ]);
  }

  return {
    deviceId,
    fileNames,
    pluginFolder,
    pluginId,
    wasRestarted: shouldRestart
  };
}

/**
 * Picks the device id out of `adb devices` output when exactly one device is attached and ready.
 *
 * @param devicesOutput - What `adb devices` printed.
 * @returns The device id.
 * @throws When no device, or more than one, is ready.
 */
export function parseSingleDeviceId(devicesOutput: string): string {
  const deviceIds = devicesOutput
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === DEVICE_STATE)
    .map(([deviceId]) => ensureNonNullable(deviceId));

  const [deviceId, ...otherDeviceIds] = deviceIds;
  if (deviceId === undefined) {
    throw new Error('No Android device is attached and ready (`adb devices` lists none in the `device` state). Connect one with USB debugging on.');
  }

  if (otherDeviceIds.length > 0) {
    throw new Error(`More than one Android device is attached (${deviceIds.join(', ')}). Pick one with --device.`);
  }

  return deviceId;
}

/**
 * Quotes a string for the device's `sh`, in single quotes.
 *
 * @param value - The string to quote.
 * @returns The quoted string.
 */
export function quoteForDeviceShell(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}

async function enablePluginOnDevice(deviceId: string, communityPluginsPath: string, pluginId: string): Promise<void> {
  const quotedPath = quoteForDeviceShell(communityPluginsPath);
  const content = await runAdb(deviceId, ['shell', `cat ${quotedPath} 2>/dev/null || true`]);
  const newContent = addPluginIdToCommunityPlugins(content, pluginId);
  if (newContent === null) {
    return;
  }
  await runAdb(deviceId, ['shell', `cat > ${quotedPath}`], newContent);
}

async function isDeviceFolder(deviceId: string, folder: string): Promise<boolean> {
  const output = await runAdb(deviceId, ['shell', `test -d ${quoteForDeviceShell(folder)} && echo yes || echo no`]);
  return output.trim() === 'yes';
}

async function readPluginId(distFolder: string): Promise<string> {
  const manifestPath = join(distFolder, ObsidianPluginRepoPaths.ManifestJson);
  let manifestContent: string;
  try {
    manifestContent = await readFile(manifestPath, 'utf-8');
  } catch (error) {
    throw new Error(`No build to deploy: ${manifestPath} cannot be read. Build the plugin first.`, { cause: error });
  }

  const manifest = JSON.parse(manifestContent) as BuildManifest;
  if (typeof manifest.id !== 'string' || manifest.id === '') {
    throw new Error(`${manifestPath} has no plugin id.`);
  }
  return manifest.id;
}

async function resolveSingleDeviceId(): Promise<string> {
  return parseSingleDeviceId(await runAdbCommand([ADB_COMMAND, 'devices']));
}

async function runAdb(deviceId: string, adbArguments: readonly string[], stdin?: string): Promise<string> {
  return await runAdbCommand([ADB_COMMAND, '-s', deviceId, ...adbArguments], stdin);
}

async function runAdbCommand(command: readonly string[], stdin?: string): Promise<string> {
  let result;
  try {
    result = await exec([...command], {
      isQuiet: true,
      shouldIgnoreExitCode: true,
      shouldIncludeDetails: true,
      ...(stdin !== undefined && { stdin })
    });
  } catch (error) {
    throw new Error(`\`${ADB_COMMAND}\` could not be started. Install the Android SDK platform tools and put \`${ADB_COMMAND}\` on PATH.`, { cause: error });
  }

  if (result.exitCode !== 0) {
    const details = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n') || `exit code ${String(result.exitCode)}`;
    throw new Error(`\`${command.join(' ')}\` failed: ${details}`);
  }

  return result.stdout;
}
