# @mnaoumov/obsidian-dev-toolkit

Tooling for Obsidian plugins: the plugin builder for `esbuild`, with adapters for `vite`, rollup, `webpack` and parcel and built-in support for `React`, `Preact`, `Solid`, `Svelte`, `Vue`, `PostCSS`, `Tailwind`, CSS modules and `WebAssembly`, the shared `ESLint` and `Vitest` configurations, an opt-in `stylelint` configuration that allows only theme tokens, demo vaults, the plugin release script, the per-test setup for plugin tests, and the consumer templates. It continues the tooling half of `obsidian-dev-utils`. Install it as a dev dependency.

## Installation

```bash
npm install --save-dev @mnaoumov/obsidian-dev-toolkit
```

## Documentation

The guides and the API reference are at <https://mnaoumov.dev/obsidian-dev-toolkit/>.

Run `npx start-obsidian-for-debugging` to start Obsidian with its renderer debugging endpoint, and `npx generate-vscode-debug-config` in your plugin project to create a VS Code attach configuration matching the `esbuild` development source maps. See [Debugging plugins](docs/src/content/docs/guides/debugging.md) for starting Obsidian and the development build, and [Debugging in VS Code](docs/src/content/docs/guides/debugging-vscode.md) for binding TypeScript breakpoints and diagnosing source paths.

