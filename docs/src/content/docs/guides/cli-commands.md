---
title: Commands
description: The Obsidian plugin builder, the development build with hot reload, the plugin release, the community directory check, and the Obsidian-aware lint and format commands.
---

`@mnaoumov/obsidian-dev-toolkit` adds the commands only an Obsidian plugin needs to the generic ones of `@mnaoumov/typescript-dev-toolkit`. Each is a function, identified by its import subpath, that a script in your `scripts/` folder calls:

```typescript
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';

await build();
```

The generic commands (clean, compile, spellcheck, find over-exposed declarations, the test runners, the branch gate and the `npm` publish) are documented on the [TypeScript Dev Toolkit commands page](https://mnaoumov.dev/typescript-dev-toolkit/guides/cli-commands/), together with how to wire a command into an `npm` script, how to switch a command off with an environment variable, and why every command skips what `.gitignore` skips. A plugin calls them from `@mnaoumov/typescript-dev-toolkit` directly.

## Generate a debugger configuration

Run `npx generate-debug-config` in a plugin project to create `.vscode/launch.json` for VS Code's built-in browser debugger. It reads the `npm` package name used by `esbuild`'s development source maps and refuses to overwrite existing settings. Pass `--port=9333` to change the default renderer port of `9222`. See [Debugging plugins](/obsidian-dev-toolkit/guides/debugging/) for launching Obsidian, attaching, and diagnosing unbound breakpoints.

## Build Production Version

```typescript
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
```

Runs `build:compile`, then bundles the plugin with `esbuild` into the `dist/build` folder: `main.js`, `styles.css` when the plugin has styles, and a copy of `manifest.json`. The bundle is one CommonJS `main.js`, loaded both by Electron on desktop and by a bare WebView on a phone, so its banner shims the few globals the second one lacks.

To build with `vite`, rollup, `webpack` or parcel instead, see [Bundlers](/obsidian-dev-toolkit/guides/bundlers/): each has an adapter producing the same output.

`build` takes `customEsbuildPlugins` to add `esbuild` plugins and `customizeEsbuildOptions` to edit the `esbuild` options before the build runs. `buildObsidianPlugin` is the same build with the mode as a parameter (`BuildMode.Production` or `BuildMode.Development`), returning a `CliTaskResult` instead of throwing.

## Build Development Version

```typescript
import { dev } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
```

Compiles the development version of your plugin into the `dist/dev` folder and keeps rebuilding it on every change. Set `OBSIDIAN_CONFIG_FOLDER` to the configuration folder of the vault you develop in (e.g. `path/to/my/vault/.obsidian`), either as an environment variable or in a `.env` file, or pass `obsidianConfigFolder`. Every rebuild is then copied into that vault's `plugins/<plugin-id>/` folder.

On the first rebuild it launches a dedicated Obsidian instance on that vault and, through it, installs the [Hot Reload] plugin from the official community store if it is not already installed, enables it if it is disabled, and enables your plugin, so [Hot Reload] refreshes your plugin on every rebuild.

## Deploy to an Android Device

```sh
npx deploy-to-device --vault=/sdcard/Documents/MyVault
```

Pushes a build to Obsidian Mobile on an Android phone connected over `adb`, to try it by hand on the phone. It copies every file of `dist/build` into the vault's `.obsidian/plugins/<plugin-id>/` folder on the device, adds the plugin to the vault's enabled plugins, and restarts Obsidian on that vault, so the new build is the one running. Obsidian Mobile has no command line and runs no [Hot Reload], so a restart is how the build is reloaded there; the enabled plugins are edited while Obsidian is stopped, so it cannot write its own list over the edit.

It needs `adb` on `PATH` (the Android SDK platform tools) and a phone with USB debugging on. The vault must be one Obsidian has opened on the phone, in shared storage: a vault in Obsidian's app-private storage is out of `adb`'s reach. Community plugins must be turned on in that vault, or Obsidian loads none of them.

| Flag | Effect |
| --- | --- |
| `--vault=<folder>` | The vault folder on the device. Falls back to the `OBSIDIAN_DEVICE_VAULT_PATH` environment variable. Required. |
| `--device=<id>` | The device to deploy to, as `adb devices` lists it. Without it, the one attached device is used, and the command fails when there are none or several. |
| `--dist=<folder>` | The build folder, relative to the project root, e.g. `dist/dev`. Defaults to `dist/build`. |
| `--app-id=<id>` | The Android application id of Obsidian. Defaults to `md.obsidian`. |
| `--no-restart` | Pushes the build only. It runs once Obsidian is restarted by hand, and a new plugin is not enabled. |

The same is the `deployToDevice` function (`@mnaoumov/obsidian-dev-toolkit/device-deployment`), for a script that builds and deploys in one step:

```typescript
import { build } from '@mnaoumov/obsidian-dev-toolkit/bundlers/esbuild';
import { deployToDevice } from '@mnaoumov/obsidian-dev-toolkit/device-deployment';

await build();
await deployToDevice({ deviceVaultPath: '/sdcard/Documents/MyVault' });
```

## Check Against the Community Directory

```sh
npx check-plugin --scanner
```

Checks the plugin the way the community directory does, so a finding that would get a submission rejected or a release delisted shows up on your own machine first. Without flags it checks `manifest.json`, `versions.json` and, when `dist/build` exists, the release assets in it. It exits `1` on any error and prints warnings without failing.

The manifest, `versions.json` and asset rules are those of [`obsidianmd/obsidian-workflows`](https://github.com/obsidianmd/obsidian-workflows), the action the directory team points to as matching its scanner, with its rule ids and its `strict: true` severities: an ID or name holding `obsidian` or `plugin`, a description over 250 characters or naming Obsidian, a placeholder or email in `author`, a non-HTTPS URL, a version that is not semver, `main.js` or `manifest.json` missing from the release. On top of these are the submission bot's own rules: an ID of lowercase letters, digits, dashes and underscores only, and a release tag equal to `manifest.json`'s `version`, with no `v` prefix, since that tag is how the directory finds the release. As in the action, an ID the directory already lists for the plugin's repository is exempt from the banned-word rule, since a listed ID can never change; the directory's `community-plugins.json` is read only when that rule fires.

`--scanner` also runs the scanner's own `ESLint` and Stylelint rulesets, by running `obsidianmd/obsidian-workflows` itself on your machine: its bundled action is downloaded once into `node_modules/.cache`, then run in its pull-request mode with the scanner lint and `strict` on and the build off. So the answer is the scanner's, not a copy of its rules that could drift. The action installs the scanner's linters into a temporary folder on each run, which takes a few minutes, and needs network access. A finding it reports that your own `npm run lint` does not, such as an `eslint-disable` comment naming a rule from a plugin the scanner does not load, is a finding the directory reports too.

| Flag | Effect |
| --- | --- |
| `--tag=<tag>` | Checks this release tag against `manifest.json`. In `GitHub Actions` it defaults to the pushed tag (`GITHUB_REF`). |
| `--dist=<folder>` | The folder holding the release assets, relative to the project root. Defaults to `dist/build`. |
| `--require-assets` | Fails when the asset folder does not exist, instead of skipping the asset checks. |
| `--scanner` | Also runs the scanner's `ESLint` and Stylelint rulesets, through `obsidianmd/obsidian-workflows`. |
| `--api-version` | Derives an API version floor from the plugin's source and compares it with `manifest.json`'s `minAppVersion`. Requires the plugin's typed `ESLint` configuration. |
| `--scanner-version=<tag>` | The `obsidianmd/obsidian-workflows` release to run. Defaults to the one this package was tested with. |
| `--no-strict` | Reports the scanner's policy findings as warnings, as the action does without `strict`. |
| `--repository=<owner/repo>` | The plugin's repository, for the scanner's `authorUrl` check. In `GitHub Actions` it defaults to `GITHUB_REPOSITORY`. |

[Version Management](#version-management) runs the same manifest, tag and asset checks by itself, and stops the release on an error before it is tagged. The checks are also the `validatePluginRelease` function (`@mnaoumov/obsidian-dev-toolkit/plugin-release-checks`), and the scanner run is `runScannerCheck` (`@mnaoumov/obsidian-dev-toolkit/plugin-scanner-check`).

### Check the API Version Floor

Run `npx check-plugin --api-version` before a release to compare your declared `minAppVersion` with the highest version required by an unguarded API use. It runs only `obsidianmd/no-unsupported-api` from your typed `ESLint` configuration, overriding its minimum to `0.0.0`, and prints the comparison and source locations. An insufficient manifest fails the command; a higher manifest gets advice that it could be lowered after reviewing other requirements. Recognized `requireApiVersion()` guards retain the upstream rule's behavior. Inline lint suppressions are disabled for this analysis, and neither the manifest nor `versions.json` is rewritten.

The default scan covers JavaScript and TypeScript files under `src/`, excluding `*.test.*`, `*.spec.*` and declaration files, and respects your `ESLint` ignores. A missing configuration, parse failure, empty scan or unrecognized report fails the command. No detected versioned API usage means no floor could be derived; it does not mean every Obsidian version works. The result covers only APIs and guards the upstream rule recognizes in the scanned source and installed Obsidian declarations. Dependencies, computed API access, unsupported guard shapes, runtime features and other compatibility requirements still need review. This optional check is separate from the automatic manifest, tag and asset release guards.

For a different source layout, call `analyzePluginApiVersion({ files: ['lib/**/*.ts'] })` from `@mnaoumov/obsidian-dev-toolkit/plugin-api-version-check`. The returned report includes `minAppVersion`, `requiredMinAppVersion` (undefined when no versioned use was detected), `hasErrors`, `summary` and `apiUsages`.

Stable manifest versions must contain only digits and dots: a suffix such as `-beta.1` fails the release check. Prerelease versions belong in `manifest-beta.json`, which `validatePluginRelease({ manifestFile: 'manifest-beta.json' })` accepts. The lower-level `validatePluginManifest` checks the manifest schema for either channel; `validatePluginRelease` also enforces the stable channel's numeric version requirement.

## Lint, Lint Markdown and Format

```typescript
import { format } from '@mnaoumov/obsidian-dev-toolkit/formatters/dprint';
import { lint } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint';
import { lint as lintMarkdown } from '@mnaoumov/obsidian-dev-toolkit/linters/markdownlint';
```

The generic `ESLint`, `markdownlint` and `dprint` commands, with one difference: a project that has no configuration of its own gets this package's template copied in (`eslint.config.mts`, `.markdownlint-cli2.mjs`, `dprint.json`), which builds on the Obsidian layer of the shared configuration rather than the generic one. They take the same options as the generic commands, such as `{ shouldFix: true }`.

The Obsidian layer of the `ESLint` configuration is `defineEslintConfigs` (`@mnaoumov/obsidian-dev-toolkit/linters/eslint-config`): the generic configuration plus `eslint-plugin-obsidianmd`'s recommended rules, the Node-builtins exemption for `src/**/desktop-*.ts`, the integration-test rules, and lint rules for `manifest.json` and `LICENSE`. Its own rules are registered under `obsidian-dev-toolkit`, so a disable comment names one as `obsidian-dev-toolkit/<rule>`. The `markdownlint` layer is `obsidianMarkdownlintCli2Config` (`@mnaoumov/obsidian-dev-toolkit/linters/markdownlint-cli2-config`).

## Version Management

```typescript
import {
  parseVersionArguments,
  updateVersion
} from '@mnaoumov/obsidian-dev-toolkit/version';
```

Releases the plugin. It is the [generic release](https://mnaoumov.dev/typescript-dev-toolkit/guides/cli-commands/#release) (the clean-repo check, the branch gate, the version bump, the changelog, the commit, the tag, the push and the `GitHub` release) plus what only a plugin has:

- **`manifest.json` and `versions.json`.** The new version is written into `manifest.json`, preserving its current `minAppVersion` by default, and a new `versions.json` entry maps the release to that minimum. Older compatibility entries are preserved. No latest-version feed is fetched. Use `--min-app-version` to change the minimum explicitly, or `--api-version` to raise it when the source analysis detects an unguarded API requiring a newer version.
- **Pre-releases.** A pre-release version (`prepatch`, `preminor`, `premajor` or `prerelease`, which number it `x.y.z-beta.n`, or an explicit `x.y.z-suffix`) goes to a `manifest-beta.json` copied from `manifest.json`, and `manifest.json` and `versions.json` are left alone, so the release installs through [BRAT](https://community.obsidian.md/plugins/obsidian42-brat) without reaching users of the stable release. The next stable release deletes `manifest-beta.json`.
- **The release assets.** The updated manifest is copied into `dist/build`, and every file in `dist/build` is attached to the `GitHub` release, instead of the `npm pack` tarball a library attaches.
- **The demo vault.** A plugin with a `demo-vault/` folder gets it archived and attached to the release. See [Demo Vault](/obsidian-dev-toolkit/guides/demo-vault/).
- **The community directory checks.** `manifest.json` and `versions.json` are checked before anything runs, and the tag and the assets in `dist/build` once the version is bumped, before the release commit, with the rules of [Check Against the Community Directory](#check-against-the-community-directory). An error stops the release before it is tagged; a pre-release skips the tag check.
- **Publish before push.** Obsidian reads a plugin's version from `manifest.json` on the default branch and downloads the assets of the release whose tag equals it, so the branch must not name a release that is not public yet. The plugin release therefore turns on the generic `shouldPublishBeforePush`: after the release commit and tag are made locally, it checks that `manifest.json` and `dist/build/manifest.json` both carry the tag's version (for a stable release), prepares the assets, pushes only the tag to `origin`, creates the `GitHub` release and verifies it is published with every asset, and only then pushes the commit to the branch, without force. A failure before that last push leaves the remote branch untouched. Pass `shouldPublishBeforePush: false` to `updateVersion` for the older order, which pushes the branch first.

For the script to be able to publish releases in your repository, your `GitHub` token needs `Read and write permissions` in `Settings > Actions > General`.

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

It accepts every flag of the generic release, plus the plugin flags below. When invoking via `npm run`, separate the flags with `--`, e.g. `npm run version -- patch --no-changelog-editing`:

| Flag | Effect |
| --- | --- |
| `--min-app-version=<x.y.z>` | Writes this `minAppVersion` into `manifest.json` and the new `versions.json` entry, overriding the existing minimum. With `--api-version`, a value below the detected floor fails before compatibility files are edited. |
| `--api-version` | Runs the typed API analysis described above and raises the existing minimum only if required. No detected floor leaves it unchanged. Analysis failures stop the update. Ignored for pre-releases, as is `--min-app-version`. |
| `--no-demo-vault` | Skips archiving the demo vault for this release. |
| `--no-release-checks` | Skips the community directory checks. |

The corresponding options of `updateVersion` are `minAppVersion`, `shouldCheckApiVersion` (default `false`), `shouldArchiveDemoVault` and `shouldRunReleaseChecks`. API analysis uses the same source layout, typed `ESLint` setup and coverage limits as `check-plugin --api-version`; it cannot prove compatibility with older runtimes or dependencies. The generic branch gate runs before compatibility files are updated, so an unsupported API lint failure may require first raising the manifest or guarding the API.

[Hot Reload]: https://community.obsidian.md/plugins/hot-reload
