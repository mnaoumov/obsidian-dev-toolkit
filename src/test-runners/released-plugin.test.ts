import { join } from '@mnaoumov/typescript-lib/path';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  downloadReleasedPlugin,
  getReleasedPluginPopulate
} from './released-plugin.ts';

const { mockGetRootFolder } = vi.hoisted(() => ({
  mockGetRootFolder: vi.fn<() => null | string>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/root')>(),
  getRootFolder: mockGetRootFolder
}));

const PLUGIN = {
  pluginId: 'some-plugin',
  repo: 'owner/some-plugin',
  version: '1.2.3'
};

function releaseUrl(assetName: string): string {
  return `https://github.com/owner/some-plugin/releases/download/1.2.3/${assetName}`;
}

function stubFetch(responses: Record<string, Response>): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn((url: string) => Promise.resolve(responses[url] ?? new Response('missing', { status: 404, statusText: 'Not Found' })));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

describe('released-plugin', () => {
  let rootFolder: string;
  let cacheFolder: string;

  beforeEach(async () => {
    rootFolder = await mkdtemp(join(tmpdir(), 'released-plugin-'));
    cacheFolder = join(rootFolder, 'node_modules', '.cache', 'obsidian-dev-toolkit', 'released-plugins', 'some-plugin', '1.2.3');
    mockGetRootFolder.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(rootFolder, { force: true, recursive: true });
  });

  describe('downloadReleasedPlugin', () => {
    it('should download both assets on first use and cache them', async () => {
      const mockFetch = stubFetch({
        [releaseUrl('main.js')]: new Response('main code'),
        [releaseUrl('manifest.json')]: new Response('{"id":"some-plugin"}')
      });

      expect(await downloadReleasedPlugin({ ...PLUGIN, rootFolder })).toEqual({
        mainJs: 'main code',
        manifestJson: '{"id":"some-plugin"}'
      });
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(await readFile(join(cacheFolder, 'main.js'), 'utf-8')).toBe('main code');
      expect(await readFile(join(cacheFolder, 'manifest.json'), 'utf-8')).toBe('{"id":"some-plugin"}');
      expect(existsSync(join(cacheFolder, `main.js.${String(process.pid)}.tmp`))).toBe(false);
    });

    it('should read cached assets without network I/O', async () => {
      await mkdir(cacheFolder, { recursive: true });
      await writeFile(join(cacheFolder, 'main.js'), 'cached main');
      await writeFile(join(cacheFolder, 'manifest.json'), 'cached manifest');
      const mockFetch = stubFetch({});

      expect(await downloadReleasedPlugin({ ...PLUGIN, rootFolder })).toEqual({
        mainJs: 'cached main',
        manifestJson: 'cached manifest'
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should default to the project root', async () => {
      mockGetRootFolder.mockReturnValue(rootFolder);
      stubFetch({
        [releaseUrl('main.js')]: new Response('main code'),
        [releaseUrl('manifest.json')]: new Response('manifest')
      });

      await downloadReleasedPlugin(PLUGIN);

      expect(await readFile(join(cacheFolder, 'main.js'), 'utf-8')).toBe('main code');
    });

    it('should throw when there is no project root', async () => {
      mockGetRootFolder.mockReturnValue(null);

      await expect(downloadReleasedPlugin(PLUGIN)).rejects.toThrow('Could not find the project root');
    });

    it('should throw when an asset cannot be downloaded', async () => {
      stubFetch({});

      await expect(downloadReleasedPlugin({ ...PLUGIN, rootFolder })).rejects.toThrow(
        `Could not download ${releaseUrl('main.js')}: HTTP 404 Not Found`
      );
      expect(existsSync(join(cacheFolder, 'main.js'))).toBe(false);
    });
  });

  describe('getReleasedPluginPopulate', () => {
    beforeEach(() => {
      stubFetch({
        [releaseUrl('main.js')]: new Response('main code'),
        [releaseUrl('manifest.json')]: new Response('manifest')
      });
    });

    it('should install the plugin with its settings', async () => {
      expect(await getReleasedPluginPopulate({ ...PLUGIN, data: { isOn: false }, rootFolder })).toEqual({
        '.obsidian/plugins/some-plugin/data.json': '{"isOn":false}',
        '.obsidian/plugins/some-plugin/main.js': 'main code',
        '.obsidian/plugins/some-plugin/manifest.json': 'manifest'
      });
    });

    it('should throw when the settings are not JSON-serializable', async () => {
      await expect(getReleasedPluginPopulate({ ...PLUGIN, data: (): void => undefined, rootFolder })).rejects.toThrow(
        'The plugin settings are not JSON-serializable'
      );
    });

    it('should seed no settings when none are given, into a custom config folder', async () => {
      expect(await getReleasedPluginPopulate({ ...PLUGIN, configFolder: '.config', rootFolder })).toEqual({
        '.config/plugins/some-plugin/main.js': 'main code',
        '.config/plugins/some-plugin/manifest.json': 'manifest'
      });
    });
  });
});
