/**
 * @file
 *
 * Builds the library's `dist/lib` with the generic preprocess plugin.
 *
 * @remarks
 * Not the Obsidian one: its CommonJS banner patches `require` and reads `globalThis.app` on the first non-built-in
 * `require`, so every `.cjs` module threw on load under plain Node. Nothing in `dist/lib` runs inside Obsidian; the
 * demo-vault helper and the integration-test plugin are bundled by their own scripts.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { buildLibrary } from '@mnaoumov/typescript-dev-toolkit/library-build';

await wrapCliTask(async () => {
  await buildLibrary();
});
