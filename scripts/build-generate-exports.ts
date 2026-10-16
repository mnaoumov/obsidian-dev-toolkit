import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { generateLibraryExports } from '@mnaoumov/typescript-dev-toolkit/library-build';

await wrapCliTask(() =>
  generateLibraryExports({
    /**
     * The `exports` entries of the files this package ships outside `src/`: the framework tsconfig presets, which a
     * project's tsconfig names in `extends`, and the ambient declarations, which it names in `compilerOptions.types`.
     */
    additionalExports: {
      './tsconfig/*': './tsconfig/*',
      './types/*': { types: './types/*.d.ts' }
    }
  })
);
