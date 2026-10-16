import { join } from '@mnaoumov/typescript-lib/path';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { assertProjectPackagesInstalled } from './e2e-runner-support.ts';

const state = vi.hoisted(() => ({
  rootFolder: null as null | string
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  getRootFolder: (): null | string => state.rootFolder
}));

function installPackage(projectFolder: string, packageName: string, extraPackageJsonFields = ''): void {
  const packageFolder = join(projectFolder, 'node_modules', packageName);
  mkdirSync(packageFolder, { recursive: true });
  writeFileSync(join(packageFolder, 'package.json'), `{"name":"${packageName}"${extraPackageJsonFields}}`);
}

describe('assertProjectPackagesInstalled', () => {
  let projectFolder: string;

  beforeEach(() => {
    projectFolder = mkdtempSync(join(tmpdir(), 'e2e-runner-support-'));
    writeFileSync(join(projectFolder, 'package.json'), '{"name":"my-plugin"}');
    state.rootFolder = projectFolder;
  });

  afterEach(() => {
    rmSync(projectFolder, { force: true, recursive: true });
  });

  it('passes when every package is installed, including one whose exports hide its package.json', () => {
    installPackage(projectFolder, 'plain');
    installPackage(projectFolder, '@scope/strict', ',"exports":{".":"./index.js"}');

    expect(() => {
      assertProjectPackagesInstalled({ packageNames: ['plain', '@scope/strict'], requester: 'runner()' });
    }).not.toThrow();
  });

  it('names every missing package and the npm install line', () => {
    installPackage(projectFolder, 'plain');

    expect(() => {
      assertProjectPackagesInstalled({ packageNames: ['plain', 'missing-one', 'missing-two'], requester: 'runner()' });
    }).toThrow('runner() needs `missing-one`, `missing-two`, which the project does not have. Install with: npm install --save-dev missing-one missing-two');
  });

  it('resolves from the given project folder', () => {
    const otherFolder = mkdtempSync(join(tmpdir(), 'e2e-runner-support-other-'));
    installPackage(otherFolder, 'only-there');

    expect(() => {
      assertProjectPackagesInstalled({ packageNames: ['only-there'], projectFolder: otherFolder, requester: 'runner()' });
    }).not.toThrow();
    rmSync(otherFolder, { force: true, recursive: true });
  });

  it('falls back to the working folder outside a project', () => {
    state.rootFolder = null;

    expect(() => {
      assertProjectPackagesInstalled({ packageNames: ['no-such-package-anywhere-t3401'], requester: 'runner()' });
    }).toThrow('no-such-package-anywhere-t3401');
  });
});
