/**
 * @file
 *
 * Runs the integration tests that load every bundler adapter's build in a real Obsidian Mobile, on an Android emulator
 * driven through `obsidian-integration-testing`'s Appium transport. They need the Android SDK, the `obsidian_test` AVD
 * and Appium, so CI does not run them; its `test:integration:obsidian:android` script points here.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

await wrapCliTask(async () => {
  await test({
    projects: ['obsidian-android-integration-tests']
  });
});
