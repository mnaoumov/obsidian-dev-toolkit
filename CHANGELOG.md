# CHANGELOG

## 10.0.0

This release has 1 breaking change and 1 fix.

### Breaking changes

- return null, not undefined, for no value

### Fixed

- **linters:** ship a no-dynamic-node-builtin-import module that parses

## 9.1.0

- feat(test-runners): install another plugin's released build into an integration vault
- fix(linters): type the no-dynamic-node-builtin-import test errors as TestCaseError
- feat(linters): forbid a dynamic import() of a Node builtin in plugin source

## 9.0.0

- docs(changelog): regroup the published release notes for readers
- fix(bundlers): deploy a development build into the folder named after the manifest id
- feat(bundlers): keep the lines of a production main.js within a line limit
- fix(version)!: restore the latest public Obsidian as the release minimum
- docs: link the changelog from the README
- docs: add See also comparison of similar tools
- feat!: lint the manifest with upstream validate-manifest
- feat!: add start-obsidian-for-debugging and name the VS Code generator
- fix(templates): align `dprint` braces and import order with `ESLint`
- docs(readme): state the supported `obsidian-lib` peer majors
- test: give corpus generation and project collection explicit budgets
- fix(version): ship manifest-beta.json as the pre-release manifest asset
- feat(version): publish plugin releases before pushing the branch

## 8.2.1

This release has 1 fix.

### Fixed

- **docs:** link public Obsidian API types to official references

## 8.2.0

This release has 3 new features and 1 fix.

### New

- **lint:** require code spans for tool and service names
- analyze plugin API version requirements
- share a configurable runtime floor across lint and builds

### Fixed

- **version:** preserve the plugin minimum Obsidian version

## 8.1.0

This release has 5 new features and 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- **testing:** run desktop suites with both plugin enable timings
- generate VS Code plugin debugger configurations
- **bundlers:** inline browser workers across adapters
- add check-plugin and community directory release checks
- add deploy-to-device command for Obsidian Mobile on Android

### Fixed

- reject pre-release versions in stable plugin manifests

## 8.0.0

This release has 1 breaking change, 1 fix and 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Breaking changes

- **deps:** float `typescript-dev-toolkit` to ^6

### Fixed

- **deps:** raise solid-js past two advisories, record deepmerge

### Documentation

- add issue-filing instructions for AI agents

## 7.4.0

This release has 1 new feature.

### New

- **eslint-config:** skip prefer-dedent inside evalInObsidian callbacks

## 7.3.0

This release has 1 new feature and 1 fix.

### New

- **test-runners:** rare-token tail for varied performance-vault prose

### Fixed

- **deps:** accept @mnaoumov/obsidian-lib 9 and 10 as the peer

## 7.2.0

This release has 1 new feature and 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- **test-runners:** varied Zipf-distributed prose for the performance vault

### Fixed

- **demo-vault-coverage:** skip notes the demo vault's .gitignore drops

## 7.1.1

This release has 1 fix.

### Fixed

- **deps:** accept `obsidian-lib` 8 as a required peer

## 7.1.0

This release has 1 new feature.

### New

- **test-runners:** add deterministic performance vault tooling

## 7.0.1

This release has 2 fixes.

### Fixed

- **deps:** accept `obsidian-lib` 7 as a required peer
- **`vitest`:** preserve serial projects under worker caps

## 7.0.0

This release has 1 breaking change.

### Breaking changes

- reject bare keyword bindings in shared lint configuration

## 6.0.0

This release has 1 breaking change and 1 fix.

### Breaking changes

- enforce readonly interface members in shared lint configuration

### Fixed

- **deps:** patch vulnerable transitive dependencies

## 5.3.1

This release has 1 fix.

### Fixed

- **deps:** accept `typescript-lib` 2 in development tooling

## 5.3.0

This release has 1 new feature.

### New

- **`esbuild`:** add configurable source map ignore lists

## 5.2.0

This release has 1 new feature.

### New

- **`eslint`:** add the `obsidian-dev-toolkit/no-bare-code-element` rule, which reports a bare `code` element and points UI code to `appendCodeBlock`

## 5.1.1

This release has 1 fix.

### Fixed

- **deps:** let the optional @babel/core peer admit `Babel` 8

## 5.1.0

This release has 1 new feature and 1 documentation change.

### New

- **linters:** let the plugin-name rules exclude a name

