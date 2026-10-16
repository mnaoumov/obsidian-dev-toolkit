/**
 * @file
 *
 * Reloads a deployed development build through the Obsidian CLI (`obsidian`, Obsidian 1.12 and later), in the
 * Obsidian the developer already has open. It is the `reload: 'obsidian-cli'` half of
 * `obsidian-plugins-folder-deployment.ts`.
 */

import type { ExecResult } from '@mnaoumov/typescript-dev-toolkit/exec';

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';

/**
 * Parameters for {@link reloadPluginWithObsidianCli}.
 */
export interface ReloadPluginWithObsidianCliParams {
  /**
   * The plugin id, from its `manifest.json`.
   */
  readonly pluginId: string;

  /**
   * The vault's name as Obsidian knows it, which is the name of the vault's folder.
   */
  readonly vaultName: string;
}

/**
 * The command the Obsidian CLI is run as.
 */
export const OBSIDIAN_CLI_COMMAND = 'obsidian';

const OBSIDIAN_CLI_SETUP_HINT = 'Turn the Obsidian CLI on in Obsidian (Settings → General → Command line interface), make sure '
  + `\`${OBSIDIAN_CLI_COMMAND}\` is on PATH, and keep Obsidian running. Or build with \`reload: 'hot-reload-plugin'\` instead.`;

/**
 * Reloads a plugin in the running Obsidian through the Obsidian CLI, enabling it first when Obsidian does not
 * know it yet.
 *
 * The CLI exits with code 0 even when the command failed, and says so in its output (`Vault not found.`,
 * `Error: ...`), so the output is what is checked.
 *
 * @param params - The {@link ReloadPluginWithObsidianCliParams}.
 * @returns A {@link Promise} that resolves once the plugin is reloaded.
 * @throws When the CLI cannot be run, or reports a failure.
 */
export async function reloadPluginWithObsidianCli(params: ReloadPluginWithObsidianCliParams): Promise<void> {
  const { pluginId, vaultName } = params;
  const reloadOutput = await runObsidianCli([`vault=${vaultName}`, 'plugin:reload', `id=${pluginId}`]);
  if (!isPluginNotFoundOutput(reloadOutput)) {
    assertObsidianCliSucceeded(reloadOutput, `reload plugin '${pluginId}' in vault '${vaultName}'`);
    return;
  }

  const enableOutput = await runObsidianCli([`vault=${vaultName}`, 'eval', `code=${getEnableNewPluginCode(pluginId)}`]);
  assertObsidianCliSucceeded(enableOutput, `enable new plugin '${pluginId}' in vault '${vaultName}'`);
}

function assertObsidianCliSucceeded(output: string, action: string): void {
  if (output === 'Vault not found.' || output.startsWith('Error:')) {
    throw new Error(`The Obsidian CLI could not ${action}: ${output}\n${OBSIDIAN_CLI_SETUP_HINT}`);
  }
}

function formatCommandFailure(result: ExecResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n') || `exit code ${String(result.exitCode)}`;
}

/**
 * Builds the code that loads the plugin manifests from disk and enables the plugin, for a plugin Obsidian has not
 * seen yet: the CLI's `plugin:reload` and `plugin:enable` both answer `not found` until the manifests are re-read,
 * which Obsidian otherwise does only when its Community plugins settings are opened.
 *
 * @param pluginId - The plugin id.
 * @returns The code, for the CLI's `eval`, which awaits the promise it evaluates to.
 */
function getEnableNewPluginCode(pluginId: string): string {
  return `app.plugins.loadManifests().then(() => app.plugins.enablePluginAndSave(${JSON.stringify(pluginId)}))`;
}

function isPluginNotFoundOutput(output: string): boolean {
  return output.startsWith('Error: Plugin ') && output.includes(' not found');
}

async function runObsidianCli(cliArguments: readonly string[]): Promise<string> {
  let result: ExecResult;
  try {
    result = await exec([OBSIDIAN_CLI_COMMAND, ...cliArguments], {
      isQuiet: true,
      shouldIgnoreExitCode: true,
      shouldIncludeDetails: true
    });
  } catch (error) {
    throw new Error(`The Obsidian CLI (\`${OBSIDIAN_CLI_COMMAND}\`) could not be started.\n${OBSIDIAN_CLI_SETUP_HINT}`, { cause: error });
  }

  if (result.exitCode !== 0) {
    throw new Error(`The Obsidian CLI (\`${OBSIDIAN_CLI_COMMAND}\`) failed: ${formatCommandFailure(result)}\n${OBSIDIAN_CLI_SETUP_HINT}`);
  }

  return result.stdout.trim();
}
