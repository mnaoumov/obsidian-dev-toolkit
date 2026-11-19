/**
 * @file
 *
 * Fails a production build whose `main.js` cannot even be LOADED on Obsidian mobile.
 *
 * The failure this guards against is invisible on desktop and reads as a mystery on a phone: a module
 * reached while the bundle initializes evaluates a platform-only API, so the plugin dies before any of
 * its code runs. The integration-test harness plugin died exactly that way on Android: the generated
 * barrels imported `desktop-demo-vault-opener.ts`, whose `adm-zip` dependency opens with a top-level
 * `const { randomFillSync } = require('crypto')`, and mobile's `require` hands back `undefined`.
 *
 * The check evaluates the emitted bundle in a `node:vm` context shaped like Obsidian mobile: `require`
 * returns `undefined` for every Node builtin and a permissive stub for the externals the app itself
 * provides (`obsidian`, `electron`, the CodeMirror packages), `process` is present and renderer-shaped,
 * which is what keeps a runtime-branching dependency such as `debug` on its browser branch there, and the
 * globals a webview has (the DOM, `URL`, `TextEncoder`, Obsidian's own `createDiv`...) are present. Node's
 * own globals, `Buffer` first of all, are absent, as they are on a phone. Loading the bundle that shipped
 * the Android failure reproduces that exact error in milliseconds, so this is a faithful model rather than
 * a proxy for one.
 *
 * It asserts only that module INITIALIZATION survives: nothing is called, so a helper that reaches a
 * Node builtin from inside a function (a call-time dynamic `import()`) passes, which is the whole
 * point: platform-only work is allowed, evaluating it at load time is not. Executing the bundle, rather
 * than scanning its text for `process.env` or `require("node:...")`, reports only what really throws on a
 * phone, whatever its spelling.
 */

import type { PluginManifest } from 'obsidian';

import { noop } from '@mnaoumov/typescript-lib/function';
import { join } from '@mnaoumov/typescript-lib/path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import {
  createContext,
  runInContext
} from 'node:vm';

import { ObsidianPluginRepoPaths } from '../obsidian-plugin-repo-paths.ts';

/**
 * Parameters for {@link assertMainJsLoadsOnMobile}: the part of the build context it reads.
 */
export interface AssertMainJsLoadsOnMobileParams {
  /**
   * The output folder, holding the built `manifest.json`.
   */
  readonly distFolder: string;

  /**
   * Whether this is a production build. A development build is never checked.
   */
  readonly isProductionBuild: boolean;

  /**
   * The absolute path of the emitted `main.js`.
   */
  readonly mainJsPath: string;

  /**
   * Whether the check runs at all.
   */
  readonly shouldCheckMobileLoad: boolean;
}

/**
 * Parameters for {@link assertMobileLoadableBundle}.
 */
export interface AssertMobileLoadableBundleParams {
  /**
   * The bundle's path, used to name it in the failure message and as the `filename` of the evaluated
   * script, so the reported stack frames point at real line numbers.
   */
  readonly bundlePath: string;

  /**
   * The bundle's JavaScript source.
   */
  readonly bundleSource: string;
}

const NODE_BUILTIN_MODULE_IDS = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleId) => `node:${moduleId}`)
]);

/**
 * Web platform globals Node implements too, so the real ones are handed to the bundle. A webview has every one of them.
 */
const SHARED_WEB_GLOBAL_NAMES: readonly string[] = [
  'AbortController',
  'AbortSignal',
  'atob',
  'Blob',
  'btoa',
  'BroadcastChannel',
  'clearInterval',
  'clearTimeout',
  'console',
  'crypto',
  'CustomEvent',
  'DOMException',
  'Event',
  'EventTarget',
  'fetch',
  'File',
  'FormData',
  'Headers',
  'MessageChannel',
  'MessageEvent',
  'MessagePort',
  'performance',
  'queueMicrotask',
  'ReadableStream',
  'Request',
  'Response',
  'setInterval',
  'setTimeout',
  'structuredClone',
  'TextDecoder',
  'TextEncoder',
  'TransformStream',
  'URL',
  'URLSearchParams',
  'WritableStream'
];

/**
 * Globals a webview, or Obsidian itself, provides and Node does not. Each is a permissive stand-in, so a top level that
 * subclasses `HTMLElement` or reads `localStorage` is not failed for a name a phone does have.
 */
