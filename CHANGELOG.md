# CHANGELOG

## 3.4.0

- feat(demo-vault-coverage): fail the suite on a Try it section without a code button by default

## 3.3.0

- feat(demo-vault-coverage): check that every Try it section has a code button
- test(bundlers): give the framework compile tests a cold-load timeout
- feat(build): keep the vitest- and harness-bound modules off the barrels
- test(scripts): stop the bash workflow cases timing out under a loaded gate

## 3.2.1

- fix(linters): load the ESLint layer without obsidian-integration-testing
- test(bundlers): load every bundler adapter's build on Obsidian Mobile
- build: validate the published dependencies with typescript-dev-toolkit's validateDependencies
- docs(e2e-testing): link obsidian-test#7 and document OBSIDIAN_CONFIG_PATH
- build: pass the tsconfig and types exports to generateLibraryExports as additionalExports
- fix(bundlers): resolve parcel packages with browser conditions and tree-shake the bundle
- fix(build): load the CommonJS build of dist/lib under plain Node
- fix(bundlers): load obsidian-integration-testing only when the hot-reload deployment runs
- build(docs): set the repository homepage to the docs site on each Pages build

## 3.2.0

- feat(test-runners): add defineObsidianPluginJestConfig
- test(bundlers): load every bundler adapter's build in a real Obsidian

## 3.1.0

- fix(deps): take obsidian-lib 3.x or 4.x as a peer dependency, so a plugin gets one copy

## 3.0.0

- docs(ci): pin the reusable workflows to 3.0.0, the release that first ships them
- fix(deps): install typescript-dev-toolkit for consumers, and check every published import is installed
- feat(ci): ship reusable plugin CI, release and attestation workflows, and a coverage badge
- feat: support wdio-obsidian and obsidian-test e2e, and Obsidian CLI reload
- feat(bundlers): build frameworks, PostCSS, Tailwind, CSS modules and wasm with every bundler
- feat(bundlers): build Obsidian plugins with vite, rollup, webpack and parcel
- build(deps)!: take typescript-dev-toolkit 3.0.0, which keeps only nine @stylistic rules
- docs(site): show the package logo as the home page hero image
- docs(readme): link the documentation site
- build(deps): take @mnaoumov/typescript-dev-toolkit 2.2.0 so the docs site passes its link check

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
