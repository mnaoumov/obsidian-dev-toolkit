import {
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import type { AssertMainJsLoadsOnMobileParams } from './obsidian-plugin-mobile-load-check.ts';

import {
  assertMainJsLoadsOnMobile,
  assertMobileLoadableBundle
} from './obsidian-plugin-mobile-load-check.ts';

const BUNDLE_PATH = 'dist/integration-test-plugin/main.js';
const NODE_ONLY_BUNDLE = '"use strict"; var { randomFillSync } = require("crypto");';

function loadBundle(bundleSource: string): void {
  assertMobileLoadableBundle({
    bundlePath: BUNDLE_PATH,
    bundleSource
  });
}

describe('assertMobileLoadableBundle', () => {
  it('accepts a bundle whose top level touches nothing platform-only', () => {
    expect(() => {
      loadBundle('"use strict"; var answer = 42; module.exports = { answer };');
    }).not.toThrow();
  });

  it('accepts a bundle whose top level reads an Obsidian external, which mobile does provide', () => {
    expect(() => {
      loadBundle('"use strict"; var Plugin = require("obsidian").Plugin; module.exports = class extends Plugin {};');
    }).not.toThrow();
  });

  it('accepts a bundle whose top level branches on the renderer-shaped process, the way `debug` does', () => {
    expect(() => {
      loadBundle('"use strict"; if (typeof process === "undefined" || process.type === "renderer") { module.exports = {}; } else { require("util").deprecate(); }');
    }).not.toThrow();
  });

  it('accepts a bundle that only reaches a Node builtin lazily, which is the shape a cross-platform module has to take', () => {
    expect(() => {
      loadBundle('"use strict"; module.exports = { extract: function () { var { randomFillSync } = require("crypto"); return randomFillSync; } };');
    }).not.toThrow();
  });

  it('accepts a top level that uses the globals a webview and Obsidian provide', () => {
    expect(() => {
      loadBundle(
        '"use strict"; class Card extends HTMLElement {} customElements.define("x-card", Card);'
          + ' var url = new URL("https://example.com"); var bytes = new TextEncoder().encode(url.host);'
          + ' var stored = localStorage.getItem("key"); var day = moment(); var div = createDiv();'
          + ' var agent = "ua: " + navigator.userAgent; var cores = +navigator.hardwareConcurrency; var href = String(location.href);'
          + ' module.exports = { agent, bytes, day, div, href, cores, stored, same: window === globalThis && self === global };'
      );
    }).not.toThrow();
  });

  it('gives a stand-in every member, constructs it, and keeps it from looking like a thenable', () => {
    expect(() => {
      loadBundle(
        '"use strict"; var Plugin = require("obsidian").Plugin; var instance = new Plugin();'
          + ' if (!("anything" in instance)) { throw new Error("missing member"); }'
          + ' if (instance.then !== undefined) { throw new Error("thenable"); }'
      );
    }).not.toThrow();
  });

  it('accepts a top level that inspects the DOM prototypes the way `Svelte` 5 does at load', () => {
    expect(() => {
      loadBundle(
        '"use strict"; var getDescriptor = Object.getOwnPropertyDescriptor;'
          + ' var firstChild = getDescriptor(Node.prototype, "firstChild").get; var nextSibling = getDescriptor(Node.prototype, "nextSibling").get;'
          + ' if (typeof firstChild !== "function" || typeof nextSibling !== "function") { throw new Error("no getter"); }'
          + ' if (!Object.isExtensible(Element.prototype) || !Object.isExtensible(Text.prototype)) { throw new Error("frozen"); }'
          + ' var CLASS = Symbol("class"); Element.prototype[CLASS] = undefined; Element.prototype.__e = undefined; Text.prototype[CLASS] = undefined;'
          + ' if (!(Text.prototype instanceof CharacterData) || !(HTMLElement.prototype instanceof Node) || !(Comment.prototype instanceof Node)) { throw new Error("hierarchy"); }'
          + ' if (Text.name !== "Text" || Node.TEXT_NODE !== 3 || Node.prototype.ELEMENT_NODE !== 1) { throw new Error("shape"); }'
          + ' if (typeof HTMLTemplateElement.prototype.cloneNode !== "function" || !("content" in HTMLTemplateElement.prototype)) { throw new Error("members"); }'
          + ' var text = new Text(); text.data = "ignored"; if (text.firstChild !== null || text.data !== null) { throw new Error("accessor"); }'
          + ' if (typeof text.cloneNode().anything !== "function") { throw new Error("method"); }'
          + ' var event = new KeyboardEvent("keydown"); if (!(event instanceof Event) || event.type !== "keydown") { throw new Error("event"); }'
      );
    }).not.toThrow();
  });

  it('keeps what one check writes onto a DOM prototype out of the next one', () => {
    loadBundle('"use strict"; Object.defineProperty(Element.prototype, "marker", { value: 1 });');
    expect(() => {
      loadBundle('"use strict"; if ("marker" in Element.prototype) { throw new Error("leaked"); } Object.defineProperty(Element.prototype, "marker", { value: 2 });');
    }).not.toThrow();
  });

  it('lets a bundle define the same property on two stand-ins and read back what it defined', () => {
    expect(() => {
      loadBundle(
        '"use strict"; var CLASS = Symbol("class");'
          + ' Object.defineProperty(customElements, CLASS, { value: 1 }); Object.defineProperty(document, CLASS, { value: 2 });'
          + ' if (customElements[CLASS] !== 1 || document[CLASS] !== 2) { throw new Error("not read back"); }'
          + ' if (typeof document.prototype !== "function" || typeof document.length !== "function") { throw new Error("stand-in"); }'
      );
    }).not.toThrow();
  });

  it('rejects a top level that reads Node\'s own `Buffer`, which a phone does not have', () => {
    expect(() => {
      loadBundle('"use strict"; var bytes = Buffer.from("a");');
    }).toThrow(/Buffer is not defined/);
  });

  it('rejects a bundle whose top level unpacks a Node builtin, the way `adm-zip` does', () => {
    expect(() => {
      loadBundle(NODE_ONLY_BUNDLE);
    }).toThrow(/cannot load on Obsidian mobile/);
  });

  it('names the bundle and the underlying reason, so the offending module is identifiable', () => {
    let message = '';
    try {
      loadBundle(NODE_ONLY_BUNDLE);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(BUNDLE_PATH);
    expect(message).toContain('Cannot destructure property');
    expect(message).toContain('randomFillSync');
    expect(message).toContain('isDesktopOnly');
    expect(message).toContain('shouldCheckMobileLoad: false');
  });

  it('reports a thrown non-error value as it is', () => {
    expect(() => {
      loadBundle('throw "plain string";');
    }).toThrow(/plain string/);
  });
});

describe('assertMainJsLoadsOnMobile', () => {
  type CheckOverrides = Pick<AssertMainJsLoadsOnMobileParams, 'isProductionBuild' | 'shouldCheckMobileLoad'>;
  let distFolder = '';
  let mainJsPath = '';

  beforeEach(async () => {
    distFolder = await mkdtemp(join(tmpdir(), 'obsidian-plugin-mobile-load-check-'));
    mainJsPath = join(distFolder, 'main.js');
  });

  afterEach(async () => {
    await rm(distFolder, { force: true, recursive: true });
  });

  async function check(overrides: Partial<CheckOverrides> = {}): Promise<void> {
    await assertMainJsLoadsOnMobile({ distFolder, isProductionBuild: true, mainJsPath, shouldCheckMobileLoad: true, ...overrides });
  }

  async function writeManifest(contents: string): Promise<void> {
    await writeFile(join(distFolder, 'manifest.json'), contents, 'utf-8');
  }

  it('fails a production main.js of a plugin that is not desktop-only', async () => {
    await writeFile(mainJsPath, NODE_ONLY_BUNDLE, 'utf-8');
    await writeManifest(JSON.stringify({ id: 'sample', isDesktopOnly: false }));

    await expect(check()).rejects.toThrow(/cannot load on Obsidian mobile/);
  });

  it('checks a main.js whose manifest is missing or unreadable, since Obsidian reads either as not desktop-only', async () => {
    await writeFile(mainJsPath, NODE_ONLY_BUNDLE, 'utf-8');
    await expect(check()).rejects.toThrow(/cannot load on Obsidian mobile/);

    await writeManifest('{ not json');
    await expect(check()).rejects.toThrow(/cannot load on Obsidian mobile/);
  });

  it('accepts a production main.js that loads on mobile', async () => {
    await writeFile(mainJsPath, '"use strict"; module.exports = {};', 'utf-8');

    await expect(check()).resolves.toBeUndefined();
  });

  it('skips a desktop-only plugin, a development build, a turned-off check and a missing main.js', async () => {
    await expect(check()).resolves.toBeUndefined();

    await writeFile(mainJsPath, NODE_ONLY_BUNDLE, 'utf-8');
    await expect(check({ isProductionBuild: false })).resolves.toBeUndefined();
    await expect(check({ shouldCheckMobileLoad: false })).resolves.toBeUndefined();

    await writeManifest(JSON.stringify({ id: 'sample', isDesktopOnly: true }));
    await expect(check()).resolves.toBeUndefined();
  });
});
