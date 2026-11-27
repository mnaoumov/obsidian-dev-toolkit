import { assertObsidianPluginReproducibleBuild } from '@mnaoumov/obsidian-dev-toolkit/plugin-reproducible-build';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

await wrapCliTask(() =>
  assertObsidianPluginReproducibleBuild({
    shouldBuildWorkingTree: !process.argv.includes('--no-build')
  })
);
