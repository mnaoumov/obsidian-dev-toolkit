---
title: Debugging in WebStorm
description: Attach WebStorm to the Obsidian renderer and map esbuild development source maps onto your TypeScript.
---

:::caution[Not yet verified in WebStorm]
Everything on this page outside WebStorm itself was checked against a real Obsidian 1.15 development build: the renderer endpoint and its targets, the custom port, the source URLs, the inline source map and that a breakpoint at the mapped line pauses in the command callback. That a TypeScript breakpoint **binds and pauses inside WebStorm** with the configuration below has not been confirmed yet. Until it is, treat the WebStorm steps as a starting point and report what you find.
:::

WebStorm attaches to a running Chromium renderer through its **Attach to Node.js/Chrome** run/debug configuration, which speaks the Chrome DevTools Protocol. Start Obsidian with its debugging endpoint and run the development build first, as [Debugging plugins](/obsidian-dev-toolkit/guides/debugging/) describes. The [VS Code page](/obsidian-dev-toolkit/guides/debugging-vscode/) covers the same workflow in VS Code; its `sourceMapPathOverrides` setting has no WebStorm equivalent of the same name, so do not copy it.

## What WebStorm has to attach to

With Obsidian started by `npx start-obsidian-for-debugging`, `http://127.0.0.1:9222/json/list` lists the targets on the port. In Obsidian 1.15 it lists one `page` target per window and, beside them, `worker` targets with an empty title and URL:

```text
page    New tab - My dev vault - Obsidian 1.15.1    app://obsidian.md/index.html
worker
worker
```

The `page` is the renderer your plugin runs in, and its title names the vault, which tells several vault windows apart. Before a vault is open, the only page is `app://obsidian.md/starter.html`, the vault chooser, and your plugin is not loaded there yet.

Your plugin's bundle appears in that renderer as a script named `plugin:<manifest id>`, evaluated from `main.js` with its source map inline as a `data:` URL. The map's `sources` are `app://obsidian.md/plugin:<package name>/<project-relative path>` and it carries `sourcesContent`, so the TypeScript text travels with the bundle. Note the two different names: the script is named after the manifest's `id`, while the sources are named after `name` in `package.json`, in full for a scoped name.

## Create the attach configuration

1. Choose **Run | Edit Configurations**, click the add button and pick **Attach to Node.js/Chrome**.
2. Set **Host** to `127.0.0.1` and **Port** to the renderer port: `9222` by default. The configuration's own default, `9229`, is Node's inspector port, which Obsidian does not open. For another port, start Obsidian with `npx start-obsidian-for-debugging --port=9333` and enter `9333` here.
3. Leave **Reconnect automatically** on if you restart Obsidian often; it re-attaches when the endpoint comes back.
4. Under **Remote URLs of local files**, give your project's root folder the remote URL `app://obsidian.md/plugin:<package name>`, for example `app://obsidian.md/plugin:my-plugin-package`. This tells WebStorm that `app://obsidian.md/plugin:my-plugin-package/src/main.ts` is your local `src/main.ts`. A configuration stores this mapping only once it is saved; a temporary configuration does not keep it.

Save it under a name such as `Attach to Obsidian`. To share it, tick **Store as project file**, which writes it under `.run/` in the project.

The JetBrains references for these fields are [Attach to Node.js/Chrome](https://www.jetbrains.com/help/webstorm/run-debug-configuration-node-js-remote-debug.html), [Debugging JavaScript in Chrome](https://www.jetbrains.com/help/webstorm/debugging-javascript-in-chrome.html) and [Configuring the JavaScript debugger](https://www.jetbrains.com/help/webstorm/configuring-javascript-debugger.html). JetBrains does not document Obsidian or Electron renderers specifically, and it does not say how the configuration picks a target when the port lists several; confirm in the **Debug** tool window (**Alt+5**) that you are attached to your vault's renderer.

## Attach and pause

Select **Attach to Obsidian** and click **Debug**. Set a breakpoint inside a command callback in your TypeScript and run that command in Obsidian. A breakpoint whose status is **Verified** has bound; **Invalid** means WebStorm found no code to suspend on that line, which is what a type-only line looks like, and also what an unmapped source looks like. When it pauses, the **Frames** pane and the **Threads & Variables** pane show your original TypeScript with its locals.

To debug `onload()`, attach first, set the breakpoint, then disable and enable the plugin, or let the development build's reload do it. Code that already ran before you attached cannot be paused. Each reload evaluates the bundle again as a new script, so a breakpoint has to bind again after it; check its status after a reload before concluding it is broken.

With several vault windows open, each is its own `page` target. Attach to the one whose title names your development vault.

## Diagnose a breakpoint that does not bind

1. Check the port: `http://127.0.0.1:<port>/json/list` must list an Obsidian `page`. A configuration left on `9229` reaches nothing.
2. Check that the plugin is loaded in that vault: the renderer must have a `plugin:<manifest id>` script, which only appears once the plugin is enabled.
3. Check that the deployed `main.js` is the latest development build, from `npm run dev` with `OBSIDIAN_CONFIG_FOLDER` pointing at this vault. Its inline map lists your `src/` files in `sources`; a production bundle's compact map does not.
4. Check the mapping against the map itself: the prefix in **Remote URLs of local files** must equal the part of a `sources` entry before your project-relative path, `app://obsidian.md/plugin:<package name>`. After renaming the package, update it.
5. Toggle **Disable Source Maps** in the **Debug** tool window's toolbar off: with source maps disabled, WebStorm shows only the generated `main.js`.
6. Reload the plugin after attaching, then run the code again; see the `onload()` note above.

## See also

- [Debugging plugins](/obsidian-dev-toolkit/guides/debugging/): starting Obsidian with the endpoint, the development build and the source paths.
- [Debugging in VS Code](/obsidian-dev-toolkit/guides/debugging-vscode/).
