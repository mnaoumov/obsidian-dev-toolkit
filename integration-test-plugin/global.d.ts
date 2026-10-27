/**
 * @file
 *
 * Global type augmentation for the integration test harness plugin.
 * Declares the strongly typed `__obsidianLibModule` property on `Window`.
 */

// eslint-disable-next-line import-x/no-namespace -- Need entire module for typeof.
import type * as obsidianLib from '@mnaoumov/obsidian-lib';

declare global {
  interface Window {
    // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Installed on plugin load and deleted on unload.
    __obsidianLibModule?: typeof obsidianLib;
  }
}
