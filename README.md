# @mnaoumov/obsidian-dev-toolkit

Tooling for Obsidian plugins: the plugin builder for esbuild, with adapters for vite, rollup, webpack and parcel and built-in support for React, Preact, Solid, Svelte, Vue, PostCSS, Tailwind, CSS modules and WebAssembly, the shared ESLint and Vitest configurations, demo vaults, the plugin release script, the per-test setup for plugin tests, and the consumer templates. It continues the tooling half of `obsidian-dev-utils`. Install it as a dev dependency.

## Installation

```bash
npm install --save-dev @mnaoumov/obsidian-dev-toolkit
```

## Documentation

The guides and the API reference are at <https://mnaoumov.dev/obsidian-dev-toolkit/>.

esbuild builds include source-map ignore lists for shared debug and patching wrappers, so DevTools can link console messages to their callers. Extend the defaults with `ignoreListSources` or disable them with `ignoreListSources: false`; see the [bundler guide](https://mnaoumov.dev/obsidian-dev-toolkit/guides/bundlers/#esbuild).

## Where it fits

It is one of five packages that replace [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils): [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-test-toolkit`](https://github.com/mnaoumov/typescript-test-toolkit), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) and [`@mnaoumov/obsidian-dev-toolkit`](https://github.com/mnaoumov/obsidian-dev-toolkit). It depends on [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), and takes [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) 6.x as a peer dependency, so a plugin and its tooling share one copy. It moved here from that repository with its history.

## Filing an issue (for AI agents and humans)

Open issues through the [issue forms](https://github.com/mnaoumov/obsidian-dev-toolkit/issues/new/choose), not as blank issues.

Filing from the CLI or the API (`gh issue create --body`, or an AI agent filing for you) skips the form, and `gh issue create --template` cannot load an issue form. In that case, open the matching form in [`.github/ISSUE_TEMPLATE/`](https://github.com/mnaoumov/obsidian-dev-toolkit/tree/HEAD/.github/ISSUE_TEMPLATE), copy every field as a `### <label>` heading in the form's order, and fill in each one. Always state the version you used and your operating system.

## License

© [Michael Naumov](https://github.com/mnaoumov/)
