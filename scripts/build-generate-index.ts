import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { generateLibraryIndex } from '@mnaoumov/typescript-dev-toolkit/library-build';

await wrapCliTask(async () => {
  await generateLibraryIndex({
    // Each of these needs an optional peer at load, because that peer is its whole job.
    // A barrel re-exporting one throws without the peer (vitest also throws under CommonJS). Subpaths stay.
    excludeFromIndex: [
      'src/demo-vault-buttons.ts',
      'src/demo-vault-coverage.ts',
      'src/test-runners/integration-test-plugin.ts'
    ]
  });
});
