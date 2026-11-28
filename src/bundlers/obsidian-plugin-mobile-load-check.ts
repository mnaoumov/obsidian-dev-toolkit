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
 * A constructor a DOM interface class can extend.
 */
type DomInterfaceConstructor = new (...arguments_: never[]) => object;

/**
 * A DOM interface the context models as a real class, so its `prototype` is a real object.
 */
interface DomInterfaceDefinition {
  /**
   * The accessor properties its prototype declares, each a getter answering `null` and a setter doing nothing.
   */
  readonly accessors?: readonly string[];

  /**
   * The methods its prototype declares, each answering a permissive stand-in.
   */
  readonly methods?: readonly string[];

  /**
   * The interface's global name.
   */
  readonly name: string;

  /**
   * The interface it extends: another entry of {@link DOM_INTERFACES} defined before it, or a shared web global
   * (`EventTarget`, `Event`), which every supported Node has.
   */
  readonly parent: string;
}

/**
 * The `nodeType` constants `Node` carries both as statics and on its prototype.
 */
/* eslint-disable no-magic-numbers -- The values are the DOM's own `nodeType` numbers. */
const NODE_TYPE_CONSTANTS: Readonly<Record<string, number>> = {
  ATTRIBUTE_NODE: 2,
  CDATA_SECTION_NODE: 4,
  COMMENT_NODE: 8,
  DOCUMENT_FRAGMENT_NODE: 11,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
  ELEMENT_NODE: 1,
  PROCESSING_INSTRUCTION_NODE: 7,
  TEXT_NODE: 3
};
/* eslint-enable no-magic-numbers -- The `nodeType` table ends here. */

const CHILD_NODE_METHODS = ['after', 'before', 'remove', 'replaceWith'];
const PARENT_NODE_ACCESSORS = ['childElementCount', 'children', 'firstElementChild', 'lastElementChild'];
const PARENT_NODE_METHODS = ['append', 'prepend', 'querySelector', 'querySelectorAll', 'replaceChildren'];

/**
 * The DOM interfaces a framework runtime reads at load time, modeled as real classes rather than as stand-ins.
 *
 * A stand-in is not enough for them: `Svelte` 5 runs `Object.getOwnPropertyDescriptor(Node.prototype, 'firstChild').get`
 * and writes cache slots onto `Element.prototype` and `Text.prototype` at load, and a `Proxy` answers neither the way a
 * webview's prototype does. So each one is a class whose prototype declares its interface's accessors and methods, in
 * the hierarchy a webview has. An entry's parent is defined before it.
 */
