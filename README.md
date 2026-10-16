# @mnaoumov/obsidian-dev-toolkit

Tooling for Obsidian plugins: the plugin builder for esbuild, with adapters for vite, rollup, webpack and parcel and built-in support for React, Preact, Solid, Svelte, Vue, PostCSS, Tailwind, CSS modules and WebAssembly, the shared ESLint and Vitest configurations, demo vaults, the plugin release script, the per-test setup for plugin tests, and the consumer templates. It continues the tooling half of `obsidian-dev-utils`. Install it as a dev dependency.

## Installation

```bash
npm install --save-dev @mnaoumov/obsidian-dev-toolkit
```

## Documentation

The guides and the API reference are at <https://mnaoumov.dev/obsidian-dev-toolkit/>.

## Where it fits

It is one of five packages that replace [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils): [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-test-toolkit`](https://github.com/mnaoumov/typescript-test-toolkit), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) and [`@mnaoumov/obsidian-dev-toolkit`](https://github.com/mnaoumov/obsidian-dev-toolkit). It depends on [`@mnaoumov/typescript-lib`](https://github.com/mnaoumov/typescript-lib), [`@mnaoumov/typescript-dev-toolkit`](https://github.com/mnaoumov/typescript-dev-toolkit), and takes [`@mnaoumov/obsidian-lib`](https://github.com/mnaoumov/obsidian-lib) 3.x or 4.x as a peer dependency, so a plugin and its tooling share one copy. It moved here from that repository with its history.

## License

© [Michael Naumov](https://github.com/mnaoumov/)
