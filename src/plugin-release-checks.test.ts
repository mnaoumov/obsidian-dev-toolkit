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

import type { ValidatePluginReleaseOptions } from './plugin-release-checks.ts';

import {
  formatPluginCheckFindings,
  hasPluginCheckErrors,
  validatePluginManifest,
  validatePluginRelease,
  validateReleaseAssets,
  validateReleaseTag,
  validateVersionsJson
} from './plugin-release-checks.ts';

const { mockGetRootFolder } = vi.hoisted(() => ({
  mockGetRootFolder: vi.fn<() => null | string>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/root')>(),
  getRootFolder: mockGetRootFolder
}));

const VALID_MANIFEST = {
  author: 'Jane Doe',
  authorUrl: 'https://example.com',
  description: 'Fixes the tab size everywhere.',
  id: 'fix-tab-size',
  isDesktopOnly: false,
  minAppVersion: '1.5.0',
  name: 'Fix Tab Size',
  version: '1.2.3'
};

const COMMUNITY_PLUGINS_JSON_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json';

function ruleIds(manifest: unknown): string[] {
  return validatePluginManifest(manifest).map((finding) => finding.ruleId);
}

function stubDirectory(body: unknown, init?: ResponseInit): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn(() => Promise.resolve(Response.json(body, init)));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validatePluginManifest', () => {
  it('should pass a valid manifest', () => {
    expect(validatePluginManifest(VALID_MANIFEST)).toEqual([]);
  });

  it('should reject a manifest that is not an object', () => {
    expect(ruleIds('x')).toEqual(['manifest-invalid-json']);
    expect(ruleIds(null)).toEqual(['manifest-invalid-json']);
  });

  it('should report every missing required field', () => {
    expect(ruleIds({ author: 'A', isDesktopOnly: true, minAppVersion: '1.0.0' })).toEqual([
      'manifest-missing-required-field',
      'manifest-missing-required-field',
      'manifest-missing-required-field',
      'manifest-missing-required-field'
    ]);
    expect(ruleIds({ ...VALID_MANIFEST, id: '  ' })).toEqual(['manifest-missing-required-field']);
  });

  it('should reject banned words and characters in the id, unless the id is listed', () => {
    expect(ruleIds({ ...VALID_MANIFEST, id: 'obsidian-tab-plugin' })).toEqual(['manifest-id-banned-word', 'manifest-id-banned-word']);
    expect(ruleIds({ ...VALID_MANIFEST, id: 'Tab Size' })).toEqual(['manifest-id-invalid']);
    expect(validatePluginManifest({ ...VALID_MANIFEST, id: 'obsidian-tabs' }, { isIdListed: true })).toEqual([]);
  });

  it('should check the name', () => {
    expect(ruleIds({ ...VALID_MANIFEST, name: 'Obsidian Tabs' })).toEqual(['manifest-disallowed-name']);
    expect(ruleIds({ ...VALID_MANIFEST, name: 'T'.repeat(51) })).toEqual(['manifest-name-too-long', 'manifest-name-all-caps']);
    expect(ruleIds({ ...VALID_MANIFEST, name: 'TABS' })).toEqual(['manifest-name-all-caps']);
    expect(ruleIds({ ...VALID_MANIFEST, name: 'X' })).toEqual([]);
    expect(ruleIds({ ...VALID_MANIFEST, name: 'tabs' })).toEqual([]);
  });

  it('should check the version unless told not to', () => {
    expect(ruleIds({ ...VALID_MANIFEST, version: 'v1.2.3' })).toEqual(['manifest-invalid-semver']);
    expect(ruleIds({ ...VALID_MANIFEST, version: '0.0.0' })).toEqual(['manifest-version-placeholder']);
    expect(ruleIds({ ...VALID_MANIFEST, version: '1.2.3-beta.1' })).toEqual([]);
    expect(validatePluginManifest({ ...VALID_MANIFEST, version: '0.0.0' }, { shouldCheckVersion: false })).toEqual([]);
  });

  it('should check the description', () => {
    expect(ruleIds({ ...VALID_MANIFEST, description: 'Short.' })).toEqual(['manifest-description-too-short']);
    expect(ruleIds({ ...VALID_MANIFEST, description: 'Fix Tab Size' })).toEqual([
      'manifest-description-equals-name',
      'manifest-description-starts-with-name',
      'manifest-description-punctuation'
    ]);
    expect(ruleIds({ ...VALID_MANIFEST, description: 'This plugin fixes tabs.' })).toEqual(['manifest-description-self-reference']);
    expect(ruleIds({ ...VALID_MANIFEST, description: `${'a'.repeat(251)}.` })).toEqual(['manifest-description-too-long']);
    expect(ruleIds({ ...VALID_MANIFEST, description: 'Fixes tabs in Obsidian!' })).toEqual(['manifest-description-brand-name']);
    expect(ruleIds({ ...VALID_MANIFEST, description: 'Fixes the tabs nicely?', name: undefined })).toEqual(['manifest-missing-required-field']);
  });

  it('should check minAppVersion only when it is a non-empty string', () => {
    expect(ruleIds({ ...VALID_MANIFEST, minAppVersion: 'latest' })).toEqual(['manifest-invalid-semver']);
    expect(ruleIds({ ...VALID_MANIFEST, minAppVersion: '' })).toEqual([]);
  });

  it('should check the author', () => {
    expect(ruleIds({ ...VALID_MANIFEST, author: 'Your Name' })).toEqual(['manifest-author-placeholder']);
    expect(ruleIds({ ...VALID_MANIFEST, author: 'Jane <jane@example.com>' })).toEqual(['manifest-author-email']);
    expect(ruleIds({ ...VALID_MANIFEST, author: 'Jane https://jane.dev' })).toEqual(['manifest-author-url']);
    expect(ruleIds({ ...VALID_MANIFEST, author: 1 })).toEqual([]);
  });

  it('should require isDesktopOnly to be a boolean', () => {
    expect(ruleIds({ ...VALID_MANIFEST, isDesktopOnly: 'no' })).toEqual(['manifest-is-desktop-only-type']);
  });

  it('should check the URLs', () => {
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'not a url' })).toEqual(['manifest-url-invalid']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'ftp://1.2.3.4/' })).toEqual(['manifest-url-non-https', 'manifest-url-raw-ip']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'https://obsidian.md' })).toEqual(['manifest-url-obsidian']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'https://www.obsidian.md' })).toEqual(['manifest-url-obsidian']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'https://github.com/jane/tabs' })).toEqual(['manifest-author-url-repo']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'https://www.github.com/jane/tabs' })).toEqual(['manifest-author-url-repo']);
    expect(ruleIds({ ...VALID_MANIFEST, authorUrl: 'https://github.com/jane' })).toEqual([]);
    expect(ruleIds({ ...VALID_MANIFEST, fundingUrl: 'https://github.com/sponsors/jane/x' })).toEqual([]);
    expect(ruleIds({ ...VALID_MANIFEST, fundingUrl: { 'Buy me a coffee': 'ftp://x.dev', 'GitHub': 'https://github.com/sponsors/jane' } })).toEqual([
      'manifest-url-non-https'
    ]);
  });

  it('should warn on unknown and missing recommended fields', () => {
    const { author: _author, isDesktopOnly: _isDesktopOnly, minAppVersion: _minAppVersion, ...rest } = VALID_MANIFEST;
    expect(ruleIds({ ...rest, helpUrl: 'https://example.com' })).toEqual([
      'manifest-unknown-field',
      'manifest-missing-recommended-field',
      'manifest-missing-recommended-field',
      'manifest-missing-recommended-field'
    ]);
  });
});

