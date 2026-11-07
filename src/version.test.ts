import type { EditJsonParams } from '@mnaoumov/typescript-dev-toolkit/json';
import type { ResolvePathFromRootSafeParams } from '@mnaoumov/typescript-dev-toolkit/root';
import type { UpdateVersionOptions as GenericUpdateVersionOptions } from '@mnaoumov/typescript-dev-toolkit/version';

import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import { assertNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  copyUpdatedManifest,
  parseVersionArguments,
  updateVersion
} from './version.ts';

const {
  mockAnalyzePluginApiVersion,
  mockArchivePluginDemoVault,
  mockCp,
  mockEditJson,
  mockExistsSync,
  mockReaddirPosix,
  mockReadJson,
  mockResolvePathFromRootSafe,
  mockRm,
  mockUpdateVersionGeneric,
  mockValidatePluginRelease
} = vi.hoisted(() => ({
  mockAnalyzePluginApiVersion: vi.fn(),
  mockArchivePluginDemoVault: vi.fn(),
  mockCp: vi.fn(),
  mockEditJson: vi.fn<(params: EditJsonParams<Record<string, string>>) => Promise<void>>(),
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockReaddirPosix: vi.fn<(path: string) => Promise<string[]>>(),
  mockReadJson: vi.fn<(path: string) => Promise<unknown>>(),
  mockResolvePathFromRootSafe: vi.fn<(params: ResolvePathFromRootSafeParams) => string>(),
  mockRm: vi.fn(),
  mockUpdateVersionGeneric: vi.fn<(versionUpdateType?: string, options?: GenericUpdateVersionOptions) => Promise<void>>(),
  mockValidatePluginRelease: vi.fn()
}));

vi.mock('./plugin-api-version-check.ts', () => ({
  analyzePluginApiVersion: mockAnalyzePluginApiVersion
}));

vi.mock('./demo-vault.ts', () => ({
  archivePluginDemoVault: mockArchivePluginDemoVault
}));

