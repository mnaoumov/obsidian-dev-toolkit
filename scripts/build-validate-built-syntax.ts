/**
 * @file
 *
 * Fails the build when an emitted module of `dist/lib` or `bin/` does not parse.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

import { validateBuiltSyntax } from './helpers/validate-built-syntax.ts';

await wrapCliTask(async () => {
  const { checkedCount, problems } = await validateBuiltSyntax(['dist/lib', 'bin']);
  if (problems.length === 0) {
    return;
  }
  const lines = problems.map((problem) => `  ${problem.path}: ${problem.message}`);
  throw new Error(`${String(problems.length)} of ${String(checkedCount)} emitted module(s) do not parse:\n${lines.join('\n')}`);
});