### Documentation

- name `obsidian-lib` where comments said dev-utils

## 5.0.2

This release has 1 fix.

### Fixed

- **deps:** bundle the demo-vault helper from `obsidian-lib` 6.0.2

## 5.0.1

This release has 1 fix.

### Fixed

- **deps:** bundle the demo-vault helper from `obsidian-lib` 6.0.1

## 5.0.0

This release has 1 breaking change.

### Breaking changes

- move to `obsidian-lib` 6 and rename the harness global to __obsidianLibModule

## 4.0.0

This release has 1 breaking change, 1 new feature and 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Breaking changes

- **demo-vault-coverage:** spell the validation directives and key as `obsidian-dev-toolkit`

### New

- **demo-vault-buttons:** report a button that never rendered apart from one that never reported

### Fixed

- **`dprint`:** exclude Claude Code's tool-local settings from formatting

## 3.7.0

This release has 2 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- **linters:** record why plugin-name-as-code reports inline quotations
- check guide snippets and retired `obsidian-dev-utils` references

## 3.6.0

This release has 1 new feature.

### New

- **linters:** fail lint on plugin API contract entries without schemas

## 3.5.0

This release has 1 new feature.

### New

- **linters:** fail lint on plugin names not marked as code

## 3.4.2

This release has 1 fix and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **vitest-config:** keep unit-test workers alive on Node 24

### Documentation

- use the approved `obsidian-dev-toolkit` logo and favicon

## 3.4.1

This release has 1 fix.

### Fixed

- **types:** type CSS module imports as their class names

## 3.4.0

This release has 1 new feature.

### New

- **demo-vault-coverage:** fail the suite on a Try it section without a code button by default

## 3.3.0

This release has 2 new features. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **demo-vault-coverage:** check that every Try it section has a code button
- **build:** keep the vitest- and harness-bound modules off the barrels

## 3.2.1

This release has 4 fixes and 1 documentation change. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **linters:** load the `ESLint` layer without `obsidian-integration-testing`
- **bundlers:** resolve parcel packages with browser conditions and tree-shake the bundle
- **build:** load the CommonJS build of dist/lib under plain Node
- **bundlers:** load `obsidian-integration-testing` only when the hot-reload deployment runs

### Documentation

- **e2e-testing:** link obsidian-test#7 and document OBSIDIAN_CONFIG_PATH

## 3.2.0

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- **test-runners:** add defineObsidianPluginJestConfig

## 3.1.0

This release has 1 fix.

### Fixed

- **deps:** take `obsidian-lib` 3.x or 4.x as a peer dependency, so a plugin gets one copy

## 3.0.0

This release has 1 breaking change, 4 new features, 1 fix and 3 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Breaking changes

- **deps:** take `typescript-dev-toolkit` 3.0.0, which keeps only nine @stylistic rules

### New

- **ci:** ship reusable plugin CI, release and attestation workflows, and a coverage badge
- support wdio-obsidian and obsidian-test e2e, and Obsidian CLI reload
- **bundlers:** build frameworks, `PostCSS`, `Tailwind`, CSS modules and wasm with every bundler
- **bundlers:** build Obsidian plugins with `vite`, rollup, `webpack` and parcel

### Fixed

- **deps:** install `typescript-dev-toolkit` for consumers, and check every published import is installed

### Documentation

- **ci:** pin the reusable workflows to 3.0.0, the release that first ships them
- **site:** show the package logo as the home page hero image
- **readme:** link the documentation site

## 2.1.0

This release has 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- add this package's documentation site

## 2.0.0

This release has 1 breaking change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Breaking changes

- **`eslint`:** register the Obsidian rules under the `obsidian-dev-toolkit` namespace

## 1.1.0

This release has 4 new features, 1 fix and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- **linters:** report locally declared Obsidian internals as an error
- **linters:** add the require-plugin-api-contract-schemas `ESLint` rule, registered off
- **linters:** merge the plugin-name-as-code rules
- **`eslint`:** merge the no-local-obsidian-internals rule

### Fixed

- **demo-vault-coverage:** report notes in the same order on every platform

### Documentation

- mark plugin names as code in comments

## 1.0.0

- Initial release as a standalone repository: the package moved out of the [`obsidian-dev-utils`](https://github.com/mnaoumov/obsidian-dev-utils) workspace with its history, and its version line restarts at `1.0.0`
