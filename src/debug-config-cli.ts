/**
 * @file
 *
 * Generates a local launch.json without overwriting existing debugger settings.
 */

import { readPackageJson } from '@mnaoumov/typescript-dev-toolkit/npm';
import {
  mkdir,
  writeFile
} from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createObsidianDebugConfig } from './debug-config.ts';

const JSON_INDENT = 2;

/**
 * Runs `generate-debug-config` from the plugin project root.
 *
 * @param $arguments - Command arguments, optionally `--port=<number>`.
 * @returns The exit code, with errors printed to stderr.
 */
export async function runGenerateDebugConfigCli($arguments: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is Node's `parseArgs` option name.
      args: $arguments,
      options: { port: { type: 'string' } }
    });
    const packageJson = await readPackageJson();
    const config = createObsidianDebugConfig({
      pluginName: packageJson.name ?? '',
      ...(values.port !== undefined && { port: Number(values.port) })
    });
    await mkdir('.vscode', { recursive: true });
    await writeFile('.vscode/launch.json', `${JSON.stringify(config, null, JSON_INDENT)}\n`, { flag: 'wx' });
    process.stdout.write('Created .vscode/launch.json. Start Obsidian with the matching --remote-debugging-port, then attach from VS Code.\n');
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
