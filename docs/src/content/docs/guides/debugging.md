---
title: Debugging plugins
description: Start Obsidian with its renderer debugging endpoint, run the esbuild development build, and attach an IDE or DevTools to your TypeScript.
---

Debug your plugin in the Obsidian renderer, where its code and the DOM run. Any debugger that speaks the Chrome DevTools Protocol can attach to that renderer once Obsidian is started with its remote debugging endpoint open. This page covers the steps every debugger shares; the IDE-specific setup lives on its own page:

- [Debugging in VS Code](/obsidian-dev-toolkit/guides/debugging-vscode/): an attach configuration the toolkit generates, and how to diagnose unbound breakpoints.

This workflow updates [How to debug Obsidian plugins (2022)](https://mnaoumov.wordpress.com/2022/05/10/how-to-debug-obsidian-plugins/) for the toolkit's current `esbuild` output.

## Start Obsidian with the debugging endpoint

Quit every Obsidian window first, including the system tray icon. Obsidian is a single-instance app: launching it while it runs hands the request to the running process, which keeps the flags it was started with. Then run, from your plugin project:

```bash
npx start-obsidian-for-debugging
```

It starts the installed desktop Obsidian with `--remote-debugging-port=9222` and waits until the renderer endpoint answers and reports itself as Obsidian. It exits with an error, instead of claiming success, when Obsidian exits without opening the port (an Obsidian already running received the request) or when the port is taken by something else. When an Obsidian already listens on the port, it starts nothing and says so.

- `--port=9333` uses another port. Attach your debugger to the same one.
- `--executable=<path>` starts a specific Obsidian executable instead of the one it finds: on Windows `Obsidian.exe` on `PATH` (a `scoop` shim is skipped) or `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe`, on macOS `/Applications/Obsidian.app`, on Linux `obsidian` on `PATH`.
- Arguments after `--` are passed to Obsidian unchanged, for example `npx start-obsidian-for-debugging -- --user-data-dir=<folder>` to run a separate Obsidian profile beside your everyday one.

The command only starts Obsidian. It does not build or enable your plugin, and it does not attach a debugger. The endpoint it opens is Chromium's remote debugging port, not Obsidian's own debug setting.

To start Obsidian by hand instead, launch the desktop executable with the flag:

<!-- cspell:ignore LOCALAPPDATA -->

```powershell
# Windows, for a per-user installation. Adjust the path for your installation.
& "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe" --remote-debugging-port=9222
```

```bash
# macOS
/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222

# Linux, if the executable is on PATH
obsidian --remote-debugging-port=9222
```

Open your development vault. Keep the debugging endpoint local: it gives an attached client control of the app. Check `http://127.0.0.1:9222/json/list` if attachment fails: an Obsidian renderer should appear there. A connection refusal means the app is not listening on that port, rather than a source-map problem.

## Run the development build

Configure `OBSIDIAN_CONFIG_FOLDER` to point to that vault's configuration directory, then start the [esbuild development build](/obsidian-dev-toolkit/guides/cli-commands/#build-development-version). For a plugin using the toolkit's standard scripts:

```bash
npm run dev
```

Use `dist/dev/main.js` deployed by this build. Production output may be minified and its compact ignore map does not retain your TypeScript mappings. Keep the watcher running so an edit rebuilds and deploys the same code your debugger shows.

To debug `onload()`, attach first, set the breakpoint and then disable and enable your plugin or trigger its development reload. Attaching after startup cannot pause code that already ran. Use [Hot Reload] or the [Obsidian CLI reload option](/obsidian-dev-toolkit/guides/bundlers/#reloading-a-development-build) to repeat the cycle. With several vault windows open, each is its own renderer target: attach to the one showing your development vault.

## Where the source paths point

The `esbuild` adapter embeds source content and mappings in `main.js`, rewrites each source to `app://obsidian.md/plugin:<package name>/<project-relative path>`, and appends `/* nosourcemap */` so Obsidian preserves the inline map. `<package name>` is `name` from `package.json`, in full for a scoped name, not the manifest's `id`. For example, `app://obsidian.md/plugin:my-plugin-package/src/main.ts` stands for your local `src/main.ts`. A debugger binds your breakpoints once it maps that URL prefix onto your project folder, which is what the IDE pages configure.

Other [bundler adapters](/obsidian-dev-toolkit/guides/bundlers/) produce development maps too, but may emit different source URLs; inspect their map's `sources` before expecting local breakpoints to bind.

## DevTools

Obsidian's own DevTools need no setup and are useful for the DOM, console and network: open them with **Ctrl+Shift+I** on Windows/Linux or **Cmd+Option+I** on macOS. Enable JavaScript source maps in DevTools settings and find your `plugin:` source there. The [source-map ignore list](/obsidian-dev-toolkit/guides/bundlers/#esbuild) skips shared logger and patch wrappers; disable ignore listing temporarily when you need to step through those wrappers. Mobile debugging uses a platform-specific WebView inspector and is outside this desktop workflow.

[Hot Reload]: https://github.com/pjeby/hot-reload
