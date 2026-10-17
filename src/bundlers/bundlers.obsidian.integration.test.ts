/**
 * @file
 *
 * Builds the fixture plugin with every bundler adapter and loads each build in a real Obsidian, through
 * `obsidian-integration-testing`. `bundlers.integration.test.ts` loads the same builds in a model of Obsidian's plugin
 * loader, which needs no Obsidian; this suite checks what only a live app has: the real `obsidian` module, a Node
 * builtin reached through Electron's `require`, and `styles.css` loaded and unloaded with the plugin.
 *
 * Two projects run it: `obsidian-integration-tests` in a desktop Obsidian (`npm run test:integration:obsidian`) and
 * `obsidian-android-integration-tests` in Obsidian Mobile on an Android emulator (`npm run
 * test:integration:obsidian:android`). CI has neither, so both run locally only.
 */

import {
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import {
  join,
  sep
} from 'node:path';
import {
  DEFAULT_CONFIG_DIRECTORY,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-no-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  inject,
  it
} from 'vitest';

import {
  BUILD_TIMEOUT_IN_MILLISECONDS,
  buildFixture,
  BUNDLER_CASES,
  createFixtureFolder
} from '../../scripts/helpers/bundler-fixture.ts';

interface FixtureManifest {
  id: string;
  name: string;
}

// HotReload's marker is a development build's own file, not one Obsidian reads.
const HOT_RELOAD_MARKER_FILE_NAME = '.hotreload';
const COMMAND_ID = 'greet';
const STYLED_CLASS_NAME = 'bundler-fixture-plugin';

// Each case writes the same fixture's `dist` folder; the cases of one file run one after another.
describe('every bundler adapter builds a plugin a real Obsidian loads', () => {
  const vault = getTemporaryVault();
  // The project picks the platform; asserting `app.isMobile` against it proves the build ran where the project says.
  const isMobile = inject('obsidianTransport')?.type === 'obsidian-android-appium';
  let fixtureFolder = '';

  beforeAll(() => {
    fixtureFolder = createFixtureFolder();
  });

  afterAll(() => {
    if (fixtureFolder) {
      rmSync(fixtureFolder, { force: true, recursive: true });
    }
  });

  it.each(BUNDLER_CASES)('$bundler (development: $isDevelopment)', async ({ bundler, isDevelopment }) => {
    const distFolder = buildFixture(fixtureFolder, bundler, isDevelopment);

    // One plugin id per case, so no case loads a plugin an earlier one left registered.
    const pluginId = `bundler-fixture-plugin-${bundler}${isDevelopment ? '-dev' : ''}`;
    const pluginFolder = `${DEFAULT_CONFIG_DIRECTORY}/plugins/${pluginId}`;
    const manifest = JSON.parse(readFileSync(join(distFolder, 'manifest.json'), 'utf-8')) as FixtureManifest;
    manifest.id = pluginId;
    const files: Record<string, string> = {};
    for (const fileName of readdirSync(distFolder)) {
      if (fileName !== HOT_RELOAD_MARKER_FILE_NAME) {
        files[`${pluginFolder}/${fileName}`] = readFileSync(join(distFolder, fileName), 'utf-8');
      }
    }
    files[`${pluginFolder}/manifest.json`] = JSON.stringify(manifest);
    vault.populate(files);
    await vault.syncToDevice();

    const result = await evalInObsidian({
      callback: async ({ app, className, commandId, lib: { waitUntil }, obsidianModule, pluginId: id }) => {
        function readStyledContent(): string {
          const element = activeDocument.body.createDiv({ cls: className });
          const content = activeWindow.getComputedStyle(element, '::after').content;
          element.remove();
          return content;
        }

        const fullCommandId = `${id}:${commandId}`;
        await app.plugins.loadManifests();
        const isEnabled = await app.plugins.enablePlugin(id);
        await waitUntil({
          message: `the command ${fullCommandId} to be registered`,
          predicate: () => app.commands.findCommand(fullCommandId) !== undefined
        });

        const plugin = app.plugins.getPlugin(id);
        const command = app.commands.findCommand(fullCommandId);
        const loaded = {
          commandName: command?.name,
          // Mobile has no Node builtins, so the fixture's `sep` is missing there: esbuild's interop reads it as
          // `undefined` and every other bundler throws. Gating a builtin is the plugin's job, not the bundle's.
          commandResult: app.isMobile ? undefined : command?.callback?.() as unknown,
          isEnabled,
          isMobile: app.isMobile,
          isPluginInstance: plugin instanceof obsidianModule.Plugin,
          styledContent: readStyledContent()
        };

        await app.plugins.disablePlugin(id);
        return {
          ...loaded,
          isCommandLeftAfterDisable: app.commands.findCommand(fullCommandId) !== undefined,
          styledContentAfterDisable: readStyledContent()
        };
      },
      input: { className: STYLED_CLASS_NAME, commandId: COMMAND_ID, pluginId },
      vaultPath: vault.path
    });

    expect(result).toEqual({
      commandName: `${manifest.name}: Hello, bundler`,
      commandResult: isMobile ? undefined : sep,
      isCommandLeftAfterDisable: false,
      isEnabled: true,
      isMobile,
      isPluginInstance: true,
      styledContent: '"bundler fixture"',
      styledContentAfterDisable: 'none'
    });
  }, BUILD_TIMEOUT_IN_MILLISECONDS);
});
