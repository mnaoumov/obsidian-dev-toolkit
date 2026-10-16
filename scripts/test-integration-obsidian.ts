/**
 * @file
 *
 * Runs the integration tests that load every bundler adapter's build in a real Obsidian, through
 * `obsidian-integration-testing`. They need a desktop Obsidian installed, so CI does not run them; its
 * `test:integration:obsidian` script points here.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

await wrapCliTask(async () => {
  await test({
    projects: ['obsidian-integration-tests']
  });
});
