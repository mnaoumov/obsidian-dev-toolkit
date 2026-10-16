---
title: Bundlers
description: Build an Obsidian plugin with esbuild, vite, rollup, webpack or parcel, each producing the same main.js, styles.css and manifest.json.
---

An Obsidian plugin ships three files: `main.js`, `styles.css` and `manifest.json`. Obsidian loads `main.js` as CommonJS, reads the stylesheet from `styles.css` and from nothing else, and supplies `obsidian`, `electron` and the CodeMirror and Lezer packages itself. The toolkit builds that layout with whichever bundler a plugin prefers. esbuild is the default and needs nothing extra; vite, rollup, webpack and parcel each have an adapter, and each is an optional peer dependency, so a plugin built with esbuild installs none of them.

Every adapter does the same things:

- builds `src/main.ts` into one CommonJS `main.js` in `dist/build`, or `dist/dev` for a development build, with every dynamic import inlined, because nothing loads a second chunk beside `main.js`;
- leaves `obsidian`, `electron`, the `@codemirror/*` and `@lezer/*` packages and the Node builtins (with or without `node:`) to `require()`, beside any externals of your own;
- puts every CSS file the bundler emits into one `styles.css`;
- empties the output folder before the first write and copies `manifest.json` beside the bundle;
- heads `main.js` with the generated-file banner, after minification so the minifier does not strip it;
- in a development build, writes an inline source map, deploys every rebuild into the vault named by `OBSIDIAN_CONFIG_FOLDER`, and [reloads it there](#reloading-a-development-build): by default by adding the `.hotreload` marker and enabling [Hot Reload] and the plugin, as the [development build](/obsidian-dev-toolkit/guides/cli-commands/#build-development-version) does.

Each adapter fills in only what your own configuration leaves unset, so anything you configure wins. TypeScript stays your choice of the bundler's own plugin or loader. A UI framework, the stylesheet pipeline and WebAssembly are [build features](#build-features), one set of options every adapter takes the same way.

## esbuild

```typescript
// scripts/build.ts
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => build());
```

The default, documented on the [Commands page](/obsidian-dev-toolkit/guides/cli-commands/#build-production-version). It type-checks with `build:compile` first and handles TypeScript, Sass and Svelte itself.

## vite

```bash
npm install --save-dev vite
```

```typescript
// vite.config.ts
import { obsidianPluginVite } from '@mnaoumov/obsidian-dev-toolkit/bundlers/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [obsidianPluginVite()]
});
```

`vite build` is the production build and `vite build --watch` the development one; `--mode development` also makes a development build, and `obsidianPluginVite({ mode })` decides it outright. The plugin turns the build into a library build of `src/main.ts` (unless you set `build.lib`), sets `build.outDir`, puts every asset inline (`build.assetsInlineLimit`), minifies only in production, and turns off `build.emptyOutDir` because it empties the folder itself. It needs vite 8, which builds with rolldown.

## rollup

```bash
npm install --save-dev rollup rollup-plugin-esbuild rollup-plugin-css-only
```

```javascript
// rollup.config.mjs
import { obsidianPluginRollup } from '@mnaoumov/obsidian-dev-toolkit/bundlers/rollup';
import process from 'node:process';
import css from 'rollup-plugin-css-only';
import esbuild from 'rollup-plugin-esbuild';

export default {
  input: 'src/main.ts',
  output: { dir: process.env['ROLLUP_WATCH'] ? 'dist/dev' : 'dist/build' },
  plugins: [esbuild(), css(), obsidianPluginRollup()]
};
```

`rollup --config rollup.config.mjs` builds for production and adds `--watch` for development; `obsidianPluginRollup({ mode })` decides it outright. The rollup command line checks `input` and picks the output folder before any plugin runs, which is why the config names both; through rollup's JavaScript API the plugin fills in `input` and writes `main.js` itself, and either way an `output.file` or `output.dir` you set is kept and the dist folder follows it. rollup reads only JavaScript and minifies nothing by itself, so the TypeScript, CSS and minifier plugins are yours to pick: any CSS plugin that emits its CSS as an asset works, or the adapter compiles stylesheets itself with the [`styles` option](#build-features), and `@rollup/plugin-node-resolve` with `{ browser: true }` and `@rollup/plugin-commonjs` bring in dependencies from `node_modules`.

## webpack

```bash
npm install --save-dev webpack webpack-cli esbuild-loader css-loader mini-css-extract-plugin
```

```typescript
// webpack.config.ts
import { ObsidianPluginWebpackPlugin } from '@mnaoumov/obsidian-dev-toolkit/bundlers/webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

export default {
  module: {
    rules: [
      { loader: 'esbuild-loader', test: /\.tsx?$/ },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] }
    ]
  },
  plugins: [new ObsidianPluginWebpackPlugin(), new MiniCssExtractPlugin()],
  resolve: { extensions: ['.ts', '.tsx', '.js'] }
};
```

`webpack` builds for production and `webpack --watch` (or `mode: 'development'`) for development; `new ObsidianPluginWebpackPlugin({ mode })` decides it outright. Unless you set them, the plugin fills in `entry`, `mode`, `output.path`, `output.filename`, a `commonjs2` library, `output.asyncChunks: false`, `target: 'node'` (what Obsidian's renderer runs) with the browser's export conditions and never `node`, so a package hands over its browser build even when its `exports` lists `node` first, and `devtool`. It also puts license comments the minimizer extracted into `main.js.LICENSE.txt` back into `main.js`, since no Obsidian release ships that file.

The TypeScript step in both examples is esbuild-based on purpose: `@rollup/plugin-typescript` and `ts-loader` call TypeScript's JavaScript API, which TypeScript 7 no longer has, so with the TypeScript npm installs today they fail before reading a file.

## parcel

```bash
npm install --save-dev @parcel/core @parcel/plugin @parcel/config-default
```

```typescript
// scripts/build.ts
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/parcel';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => build());
```

```typescript
// scripts/dev.ts
import { dev } from '@mnaoumov/obsidian-dev-toolkit/bundlers/parcel';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => dev());
```

The same `build()` and `dev()` the esbuild builder has, running parcel through its JavaScript API: `build:compile` first when the project has it, since parcel strips types without checking them. Parcel takes no `external` list and no output file name, so the build writes a `.parcelrc` of its own into `.parcel-cache/obsidian-dev-toolkit/`, with a resolver that leaves Obsidian's modules external, a namer for `styles.css`, a transformer that keeps dynamic imports inside `main.js`, and an optimizer that adds the banner and lets parcel's runtime reach the `require` Obsidian passes in. That configuration extends your own `.parcelrc` when the project has one, so every transformer you configured still applies, and `@parcel/config-default` otherwise. `customizeParcelOptions` edits the options handed to parcel before the build runs.

A dependency that exposes its modules only through the `exports` field needs parcel's package exports switched on, in `package.json`:

```json
{
  "@parcel/resolver-default": {
    "packageExports": true
  }
}
```

## Build features

Every adapter takes the same three options beside its own: `build({ framework: 'react' })` for esbuild and parcel, `obsidianPluginVite({ framework: 'react' })`, `obsidianPluginRollup({ framework: 'react' })` and `new ObsidianPluginWebpackPlugin({ framework: 'react' })` for the others. Each is off unless set, and each needs a package or two that the toolkit does not install for you, because a plugin without the feature should not pay for it. The toolkit loads those packages from your project, so a missing one fails the build with the exact `npm install` command. Switching bundler keeps the options and the packages, since every adapter compiles a feature with the same code.

| Option | What it does | Install |
| --- | --- | --- |
| `framework: 'react'` | JSX with React's automatic runtime | `react react-dom` |
| `framework: 'preact'` | JSX with Preact's automatic runtime | `preact` |
| `framework: 'solid'` | JSX compiled by `babel-preset-solid` | `solid-js @babel/core babel-preset-solid` |
| `framework: 'svelte'` | `.svelte` components and `.svelte.ts` / `.svelte.js` modules, styles injected by the component | `svelte` |
| `framework: 'vue'` | `.vue` single-file components, through `unplugin-vue` | `vue unplugin-vue`, and on parcel `@parcel/transformer-vue` |
| `styles: { postcss: true }` | every stylesheet through your `postcss.config.*` | your PostCSS plugins |
| `styles: { tailwind: true }` | every stylesheet through Tailwind CSS 4 | `tailwindcss @tailwindcss/postcss` |
| `styles: { cssModules: true }` | `*.module.css` scoped, its import giving the scoped class names | nothing |
| `wasm: true` | `import bytes from './module.wasm'` gives the module's bytes, inlined into `main.js` | nothing |

Any `framework` also defines `process.env.NODE_ENV` as `"production"` or `"development"`, and for Vue its three feature flags, so a production plugin bundles the framework's production build. Obsidian's renderer has no `process.env.NODE_ENV` of its own, and a library build (vite's, parcel's) leaves it alone.

### tsconfig presets

The JSX settings live in tsconfig presets the toolkit ships, so the type checker and every TypeScript loader read the same ones. Extend the one for your framework beside your own base:

```json
{
  "extends": ["@tsconfig/strictest", "@mnaoumov/obsidian-dev-toolkit/tsconfig/react.json"]
}
```

There is one per framework: `react.json` and `preact.json` (`jsx: react-jsx` and the import source), `solid.json` (`jsx: preserve`, `jsxImportSource: solid-js`, since Babel compiles the JSX), `vue.json` (`jsx: preserve`, `jsxImportSource: vue`) and `svelte.json` (`isolatedModules` and `verbatimModuleSyntax`, which Svelte's TypeScript needs). On rollup and webpack this is also what compiles React and Preact JSX: `rollup-plugin-esbuild` and `esbuild-loader` read the preset.

The types of stylesheet imports (a plain one for its side effect, a CSS module for its class names) and of a `.wasm` import ship too. Name the ones you use in `compilerOptions.types`:

```json
{
  "compilerOptions": {
    "types": ["@mnaoumov/obsidian-dev-toolkit/types/styles", "@mnaoumov/obsidian-dev-toolkit/types/wasm"]
  }
}
```

### Examples

```typescript
// scripts/build.ts: a Svelte plugin styled with Tailwind, built with esbuild.
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => build({ framework: 'svelte', styles: { tailwind: true } }));
```

```css
/* src/styles.css, imported from src/main.ts */
@import "tailwindcss/theme.css";
@import "tailwindcss/utilities.css";
```

```typescript
// vite.config.ts: a Vue plugin with CSS modules and a WebAssembly module.
import { obsidianPluginVite } from '@mnaoumov/obsidian-dev-toolkit/bundlers/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [obsidianPluginVite({ framework: 'vue', styles: { cssModules: true }, wasm: true })]
});
```

```javascript
// rollup.config.mjs: a Solid plugin with PostCSS. With `styles`, the adapter compiles every stylesheet itself.
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { obsidianPluginRollup } from '@mnaoumov/obsidian-dev-toolkit/bundlers/rollup';
import process from 'node:process';
import esbuild from 'rollup-plugin-esbuild';

export default {
  input: 'src/main.ts',
  output: { dir: process.env['ROLLUP_WATCH'] ? 'dist/dev' : 'dist/build' },
  plugins: [
    obsidianPluginRollup({ framework: 'solid', styles: { postcss: true } }),
    esbuild(),
    nodeResolve({ browser: true, extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'] }),
    commonjs()
  ]
};
```

```typescript
// webpack.config.ts: a React plugin with CSS modules.
import { ObsidianPluginWebpackPlugin } from '@mnaoumov/obsidian-dev-toolkit/bundlers/webpack';

export default {
  module: {
    rules: [{ loader: 'esbuild-loader', test: /\.[jt]sx?$/ }]
  },
  plugins: [new ObsidianPluginWebpackPlugin({ framework: 'react', styles: { cssModules: true } })],
  resolve: { extensions: ['.ts', '.tsx', '.js'] }
};
```

### What each bundler does with them

- **esbuild** sets `jsx` and `jsxImportSource` for React and Preact, runs a Solid plugin, adds `unplugin-vue/esbuild` for Vue, and compiles Svelte as it always has. Stylesheets keep going through its Sass plugin, which now runs PostCSS and Tailwind on what Sass produced; `cssModules` loads `*.module.css` (and `.module.scss`) with esbuild's own `local-css` loader. `wasm` uses esbuild's `binary` loader.
- **vite** sets `oxc.jsx` for React and Preact, adds `unplugin-vue/vite` for Vue, and compiles Solid and Svelte in a plugin of its own. `postcss` and `tailwind` set `css.postcss` unless you set it. Vite scopes `*.module.css` itself, whatever `cssModules` says.
- **rollup** sets its `jsx` option for React and Preact (the TypeScript plugin reads the preset), adds `unplugin-vue/rollup` for Vue, and compiles Solid and Svelte in a plugin of its own. With `styles` set, the adapter compiles every stylesheet itself and emits it into `styles.css`, so leave rollup's CSS plugin out; `styles: {}` compiles plain CSS. It also replaces `process.env.NODE_ENV` in the bundled code, since rollup has no `define`.
- **webpack** adds rules that run the toolkit's own loader for Solid, Svelte and `.wasm`, and applies `unplugin-vue/webpack` for Vue, with a rule that strips the types of a `<script lang="ts">` block. With `styles` set, it adds the one stylesheet rule (the toolkit's loader for PostCSS and Tailwind, then `css-loader`, scoping `*.module.css` only with `cssModules`, then `mini-css-extract-plugin`) and applies `mini-css-extract-plugin` unless your config does, so leave your own `.css` rule out and install `css-loader` and `mini-css-extract-plugin`. Webpack's `mode` defines `process.env.NODE_ENV`.
- **parcel** gets pipelines in the generated `.parcelrc`: one transformer of the toolkit's compiles JSX for React, Preact and Solid (parcel reads the JSX runtime from `tsconfig.json` without following its `extends`), Svelte, `.wasm`, and with `postcss` or `tailwind` every stylesheet, in place of parcel's own PostCSS step. Parcel compiles Vue with `@parcel/transformer-vue` and scopes `*.module.css` itself. Svelte and the frameworks' runtimes are reached through `exports`, so switch `packageExports` on as shown in the [parcel section](#parcel).

## Reloading a development build

Every adapter takes `reload` beside its other options, and it decides what happens after each development rebuild has been copied into the vault named by `OBSIDIAN_CONFIG_FOLDER`:

| `reload` | What happens after each rebuild |
| --- | --- |
| `'hot-reload-plugin'` (the default) | The build writes the `.hotreload` marker, and `npm run dev` opens the vault in an Obsidian instance it owns and closes with it, with [Hot Reload] and the plugin installed and enabled there. Hot Reload then reloads the plugin whenever its files change. |
| `'obsidian-cli'` | `obsidian plugin:reload` reloads the plugin in the Obsidian you already have open, through the [Obsidian CLI](https://help.obsidian.md/cli). No Hot Reload, no second instance. A plugin the vault has not seen yet is enabled on its first build. |
| `false` | The build is copied into the vault, and nothing reloads it. |

```typescript
// scripts/dev.ts
import { dev } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';

await wrapCliTask(() => dev({ reload: 'obsidian-cli' }));
```

The same option is `obsidianPluginVite({ reload: 'obsidian-cli' })`, `obsidianPluginRollup({ reload: 'obsidian-cli' })` and `new ObsidianPluginWebpackPlugin({ reload: 'obsidian-cli' })`, and parcel's `dev({ reload: 'obsidian-cli' })`.

`'obsidian-cli'` needs Obsidian 1.12 or later, running, with **Settings → General → Command line interface** turned on so that `obsidian` is on `PATH`. The CLI names the vault by its folder name, which is the folder that holds `OBSIDIAN_CONFIG_FOLDER`. The CLI reports a failure in its output while exiting with code 0, so the adapter reads the output: an unknown vault, a CLI that is not installed, or any `Error:` it prints fails that rebuild with the message and how to turn the CLI on.

## How the adapters are tested

One fixture plugin, `test-fixtures/obsidian-plugin` in this repository, is built with every bundler by `npm run test:integration`, in production and, for the adapters that take a `mode`, in development. Each `main.js` is then loaded the way Obsidian's own plugin loader does, as the body of `function (require, module, exports)` with a bare `module`, and the plugin class is constructed and its `onload` run. CI runs it on every push.

Each build feature has a fixture of its own in `test-fixtures/features/`: one per framework, one with PostCSS, Tailwind and a CSS module together, and one with a WebAssembly module. Every bundler builds each of them, in production and, where it can, in development, and each `main.js` runs in a DOM: the framework's component renders its text, the CSS module's scoped class name is in `styles.css` beside Tailwind's utility, and the WebAssembly module answers.

[Hot Reload]: https://github.com/pjeby/hot-reload
