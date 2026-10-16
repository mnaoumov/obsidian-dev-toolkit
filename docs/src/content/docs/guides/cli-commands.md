---
title: Commands
description: The Obsidian plugin builder, the development build with hot reload, the plugin release, and the Obsidian-aware lint and format commands.
---

`@mnaoumov/obsidian-dev-toolkit` adds the commands only an Obsidian plugin needs to the generic ones of `@mnaoumov/typescript-dev-toolkit`. Each is a function, identified by its import subpath, that a script in your `scripts/` folder calls:

```typescript
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';

await build();
```

The generic commands (clean, compile, spellcheck, find over-exposed declarations, the test runners, the branch gate and the npm publish) are documented on the [TypeScript Dev Toolkit commands page](https://mnaoumov.dev/typescript-dev-toolkit/guides/cli-commands/), together with how to wire a command into an npm script, how to switch a command off with an environment variable, and why every command skips what `.gitignore` skips. A plugin calls them from `@mnaoumov/typescript-dev-toolkit` directly.

## Build Production Version

```typescript
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
```

Runs `build:compile`, then bundles the plugin with esbuild into the `dist/build` folder: `main.js`, `styles.css` when the plugin has styles, and a copy of `manifest.json`. The bundle is one CommonJS `main.js`, loaded both by Electron on desktop and by a bare WebView on a phone, so its banner shims the few globals the second one lacks.

To build with vite, rollup, webpack or parcel instead, see [Bundlers](/obsidian-dev-toolkit/guides/bundlers/): each has an adapter producing the same output.

`build` takes `customEsbuildPlugins` to add esbuild plugins and `customizeEsbuildOptions` to edit the esbuild options before the build runs. `buildObsidianPlugin` is the same build with the mode as a parameter (`BuildMode.Production` or `BuildMode.Development`), returning a `CliTaskResult` instead of throwing.

## Build Development Version

```typescript
import { dev } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
```

Compiles the development version of your plugin into the `dist/dev` folder and keeps rebuilding it on every change. Set `OBSIDIAN_CONFIG_FOLDER` to the configuration folder of the vault you develop in (e.g. `path/to/my/vault/.obsidian`), either as an environment variable or in a `.env` file, or pass `obsidianConfigFolder`. Every rebuild is then copied into that vault's `plugins/<plugin-id>/` folder.

On the first rebuild it launches a dedicated Obsidian instance on that vault and, through it, installs the [Hot Reload] plugin from the official community store if it is not already installed, enables it if it is disabled, and enables your plugin, so [Hot Reload] refreshes your plugin on every rebuild.

## Lint, Lint Markdown and Format

```typescript
import { format } from '@mnaoumov/obsidian-dev-toolkit/formatters/dprint';
import { lint } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint';
import { lint as lintMarkdown } from '@mnaoumov/obsidian-dev-toolkit/linters/markdownlint';
```

The generic ESLint, markdownlint and dprint commands, with one difference: a project that has no configuration of its own gets this package's template copied in (`eslint.config.mts`, `.markdownlint-cli2.mjs`, `dprint.json`), which builds on the Obsidian layer of the shared configuration rather than the generic one. They take the same options as the generic commands, such as `{ shouldFix: true }`.

The Obsidian layer of the ESLint configuration is `defineEslintConfigs` (`@mnaoumov/obsidian-dev-toolkit/linters/eslint-config`): the generic configuration plus `eslint-plugin-obsidianmd`'s recommended rules, the Node-builtins exemption for `src/**/desktop-*.ts`, the integration-test rules, and lint rules for `manifest.json` and `LICENSE`. Its own rules are registered under `obsidian-dev-toolkit`, so a disable comment names one as `obsidian-dev-toolkit/<rule>`. The markdownlint layer is `obsidianMarkdownlintCli2Config` (`@mnaoumov/obsidian-dev-toolkit/linters/markdownlint-cli2-config`).

## Version Management

```typescript
import {
  parseVersionArguments,
  updateVersion
} from '@mnaoumov/obsidian-dev-toolkit/version';
```

Releases the plugin. It is the [generic release](https://mnaoumov.dev/typescript-dev-toolkit/guides/cli-commands/#release) (the clean-repo check, the branch gate, the version bump, the changelog, the commit, the tag, the push and the GitHub release) plus what only a plugin has:

- **`manifest.json` and `versions.json`.** The new version is written into `manifest.json`, with `minAppVersion` set to the latest Obsidian version the desktop app can run, and a `versions.json` entry maps the new version to that `minAppVersion`. The latest version is read from the feed the desktop app updates from, not from GitHub's latest release, which can be a mobile-only one no desktop user can install.
- **Pre-releases.** A pre-release version (`prepatch`, `preminor`, `premajor` or `prerelease`, which number it `x.y.z-beta.n`, or an explicit `x.y.z-suffix`) goes to a `manifest-beta.json` copied from `manifest.json`, and `manifest.json` and `versions.json` are left alone, so the release installs through [BRAT](https://community.obsidian.md/plugins/obsidian42-brat) without reaching users of the stable release. The next stable release deletes `manifest-beta.json`.
- **The release assets.** The updated manifest is copied into `dist/build`, and every file in `dist/build` is attached to the GitHub release, instead of the `npm pack` tarball a library attaches.
- **The demo vault.** A plugin with a `demo-vault/` folder gets it archived and attached to the release. See [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/).

For the script to be able to publish releases in your repository, your GitHub token needs `Read and write permissions` in `Settings > Actions > General`.

A plugin's `scripts/version.ts` parses its flags with `parseVersionArguments`:

```typescript
import {
  parseVersionArguments,
  updateVersion
} from '@mnaoumov/obsidian-dev-toolkit/version';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

const [, , ...$arguments] = process.argv;
const { options, versionUpdateType } = parseVersionArguments($arguments);
await wrapCliTask(() => updateVersion(versionUpdateType, options));
```

It accepts every flag of the generic release, plus two of the plugin's own. When invoking via `npm run`, separate the flags with `--`, e.g. `npm run version -- patch --no-changelog-editing`:

| Flag | Effect |
| --- | --- |
| `--min-app-version=<x.y.z>` | Writes this `minAppVersion` into `manifest.json` and the new `versions.json` entry, instead of the latest Obsidian desktop version, which is then not fetched. |
| `--no-demo-vault` | Skips archiving the demo vault for this release. |

The same two are the `minAppVersion` and `shouldArchiveDemoVault` options of `updateVersion`.

[Hot Reload]: https://community.obsidian.md/plugins/hot-reload
