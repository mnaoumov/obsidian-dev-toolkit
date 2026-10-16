/**
 * @file
 *
 * This module defines an esbuild plugin that automatically copies the build output
 * to the Obsidian plugins folder during development. This plugin helps streamline
 * the development workflow by ensuring that the latest build is always available
 * in the correct Obsidian folder for testing and use.
 */

import type { Plugin } from 'esbuild';

import type { DeployToObsidianPluginsFolderParams } from '../obsidian-plugins-folder-deployment.ts';

import { deployToObsidianPluginsFolder } from '../obsidian-plugins-folder-deployment.ts';

/**
 * Parameters for {@link copyToObsidianPluginsFolderPlugin}.
 */
export type CopyToObsidianPluginsFolderPluginParams = DeployToObsidianPluginsFolderParams;

/**
 * Creates an esbuild plugin that copies the build output to the Obsidian plugins folder.
 *
 * @param params - The parameters for the function.
 * @returns An esbuild `Plugin` object.
 */
export function copyToObsidianPluginsFolderPlugin(params: CopyToObsidianPluginsFolderPluginParams): Plugin {
  return {
    name: 'copy-to-obsidian-plugins-folder',
    setup(build): void {
      build.onEnd(async () => {
        await deployToObsidianPluginsFolder(params);
      });
    }
  };
}
