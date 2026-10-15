/**
 * @file
 *
 * Builds the library's `dist/lib` with the Obsidian preprocess plugin, whose CommonJS banner
 * patches `require` for Obsidian's built-in modules.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { buildLibrary } from '@mnaoumov/typescript-dev-toolkit/library-build';

import { preprocessPlugin } from '../src/bundlers/esbuild-impl/preprocess-plugin.ts';

await wrapCliTask(async () => {
  await buildLibrary({ preprocessPluginFactory: preprocessPlugin });
});
