/**
 * @file
 *
 * Runs the integration tests: every bundler adapter builds the fixture plugin in `test-fixtures/` and the
 * result is loaded the way Obsidian loads a plugin. Its `test:integration` script points here, which the
 * gate runs with `--integration` and CI runs on its own.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

await wrapCliTask(async () => {
  await test({
    projects: ['integration-tests']
  });
});
