/**
 * @file
 *
 * Fails the build when the published output (`dist/lib` and `bin/`) imports a package that `package.json` does not
 * install for a consumer.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { validateDependencies } from '@mnaoumov/typescript-dev-toolkit/validate-dependencies';

await wrapCliTask(() => validateDependencies());
