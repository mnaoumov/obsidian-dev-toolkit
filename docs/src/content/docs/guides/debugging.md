---
title: Debugging plugins
description: Attach VS Code to Obsidian and bind TypeScript breakpoints to esbuild development source maps.
---

Debug your plugin in the Obsidian renderer, where its code and the DOM run. VS Code's built-in browser debugger can attach to that renderer; you do not need the retired Debugger for Chrome extension. This guide updates the workflow from [How to debug Obsidian plugins (2022)](https://mnaoumov.wordpress.com/2022/05/10/how-to-debug-obsidian-plugins/) for the toolkit's current `esbuild` output.

## Generate the attach configuration

Open the plugin's project root in VS Code, with `package.json` and `src/` directly inside the workspace folder. From that same directory, run the installed toolkit's command:

```bash
npx generate-debug-config
```

It creates `.vscode/launch.json`, reading `name` from `package.json`. It refuses to overwrite an existing file, including a JSON-with-comments file. If you already have configurations, add the configuration below to their `configurations` array yourself, replacing `my-plugin-package` with your `npm` package name. A scoped name such as `@example/my-plugin` goes in full, including the slash. The manifest's `id` and display `name` are different values and are not the source-map prefix.

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Obsidian",
      "type": "chrome",
      "request": "attach",
      "address": "127.0.0.1",
      "port": 9222,
      "webRoot": "${workspaceFolder}",
      "sourceMaps": true,
      "sourceMapPathOverrides": {
        "app://obsidian.md/plugin:my-plugin-package/*": "${workspaceFolder}/*"
      }
    }
  ]
}
```

For a different port, run `npx generate-debug-config --port=9333` and start Obsidian with that same port. See the [VS Code browser debugging documentation](https://code.visualstudio.com/docs/nodejs/browser-debugging) and [debugger options](https://github.com/microsoft/vscode-js-debug/blob/main/OPTIONS.md) for the underlying attach and path-mapping settings.

## Start Obsidian and the development build

Quit all instances of Obsidian first: opening another window through an already running process does not restart that process with the new debugging flag. Launch the desktop executable with `--remote-debugging-port=9222`. For example:

<!-- cspell:ignore LOCALAPPDATA -->

```powershell
# Windows, for a per-user installation. Adjust the path for your installation.
& "$env:LOCALAPPDATA\Obsidian\Obsidian.exe" --remote-debugging-port=9222
```

```bash
# macOS
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222

# Linux, if the executable is on PATH
obsidian --remote-debugging-port=9222
```

Open your development vault. Keep the debugging endpoint local; it gives an attached client control of the app. Check `http://127.0.0.1:9222/json/list` if attachment fails: an Obsidian renderer should appear there. A connection refusal means the app is not listening on that port yet, rather than a source-map problem.

Configure `OBSIDIAN_CONFIG_FOLDER` to point to that vault's configuration directory, then start the [esbuild development build](/obsidian-dev-toolkit/guides/cli-commands/#build-development-version). For a plugin using the toolkit's standard scripts:

```bash
npm run dev
```

Use `dist/dev/main.js` deployed by this build. Production output may be minified and its compact ignore map does not retain your TypeScript mappings. Keep the watcher running so an edit rebuilds and deploys the same code you see in VS Code.

In VS Code, choose **Run and Debug → Attach to Obsidian**, then press **F5**. With several vault windows open, select the target belonging to your development vault. Set a breakpoint inside a command callback and invoke that command in Obsidian. A bound breakpoint pauses on your original TypeScript line, with locals available in VS Code.

To debug `onload()`, attach first, set the breakpoint and then disable and enable your plugin or trigger its development reload. Attaching after startup cannot pause code that already ran. Use [Hot Reload] or the [Obsidian CLI reload option](/obsidian-dev-toolkit/guides/bundlers/#reloading-a-development-build) to repeat the cycle.

## Why the source paths matter

The `esbuild` adapter embeds source content and mappings in `main.js`, rewrites each source to `app://obsidian.md/plugin:<package name>/<project-relative path>`, and appends `/* nosourcemap */` so Obsidian preserves the inline map. The generated override maps that URL back to `${workspaceFolder}/<project-relative path>`. For example, `app://obsidian.md/plugin:my-plugin-package/src/main.ts` resolves to your local `src/main.ts`. This works when the build's project root and the VS Code workspace root are the same directory.

The generator targets this `esbuild` convention. Other [bundler adapters](/obsidian-dev-toolkit/guides/bundlers/) produce development maps too, but may emit different source URLs; inspect their map's `sources` and adapt `sourceMapPathOverrides` before expecting local breakpoints to bind. Custom entry points outside the project root and multi-root workspaces also need mappings to their actual local files.

## Diagnose unbound breakpoints

1. Confirm the attach target is your development vault's renderer and that the plugin is enabled there. A Node inspector port attaches to a different runtime.
2. Confirm the deployed `main.js` is the latest development build. Check the watcher output and `OBSIDIAN_CONFIG_FOLDER`; an old production bundle has no useful TypeScript map.
3. Confirm `package.json`'s `name` matches the `plugin:` prefix in the override, especially after renaming a package. Regenerate the configuration or update the existing entry.
4. Open the plugin's own project folder as the workspace. In a monorepo, replace `${workspaceFolder}` in both fields with the plugin folder or a named workspace folder such as `${workspaceFolder:my-plugin}`.
5. Run **Debug: Diagnose Breakpoint Problems** in VS Code's Command Palette. Inspect loaded scripts and their source maps; add `"trace": true` to the attach configuration when collecting a debugger trace.
6. Reload the plugin after attachment, then invoke the callback containing the breakpoint. A breakpoint on a type-only declaration or another line with no emitted JavaScript cannot pause execution.

Obsidian's own DevTools remain useful for the DOM, console and network: open them with **Ctrl+Shift+I** on Windows/Linux or **Cmd+Option+I** on macOS. Enable JavaScript source maps in DevTools settings and find your `plugin:` source there. The [source-map ignore list](/obsidian-dev-toolkit/guides/bundlers/#esbuild) skips shared logger and patch wrappers; disable ignore listing temporarily when you need to step through those wrappers. Mobile debugging uses a platform-specific WebView inspector and is outside this desktop attach workflow.

[Hot Reload]: https://github.com/pjeby/hot-reload