describe('validateVersionsJson', () => {
  it('should pass a semver map', () => {
    expect(validateVersionsJson({ '1.0.0': '1.5.0' })).toEqual([]);
  });

  it('should reject what is not an object', () => {
    expect(validateVersionsJson([]).map((finding) => finding.ruleId)).toEqual(['versions-invalid-format']);
    expect(validateVersionsJson(1).map((finding) => finding.ruleId)).toEqual(['versions-invalid-format']);
  });

  it('should warn on keys and values that are not semver', () => {
    expect(validateVersionsJson({ '1.0.0': 'x', 'v1': 1 }).map((finding) => finding.level)).toEqual(['warning', 'warning', 'warning']);
  });
});

describe('validateReleaseTag', () => {
  it('should pass the bare manifest version', () => {
    expect(validateReleaseTag('1.2.3', '1.2.3')).toEqual([]);
  });

  it('should reject a v prefix and a mismatch', () => {
    expect(validateReleaseTag('v1.2.3', '1.2.3').map((finding) => finding.ruleId)).toEqual([
      'release-tag-v-prefix',
      'release-manifest-version-mismatch',
      'release-tag-not-numeric'
    ]);
  });

  it('should only warn on a pre-release tag when there is no manifest version', () => {
    expect(validateReleaseTag('1.2.3-beta.1', undefined)).toEqual([expect.objectContaining({ level: 'warning', ruleId: 'release-tag-not-numeric' })]);
  });
});

