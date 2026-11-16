/**
 * @file
 *
 * Restores Node's `TextEncoder` and `TextDecoder` on a test environment's global object that lacks them.
 *
 * `vitest`'s `jsdom` environment copies both from Node, but `jest-environment-jsdom` does not, so under Jest an
 * `@mnaoumov/obsidian-lib` plugin's `onload` threw `ReferenceError: TextEncoder is not defined`. The generic
 * `restoreNodeWebGlobals` from `@mnaoumov/typescript-test-toolkit` does not cover these two names.
 */

import {
  TextDecoder,
  TextEncoder
} from 'node:util';

/**
 * The text codec classes this module restores, by global name.
 */
export const NODE_TEXT_CODEC_GLOBALS: Readonly<Record<'TextDecoder' | 'TextEncoder', unknown>> = {
  TextDecoder,
  TextEncoder
};

/**
 * Defines each of `TextEncoder` and `TextDecoder` on the target from `node:util`, unless the target already has it.
 *
 * @param target - The global object to fill in.
 */
// eslint-disable-next-line obsidianmd/no-global-this -- Runs in a test environment, where the global object is the one to fill, not a popout window.
export function restoreNodeTextCodecGlobals(target: object = globalThis): void {
  for (const [name, value] of Object.entries(NODE_TEXT_CODEC_GLOBALS)) {
    if (Reflect.has(target, name)) {
      continue;
    }

    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: false,
      value,
      writable: true
    });
  }
}
