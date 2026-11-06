/**
 * @file
 *
 * The `start-obsidian-for-debugging` command: starts desktop Obsidian with its renderer's remote debugging endpoint
 * open, through {@link startObsidianForDebugging}, and turns the result into an exit code.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import type { StartObsidianForDebuggingOptions } from './obsidian-debug-launcher.ts';

import { startObsidianForDebugging } from './obsidian-debug-launcher.ts';

/**
 * Parses the command line of `start-obsidian-for-debugging`: the optional `--port=<number>` and
 * `--executable=<path>`, and any arguments after `--`, which are passed on to Obsidian.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns The {@link StartObsidianForDebuggingOptions}.
 * @throws When an argument is unknown, or a positional argument is given before `--`.
 */
export function parseStartObsidianForDebuggingArguments($arguments: string[]): StartObsidianForDebuggingOptions {
  const separatorIndex = $arguments.indexOf('--');
  const ownArguments = separatorIndex === -1 ? $arguments : $arguments.slice(0, separatorIndex);
  const extraArguments = separatorIndex === -1 ? [] : $arguments.slice(separatorIndex + 1);
  const { values } = parseArgs({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
    args: ownArguments,
    options: {
      executable: { type: 'string' },
      port: { type: 'string' }
    }
  });

  return {
    ...(values.executable !== undefined && { executablePath: values.executable }),
    ...(extraArguments.length > 0 && { extraArguments }),
    ...(values.port !== undefined && { port: Number(values.port) })
  };
}

/**
 * Runs `start-obsidian-for-debugging`.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns A {@link Promise} that resolves to the exit code: `0` once the endpoint answers, `1` on any failure, which
 *   is printed to stderr.
 */
export async function runStartObsidianForDebuggingCli($arguments: string[]): Promise<number> {
  try {
    const result = await startObsidianForDebugging(parseStartObsidianForDebuggingArguments($arguments));
    const endpoint = `http://127.0.0.1:${String(result.port)}`;
    process.stdout.write(
      result.wasAlreadyListening
        ? `Obsidian is already listening for a debugger at ${endpoint} (${result.userAgent}); nothing was started.\n`
        : `Started ${String(result.executablePath)}; its renderer is listening for a debugger at ${endpoint}.\n`
    );
    process.stdout.write('Open your development vault, run your development build, then attach your IDE to that port.\n');
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