const DOM_INTERFACES: readonly DomInterfaceDefinition[] = [
  {
    accessors: [
      'baseURI',
      'childNodes',
      'firstChild',
      'isConnected',
      'lastChild',
      'nextSibling',
      'nodeName',
      'nodeType',
      'nodeValue',
      'ownerDocument',
      'parentElement',
      'parentNode',
      'previousSibling',
      'textContent'
    ],
    methods: [
      'appendChild',
      'cloneNode',
      'compareDocumentPosition',
      'contains',
      'getRootNode',
      'hasChildNodes',
      'insertBefore',
      'isEqualNode',
      'isSameNode',
      'normalize',
      'removeChild',
      'replaceChild'
    ],
    name: 'Node',
    parent: 'EventTarget'
  },
  { accessors: ['localName', 'name', 'namespaceURI', 'ownerElement', 'prefix', 'specified', 'value'], name: 'Attr', parent: 'Node' },
  {
    accessors: ['data', 'length', 'nextElementSibling', 'previousElementSibling'],
    methods: [...CHILD_NODE_METHODS, 'appendData', 'deleteData', 'insertData', 'replaceData', 'substringData'],
    name: 'CharacterData',
    parent: 'Node'
  },
  { accessors: ['assignedSlot', 'wholeText'], methods: ['splitText'], name: 'Text', parent: 'CharacterData' },
  { name: 'CDATASection', parent: 'Text' },
  { name: 'Comment', parent: 'CharacterData' },
  {
    accessors: [
      ...PARENT_NODE_ACCESSORS,
      'activeElement',
      'body',
      'characterSet',
      'contentType',
      'cookie',
      'defaultView',
      'documentElement',
      'fonts',
      'head',
      'hidden',
      'readyState',
      'styleSheets',
      'title',
      'URL',
      'visibilityState'
    ],
    methods: [
      ...PARENT_NODE_METHODS,
      'adoptNode',
      'createAttribute',
      'createComment',
      'createDocumentFragment',
      'createElement',
      'createElementNS',
      'createEvent',
      'createRange',
      'createTextNode',
      'createTreeWalker',
      'elementFromPoint',
      'getElementById',
      'getElementsByClassName',
      'getElementsByTagName',
      'getSelection',
      'importNode'
    ],
    name: 'Document',
    parent: 'Node'
  },
  {
    accessors: PARENT_NODE_ACCESSORS,
    methods: [...PARENT_NODE_METHODS, 'getElementById'],
    name: 'DocumentFragment',
    parent: 'Node'
  },
  {
    accessors: ['activeElement', 'adoptedStyleSheets', 'delegatesFocus', 'host', 'innerHTML', 'mode', 'slotAssignment'],
    methods: ['getSelection'],
    name: 'ShadowRoot',
    parent: 'DocumentFragment'
  },
  {
    accessors: [
      ...PARENT_NODE_ACCESSORS,
      'attributes',
      'classList',
      'className',
      'clientHeight',
      'clientLeft',
      'clientTop',
      'clientWidth',
      'id',
      'innerHTML',
      'localName',
      'namespaceURI',
      'nextElementSibling',
      'outerHTML',
      'part',
      'prefix',
      'previousElementSibling',
      'scrollHeight',
      'scrollLeft',
      'scrollTop',
      'scrollWidth',
      'shadowRoot',
      'slot',
      'tagName'
    ],
    methods: [
      ...CHILD_NODE_METHODS,
      ...PARENT_NODE_METHODS,
      'animate',
      'attachShadow',
      'closest',
      'getAttribute',
      'getAttributeNames',
      'getAttributeNS',
      'getBoundingClientRect',
      'getClientRects',
      'getElementsByClassName',
      'getElementsByTagName',
      'hasAttribute',
      'hasAttributes',
      'insertAdjacentElement',
      'insertAdjacentHTML',
      'insertAdjacentText',
      'matches',
      'releasePointerCapture',
      'removeAttribute',
      'removeAttributeNS',
      'requestFullscreen',
      'scroll',
      'scrollBy',
      'scrollIntoView',
      'scrollTo',
      'setAttribute',
      'setAttributeNS',
      'setPointerCapture',
      'toggleAttribute'
    ],
    name: 'Element',
    parent: 'Node'
  },
  {
    accessors: [
      'accessKey',
      'autofocus',
      'contentEditable',
      'dataset',
      'dir',
      'draggable',
      'enterKeyHint',
      'hidden',
      'inert',
      'innerText',
      'inputMode',
      'isContentEditable',
      'lang',
      'nonce',
      'offsetHeight',
      'offsetLeft',
      'offsetParent',
      'offsetTop',
      'offsetWidth',
      'outerText',
      'spellcheck',
      'style',
      'tabIndex',
      'title',
      'translate'
    ],
    methods: ['attachInternals', 'blur', 'click', 'focus', 'hidePopover', 'showPopover', 'togglePopover'],
    name: 'HTMLElement',
    parent: 'Element'
  },
  { accessors: ['download', 'href', 'rel', 'target', 'text'], name: 'HTMLAnchorElement', parent: 'HTMLElement' },
  { name: 'HTMLBodyElement', parent: 'HTMLElement' },
  { name: 'HTMLBRElement', parent: 'HTMLElement' },
  { accessors: ['disabled', 'form', 'name', 'type', 'value'], name: 'HTMLButtonElement', parent: 'HTMLElement' },
  { accessors: ['height', 'width'], methods: ['getContext', 'toBlob', 'toDataURL'], name: 'HTMLCanvasElement', parent: 'HTMLElement' },
  { accessors: ['open', 'returnValue'], methods: ['close', 'show', 'showModal'], name: 'HTMLDialogElement', parent: 'HTMLElement' },
  { name: 'HTMLDivElement', parent: 'HTMLElement' },
  { accessors: ['elements', 'length'], methods: ['reportValidity', 'requestSubmit', 'reset', 'submit'], name: 'HTMLFormElement', parent: 'HTMLElement' },
  { name: 'HTMLHeadElement', parent: 'HTMLElement' },
  { name: 'HTMLHeadingElement', parent: 'HTMLElement' },
  { name: 'HTMLHtmlElement', parent: 'HTMLElement' },
  { accessors: ['allow', 'contentDocument', 'contentWindow', 'sandbox', 'src', 'srcdoc'], name: 'HTMLIFrameElement', parent: 'HTMLElement' },
  { accessors: ['alt', 'complete', 'height', 'naturalHeight', 'naturalWidth', 'src', 'width'], methods: ['decode'], name: 'HTMLImageElement', parent: 'HTMLElement' },
  {
    accessors: [
      'checked',
      'defaultValue',
      'disabled',
      'files',
      'form',
      'indeterminate',
      'max',
      'min',
      'name',
      'placeholder',
      'readOnly',
      'selectionEnd',
      'selectionStart',
      'type',
      'value',
      'valueAsNumber'
    ],
    methods: ['select', 'setCustomValidity', 'setSelectionRange', 'showPicker'],
    name: 'HTMLInputElement',
    parent: 'HTMLElement'
  },
  { accessors: ['control', 'htmlFor'], name: 'HTMLLabelElement', parent: 'HTMLElement' },
  { name: 'HTMLLIElement', parent: 'HTMLElement' },
  { accessors: ['href', 'media', 'rel', 'sheet'], name: 'HTMLLinkElement', parent: 'HTMLElement' },
  {
    accessors: ['autoplay', 'controls', 'currentTime', 'duration', 'loop', 'muted', 'paused', 'src', 'volume'],
    methods: ['load', 'pause', 'play'],
    name: 'HTMLMediaElement',
    parent: 'HTMLElement'
  },
  { name: 'HTMLAudioElement', parent: 'HTMLMediaElement' },
  { accessors: ['height', 'poster', 'videoHeight', 'videoWidth', 'width'], name: 'HTMLVideoElement', parent: 'HTMLMediaElement' },
  { accessors: ['defaultSelected', 'disabled', 'index', 'label', 'selected', 'text', 'value'], name: 'HTMLOptionElement', parent: 'HTMLElement' },
  { name: 'HTMLParagraphElement', parent: 'HTMLElement' },
  { name: 'HTMLPreElement', parent: 'HTMLElement' },
  { accessors: ['async', 'defer', 'src', 'text', 'type'], name: 'HTMLScriptElement', parent: 'HTMLElement' },
  {
    accessors: ['disabled', 'form', 'length', 'multiple', 'name', 'options', 'selectedIndex', 'selectedOptions', 'value'],
    methods: ['add', 'item'],
    name: 'HTMLSelectElement',
    parent: 'HTMLElement'
  },
  { accessors: ['name'], methods: ['assign', 'assignedElements', 'assignedNodes'], name: 'HTMLSlotElement', parent: 'HTMLElement' },
  { name: 'HTMLSpanElement', parent: 'HTMLElement' },
  { accessors: ['media', 'sheet'], name: 'HTMLStyleElement', parent: 'HTMLElement' },
  { name: 'HTMLTableElement', parent: 'HTMLElement' },
  { accessors: ['content'], name: 'HTMLTemplateElement', parent: 'HTMLElement' },
  {
    accessors: ['cols', 'defaultValue', 'disabled', 'form', 'name', 'placeholder', 'readOnly', 'rows', 'selectionEnd', 'selectionStart', 'value'],
    methods: ['select', 'setSelectionRange'],
    name: 'HTMLTextAreaElement',
    parent: 'HTMLElement'
  },
  { name: 'HTMLUListElement', parent: 'HTMLElement' },
  { name: 'HTMLUnknownElement', parent: 'HTMLElement' },
  {
    accessors: ['dataset', 'nonce', 'ownerSVGElement', 'style', 'tabIndex', 'viewportElement'],
    methods: ['blur', 'focus'],
    name: 'SVGElement',
    parent: 'Element'
  },
  { accessors: ['transform'], methods: ['getBBox', 'getCTM', 'getScreenCTM'], name: 'SVGGraphicsElement', parent: 'SVGElement' },
  { accessors: ['height', 'viewBox', 'width', 'x', 'y'], methods: ['createSVGPoint'], name: 'SVGSVGElement', parent: 'SVGGraphicsElement' },
  { name: 'Window', parent: 'EventTarget' },
  // The event interfaces Node lacks, over Node's real `Event`, so `new KeyboardEvent('keydown')` works as a webview's.
  { accessors: ['detail', 'view'], name: 'UIEvent', parent: 'Event' },
  { accessors: ['relatedTarget'], name: 'FocusEvent', parent: 'UIEvent' },
  { accessors: ['data', 'inputType', 'isComposing'], methods: ['getTargetRanges'], name: 'InputEvent', parent: 'UIEvent' },
  {
    accessors: ['altKey', 'code', 'ctrlKey', 'isComposing', 'key', 'location', 'metaKey', 'repeat', 'shiftKey'],
    methods: ['getModifierState'],
    name: 'KeyboardEvent',
    parent: 'UIEvent'
  },
  {
    accessors: ['altKey', 'button', 'buttons', 'clientX', 'clientY', 'ctrlKey', 'metaKey', 'offsetX', 'offsetY', 'pageX', 'pageY', 'relatedTarget', 'screenX', 'screenY', 'shiftKey'],
    methods: ['getModifierState'],
    name: 'MouseEvent',
    parent: 'UIEvent'
  },
  { accessors: ['dataTransfer'], name: 'DragEvent', parent: 'MouseEvent' },
  { accessors: ['height', 'isPrimary', 'pointerId', 'pointerType', 'pressure', 'width'], name: 'PointerEvent', parent: 'MouseEvent' },
  { accessors: ['deltaMode', 'deltaX', 'deltaY', 'deltaZ'], name: 'WheelEvent', parent: 'MouseEvent' },
  { accessors: ['altKey', 'changedTouches', 'ctrlKey', 'metaKey', 'shiftKey', 'targetTouches', 'touches'], name: 'TouchEvent', parent: 'UIEvent' },
  { accessors: ['clipboardData'], name: 'ClipboardEvent', parent: 'Event' },
  { accessors: ['data'], name: 'CompositionEvent', parent: 'UIEvent' }
];

