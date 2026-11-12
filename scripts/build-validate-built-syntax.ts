/**
 * @file
 *
 * Fails the build when an emitted module of `dist/lib` or `bin/` does not parse.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { validateBuiltSyntax } from '@mnaoumov/typescript-dev-toolkit/validate-built-syntax';

await wrapCliTask(() => validateBuiltSyntax());
