---
title: Testing
description: An Obsidian plugin's Vitest projects, its per-test setup, and the integration-test harness that makes every library helper reachable inside a real Obsidian.
---

This guide covers what is specific to testing an Obsidian plugin. The generic half (the three setup endpoints, async-operation tracking, unhandled async errors, silenced console output, `localStorage`, warnings as errors and the Node web globals under a VM pool) is the [TypeScript Test Toolkit testing guide](https://mnaoumov.dev/typescript-test-toolkit/guides/testing/), and everything it says holds for the Obsidian setup endpoints below, which wrap the generic ones.

## The Obsidian setup endpoints

An Obsidian plugin's tests take the setup endpoints of this package rather than the generic ones of `@mnaoumov/typescript-test-toolkit`:

- **Vitest**: `@mnaoumov/obsidian-dev-toolkit/vitest-setup`
- **Jest**: `@mnaoumov/obsidian-dev-toolkit/jest-setup`
- **Any framework**: `setup` from `@mnaoumov/obsidian-dev-toolkit/setup`

Each does everything the generic endpoint does, and before each test it also resets the state `@mnaoumov/obsidian-lib` keeps between calls: the `globalThis.__obsidianDevUtils` bag (queues, registered handlers, the plugin-API registry) and the library context `ObsidianLibrary` holds. The Obsidian reset runs first, then the generic one. The endpoints live here rather than in the test toolkit because the test toolkit must not depend on `@mnaoumov/obsidian-lib`.

The plugin Vitest configuration below already lists `@mnaoumov/obsidian-dev-toolkit/vitest-setup` in its `unit-tests` project, after `obsidian-test-mocks/vitest-setup`, and the [plugin Jest configuration](#plugin-jest-configuration) lists `@mnaoumov/obsidian-dev-toolkit/jest-setup` in `setupFilesAfterEnv` the same way, so a plugin built on either wires nothing by hand.

## Plugin vitest configuration

An Obsidian plugin's Vitest setup is the same in every repo: a `unit-tests` project against mocked Obsidian, plus an `integration-tests:*` family against a real one. `defineObsidianPluginVitestConfig` owns that whole shape, so a plugin's config is one call:

```typescript
// scripts/vitest-config.ts
import { defineObsidianPluginVitestConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig();
```

It declares five projects, each collecting its own suffix:

| Project                                 | Collects                                                                 |
|-----------------------------------------|--------------------------------------------------------------------------|
| `unit-tests`                            | `*.test.ts` (minus every `*.integration.test.ts`), in `jsdom`            |
| `integration-tests:no-app`              | `*.no-app.integration.test.ts`, with no Obsidian instance at all         |
| `integration-tests:desktop`             | `*.desktop.integration.test.ts` + `*.cross-platform.integration.test.ts` |
| `integration-tests:desktop-performance` | `*.desktop-performance.integration.test.ts`                              |
| `integration-tests:android`             | `*.android.integration.test.ts` + `*.cross-platform.integration.test.ts` |

A behavior that must hold on **both** platforms therefore lives in exactly one `*.cross-platform.integration.test.ts` file with plain top-level `describe` / `it`: both platform projects collect it and run it under their own transport. A behavior specific to one platform stays in a single `*.desktop.` or `*.android.` file. Neither needs a wrapper function or a per-platform entry point.

`unit-tests` resolves `obsidian` to `obsidian-test-mocks/obsidian`. Every project that loads the plugin from `dist/build/main.js` first checks that build: it refuses to start when the build is missing or older than the source, because a plugin's `test:integration*` scripts call Vitest directly and never build, and a stale bundle would otherwise be tested and read as a defect.

Set `OBSIDIAN_VERSION` to pin the desktop project to a specific Obsidian (for example `OBSIDIAN_VERSION=catalyst-latest`). When it is unset, no version is pinned and the installed Obsidian runs as it is.

Customize through the two hooks: `editContext` edits the standard projects in place, and `customProjects` appends projects the base does not know about:

```typescript
import { defineObsidianPluginVitestConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig({
  customProjects(context) {
    return [{
      test: {
        ...context.desktop,
        globalSetup: ['./scripts/demo-vault-global-setup.ts'],
        include: ['src/**/*.demo-vault.integration.test.ts'],
        name: 'integration-tests:demo-vault'
      }
    }];
  },
  editContext(context) {
    context.desktopPerformance.globalSetup = ['./scripts/vitest-global-setup-performance.ts'];
    context.coverageExclude.push('src/generated/**');
  }
});
```

Everything the context exposes is live: the arrays and objects it hands you are the ones the final configuration is built from.

**Every custom project must declare its own `include`**, and `defineObsidianPluginVitestConfig` throws if one does not. The root section deliberately declares no glob, so a project that declares none falls back to Vitest's own default, which matches *every* test file in the repo. The project would then run the unit suites under an Obsidian transport, the Android suites against the desktop one, and any screenshot-capture suite that opens a window and overwrites a checked-in PNG. That widening is silent: the project passes, slowly, having done all of it. Spreading a standard project (`...context.desktop`) and overriding its `include` is the shortest way to satisfy this.

The `integration-tests:demo-vault` project above is the one [Clicking every button](/obsidian-dev-toolkit/guides/demo-vault/#clicking-every-button) needs. Declaring a project here is only half the job: `scripts/test-integration.ts` has to list it too, or nothing ever runs it.

### The `vmThreads` pool and `globalStubTestFiles`

**`unit-tests` runs on `pool: 'vmThreads'`.** The default pool builds one `jsdom` per test file, and that construction, rather than the tests, is most of a unit suite's time. A VM pool builds it once per worker and gives each file a fresh VM context, so files stay isolated from each other and coverage is unchanged.

The one thing it cannot do is redefine `window`, `document`, `location` or `top`: inside a VM context those four are non-configurable, so `vi.stubGlobal('window', …)` or `Object.defineProperty(window, 'location', …)` throws `Cannot redefine property`. Every other global stubs as usual. List a file that redefines one of the four in `globalStubTestFiles`, and it moves to a sibling `unit-tests:global-stubs` project on the default pool:

```typescript
import { defineObsidianPluginVitestConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig({
  editContext(context) {
    context.globalStubTestFiles.push('src/window-timers.test.ts');
  }
});
```

The sibling is emitted only when the list is not empty. The `test` and `test:coverage` scripts select `unit-tests` together with every `unit-tests:*` project, so the sibling runs and counts toward coverage with no script change. Check a suite by running it with `--pool=vmThreads` rather than by searching it for `stubGlobal`, since the `location` form is the one a search misses. To keep a whole suite on the default pool instead, set `context.unitTests.pool = 'forks'` and leave a comment saying why.

A VM context also starts without some of Node's Web API globals. The setup endpoint restores them, as the [TypeScript Test Toolkit guide](https://mnaoumov.dev/typescript-test-toolkit/guides/testing/) describes.

## Plugin jest configuration

A plugin that tests with Jest instead takes `defineObsidianPluginJestConfig`, the Jest counterpart of the `unit-tests` project above. It is `defineJestConfig` from `@mnaoumov/typescript-dev-toolkit/test-runners/jest-config` (ts-jest, ESM when `package.json` says `"type": "module"`, v8 coverage over `src/`) with the Obsidian layer on top:

- `testEnvironment: 'jsdom'`, because the mocks' setup writes to `Document.prototype`, `Element.prototype` and `window`;
- `obsidian` mapped onto `obsidian-test-mocks/obsidian`, since the `obsidian` npm package carries types only;
- `obsidian-test-mocks/jest-setup` and `@mnaoumov/obsidian-dev-toolkit/jest-setup` in `setupFilesAfterEnv`, in that order;
- every `*.integration.test.ts` left out, because those run in a real Obsidian through `obsidian-integration-testing`.

It takes the same options as `defineJestConfig`. An option replaces its default, except that `moduleNameMapper` entries are added to the `obsidian` one, and `setupFilesAfterEnv` and `testPathIgnorePatterns` entries are appended. A plugin that imports stylesheets, `.wasm` or framework components maps them onto stubs:

```typescript
// jest.config.ts
import { defineObsidianPluginJestConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/jest-config';

export default defineObsidianPluginJestConfig({
  moduleNameMapper: {
    '\\.(css|scss)$': '<rootDir>/src/__mocks__/style-stub.ts'
  }
});
```

Install the runner beside it: `npm install --save-dev jest ts-jest jest-environment-jsdom @jest/globals`. All four are optional peer dependencies of this package, so a Vitest plugin installs none of them. Jest 30 loads a `jest.config.ts` through Node's own type stripping, which is on by default from Node 22.18, and falls back to `ts-node` only when that fails.

The scripts call the runner from `@mnaoumov/typescript-dev-toolkit/test-runners/auto`, which picks Jest whenever a Jest configuration file exists and adds `--experimental-vm-modules` for an ESM package:

```typescript
// scripts/test.ts
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/auto';

await wrapCliTask(() => test());
```

`testCoverage` and `testWatch` come from the same module, for `scripts/test-coverage.ts` and `scripts/test-watch.ts`.

## Integration tests: reaching library helpers inside `evalInObsidian`

[`obsidian-integration-testing`](https://github.com/mnaoumov/obsidian-integration-testing) runs a closure inside a real Obsidian, and injects a `lib` bag into it. This package can merge the **entire** helper surface of `@mnaoumov/obsidian-lib` into that bag, so a serialized closure, which cannot use imports, reaches any helper as `lib.<helper>`:

<!-- snippet-check: context /// <reference types="@mnaoumov/obsidian-lib/@types/obsidian-integration-testing" /> -->

```typescript
import { evalInObsidian } from 'obsidian-integration-testing';

await evalInObsidian({
  async callback({ app, lib: { ensureMetadataCacheReady } }) {
    await ensureMetadataCacheReady(app);
  }
});
```

Three pieces make that work, and **all three are required**: the runtime without the types leaves `lib.<helper>` unable to compile, and the types without the runtime leave it `undefined` at run time.

### 1. Global setup: put the library in the test vault

The helpers are published by a small harness plugin that this package ships. It has to be installed in the test vault **alongside** your own plugin, so replace `obsidian-integration-testing/vitest-global-setup-plugin` with the drop-in below (do not list both):

<!-- snippet-check: skip A property of a vitest project's test options, not a module. -->

```typescript
// vitest.config.ts (each integration-test project)
globalSetup: ['@mnaoumov/obsidian-dev-toolkit/integration-test-vitest-global-setup'],
```

It does everything the harness's own global setup does (a temporary vault, your plugin installed and enabled) and additionally seeds and enables the harness plugin.

If a project already needs its own `populate` (demo-vault fixtures, a large performance vault), compose instead of replacing:

<!-- snippet-check: context declare function myFixtures(): import('obsidian-integration-testing').PopulateFilesParams; -->

```typescript
import {
  getIntegrationTestPluginPopulate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID
} from '@mnaoumov/obsidian-dev-toolkit/test-runners/integration-test-plugin';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

export const { setup, teardown } = createSetup({
  enableCommunityPlugins: [OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID],
  populate: () => ({ ...myFixtures(), ...getIntegrationTestPluginPopulate() })
});
```

### 2. Setup file: register the resolver

<!-- snippet-check: skip A property of a vitest project's test options, not a module. -->

```typescript
// vitest.config.ts (each integration-test project)
setupFiles: [
  'obsidian-integration-testing/vitest-setup',
  '@mnaoumov/obsidian-dev-toolkit/integration-test-setup'
],
```

Importing `@mnaoumov/obsidian-dev-toolkit/integration-test-setup` registers a renderer-side resolver whose result the harness merges into `lib`. Registration is idempotent, so naming it from more than one setup file is safe.

### 3. A triple-slash reference: activate the types

Add one line to a `.d.ts` your `tsconfig.json` already includes (e.g. `src/obsidian-lib.d.ts`):

```typescript
/// <reference types="@mnaoumov/obsidian-lib/@types/obsidian-integration-testing" />
```

This is what augments the harness's `Lib` interface with the library's flat surface. Without it, `lib.<helper>` fails to compile with `TS2339: Property '<helper>' does not exist on type 'Lib'`.

Use the reference, **not** a `compilerOptions.types` entry: a `types` entry naming the same path resolves without complaint but does not bring the module augmentation into the program, so `lib.<helper>` still fails to compile.

The `lib` bag is **flat**: every helper sits at the top level (`lib.ensureMetadataCacheReady`, not `lib['metadata-cache'].ensureMetadataCacheReady`). The harness plugin carries its own copy of the library, loaded only in the throwaway test vault, so your plugin's own bundle is untouched.
