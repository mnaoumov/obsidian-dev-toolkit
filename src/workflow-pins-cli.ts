/**
 * @file
 *
 * The `update-workflow-pins` command: runs {@link updateWorkflowPins} from the plugin project root and prints the lines
 * it changed.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import { updateWorkflowPins } from './workflow-pins.ts';

/**
 * Runs `update-workflow-pins`: `--version=<version>` moves the pins to that release instead of the installed one, and
 * `--dry-run` prints the changes without writing them.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns A {@link Promise} that resolves to the exit code: `0` on success, `1` on a failure, which is printed to
 *   stderr.
 */
export async function runUpdateWorkflowPinsCli($arguments: string[]): Promise<number> {
  try {
    const { values } = parseArgs({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
      args: $arguments,
      options: {
        'dry-run': { type: 'boolean' },
        'version': { type: 'string' }
      }
    });
    const isDryRun = values['dry-run'] === true;
    const { changes, version } = await updateWorkflowPins({
      isDryRun,
      ...(values.version !== undefined && { version: values.version })
    });

    if (changes.length === 0) {
      process.stdout.write(`Every workflow pin is already at ${version}; nothing to change.\n`);
      return 0;
    }

    for (const change of changes) {
      process.stdout.write(`${change.file}\n${change.lines.map((line) => `  ${line}`).join('\n')}\n`);
    }
    process.stdout.write(
      isDryRun
        ? `Dry run: nothing was written. Without --dry-run, ${String(changes.length)} workflow file(s) move to ${version}.\n`
        : `Moved the workflow pins of ${String(changes.length)} file(s) to ${version}. Nothing was committed: review the diff and commit it.\n`
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