const STUBBED_GLOBAL_NAMES: readonly string[] = [
  // The DOM.
  'activeDocument',
  'activeWindow',
  'cancelAnimationFrame',
  'CSS',
  'customElements',
  'document',
  'DocumentFragment',
  'DOMParser',
  'Element',
  'FileReader',
  'getComputedStyle',
  'history',
  'HTMLElement',
  'Image',
  'indexedDB',
  'IntersectionObserver',
  'KeyboardEvent',
  'localStorage',
  'location',
  'matchMedia',
  'MouseEvent',
  'MutationObserver',
  'navigator',
  'Node',
  'Range',
  'requestAnimationFrame',
  'ResizeObserver',
  'sessionStorage',
  'SVGElement',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  // Obsidian's own globals.
  'ajax',
  'ajaxPromise',
  'app',
  'createDiv',
  'createEl',
  'createFragment',
  'createSpan',
  'createSvg',
  'fish',
  'fishAll',
  'i18next',
  'isBoolean',
  'moment',
  'nextFrame',
  'ready',
  'sleep'
];

const REPORTED_STACK_FRAME_COUNT = 4;

/**
 * Asserts that a production `main.js` loads on Obsidian mobile, unless the plugin's built `manifest.json` says it is
 * desktop-only, the check is turned off, or the build is a development one. Every bundler adapter calls it once the
 * output folder is complete.
 *
 * @param params - The {@link AssertMainJsLoadsOnMobileParams}.
 * @returns A {@link Promise} that resolves once the bundle is checked, or found not to need it.
 * @throws An {@link Error} naming the bundle and the underlying failure when its initialization throws.
 */
export async function assertMainJsLoadsOnMobile(params: AssertMainJsLoadsOnMobileParams): Promise<void> {
  const { distFolder, isProductionBuild, mainJsPath, shouldCheckMobileLoad } = params;
  if (!isProductionBuild || !shouldCheckMobileLoad || !existsSync(mainJsPath) || (await isDesktopOnlyPlugin(join(distFolder, ObsidianPluginRepoPaths.ManifestJson)))) {
    return;
  }

  assertMobileLoadableBundle({
    bundlePath: mainJsPath,
    bundleSource: await readFile(mainJsPath, 'utf-8')
  });
}

/**
 * Asserts that the bundle's top level survives on Obsidian mobile.
 *
 * @param params - The {@link AssertMobileLoadableBundleParams}.
 * @throws An {@link Error} naming the bundle and the underlying failure when initialization throws.
 */
export function assertMobileLoadableBundle(params: AssertMobileLoadableBundleParams): void {
  const { bundlePath, bundleSource } = params;

  try {
    runInContext(bundleSource, createMobileContext(), { filename: bundlePath });
  } catch (error) {
    throw new Error(
      `The bundle \`${bundlePath}\` cannot load on Obsidian mobile.\n\n`
        + 'Its top level threw while every Node builtin `require(…)` returned `undefined` and Node\'s own globals '
        + 'were absent, which is what Obsidian mobile hands it:\n'
        + `${formatMobileLoadFailure(error)}\n\n`
        + 'Something reached at load time evaluates a platform-only API. Defer the offending dependency to a call-time '
        + 'dynamic `import()` from inside the function that needs it, and keep the platform-restricted work there. '
        + 'If the plugin is desktop-only, set `"isDesktopOnly": true` in `manifest.json`. If the check is wrong about a '
        + 'global a phone does have, pass `shouldCheckMobileLoad: false` to the builder and report it.',
      { cause: error }
    );
  }
}

/**
 * Builds the `node:vm` context that stands in for Obsidian mobile.
 *
 * @returns The `node:vm` context standing in for a phone.
 */