/**
 * Globals a webview, or Obsidian itself, provides and Node does not. Each is a permissive stand-in, so a top level that
 * reads `localStorage` or calls `customElements.define()` is not failed for a name a phone does have. The DOM
 * interfaces whose prototypes a runtime inspects are real classes instead, from {@link DOM_INTERFACES}.
 */
const STUBBED_GLOBAL_NAMES: readonly string[] = [
  // The DOM.
  'activeDocument',
  'activeWindow',
  'cancelAnimationFrame',
  'CSS',
  'CSSStyleSheet',
  'customElements',
  'document',
  'DOMParser',
  'FileReader',
  'getComputedStyle',
  'getSelection',
  'history',
  'Image',
  'indexedDB',
  'IntersectionObserver',
  'localStorage',
  'location',
  'matchMedia',
  'MutationObserver',
  'navigator',
  'NodeFilter',
  'Range',
  'requestAnimationFrame',
  'requestIdleCallback',
  'ResizeObserver',
  'screen',
  'Selection',
  'sessionStorage',
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
 * Builds one DOM interface class, named as the interface, with its accessors and methods on its prototype.
 *
 * @param definition - The interface.
 * @param parent - The constructor it extends.
 * @returns The class.
 */
function createDomInterface(definition: DomInterfaceDefinition, parent: DomInterfaceConstructor): DomInterfaceConstructor {
  const domInterface = {
    // A computed key names the class after the interface, so `Text.name` is `'Text'`, as in a webview.
    [definition.name]: class extends parent {}
  }[definition.name] as DomInterfaceConstructor;

  for (const accessor of definition.accessors ?? []) {
    Object.defineProperty(domInterface.prototype, accessor, {
      configurable: true,
      enumerable: true,
      get: (): null => null,
      set: noop
    });
  }

  for (const method of definition.methods ?? []) {
    Object.defineProperty(domInterface.prototype, method, {
      configurable: true,
      enumerable: true,
      value: (): unknown => createMobileStub(),
      writable: true
    });
  }

  return domInterface;
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
  defineDomInterfaces(sandbox);

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
  return new Proxy(createMobileStubTarget(), {
    apply: (): unknown => createMobileStub(),
    construct: (): object => createMobileStub() as object,
    // `then` must stay `undefined`: a stand-in that answers it looks like a thenable, so awaiting one
    // would hang instead of resolving.
    get: (target, property, receiver): unknown => {
      // A property the bundle defined on this stand-in reads back as defined. That is also the `Proxy` invariant for a
      // non-configurable, non-writable one, which a fresh stand-in would otherwise break with a `TypeError`.
      if (Object.hasOwn(target, property)) {
        return Reflect.get(target, property, receiver);
      }
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
 * Builds the target of one stand-in: a constructible function of its own with no own properties at all.
 *
 * Every stand-in used to share `noop` as its target, so whatever a bundle defined on one landed on all of them: a
 * second `Object.defineProperty(X.prototype, Symbol('class'), ...)` on another stand-in threw `Cannot redefine
 * property`, a failure no webview produces.
 *
 * @returns The target.
 */
function createMobileStubTarget(): object {
  // A bound function is a fresh object on every call, constructible as `construct` needs, and has no `prototype`.
  const target = noop.bind(undefined);
  Reflect.deleteProperty(target, 'length');
  Reflect.deleteProperty(target, 'name');
  return target;
}

/**
 * Defines the {@link DOM_INTERFACES} on the sandbox as real classes, made afresh for each context so what one bundle
 * writes onto a prototype never reaches the next check.
 *
 * @param sandbox - The sandbox, already holding the shared web globals the interfaces extend.
 */
function defineDomInterfaces(sandbox: Record<string, unknown>): void {
  for (const definition of DOM_INTERFACES) {
    sandbox[definition.name] = createDomInterface(definition, sandbox[definition.parent] as DomInterfaceConstructor);
  }

  const nodeInterface = sandbox['Node'] as DomInterfaceConstructor;
  for (const [constantName, value] of Object.entries(NODE_TYPE_CONSTANTS)) {
    const descriptor: PropertyDescriptor = { enumerable: true, value };
    Object.defineProperty(nodeInterface, constantName, descriptor);
    Object.defineProperty(nodeInterface.prototype, constantName, descriptor);
  }
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
