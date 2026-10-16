import {
  join,
  toPosixPath
} from '@mnaoumov/typescript-lib/path';
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

import {
  defineWdioObsidianConfig,
  testEndToEndWithWdioObsidian
} from './wdio-obsidian.ts';

interface ResolvePathFromRootSafeParams {
  readonly path: string;
}

const mocks = vi.hoisted(() => ({
  assertProjectPackagesInstalled: vi.fn(),
  execFromRoot: vi.fn(),
  npmRun: vi.fn(),
  rootFolder: ''
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async () => {
  const { resolve } = await import('@mnaoumov/typescript-lib/path');
  return {
    execFromRoot: mocks.execFromRoot,
    resolvePathFromRootSafe: ({ path }: ResolvePathFromRootSafeParams): string => resolve(mocks.rootFolder, path)
  };
});

vi.mock('@mnaoumov/typescript-dev-toolkit/npm-run', () => ({
  npmRun: mocks.npmRun
}));

vi.mock('./e2e-runner-support.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./e2e-runner-support.ts')>(),
  assertProjectPackagesInstalled: mocks.assertProjectPackagesInstalled
}));

describe('wdio-obsidian', () => {
  beforeEach(() => {
    mocks.rootFolder = toPosixPath(mkdtempSync(join(tmpdir(), 'wdio-obsidian-')));
    mocks.assertProjectPackagesInstalled.mockReset();
    mocks.execFromRoot.mockReset();
    mocks.npmRun.mockReset();
  });

  afterEach(() => {
    rmSync(mocks.rootFolder, { force: true, recursive: true });
  });

  describe('defineWdioObsidianConfig', () => {
    it('derives the config from the plugin layout, with an empty vault when there is no demo vault', () => {
      expect(defineWdioObsidianConfig()).toEqual({
        // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
        cacheDir: join(mocks.rootFolder, '.obsidian-cache'),
        capabilities: [{
          'browserName': 'obsidian',
          'browserVersion': 'latest',
          'wdio:obsidianOptions': { plugins: [join(mocks.rootFolder, 'dist/build')] }
        }],
        framework: 'mocha',
        logLevel: 'warn',
        // eslint-disable-next-line unicorn/name-replacements -- WebdriverIO's own option name.
        mochaOpts: { timeout: 60_000, ui: 'bdd' },
        reporters: ['obsidian'],
        runner: 'local',
        services: ['obsidian'],
        specs: ['./e2e/**/*.spec.ts']
      });
    });

    it('opens the demo vault when the project has one', () => {
      mkdirSync(join(mocks.rootFolder, 'demo-vault'));

      const [capability] = defineWdioObsidianConfig().capabilities;

      expect(capability?.['wdio:obsidianOptions'].vault).toBe(join(mocks.rootFolder, 'demo-vault'));
    });

    it('opens an empty vault when told to, even with a demo vault', () => {
      mkdirSync(join(mocks.rootFolder, 'demo-vault'));

      const [capability] = defineWdioObsidianConfig({ vault: false }).capabilities;

      expect(capability?.['wdio:obsidianOptions']).not.toHaveProperty('vault');
    });

    it('takes every option, with one capability per app version', () => {
      const config = defineWdioObsidianConfig({
        appVersions: ['earliest', 'latest'],
        cacheFolder: 'cache',
        installerVersion: 'earliest',
        maxInstances: 2,
        pluginFolder: 'out',
        specs: ['./tests/**/*.e2e.ts'],
        testTimeoutInMilliseconds: 5000,
        vault: 'test-vault'
      });

      expect(config.cacheDir).toBe(join(mocks.rootFolder, 'cache'));
      expect(config.maxInstances).toBe(2);
      expect(config.mochaOpts.timeout).toBe(5000);
      expect(config.specs).toEqual(['./tests/**/*.e2e.ts']);
      expect(config.capabilities).toEqual(['earliest', 'latest'].map((browserVersion) => ({
        'browserName': 'obsidian',
        browserVersion,
        'wdio:obsidianOptions': {
          installerVersion: 'earliest',
          plugins: [join(mocks.rootFolder, 'out')],
          vault: join(mocks.rootFolder, 'test-vault')
        }
      })));
      expect(config.capabilities[0]?.['wdio:obsidianOptions'].plugins).not.toBe(config.capabilities[1]?.['wdio:obsidianOptions'].plugins);
    });
  });

  describe('testEndToEndWithWdioObsidian', () => {
    it('builds, then runs wdio with the config it finds', async () => {
      writeFileSync(join(mocks.rootFolder, 'wdio.conf.ts'), '');

      await testEndToEndWithWdioObsidian();

      expect(mocks.assertProjectPackagesInstalled).toHaveBeenCalledWith({
        packageNames: ['@wdio/cli', '@wdio/local-runner', '@wdio/mocha-framework', 'wdio-obsidian-reporter', 'wdio-obsidian-service'],
        requester: 'testEndToEndWithWdioObsidian()'
      });
      expect(mocks.npmRun).toHaveBeenCalledWith('build');
      expect(mocks.execFromRoot).toHaveBeenCalledWith(['wdio', 'run', 'wdio.conf.ts'], { isInteractive: true });
    });

    it('prefers wdio.conf.mts', async () => {
      writeFileSync(join(mocks.rootFolder, 'wdio.conf.ts'), '');
      writeFileSync(join(mocks.rootFolder, 'wdio.conf.mts'), '');

      await testEndToEndWithWdioObsidian();

      expect(mocks.execFromRoot).toHaveBeenCalledWith(['wdio', 'run', 'wdio.conf.mts'], { isInteractive: true });
    });

    it('takes the config path and skips the build when told to', async () => {
      await testEndToEndWithWdioObsidian({ configPath: 'e2e/wdio.conf.mts', shouldBuild: false });

      expect(mocks.npmRun).not.toHaveBeenCalled();
      expect(mocks.execFromRoot).toHaveBeenCalledWith(['wdio', 'run', 'e2e/wdio.conf.mts'], { isInteractive: true });
    });

    it('reports a project with no config before building anything', async () => {
      await expect(testEndToEndWithWdioObsidian()).rejects.toThrow('found no WebdriverIO config (wdio.conf.mts, wdio.conf.ts)');
      expect(mocks.npmRun).not.toHaveBeenCalled();
    });
  });
});
