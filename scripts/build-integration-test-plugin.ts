import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

import { ObsidianPluginRepoPaths } from '../src/obsidian-plugin-repo-paths.ts';
import { buildIntegrationTestPlugin } from './helpers/build-integration-test-plugin.ts';

await wrapCliTask(async () => {
  await buildIntegrationTestPlugin({
    outDirectory: ObsidianPluginRepoPaths.DistIntegrationTestPlugin,
    shouldGenerateSourceMap: false
  });
});
