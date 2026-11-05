/**
 * @file
 *
 * Runs the release's extra-files and preparation hooks against real files, and reads back the manifests the
 * release leaves in the repository and among the assets.
 */

import type { EditJsonParams } from '@mnaoumov/typescript-dev-toolkit/json';
import type { ResolvePathFromRootSafeParams } from '@mnaoumov/typescript-dev-toolkit/root';
import type { UpdateVersionOptions as GenericUpdateVersionOptions } from '@mnaoumov/typescript-dev-toolkit/version';

import { assertNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { updateVersion } from './version.ts';

const state = vi.hoisted(() => ({ rootFolder: '' }));

const { mockUpdateVersionGeneric } = vi.hoisted(() => ({
  mockUpdateVersionGeneric: vi.fn<(versionUpdateType?: string, options?: GenericUpdateVersionOptions) => Promise<void>>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  resolvePathFromRootSafe: (params: ResolvePathFromRootSafeParams): string => join(state.rootFolder, params.path)
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/json', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/json')>();
  return {
    ...original,
    editJson: async <T>(params: EditJsonParams<T>): Promise<void> => {
      await original.editJson({ ...params, path: join(state.rootFolder, params.path) });
    }
  };
});

vi.mock('@mnaoumov/typescript-dev-toolkit/version', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/version')>(),
  updateVersion: mockUpdateVersionGeneric
}));

interface ManifestFile {
  readonly minAppVersion: string;
  readonly version: string;
}

const STABLE_MANIFEST: ManifestFile = { minAppVersion: '1.5.0', version: '1.0.0' };
const STABLE_VERSIONS = { '1.0.0': '1.5.0' };

beforeEach(async () => {
  vi.resetAllMocks();
  mockUpdateVersionGeneric.mockResolvedValue(undefined);
  state.rootFolder = await mkdtemp(join(tmpdir(), 'obsidian-release-assets-'));
  await mkdir(join(state.rootFolder, 'dist/build'), { recursive: true });
  await writeFile(join(state.rootFolder, 'manifest.json'), JSON.stringify(STABLE_MANIFEST));
  await writeFile(join(state.rootFolder, 'versions.json'), JSON.stringify(STABLE_VERSIONS));
});

afterEach(async () => {
  await rm(state.rootFolder, { force: true, recursive: true });
});

async function readManifest(path: string): Promise<unknown> {
  const manifest: unknown = JSON.parse(await readFile(join(state.rootFolder, path), 'utf-8'));
  return manifest;
}

async function runReleaseHooks(newVersion: string): Promise<void> {
  await updateVersion('prerelease', { shouldArchiveDemoVault: false, shouldRunReleaseChecks: false });
  const genericOptions = mockUpdateVersionGeneric.mock.calls[0]?.[1];
  assertNonNullable(genericOptions?.updateVersionInExtraFiles);
  assertNonNullable(genericOptions.prepareGitHubRelease);
  await genericOptions.updateVersionInExtraFiles(newVersion);
  await genericOptions.prepareGitHubRelease(newVersion);
}

describe('the release assets on disk', () => {
  it('should ship the pre-release manifest as the asset and leave the stable files alone', async () => {
    await runReleaseHooks('1.0.1-beta.0');

    expect(await readManifest('dist/build/manifest.json')).toEqual({ ...STABLE_MANIFEST, version: '1.0.1-beta.0' });
    expect(await readManifest('manifest-beta.json')).toEqual({ ...STABLE_MANIFEST, version: '1.0.1-beta.0' });
    expect(await readManifest('manifest.json')).toEqual(STABLE_MANIFEST);
    expect(await readManifest('versions.json')).toEqual(STABLE_VERSIONS);
  });

  it('should ship the stable manifest as the asset and drop manifest-beta.json for a stable release', async () => {
    await writeFile(join(state.rootFolder, 'manifest-beta.json'), JSON.stringify({ ...STABLE_MANIFEST, version: '1.0.1-beta.0' }));

    await runReleaseHooks('1.0.1');

    expect(await readManifest('dist/build/manifest.json')).toEqual({ ...STABLE_MANIFEST, version: '1.0.1' });
    expect(await readManifest('manifest.json')).toEqual({ ...STABLE_MANIFEST, version: '1.0.1' });
    expect(await readManifest('versions.json')).toEqual({ ...STABLE_VERSIONS, '1.0.1': '1.5.0' });
    expect(existsSync(join(state.rootFolder, 'manifest-beta.json'))).toBe(false);
  });
});
