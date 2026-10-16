import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { generateLibraryExports } from '@mnaoumov/typescript-dev-toolkit/library-build';
import { editPackageJson } from '@mnaoumov/typescript-dev-toolkit/npm';

type ExportsMap = Record<string, unknown>;

/**
 * The `exports` entries of the files this package ships outside `src/`: the framework tsconfig presets, which a
 * project's tsconfig names in `extends`, and the ambient declarations, which it names in `compilerOptions.types`.
 */
const STATIC_EXPORTS: Readonly<ExportsMap> = {
  './tsconfig/*': './tsconfig/*',
  './types/*': { types: './types/*.d.ts' }
};

await wrapCliTask(async () => {
  // TODO: `generateLibraryExports` rebuilds the whole map from the source folders and throws when it changed, so the
  // Static entries are taken out before it compares and put back after. Pass them as its option once a
  // Typescript-dev-toolkit release has one.
  await editPackageJson((packageJson) => {
    const exportsMap = packageJson.exports as ExportsMap;
    for (const key of Object.keys(STATIC_EXPORTS)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Removing the static entries before the map is regenerated.
      delete exportsMap[key];
    }
  });
  try {
    await generateLibraryExports();
  } finally {
    await editPackageJson((packageJson) => {
      packageJson.exports = { ...packageJson.exports as ExportsMap, ...STATIC_EXPORTS } as NonNullable<typeof packageJson.exports>;
    });
  }
});
