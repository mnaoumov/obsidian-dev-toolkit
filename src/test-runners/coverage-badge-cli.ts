/**
 * @file
 *
 * The `generate-coverage-badge` command: reads its arguments, runs {@link generateCoverageBadge} and turns the result
 * into an exit code. The `obsidian-plugin-ci.yml` reusable workflow runs it after the gate.
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import type {
  CoverageBadgeMetric,
  GenerateCoverageBadgeOptions
} from './coverage-badge.ts';

import { generateCoverageBadge } from './coverage-badge.ts';

const METRICS: readonly CoverageBadgeMetric[] = ['branches', 'functions', 'lines', 'lowest'];

/**
 * Parses the command line of `generate-coverage-badge`: `--lcov=<path>`, `--output=<path>`, `--metric=<metric>` and
 * `--label=<text>`, each optional.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns The {@link GenerateCoverageBadgeOptions}.
 * @throws When an argument is unknown, or `--metric` is not a {@link CoverageBadgeMetric}.
 */
export function parseCoverageBadgeArguments($arguments: string[]): GenerateCoverageBadgeOptions {
  const { values } = parseArgs({
    // eslint-disable-next-line unicorn/name-replacements -- `args` is the option name Node's `parseArgs` reads.
    args: $arguments,
    options: {
      label: { type: 'string' },
      lcov: { type: 'string' },
      metric: { type: 'string' },
      output: { type: 'string' }
    }
  });

  const { label, lcov, metric, output } = values;
  if (metric !== undefined && !isCoverageBadgeMetric(metric)) {
    throw new Error(`Unknown --metric '${metric}'. Use one of: ${METRICS.join(', ')}.`);
  }

  return {
    ...(label !== undefined && { label }),
    ...(lcov !== undefined && { lcovPath: lcov }),
    ...(metric !== undefined && { metric }),
    ...(output !== undefined && { outputPath: output })
  };
}

/**
 * Runs `generate-coverage-badge`.
 *
 * @param $arguments - The arguments, without the node and script paths.
 * @returns A {@link Promise} that resolves to the exit code: `0` once the badge is written, `1` on any failure, which
 *   is printed to stderr.
 */
export async function runCoverageBadgeCli($arguments: string[]): Promise<number> {
  try {
    const { outputPath, percent } = await generateCoverageBadge(parseCoverageBadgeArguments($arguments));
    process.stdout.write(`Wrote the coverage badge (${String(percent)}%) to ${outputPath}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function isCoverageBadgeMetric(value: string): value is CoverageBadgeMetric {
  return (METRICS as readonly string[]).includes(value);
}