function createMobileContext(): object {
  // eslint-disable-next-line obsidianmd/no-global-this -- Build-time Node code, not plugin code: it hands Node's real web globals over.
  const nodeGlobals = globalThis as Record<string, unknown>;
  // A name the running Node lacks is simply left out, as if the webview lacked it too.
  const sandbox: Record<string, unknown> = Object.fromEntries([
    ...SHARED_WEB_GLOBAL_NAMES.filter((name) => Object.hasOwn(nodeGlobals, name)).map((name): [string, unknown] => [name, nodeGlobals[name]]),
    ...STUBBED_GLOBAL_NAMES.map((name): [string, unknown] => [name, createMobileStub()])
  ]);

  sandbox['exports'] = {};
  sandbox['module'] = { exports: {} };
  // Obsidian mobile runs in a webview, so a dependency that branches on `process` at load time (such as `debug`) must
  // take the same branch a renderer does. Leaving `process` out instead sends those dependencies down their Node path
  // and reports a failure no phone would ever see.
  sandbox['process'] = { env: {}, type: 'renderer' };
  sandbox['require'] = requireLikeMobile;

  // The four aliases every browser global goes by all point back at the sandbox.
  for (const alias of ['global', 'globalThis', 'self', 'window']) {
    sandbox[alias] = sandbox;
  }

  return createContext(sandbox);
}

/**
 * Builds a permissive stand-in for a module (or global) the app provides but this check does not model.
 *
 * Every property access, call and construction yields another stand-in, so a bundle may reach as deep
 * into it as it likes at load time without the check inventing a failure the app would not produce.
 *
 * @returns The stand-in.
 */
function createMobileStub(): unknown {
  return new Proxy(noop, {
    apply: (): unknown => createMobileStub(),
    construct: (): object => createMobileStub() as object,
    // `then` must stay `undefined`: a stand-in that answers it looks like a thenable, so awaiting one
    // would hang instead of resolving.
    get: (_target, property): unknown => {
      if (property === 'then') {
        return undefined;
      }
      // A top level such as `React`'s reads `navigator.userAgent` into a string, which needs a primitive.
      if (property === Symbol.toPrimitive) {
        return toMobileStubPrimitive;
      }
      return createMobileStub();
    },
    has: (): boolean => true
  });
}

/**
 * Renders the underlying failure, keeping enough stack to name the module that threw.
 *
 * @param error - The value thrown while the bundle initialized.
 * @returns The indented message and its leading stack frames.
 */
function formatMobileLoadFailure(error: unknown): string {
  if (!isErrorLike(error)) {
    return `  ${String(error)}`;
  }

  // A `node:vm` stack opens with an excerpt of the offending line, which in a minified bundle is a thousand characters
  // of noise, so only the message and the leading frames are kept.
  const frames = String(error.stack)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, REPORTED_STACK_FRAME_COUNT);
  return [`${String(error.name)}: ${String(error.message)}`, ...frames].map((line) => `  ${line}`).join('\n');
}

/**
 * Tells whether the built `manifest.json` declares the plugin desktop-only. A missing or unreadable manifest is read as
 * not desktop-only, which is Obsidian's own default.
 *
 * @param manifestPath - The path of the built `manifest.json`.
 * @returns A {@link Promise} that resolves to `true` for a desktop-only plugin.
 */
async function isDesktopOnlyPlugin(manifestPath: string): Promise<boolean> {
  if (!existsSync(manifestPath)) {
    return false;
  }

  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as Partial<PluginManifest>;
    return manifest.isDesktopOnly === true;
  } catch {
    return false;
  }
}

/**
 * Tells whether a thrown value is an error. An error thrown in the `node:vm` context comes from that context's own
 * realm, where `instanceof Error` is `false`, so it is recognized by its shape.
 *
 * @param value - The thrown value.
 * @returns `true` when the value carries a name, a message and a stack.
 */
function isErrorLike(value: unknown): value is Record<'message' | 'name' | 'stack', unknown> {
  return typeof value === 'object' && value !== null && 'message' in value && 'name' in value && 'stack' in value;
}

/**
 * Resolves a module id the way Obsidian mobile does.
 *
 * @param moduleId - The requested module id.
 * @returns `undefined` for a Node builtin (mobile has none), a permissive stand-in otherwise.
 */
function requireLikeMobile(moduleId: string): unknown {
  return NODE_BUILTIN_MODULE_IDS.has(moduleId) ? undefined : createMobileStub();
}

/**
 * Converts a stand-in to a primitive: an empty string, or `0` where a number is wanted.
 *
 * @param hint - The conversion hint.
 * @returns The primitive.
 */
function toMobileStubPrimitive(hint: string): number | string {
  return hint === 'number' ? 0 : '';
}
