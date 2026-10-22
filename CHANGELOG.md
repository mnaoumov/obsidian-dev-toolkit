# CHANGELOG

## 5.1.1

- fix(deps): let the optional @babel/core peer admit Babel 8

## 5.1.0

- feat(linters): let the plugin-name rules exclude a name
- docs: name obsidian-lib where comments said dev-utils

## 5.0.2

- fix(deps): bundle the demo-vault helper from obsidian-lib 6.0.2

## 5.0.1

- fix(deps): bundle the demo-vault helper from obsidian-lib 6.0.1

## 5.0.0

- feat!: move to obsidian-lib 6 and rename the harness global to __obsidianLibModule

## 4.0.0

- feat(demo-vault-coverage)!: spell the validation directives and key as obsidian-dev-toolkit
- feat(demo-vault-buttons): report a button that never rendered apart from one that never reported
- chore(dprint): rely on the format runner to exclude Claude Code's tool-local settings
- chore(build): drop the duplicate build:compile:typescript script
- fix(dprint): exclude Claude Code's tool-local settings from formatting

## 3.7.0

- build(deps): accept @mnaoumov/obsidian-lib 5.0.0 as a peer and build with it
- docs(linters): record why plugin-name-as-code reports inline quotations
- docs: check guide snippets and retired obsidian-dev-utils references

## 3.6.0

- feat(linters): fail lint on plugin API contract entries without schemas

## 3.5.0

- feat(linters): fail lint on plugin names not marked as code

## 3.4.2

- fix(vitest-config): keep unit-test workers alive on Node 24
- build(deps): bump @mnaoumov/typescript-dev-toolkit to ^3.6.3
- docs: use the approved obsidian-dev-toolkit logo and favicon

## 3.4.1

- fix(types): type CSS module imports as their class names

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
