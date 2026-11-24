---
name: build
description: Build, bundle or watch an Obsidian plugin that uses @mnaoumov/obsidian-dev-toolkit (`npm run build`, `npm run dev`, the esbuild, vite, rollup, webpack and parcel adapters). Use it when the build fails, when the mobile load check fails or a plugin works on desktop but dies on a phone ("failed to load", a top-level `require('crypto')`), when the development build does not reach the vault or does not hot reload, when the community directory says "File is unusually packed", or when moving a plugin's own esbuild script to the toolkit. Not for unit or integration tests (test), version bumps, tags and the community directory checks (release), or the demo vault (demo-vault).
---

# Build an Obsidian plugin with `@mnaoumov/obsidian-dev-toolkit`

Run every command from the plugin root. The plugin id comes from `manifest.json`. Full guides: [Commands](https://mnaoumov.dev/obsidian-dev-toolkit/guides/cli-commands/) and [Bundlers](https://mnaoumov.dev/obsidian-dev-toolkit/guides/bundlers/).

## Commands

- `npm run build`: the production build. `scripts/build.ts` calls `build()` from `@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild`, which runs `build:compile` (the type check) and then bundles into `dist/build`: `main.js`, `styles.css` when the plugin has styles, and a copy of `manifest.json`. It ends with the mobile load check.
- `npm run dev`: the development build into `dist/dev`, rebuilt on every change, with an inline source map. `scripts/dev.ts` calls `dev()` from the same module.
- `npx check-plugin`: whether `package.json`'s `build` script runs the toolkit build, which the community directory uses to rebuild `main.js` (see the release skill for the rest of the check).
- `npx start-obsidian-for-debugging` and `npx generate-vscode-debug-config`: attach a debugger to the development build. See [Debugging plugins](https://mnaoumov.dev/obsidian-dev-toolkit/guides/debugging/).

The minimal script, which the scaffold [`create-obsidian-plugin`](https://github.com/mnaoumov/create-obsidian-plugin) writes for you:

```typescript
// scripts/build.ts
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => build());
```

`build()` takes `customEsbuildPlugins` and `customizeEsbuildOptions`. `vite`, rollup, `webpack` and parcel each have an adapter producing the same three files; each is an optional peer, so install the bundler first.

## Not configurable

One CommonJS `main.js` with every dynamic `import()` inlined (an Obsidian plugin has no second chunk, so `import()` defers evaluation, never bundle size). `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` and the Node builtins stay external. Every CSS file goes into one `styles.css`. The output folder is emptied first.

## Options every adapter takes

| Option | Default | Meaning |
| --- | --- | --- |
| `runtimeFloor` | `es2022` | The ECMAScript target. Set the same value in `defineEslintConfigs({ runtimeFloor })`. |
| `lineLimit` | `1000` | Keeps `main.js` lines short so the directory does not report "File is unusually packed". `false` turns it off. |
| `shouldCheckMobileLoad` | `true` | The mobile load check below. |
| `reload` | `'hot-reload-plugin'` | How `npm run dev` reloads: `'hot-reload-plugin'`, `'obsidian-cli'` or `false`. |
| `obsidianConfigFolder` | `OBSIDIAN_CONFIG_FOLDER` | The `.obsidian` folder of the vault a development build deploys into. |
| `framework`, `styles`, `wasm`, `workers` | off | The build features: `React`, `Preact`, `Solid`, `Svelte`, `Vue`, `PostCSS` with `Tailwind` and CSS modules, `.wasm` as bytes, inline workers. |

## The mobile load check

A production build loads `main.js` in a `node:vm` context shaped like Obsidian mobile: `require` returns `undefined` for every Node builtin, `Buffer` is absent, and the webview and Obsidian globals are stubbed. When the top level throws there, the build fails with the error and its first stack frames.

How to read a failure:

1. The error names what threw at load time. Usually a dependency calls a Node builtin at its top level (`const { randomFillSync } = require('crypto')`).
2. Move that code behind a call-time `import()` of a `desktop-` module gated on `Platform.isDesktopApp`, or replace the dependency. Code that reaches a builtin only inside a function passes.
3. A plugin that really is desktop only sets `"isDesktopOnly": true` in `manifest.json`, which skips the check.
4. Pass `shouldCheckMobileLoad: false` only when the check fails on a global a phone does have, and report that as a bug in the toolkit.

## The development build and reloading

| Symptom | Cause and fix |
| --- | --- |
| A `console.warn` says the build was not deployed and lists the known vaults | No target vault. Set `OBSIDIAN_CONFIG_FOLDER` (environment or a `.env` file) to `<vault>/.obsidian`, or pass `obsidianConfigFolder`. |
| `reload: 'obsidian-cli'` fails listing several vaults | The Obsidian CLI reloads in the ONE vault Obsidian has open. Close the others or set `OBSIDIAN_CONFIG_FOLDER`. |
| The plugin does not refresh after a rebuild | With the default `'hot-reload-plugin'`, the first rebuild opens a dedicated Obsidian on the vault and installs and enables `Hot Reload`. Let that window stay open. |
| The Obsidian CLI exits 0 but nothing reloaded | It exits 0 on failure; the toolkit reads its output and reports `Vault not found.` or `Error: ...`. Read that line. |

## Stop and recover

| Stopped at | What to do |
| --- | --- |
| `build:compile` (TypeScript errors) | Fix the type errors; nothing was bundled. |
| `Cannot find module` for `vite`, `webpack`, `rollup`, parcel or a framework package | It is an optional peer: run the `npm install` line the error names. |
| The mobile load check | See above. Never disable the check to make a release go through. |
| "File is unusually packed" from the directory | Keep `lineLimit` on (the default); a `main.js` that references a source map is left alone, so do not ship one in production. |
| `check-plugin` warns `build-script-not-toolkit` | Make the `build` script run `jiti scripts/build.ts` (or an adapter config), never `--watch` or a development build. |

## Migrating a plugin's own build script

1. `npm install --save-dev @mnaoumov/obsidian-dev-toolkit @mnaoumov/typescript-dev-toolkit` and `npm install @mnaoumov/obsidian-lib`.
2. Copy `scripts/build.ts` and `scripts/dev.ts` from `node_modules/@mnaoumov/obsidian-dev-toolkit/dist/templates/scripts/bundlers/esbuild/`.
3. Set `"build": "jiti scripts/build.ts"` and `"dev": "jiti scripts/dev.ts"` in `package.json`, and delete `esbuild.config.mjs`.
4. The output moves from the repository root to `dist/build`: update `.gitignore` and anything that copied `main.js` from the root.
5. Run `npm run build`, then load the plugin in Obsidian and on a phone before releasing.