`esbuild` builds include source-map ignore lists for shared debug and patching wrappers, so DevTools can link console messages to their callers. Extend the defaults with `ignoreListSources` or disable them with `ignoreListSources: false`; see the [bundler guide](https://mnaoumov.dev/obsidian-dev-toolkit/guides/bundlers/#esbuild).

## Where it fits

It is one of five packages that replace [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils): [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-test-toolkit`](https://github.com/mnaoumov/typescript-test-toolkit), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) and [`@mnaoumov/obsidian-dev-toolkit`](https://github.com/mnaoumov/obsidian-dev-toolkit). It depends on [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), and takes [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) as a peer dependency, accepting any major from 6 through 10, so a plugin and its tooling share one copy. It moved here from that repository with its history.

## See also

<!-- cspell:words aliou -->

[My other Obsidian resources](https://mnaoumov.dev/obsidian/)

| Tool | Features | How `@mnaoumov/obsidian-dev-toolkit` differs |
| --- | --- | --- |
| [`@aliou/vite-plugin-obsidian`](https://github.com/aliou/vite-plugin-obsidian) | `vite` plugin; CommonJS library output; externals for `obsidian`, Electron, CodeMirror, Lezer and Node builtins; `manifest.json` generated from a config file; CSS extracted to `styles.css` | Overlaps with `@aliou/vite-plugin-obsidian` in `vite` builds; also builds with `esbuild`, rollup, `webpack` and parcel; adds vault deployment, lint, test and release tooling; keeps `manifest.json` as a source file rather than generating it |
| [`@mnaoumov/create-obsidian-plugin`](https://github.com/mnaoumov/create-obsidian-plugin) (my tool) | Scaffolding CLI; generates plugin projects from templates; updates existing projects | Used by `@mnaoumov/create-obsidian-plugin`, whose generated projects build on this toolkit; leaves project scaffolding to it |
| [`@obsidian-plugin-toolkit/esbuild`](https://github.com/jon-dez/obsidian-plugin-toolkit/tree/main/packages/esbuild) | `esbuild` plugins; hot reload through server-sent events; development server for remote development; development-only API shims | Overlaps with `@obsidian-plugin-toolkit/esbuild` in `esbuild` development builds; reloads through the Hot Reload plugin or the Obsidian CLI rather than its own server; adds lint, test and release tooling; omits remote development and API shims |
| [`@obsidian-plugin-toolkit/vite`](https://github.com/jon-dez/obsidian-plugin-toolkit/tree/main/packages/vite) | `vite` configuration wrapper; manifest and development-build wiring; `React` Fast Refresh | Overlaps with `@obsidian-plugin-toolkit/vite` in `vite` builds; adds four other bundlers, lint, test and release tooling; omits `React` Fast Refresh |
| [`@ophidian/build`](https://github.com/ophidian-lib/build) | `esbuild` builder configured in a few lines; `Sass`; install into a test vault with Hot Reload; `GitHub` publish action with a manifest-against-tag check, release notes and attestations | Same goal as `@ophidian/build`, building and releasing plugins; adds four other bundlers, UI frameworks, shared lint and test configurations and demo vaults; releases from a local script or a reusable workflow |
| [`esbuild-plugin-obsidian`](https://github.com/eth-p/esbuild-plugin-obsidian) | `esbuild` plugin; `manifest.json` generated from `package.json`; `versions.json` kept up to date | Overlaps with `esbuild-plugin-obsidian`, last published in 2023, in `esbuild` builds; updates `versions.json` at release rather than at build; keeps `manifest.json` as a source file; adds lint, test and release tooling |
| [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) | Official `ESLint` rules for Obsidian's plugin guidelines; recommended configuration; `manifest.json` and `LICENSE` checks | Extends `eslint-plugin-obsidianmd`: turns on its recommended configuration in the shared `ESLint` config; adds its own rules for plugin names as code, in-Obsidian wait budgets and manifest details upstream does not check |
| [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils) (my library) | Runtime helpers for plugins; `esbuild` builder; shared lint configurations; release script | Supersedes the tooling half of `obsidian-dev-utils`, which is retired; its runtime half moved to `@mnaoumov/obsidian-lib` |
| [`obsidian-plugin-cli`](https://github.com/obsidian-tools/obsidian-tools/tree/main/packages/obsidian-plugin-cli) | `build` and `dev` commands over `esbuild`; watch mode copying the build into a vault; plugin install into a vault | Same goal as `obsidian-plugin-cli`, an alpha last published in 2023: exposes script APIs and shared configurations rather than one CLI; adds lint, test and release tooling |
| [`obsidian-plugin-validator`](https://github.com/philpalmieri/obsidian-plugin-validator) | Local community-review checks: `manifest.json` submission rules, a `versions.json` entry, `README.md` and `LICENSE` presence; `ESLint` with the `eslint-plugin-obsidianmd` recommended rules | Overlaps with `obsidian-plugin-validator` in `check-plugin`; can also run the community directory's own scanner action; checks the release tag and assets; runs the same checks before every release |
| [`obsidian-sample-plugin`](https://github.com/obsidianmd/obsidian-sample-plugin) | Official plugin template; `esbuild` configuration; `ESLint` with `eslint-plugin-obsidianmd`; `version-bump.mjs`; manual release steps | Same starting point as `obsidian-sample-plugin`: installed as a dependency rather than copied files; adds other bundlers, shared test configurations, demo vaults and an automated release |
| [`semantic-release-obsidian-plugin`](https://github.com/brianrodri/semantic-release-obsidian-plugin) | `semantic-release` plugin; verifies the metadata files; bumps `package.json`, `package-lock.json`, `manifest.json` and `versions.json` | Covers what `semantic-release-obsidian-plugin` does for version bumps, with its own release script rather than `semantic-release`; adds build, lint and test tooling |

Last searched for similar tools on 2026-11-06.

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Filing an issue (for AI agents and humans)

Open issues through the [issue forms](https://github.com/mnaoumov/obsidian-dev-toolkit/issues/new/choose), not as blank issues.

Filing from the CLI or the API (`gh issue create --body`, or an AI agent filing for you) skips the form, and `gh issue create --template` cannot load an issue form. In that case, open the matching form in [`.github/ISSUE_TEMPLATE/`](https://github.com/mnaoumov/obsidian-dev-toolkit/tree/HEAD/.github/ISSUE_TEMPLATE), copy every field as a `### <label>` heading in the form's order, and fill in each one. Always state the version you used and your operating system.

## License

© [Michael Naumov](https://github.com/mnaoumov/)
