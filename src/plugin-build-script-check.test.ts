import { join } from '@mnaoumov/typescript-lib/path';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  DIRECTORY_BUILD_SCRIPTS,
  validateProjectBuildScript
} from './plugin-build-script-check.ts';

const { mockGetRootFolder } = vi.hoisted(() => ({
  mockGetRootFolder: vi.fn<() => null | string>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/root')>()),
  getRootFolder: mockGetRootFolder
}));

const ESBUILD_SCRIPT = 'import { build } from \'@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild\';\nawait build();\n';
const DEV_SCRIPT = 'import { dev } from \'@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild\';\nawait dev();\n';
const VITE_CONFIG = 'import { obsidianPluginVite } from \'@mnaoumov/obsidian-dev-toolkit/bundlers/vite\';\nexport default { plugins: [obsidianPluginVite()] };\n';
const ROLLUP_CONFIG = 'import { obsidianPluginRollup } from \'@mnaoumov/obsidian-dev-toolkit/bundlers/rollup\';\nexport default { plugins: [obsidianPluginRollup()] };\n';
const WEBPACK_CONFIG = 'import { ObsidianPluginWebpackPlugin } from \'@mnaoumov/obsidian-dev-toolkit/bundlers/webpack\';\nexport default { plugins: [new ObsidianPluginWebpackPlugin()] };\n';
const FOREIGN_SCRIPT = 'import esbuild from \'esbuild\';\nawait esbuild.build({});\n';

let rootFolder: string;

async function findingsFor(scripts: unknown, files: Readonly<Record<string, string>> = {}): Promise<string[]> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(rootFolder, path, '..'), { recursive: true });
    await writeFile(join(rootFolder, path), text);
  }
  return await findingsForPackageJson(JSON.stringify({ scripts }));
}

async function findingsForPackageJson(packageJsonText: string): Promise<string[]> {
  await writeFile(join(rootFolder, 'package.json'), packageJsonText);
  const findings = await validateProjectBuildScript({ rootFolder });
  return findings.map((finding) => `${finding.level}:${finding.ruleId}`);
}

describe('validateProjectBuildScript', () => {
  beforeEach(async () => {
    rootFolder = await mkdtemp(join(tmpdir(), 'build-script-check-'));
  });

  afterEach(async () => {
    await rm(rootFolder, { force: true, recursive: true });
  });

  it('should list the scripts in the directory order', () => {
    expect(DIRECTORY_BUILD_SCRIPTS).toEqual(['build', 'build:plugin', 'compile']);
  });

  it('should skip a project without package.json', async () => {
    expect(await validateProjectBuildScript({ rootFolder })).toEqual([]);
  });

  it('should default the root to the project root', async () => {
    mockGetRootFolder.mockReturnValue(rootFolder);
    await writeFile(join(rootFolder, 'package.json'), '{}');
    expect(await validateProjectBuildScript()).toEqual([expect.objectContaining({ ruleId: 'build-script-missing' })]);
  });

  it('should warn when no directory build script exists, also for an invalid package.json or scripts', async () => {
    expect(await findingsFor(undefined)).toEqual(['warning:build-script-missing']);
    expect(await findingsFor('nope')).toEqual(['warning:build-script-missing']);
    expect(await findingsFor({ build: 1, dev: 'jiti scripts/dev.ts' })).toEqual(['warning:build-script-missing']);
    expect(await findingsForPackageJson('{ not json')).toEqual(['warning:build-script-missing']);
    expect(await findingsForPackageJson('null')).toEqual(['warning:build-script-missing']);
  });

  it('should accept a script file that calls the toolkit build', async () => {
    expect(await findingsFor({ build: 'jiti scripts/build.ts' }, { 'scripts/build.ts': ESBUILD_SCRIPT })).toEqual([]);
    expect(await findingsFor({ build: 'tsc --noEmit && node "scripts/build.mjs"' }, { 'scripts/build.mjs': ESBUILD_SCRIPT })).toEqual([]);
  });

  it('should use the first directory script that exists', async () => {
    expect(await findingsFor({ 'build:plugin': 'jiti scripts/build.ts', 'compile': 'tsc' }, { 'scripts/build.ts': ESBUILD_SCRIPT })).toEqual([]);
    expect(await findingsFor({ compile: 'tsc' })).toEqual(['warning:build-script-not-toolkit']);
  });

  it('should warn on a script file that does not call the toolkit build', async () => {
    expect(await findingsFor({ build: 'jiti scripts/build.ts' }, { 'scripts/build.ts': FOREIGN_SCRIPT })).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'jiti scripts/dev.ts' }, { 'scripts/dev.ts': DEV_SCRIPT })).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'jiti scripts/missing.ts' })).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: '' })).toEqual(['warning:build-script-not-toolkit']);
  });

  it('should warn on a watch or development build', async () => {
    expect(await findingsFor({ build: 'jiti scripts/build.ts --watch' }, { 'scripts/build.ts': ESBUILD_SCRIPT })).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'vite build --mode development' }, { 'vite.config.ts': VITE_CONFIG })).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'rollup -c -w' }, { 'rollup.config.mjs': ROLLUP_CONFIG })).toEqual(['warning:build-script-not-toolkit']);
  });

  it('should follow another npm script, once', async () => {
    const files = { 'scripts/build.ts': ESBUILD_SCRIPT };
    expect(await findingsFor({ 'build': 'npm run build:plugin', 'build:plugin': 'jiti scripts/build.ts' }, files)).toEqual([]);
    expect(await findingsFor({ build: 'pnpm run-script compile', compile: 'jiti scripts/build.ts' }, files)).toEqual([]);
    expect(await findingsFor({ build: 'yarn bundle', bundle: 'jiti scripts/build.ts' }, files)).toEqual([]);
    expect(await findingsFor({ build: 'npm run build' }, files)).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'npm run missing' }, files)).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'npm run' }, files)).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'npm' }, files)).toEqual(['warning:build-script-not-toolkit']);
    expect(await findingsFor({ build: 'pnpm vite build' }, { 'vite.config.ts': VITE_CONFIG })).toEqual([]);
  });

  it('should read the default config of vite, rollup and webpack', async () => {
    expect(await findingsFor({ build: 'vite build' }, { 'vite.config.ts': VITE_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'npx rollup -c' }, { 'rollup.config.mjs': ROLLUP_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'webpack --mode production' }, { 'webpack.config.ts': WEBPACK_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'npx' })).toEqual(['warning:build-script-not-toolkit']);
  });

  it('should read a config named on the command line', async () => {
    expect(await findingsFor({ build: 'rollup --config build/rollup.mjs' }, { 'build/rollup.mjs': ROLLUP_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'vite build --config=build/vite.mts' }, { 'build/vite.mts': VITE_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'rollup -c --bundleConfigAsCjs' }, { 'rollup.config.js': ROLLUP_CONFIG })).toEqual([]);
    expect(await findingsFor({ build: 'rollup --config' }, { 'rollup.config.cjs': ROLLUP_CONFIG })).toEqual([]);
  });

  it('should warn on a bundler config that does not use the toolkit adapter', async () => {
    expect(await findingsFor({ build: 'vite build' }, { 'vite.config.ts': 'export default {};\n' })).toEqual(['warning:build-script-not-toolkit']);
  });
});