vi.mock('./plugin-release-checks.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./plugin-release-checks.ts')>(),
  validatePluginRelease: mockValidatePluginRelease
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/fs', () => ({
  readdirPosix: mockReaddirPosix
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/json', () => ({
  editJson: mockEditJson,
  readJson: mockReadJson
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', () => ({
  resolvePathFromRootSafe: mockResolvePathFromRootSafe
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/version', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/version')>(),
  updateVersion: mockUpdateVersionGeneric
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  existsSync: mockExistsSync
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  cp: mockCp,
  rm: mockRm
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockArchivePluginDemoVault.mockResolvedValue(null);
  mockValidatePluginRelease.mockResolvedValue([]);
  mockCp.mockResolvedValue(undefined);
  mockEditJson.mockImplementation(async (params: EditJsonParams<Record<string, string>>) => {
    await params.editFunction({ minAppVersion: '1.0.0', version: '1.0.0' });
  });
  mockAnalyzePluginApiVersion.mockResolvedValue({ requiredMinAppVersion: undefined });
  mockExistsSync.mockReturnValue(false);
  mockReaddirPosix.mockResolvedValue([]);
  mockReadJson.mockResolvedValue({ minAppVersion: '1.0.0', version: '1.0.1' });
  mockResolvePathFromRootSafe.mockImplementation((params: ResolvePathFromRootSafeParams) => `/root/${params.path}`);
  mockRm.mockResolvedValue(undefined);
  mockUpdateVersionGeneric.mockResolvedValue(undefined);
  stubDesktopReleasesFeed({ latestVersion: '1.7.0' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Runs the wrapper and hands back the options it passed to the generic release, so a case can drive the hooks.
 *
 * @param versionUpdateType - The version update type.
 * @param options - The wrapper's options.
 * @returns The options the generic `updateVersion` received.
 */
async function captureGenericOptions(versionUpdateType: string, options?: Parameters<typeof updateVersion>[1]): Promise<GenericUpdateVersionOptions> {
  await updateVersion(versionUpdateType, options);
  const genericOptions = mockUpdateVersionGeneric.mock.calls[0]?.[1];
  assertNonNullable(genericOptions);
  return genericOptions;
}

function getEditJsonParams(callIndex: number): EditJsonParams<Record<string, string>> {
  const params = mockEditJson.mock.calls[callIndex]?.[0];
  assertNonNullable(params);
  return params;
}

function stubDesktopReleasesFeed(desktopReleasesJson: null | object, status = 200): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn().mockResolvedValue({
    json: vi.fn().mockResolvedValue(desktopReleasesJson),
    ok: status === 200,
    status
  });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

async function updateVersionInExtraFiles(newVersion: string, options?: Parameters<typeof updateVersion>[1]): Promise<void> {
  const genericOptions = await captureGenericOptions('patch', options);
  assertNonNullable(genericOptions.updateVersionInExtraFiles);
  await genericOptions.updateVersionInExtraFiles(newVersion);
}

describe('copyUpdatedManifest', () => {
  it('should copy manifest.json to the dist/build folder', async () => {
    await copyUpdatedManifest();
    expect(mockCp).toHaveBeenCalledTimes(1);
    expect(mockCp).toHaveBeenCalledWith('/root/manifest.json', '/root/dist/build/manifest.json', { force: true });
  });

  it('should copy the given manifest to dist/build/manifest.json', async () => {
    await copyUpdatedManifest('manifest-beta.json');
    expect(mockCp).toHaveBeenCalledWith('/root/manifest-beta.json', '/root/dist/build/manifest.json', { force: true });
  });
});

describe('parseVersionArguments', () => {
  it('should parse the version update type with no flags', () => {
    const { options, versionUpdateType } = parseVersionArguments(['patch']);
    expect(versionUpdateType).toBe('patch');
    expect(options).toEqual({
      changelogFilePath: undefined,
      minAppVersion: undefined,
      shouldArchiveDemoVault: true,
      shouldBuild: true,
      shouldCheckApiVersion: false,
      shouldCloseReleasedIssues: true,
      shouldEditChangelog: true,
      shouldRelease: true,
      shouldRunChecks: true,
      shouldRunReleaseChecks: true,
      shouldVerifyCommit: true
    });
  });

  it('should parse the generic flags together with the plugin flags', () => {
    const { options, versionUpdateType } = parseVersionArguments([
      'patch',
      '--changelog-file=notes.md',
      '--min-app-version=1.9.0',
      '--api-version',
      '--no-build',
      '--no-changelog-editing',
      '--no-checks',
      '--no-commit-verification',
      '--no-demo-vault',
      '--no-issue-closing',
      '--no-release',
      '--no-release-checks'
    ]);
    expect(versionUpdateType).toBe('patch');
    expect(options).toEqual({
      changelogFilePath: 'notes.md',
      minAppVersion: '1.9.0',
      shouldArchiveDemoVault: false,
      shouldBuild: false,
      shouldCheckApiVersion: true,
      shouldCloseReleasedIssues: false,
      shouldEditChangelog: false,
      shouldRelease: false,
      shouldRunChecks: false,
      shouldRunReleaseChecks: false,
      shouldVerifyCommit: false
    });
  });

  it('should return an undefined version update type when no positional is provided', () => {
    const { versionUpdateType } = parseVersionArguments(['--no-demo-vault']);
    expect(versionUpdateType).toBeUndefined();
  });
});

describe('updateVersion', () => {
  describe('community directory checks', () => {
    it('should check the manifest before the release and the tag and assets after the bump', async () => {
      stubDesktopReleasesFeed({ latestVersion: '1.9.0' });
      await updateVersionInExtraFiles('1.2.3');
      expect(mockValidatePluginRelease).toHaveBeenNthCalledWith(1, { shouldCheckAssets: false, shouldCheckVersion: false });
      expect(mockValidatePluginRelease).toHaveBeenNthCalledWith(2, { shouldRequireAssets: true, tag: '1.2.3' });
    });

    it('should check manifest-beta.json, and no tag or assets, for a pre-release', async () => {
      await updateVersionInExtraFiles('1.2.3-beta.1');
      expect(mockValidatePluginRelease).toHaveBeenNthCalledWith(2, { manifestFile: 'manifest-beta.json', shouldCheckAssets: false });
    });

    it('should warn on warnings and stop on errors', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(noop);
      try {
        mockValidatePluginRelease.mockResolvedValue([{ level: 'warning', message: 'w', ruleId: 'r' }]);
        await updateVersion('patch');
        expect(warn).toHaveBeenCalledWith('warning: w (r)');
        expect(mockUpdateVersionGeneric).toHaveBeenCalledTimes(1);

        mockValidatePluginRelease.mockResolvedValue([{ level: 'error', message: 'e', ruleId: 'r' }]);
        await expect(updateVersion('patch')).rejects.toThrow('The community directory checks failed before the release. Fix these, or pass --no-release-checks to release anyway:\nerror: e (r)');
        expect(mockUpdateVersionGeneric).toHaveBeenCalledTimes(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('should skip the checks when told to', async () => {
      stubDesktopReleasesFeed({ latestVersion: '1.9.0' });
      await updateVersionInExtraFiles('1.2.3', { shouldRunReleaseChecks: false });
      expect(mockValidatePluginRelease).not.toHaveBeenCalled();
    });
  });

  it('should forward the generic options to the generic release and keep the plugin options to itself', async () => {
    const genericOptions = await captureGenericOptions('minor', {
      minAppVersion: '1.9.0',
      shouldArchiveDemoVault: false,
      shouldBuild: false,
      shouldRelease: false
    });
    expect(mockUpdateVersionGeneric).toHaveBeenCalledWith('minor', expect.any(Object));
    expect(genericOptions.shouldBuild).toBe(false);
    expect(genericOptions.shouldRelease).toBe(false);
    expect(genericOptions).not.toHaveProperty('minAppVersion');
    expect(genericOptions).not.toHaveProperty('shouldArchiveDemoVault');
  });

  it('should run with no arguments at all', async () => {
    await updateVersion();
    expect(mockUpdateVersionGeneric).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        getReleaseAssetPaths: expect.any(Function) as unknown,
        prepareGitHubRelease: expect.any(Function) as unknown,
        updateVersionInExtraFiles: expect.any(Function) as unknown
      })
    );
  });

  describe('the release assets', () => {
    it('should be every file in dist/build', async () => {
      mockReaddirPosix.mockResolvedValue(['main.js', 'manifest.json', 'styles.css']);
      const genericOptions = await captureGenericOptions('patch');
      assertNonNullable(genericOptions.getReleaseAssetPaths);
      const assetPaths = await genericOptions.getReleaseAssetPaths();
      expect(mockReaddirPosix).toHaveBeenCalledWith('/root/dist/build');
      expect(assetPaths).toEqual(['/root/dist/build/main.js', '/root/dist/build/manifest.json', '/root/dist/build/styles.css']);
    });
  });

  describe('the GitHub release preparation', () => {
    it('should run the caller\'s preparation first and then archive the demo vault', async () => {
      const steps: string[] = [];
      const prepareGitHubRelease = vi.fn((newVersion: string) => {
        steps.push(`prepare ${newVersion}`);
        return noopAsync();
      });
      mockArchivePluginDemoVault.mockImplementation(() => {
        steps.push('archive');
        return Promise.resolve(null);
      });
      const genericOptions = await captureGenericOptions('patch', { prepareGitHubRelease });
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await genericOptions.prepareGitHubRelease('1.0.1');
      expect(steps).toEqual(['prepare 1.0.1', 'archive']);
    });

    it('should archive the demo vault when the caller has no preparation of its own', async () => {
      const genericOptions = await captureGenericOptions('patch');
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await genericOptions.prepareGitHubRelease('1.0.1');
      expect(mockArchivePluginDemoVault).toHaveBeenCalledTimes(1);
    });

    it('should not archive the demo vault when shouldArchiveDemoVault is false', async () => {
      const prepareGitHubRelease = vi.fn(noopAsync);
      const genericOptions = await captureGenericOptions('patch', { prepareGitHubRelease, shouldArchiveDemoVault: false });
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await genericOptions.prepareGitHubRelease('1.0.1');
      expect(prepareGitHubRelease).toHaveBeenCalledWith('1.0.1');
      expect(mockArchivePluginDemoVault).not.toHaveBeenCalled();
    });

    it('should check that both stable manifests equal the tag before anything is prepared', async () => {
      const prepareGitHubRelease = vi.fn(noopAsync);
      const genericOptions = await captureGenericOptions('patch', { prepareGitHubRelease });
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await genericOptions.prepareGitHubRelease('1.0.1');
      expect(mockReadJson).toHaveBeenNthCalledWith(1, '/root/manifest.json');
      expect(mockReadJson).toHaveBeenNthCalledWith(2, '/root/dist/build/manifest.json');
      expect(prepareGitHubRelease).toHaveBeenCalledWith('1.0.1');
    });

    it('should refuse a stable release whose released manifest does not carry the tag', async () => {
      mockReadJson.mockResolvedValueOnce({ minAppVersion: '1.0.0', version: '1.0.1' }).mockResolvedValueOnce({ minAppVersion: '1.0.0', version: '1.0.0' });
      const prepareGitHubRelease = vi.fn(noopAsync);
      const genericOptions = await captureGenericOptions('patch', { prepareGitHubRelease });
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await expect(genericOptions.prepareGitHubRelease('1.0.1')).rejects.toThrow(
        'Refusing to release 1.0.1: dist/build/manifest.json carries version 1.0.0, and a stable manifest must equal the release tag.'
      );
      expect(prepareGitHubRelease).not.toHaveBeenCalled();
      expect(mockArchivePluginDemoVault).not.toHaveBeenCalled();
    });

    it('should check manifest-beta.json and the asset manifest, not manifest.json, for a pre-release', async () => {
      mockReadJson.mockResolvedValue({ minAppVersion: '1.0.0', version: '1.0.1-beta.1' });
      const genericOptions = await captureGenericOptions('prerelease');
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await genericOptions.prepareGitHubRelease('1.0.1-beta.1');
      expect(mockReadJson).toHaveBeenCalledTimes(2);
      expect(mockReadJson).toHaveBeenNthCalledWith(1, '/root/manifest-beta.json');
      expect(mockReadJson).toHaveBeenNthCalledWith(2, '/root/dist/build/manifest.json');
      expect(mockArchivePluginDemoVault).toHaveBeenCalledTimes(1);
    });

    it('should refuse a pre-release whose asset manifest does not carry the tag', async () => {
      mockReadJson.mockResolvedValueOnce({ minAppVersion: '1.0.0', version: '1.0.1-beta.1' }).mockResolvedValueOnce({ minAppVersion: '1.0.0', version: '1.0.0' });
      const genericOptions = await captureGenericOptions('prerelease');
      assertNonNullable(genericOptions.prepareGitHubRelease);
      await expect(genericOptions.prepareGitHubRelease('1.0.1-beta.1')).rejects.toThrow(
        'Refusing to release 1.0.1-beta.1: dist/build/manifest.json carries version 1.0.0, and a pre-release manifest must equal the release tag.'
      );
      expect(mockArchivePluginDemoVault).not.toHaveBeenCalled();
    });
  });

  describe('the release ordering', () => {
    it('should publish the release before the branch is pushed by default', async () => {
      const genericOptions = await captureGenericOptions('patch');
      expect(genericOptions.shouldPublishBeforePush).toBe(true);
    });

    it('should let the caller fall back to the push-first ordering', async () => {
      const genericOptions = await captureGenericOptions('patch', { shouldPublishBeforePush: false });
      expect(genericOptions.shouldPublishBeforePush).toBe(false);
    });
  });

  describe('the plugin files', () => {
    it('should preserve older compatibility entries when raising minAppVersion', async () => {
      await updateVersionInExtraFiles('2.0.0', { minAppVersion: '1.9.0' });
      const versions: Record<string, string> = { '1.0.0': '1.0.0', '1.5.0': '1.5.0' };
      const versionsParams = getEditJsonParams(1);
      expect(versionsParams.path).toBe('versions.json');
      await versionsParams.editFunction(versions);
      expect(versions).toEqual({ '1.0.0': '1.0.0', '1.5.0': '1.5.0', '2.0.0': '1.9.0' });
    });

    it('should copy manifest.json to manifest-beta.json with the new version for a pre-release', async () => {
      const mockFetch = stubDesktopReleasesFeed({ latestVersion: '1.7.0' });
      await updateVersionInExtraFiles('1.0.1-beta.0');

      expect(mockCp).toHaveBeenNthCalledWith(1, '/root/manifest.json', '/root/manifest-beta.json', { force: true });
      expect(mockEditJson).toHaveBeenCalledTimes(1);
      const params = getEditJsonParams(0);
      expect(params.path).toBe('manifest-beta.json');
      const betaManifest: Record<string, string> = { version: '1.0.0' };
      await params.editFunction(betaManifest);
      expect(betaManifest).toEqual({ version: '1.0.1-beta.0' });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
      expect(mockCp).toHaveBeenNthCalledWith(2, '/root/manifest-beta.json', '/root/dist/build/manifest.json', { force: true });
    });

    it('should use the minAppVersion option verbatim without fetching', async () => {
      const mockFetch = stubDesktopReleasesFeed({ latestVersion: '1.7.0' });
      await updateVersionInExtraFiles('1.0.1', { minAppVersion: '1.9.0' });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockEditJson).toHaveBeenCalledTimes(2);

      const manifestParams = getEditJsonParams(0);
      expect(manifestParams.path).toBe('manifest.json');
      const manifest: Record<string, string> = { minAppVersion: '1.0.0', version: '1.0.0' };
      await manifestParams.editFunction(manifest);
      expect(manifest).toEqual({ minAppVersion: '1.9.0', version: '1.0.1' });

      const versionsParams = getEditJsonParams(1);
      expect(versionsParams.path).toBe('versions.json');
      const versions: Record<string, string> = {};
      await versionsParams.editFunction(versions);
      expect(versions).toEqual({ '1.0.1': '1.9.0' });

      expect(mockRm).not.toHaveBeenCalled();
      expect(mockCp).toHaveBeenCalledTimes(1);
      expect(mockCp).toHaveBeenCalledWith('/root/manifest.json', '/root/dist/build/manifest.json', { force: true });
    });

    it('should write the latest public Obsidian version as the minimum by default, without scanning', async () => {
      const mockFetch = stubDesktopReleasesFeed({ beta: { latestVersion: '1.8.0' }, latestVersion: '1.7.0' });
      await updateVersionInExtraFiles('1.0.1');

      expect(mockFetch).toHaveBeenCalledWith('https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json');
      expect(mockAnalyzePluginApiVersion).not.toHaveBeenCalled();
      const manifest: Record<string, string> = { minAppVersion: '1.0.0', version: '1.0.0' };
      await getEditJsonParams(0).editFunction(manifest);
      expect(manifest).toEqual({ minAppVersion: '1.7.0', version: '1.0.1' });
      const versions: Record<string, string> = { '1.0.0': '0.15.0' };
      await getEditJsonParams(1).editFunction(versions);
      expect(versions).toEqual({ '1.0.0': '0.15.0', '1.0.1': '1.7.0' });
    });

    it('should stop before editing files when the latest public version cannot be fetched', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      await expect(updateVersionInExtraFiles('1.0.1')).rejects.toThrow('Could not fetch the latest public Obsidian version from');
      expect(mockEditJson).not.toHaveBeenCalled();
    });

    it('should stop before editing files when the feed answers with an error status', async () => {
      stubDesktopReleasesFeed({}, 503);
      await expect(updateVersionInExtraFiles('1.0.1')).rejects.toThrow('answered 503. Pass --min-app-version=<x.y.z>');
      expect(mockEditJson).not.toHaveBeenCalled();
    });

    it.each([null, {}, { latestVersion: 17 }, { latestVersion: '1.x' }, { latestVersion: '1.16.0-beta.1' }])(
      'should stop before editing files when the feed carries no valid public version: %j',
      async (desktopReleasesJson) => {
        stubDesktopReleasesFeed(desktopReleasesJson);
        await expect(updateVersionInExtraFiles('1.0.1')).rejects.toThrow('has no valid public latestVersion');
        expect(mockEditJson).not.toHaveBeenCalled();
      }
    );

    it('should stop before editing compatibility files when requested API analysis fails', async () => {
      mockAnalyzePluginApiVersion.mockRejectedValue(new Error('Typed config unavailable'));
      await expect(updateVersionInExtraFiles('1.0.1', { shouldCheckApiVersion: true })).rejects.toThrow('Typed config unavailable');
      expect(mockEditJson).not.toHaveBeenCalled();
    });

    it.each([undefined, '0.9.0', '1.7.0'])(
      'should keep the latest public minimum, never lowering it, when the detected API floor is %s',
      async (requiredMinAppVersion) => {
        mockAnalyzePluginApiVersion.mockResolvedValue({ requiredMinAppVersion });
        await updateVersionInExtraFiles('1.0.1', { shouldCheckApiVersion: true });
        const manifest: Record<string, string> = { minAppVersion: '1.0.0', version: '1.0.0' };
        await getEditJsonParams(0).editFunction(manifest);
        expect(manifest).toEqual({ minAppVersion: '1.7.0', version: '1.0.1' });
        const versions: Record<string, string> = { '1.0.0': '0.9.0' };
        await getEditJsonParams(1).editFunction(versions);
        expect(versions).toEqual({ '1.0.0': '0.9.0', '1.0.1': '1.7.0' });
        expect(mockAnalyzePluginApiVersion).toHaveBeenCalledTimes(1);
      }
    );

    it('should reject source whose API floor is above the latest public version before editing files', async () => {
      mockAnalyzePluginApiVersion.mockResolvedValue({ requiredMinAppVersion: '1.8.0' });
      await expect(updateVersionInExtraFiles('1.0.1', { shouldCheckApiVersion: true })).rejects.toThrow(
        'The source requires Obsidian 1.8.0, above the latest public version 1.7.0. Guard the newer APIs.'
      );
      expect(mockEditJson).not.toHaveBeenCalled();
    });

    it.each(['1.10.0', '1.11.0'])(
      'should honor a sufficient explicit minimum %s when API analysis is requested',
      async (minAppVersion) => {
        mockAnalyzePluginApiVersion.mockResolvedValue({ requiredMinAppVersion: '1.10.0' });
        await updateVersionInExtraFiles('1.0.1', { minAppVersion, shouldCheckApiVersion: true });
        const versions: Record<string, string> = {};
        await getEditJsonParams(1).editFunction(versions);
        expect(versions).toEqual({ '1.0.1': minAppVersion });
      }
    );

    it('should reject an explicit minimum below the detected floor before editing files', async () => {
      mockAnalyzePluginApiVersion.mockResolvedValue({ requiredMinAppVersion: '1.10.0' });
      await expect(updateVersionInExtraFiles('1.0.1', {
        minAppVersion: '1.9.0',
        shouldCheckApiVersion: true
      })).rejects.toThrow('requires Obsidian 1.10.0');
      expect(mockEditJson).not.toHaveBeenCalled();
    });

    it('should preserve the stable minimum for a prerelease even when analysis is requested', async () => {
      await updateVersionInExtraFiles('1.0.1-beta.0', { minAppVersion: '1.9.0', shouldCheckApiVersion: true });
      expect(mockAnalyzePluginApiVersion).not.toHaveBeenCalled();
      expect(mockEditJson).toHaveBeenCalledTimes(1);
      const manifest: Record<string, string> = { minAppVersion: '1.0.0', version: '1.0.0' };
      await getEditJsonParams(0).editFunction(manifest);
      expect(manifest).toEqual({ minAppVersion: '1.0.0', version: '1.0.1-beta.0' });
    });

    it('should remove manifest-beta.json for a stable release when it exists', async () => {
      mockExistsSync.mockImplementation((path: string) => path === '/root/manifest-beta.json');
      await updateVersionInExtraFiles('1.0.1', { minAppVersion: '1.9.0' });
      expect(mockRm).toHaveBeenCalledWith('/root/manifest-beta.json');
    });
  });
});
