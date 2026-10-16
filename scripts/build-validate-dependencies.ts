/**
 * @file
 *
 * Fails the build when the published output imports a package that `package.json` does not install for a consumer.
 *
 * Every bare specifier in `dist/lib` (code and declarations, ESM and CommonJS) and in `bin/` must name a package in
 * `dependencies` or `peerDependencies`, the package itself, or a Node builtin. A package in `devDependencies` only is
 * present in this repository and absent from a consumer's install, so nothing here fails, and the consumer gets
 * `Cannot find module`. That is how `@mnaoumov/typescript-dev-toolkit` slipped into `devDependencies` while the
 * built bundlers and every `scripts/` template still imported it.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import {
  readdirSync,
  readFileSync
} from 'node:fs';
import { isBuiltin } from 'node:module';
import {
  join,
  relative
} from 'node:path';
import process from 'node:process';
import { preProcessFile } from 'typescript';

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly name: string;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const SCANNED_FOLDERS = ['dist/lib', 'bin'];
const SCOPED_PACKAGE_NAME_SEGMENT_COUNT = 2;
const SCANNED_FILE_PATTERN = /\.(?:cjs|cts|js|mjs|mts|ts)$/u;

await wrapCliTask(() => {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as PackageJson;
  const installedPackageNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    packageJson.name
  ]);

  const undeclaredImports: string[] = [];
  for (const folder of SCANNED_FOLDERS) {
    for (const filePath of getFilePaths(join(root, folder))) {
      for (const specifier of getImportSpecifiers(readFileSync(filePath, 'utf-8'))) {
        const packageName = getPackageName(specifier);
        if (packageName === null || installedPackageNames.has(packageName)) {
          continue;
        }
        undeclaredImports.push(`${relative(root, filePath)}: ${specifier}`);
      }
    }
  }

  if (undeclaredImports.length > 0) {
    throw new Error(
      `The published output imports packages that are not in dependencies or peerDependencies:\n${undeclaredImports.join('\n')}`
    );
  }
});

function getFilePaths(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SCANNED_FILE_PATTERN.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function getImportSpecifiers(sourceText: string): string[] {
  const { importedFiles } = preProcessFile(sourceText, true, true);
  return importedFiles.map((importedFile) => importedFile.fileName);
}

function getPackageName(specifier: string): null | string {
  if (specifier.startsWith('.') || specifier.startsWith('/') || isBuiltin(specifier)) {
    return null;
  }

  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, SCOPED_PACKAGE_NAME_SEGMENT_COUNT).join('/') : segments[0] ?? specifier;
}
