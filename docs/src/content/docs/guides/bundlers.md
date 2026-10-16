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
- in a development build, adds the `.hotreload` marker, writes an inline source map, and deploys every rebuild into the vault named by `OBSIDIAN_CONFIG_FOLDER`, enabling [Hot Reload] and the plugin there, as the [development build](/obsidian-dev-toolkit/guides/cli-commands/#build-development-version) does.

Each adapter fills in only what your own configuration leaves unset, so anything you configure wins. TypeScript, CSS preprocessors and frameworks stay your choice of the bundler's own plugins and loaders.

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

`rollup --config rollup.config.mjs` builds for production and adds `--watch` for development; `obsidianPluginRollup({ mode })` decides it outright. The rollup command line checks `input` and picks the output folder before any plugin runs, which is why the config names both; through rollup's JavaScript API the plugin fills in `input` and writes `main.js` itself, and either way an `output.file` or `output.dir` you set is kept and the dist folder follows it. rollup reads only JavaScript and minifies nothing by itself, so the TypeScript, CSS and minifier plugins are yours to pick: any CSS plugin that emits its CSS as an asset works, and `@rollup/plugin-node-resolve` with `{ browser: true }` and `@rollup/plugin-commonjs` bring in dependencies from `node_modules`.

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

## How the adapters are tested

One fixture plugin, `test-fixtures/obsidian-plugin` in this repository, is built with every bundler by `npm run test:integration`, in production and, for the adapters that take a `mode`, in development. Each `main.js` is then loaded the way Obsidian's own plugin loader does, as the body of `function (require, module, exports)` with a bare `module`, and the plugin class is constructed and its `onload` run. CI runs it on every push.

[Hot Reload]: https://github.com/pjeby/hot-reload
