# CHANGELOG

## 2.1.0

- build(dprint): stop dprint and @stylistic/jsx-quotes fighting over JSX attribute quotes
- docs: add this package's documentation site
- build: take commitlintConfig from typescript-dev-toolkit 2.1.0

## 2.0.0

- build: drop the workspace-era sibling includes from tsconfig.types.json
- feat(eslint)!: register the Obsidian rules under the obsidian-dev-toolkit namespace

## 1.1.0

- feat(linters): report locally declared Obsidian internals as an error
- feat(linters): add the require-plugin-api-contract-schemas ESLint rule, registered off
- docs: mark plugin names as code in comments
- feat(linters): merge the plugin-name-as-code rules
- feat(eslint): merge the no-local-obsidian-internals rule
- fix(demo-vault-coverage): report notes in the same order on every platform
- build: add the npm-resolved lockfile

## 1.0.0

- Initial release as a standalone repository: the package moved out of the [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils) workspace with its history, and its version line restarts at `1.0.0`
