/**
 * @file
 *
 * What the end-to-end runners share: where the specs live, and the check that the packages a runner drives are
 * installed in the project, so a missing one is reported with the `npm install` line that fixes it instead of as a
 * shell's `command not found`.
 */

import { getRootFolder } from '@mnaoumov/typescript-dev-toolkit/root';
import { join } from '@mnaoumov/typescript-lib/path';
import { createRequire } from 'node:module';
import process from 'node:process';

/**
 * The spec files the end-to-end runners run by default.
 */
export const DEFAULT_END_TO_END_SPECS = './e2e/**/*.spec.ts';

/**
 * Parameters for {@link assertProjectPackagesInstalled}.
 */
export interface AssertProjectPackagesInstalledParams {
  /**
   * The packages the runner needs.
   */
  readonly packageNames: readonly string[];

  /**
   * The folder whose `node_modules` the packages are resolved from. Defaults to the project root.
   */
  readonly projectFolder?: string;

  /**
   * What needs the packages, as the error message names it, e.g. `testEndToEndWithWdioObsidian()`.
   */
  readonly requester: string;
}

/**
 * Throws when any of the packages is not installed in the project, naming the `npm install` line.
 *
 * @param params - The {@link AssertProjectPackagesInstalledParams}.
 * @throws When a package is missing.
 */
export function assertProjectPackagesInstalled(params: AssertProjectPackagesInstalledParams): void {
  const projectFolder = params.projectFolder ?? getRootFolder() ?? process.cwd();
  const require = createRequire(join(projectFolder, 'package.json'));
  const missingPackageNames = params.packageNames.filter((packageName) => !isPackageInstalled(require, packageName));
  if (missingPackageNames.length === 0) {
    return;
  }

  throw new Error(
    `${params.requester} needs ${missingPackageNames.map((packageName) => `\`${packageName}\``).join(', ')}, which the project does not have. `
      + `Install with: npm install --save-dev ${missingPackageNames.join(' ')}`
  );
}

function isPackageInstalled(require: NodeJS.Require, packageName: string): boolean {
  try {
    require.resolve(`${packageName}/package.json`);
    return true;
  } catch (error) {
    // A package whose `exports` map does not list `./package.json` is installed all the same.
    return (error as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  }
}