describe('validateReleaseAssets', () => {
  it('should require main.js and manifest.json', () => {
    expect(validateReleaseAssets(['main.js', 'manifest.json', 'styles.css'])).toEqual([]);
    expect(validateReleaseAssets([]).map((finding) => finding.ruleId)).toEqual(['release-asset-main-js-missing', 'release-asset-manifest-missing']);
    expect(validateReleaseAssets([], 'dist/build')[0]?.message).toContain('in dist/build');
    expect(validateReleaseAssets([])[0]?.message).toContain('in the release');
  });
});

describe('formatPluginCheckFindings and hasPluginCheckErrors', () => {
  it('should list errors first', () => {
    const findings = [
      { level: 'warning', message: 'w', ruleId: 'a' },
      { level: 'error', message: 'e', ruleId: 'b' }
    ] as const;
    expect(formatPluginCheckFindings(findings)).toBe('error: e (b)\nwarning: w (a)');
    expect(hasPluginCheckErrors(findings)).toBe(true);
    expect(hasPluginCheckErrors([findings[0]])).toBe(false);
  });
});

describe('validatePluginRelease', () => {
  let rootFolder: string;

  beforeEach(async () => {
    rootFolder = await mkdtemp(join(tmpdir(), 'plugin-release-checks-'));
  });

  afterEach(async () => {
    await rm(rootFolder, { force: true, recursive: true });
  });

  async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFile(join(rootFolder, path), typeof value === 'string' ? value : JSON.stringify(value) ?? '');
  }

  async function releaseRuleIds(options: ValidatePluginReleaseOptions = {}): Promise<string[]> {
    const findings = await validatePluginRelease({ rootFolder, ...options });
    return findings.map((finding) => finding.ruleId);
  }

  it('should report a missing manifest', async () => {
    expect(await releaseRuleIds()).toEqual(['manifest-invalid-json']);
    const findings = await validatePluginRelease({ manifestFile: 'missing.json', rootFolder });
    expect(findings).toEqual([expect.objectContaining({ message: 'missing.json not found or is not valid JSON.' })]);
  });

  it('should report a manifest that is not an object', async () => {
    await writeJson('manifest.json', '"x"');
    expect(await releaseRuleIds()).toEqual(['manifest-invalid-json']);
  });

  it('should default the root to the project root', async () => {
    mockGetRootFolder.mockReturnValue(rootFolder);
    await writeJson('manifest.json', VALID_MANIFEST);
    expect(await validatePluginRelease()).toEqual([]);
  });

  it('should check versions.json, the tag and the assets', async () => {
    await writeJson('manifest.json', VALID_MANIFEST);
    await writeJson('versions.json', { '1.2.3': 'x' });
    await mkdir(join(rootFolder, 'dist/build'), { recursive: true });
    await writeJson('dist/build/manifest.json', { ...VALID_MANIFEST, version: '1.2.2' });
    expect(await releaseRuleIds({ tag: 'v1.2.3' })).toEqual([
      'versions-invalid-semver',
      'release-tag-v-prefix',
      'release-manifest-version-mismatch',
      'release-tag-not-numeric',
      'release-asset-main-js-missing',
      'release-asset-manifest-stale'
    ]);
  });

  it('should report a versions.json that does not parse', async () => {
    await writeJson('manifest.json', VALID_MANIFEST);
    await writeJson('versions.json', '{');
    expect(await releaseRuleIds()).toEqual(['versions-invalid-json']);
  });

  it('should not compare versions when either manifest has none', async () => {
    await writeJson('manifest.json', { ...VALID_MANIFEST, version: 1 });
    await mkdir(join(rootFolder, 'out'), { recursive: true });
    await writeJson('out/main.js', '');
    await writeJson('out/manifest.json', VALID_MANIFEST);
    expect(await releaseRuleIds({ distFolder: 'out' })).toEqual(['manifest-missing-required-field']);

    await writeJson('manifest.json', VALID_MANIFEST);
    await writeJson('out/manifest.json', '[');
    expect(await releaseRuleIds({ distFolder: 'out' })).toEqual([]);
  });

  it('should skip the version, and read another manifest file, when told to', async () => {
    await writeJson('manifest-beta.json', { ...VALID_MANIFEST, version: '0.0.0' });
    expect(await releaseRuleIds({ manifestFile: 'manifest-beta.json', shouldCheckVersion: false })).toEqual([]);
    expect(await releaseRuleIds({ manifestFile: 'manifest-beta.json' })).toEqual(['manifest-version-placeholder']);
  });

  it('should require the asset folder only when asked, and skip it when told to', async () => {
    await writeJson('manifest.json', VALID_MANIFEST);
    expect(await releaseRuleIds()).toEqual([]);
    expect(await releaseRuleIds({ shouldRequireAssets: true })).toEqual(['release-assets-missing']);
    expect(await releaseRuleIds({ shouldCheckAssets: false, shouldRequireAssets: true })).toEqual([]);
  });

  describe('a banned word in a listed ID', () => {
    beforeEach(async () => {
      await writeJson('manifest.json', { ...VALID_MANIFEST, id: 'obsidian-tabs' });
    });

    it('should be exempt when the directory lists the ID for this repository', async () => {
      const mockFetch = stubDirectory([{ id: 'other' }, { id: 'obsidian-tabs', repo: 'Jane/Tabs' }]);
      expect(await releaseRuleIds({ repository: 'jane/tabs' })).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(COMMUNITY_PLUGINS_JSON_URL);
      expect(await releaseRuleIds()).toEqual([]);
    });

    it('should not be exempt for another repository, or an ID the directory does not list', async () => {
      stubDirectory([{ id: 'obsidian-tabs', repo: 'someone/else' }]);
      expect(await releaseRuleIds({ repository: 'jane/tabs' })).toEqual(['manifest-id-banned-word']);
      stubDirectory([{ id: 'obsidian-tabs' }]);
      expect(await releaseRuleIds({ repository: 'jane/tabs' })).toEqual(['manifest-id-banned-word']);
      stubDirectory([1, { id: 'x' }]);
      expect(await releaseRuleIds()).toEqual(['manifest-id-banned-word']);
    });

    it('should warn when the directory cannot be read', async () => {
      const unavailable = ['manifest-id-banned-word', 'registry-unavailable'];
      stubDirectory([], { status: 500 });
      expect(await releaseRuleIds()).toEqual(unavailable);
      stubDirectory({});
      expect(await releaseRuleIds()).toEqual(unavailable);
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      expect(await releaseRuleIds()).toEqual(unavailable);
    });
  });
});
