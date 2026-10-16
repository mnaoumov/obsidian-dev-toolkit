---
title: End-to-end Testing
description: Three ways to test a plugin inside a real Obsidian - obsidian-integration-testing, wdio-obsidian-service and obsidian-test - and the toolkit support for each.
---

The toolkit supports three stacks that test a plugin inside a real Obsidian. All three stay supported, and a plugin can use more than one.

| Stack | Test style | What the toolkit provides |
| --- | --- | --- |
| [`obsidian-integration-testing`](https://github.com/mnaoumov/obsidian-integration-testing) | Vitest; a closure runs inside Obsidian with `evalInObsidian` | `defineObsidianPluginVitestConfig`, the desktop and Android projects, the harness plugin |
| [`wdio-obsidian-service`](https://github.com/jesse-r-s-hines/wdio-obsidian-service) | WebdriverIO with mocha; the test drives the UI from outside | `defineWdioObsidianConfig`, `testEndToEndWithWdioObsidian` |
| [`obsidian-test`](https://github.com/b-camphart/obsidian-test) | `node:test`; the test is bundled into the plugin and runs inside Obsidian | `testEndToEndWithObsidianTest` |

## Which one to use

**Start with `obsidian-integration-testing`.** It is what the [testing guide](/obsidian-dev-toolkit/guides/testing/) sets up, it runs on desktop and on Android from the same test file, its tests are Vitest tests like the unit tests, and every `@mnaoumov/obsidian-lib` helper is reachable inside a test.

Add **`wdio-obsidian-service`** when you need to test several Obsidian versions in one run. It downloads each version into a cache, so `appVersions: ['earliest', 'latest']` tests your `minAppVersion` and the current release side by side, on any machine and in CI, without Obsidian being installed. Its tests also drive the real UI through WebDriver.

Use **`obsidian-test`** when you want the tests compiled into the plugin itself and run with `node:test`. It is beta software, and it launches the Obsidian installed on the machine.

## wdio-obsidian-service

Install the packages:

```bash
npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/globals wdio-obsidian-service wdio-obsidian-reporter
```

`wdio.conf.mts` is one call:

```typescript
import { defineWdioObsidianConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/wdio-obsidian';

export const config: WebdriverIO.Config = defineWdioObsidianConfig({ appVersions: ['earliest', 'latest'] });
```

`defineWdioObsidianConfig` derives the configuration from the plugin's layout:

- **The plugin under test is the production build in `dist/build`.** `pluginFolder` changes it.
- **The vault is the plugin's demo vault (`demo-vault/`) when there is one**, and an empty vault otherwise. The service opens a copy, so the tests never change the folder. `vault: 'test/vaults/simple'` names another vault, and `vault: false` forces the empty one.
- **The specs are `e2e/**/*.spec.ts`.** `specs` changes them.
- **Each entry of `appVersions` is one capability**, so each version runs the whole suite. It defaults to `['latest']`. `earliest` is the `minAppVersion` of `manifest.json`, and `latest-beta` needs an Obsidian Insiders account (`OBSIDIAN_EMAIL` and `OBSIDIAN_PASSWORD`). So does `earliest` when `minAppVersion` names a version that was only ever a beta, such as `1.5.0`: set it to a public release.
- **Obsidian versions are downloaded into `.obsidian-cache/`**, which belongs in `.gitignore`. `cacheFolder` changes it.
- mocha gets a 60 s per-test timeout (`testTimeoutInMilliseconds`), since Obsidian starts once per spec file. `installerVersion` and `maxInstances` pass through to the service and WebdriverIO.

The result is plain data, so anything else is changed by spreading it: `{ ...defineWdioObsidianConfig(), logLevel: 'info' }`.

Add `@wdio/globals/types`, `@wdio/mocha-framework` and `wdio-obsidian-service` to the `types` of the `tsconfig.json` that covers `e2e/`. A spec then reads:

```typescript
// e2e/plugin.spec.ts
import { browser, expect } from '@wdio/globals';

describe('my plugin', () => {
  it('runs its command', async () => {
    await browser.executeObsidianCommand('my-plugin:open-sample-modal');
    await expect(browser.$('.modal-container .modal-content')).toExist();
  });
});
```

The `test:e2e` script builds the plugin and runs WebdriverIO:

```typescript
// scripts/test-e2e.ts
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { testEndToEndWithWdioObsidian } from '@mnaoumov/obsidian-dev-toolkit/test-runners/wdio-obsidian';

await wrapCliTask(() => testEndToEndWithWdioObsidian());
```

It runs `npm run build` first, so the tests always load the current `dist/build` (`shouldBuild: false` skips it), then `wdio run` with `wdio.conf.mts` or `wdio.conf.ts`, whichever exists first (`configPath` names another). A missing package is reported with the `npm install` line that adds it.

## obsidian-test

Install the package:

```bash
npm install --save-dev obsidian-test
```

A test is a `node:test` test inside `embedded()`, which runs it only inside Obsidian:

```typescript
// e2e/plugin.spec.ts
import assert from 'node:assert';
import test from 'node:test';
import { embedded } from 'obsidian-test';

embedded((app) => {
  void test('the workspace is ready', () => {
    assert.ok(app.workspace);
  });
});
```

The `test:e2e` script:

```typescript
// scripts/test-e2e.ts
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { testEndToEndWithObsidianTest } from '@mnaoumov/obsidian-dev-toolkit/test-runners/obsidian-test-runner';

await wrapCliTask(() => testEndToEndWithObsidianTest());
```

`obsidian-test` bundles the plugin together with the test files, installs it into a temporary vault, launches Obsidian and reports the results. It replays its cached results when nothing changed, and `shouldUseCache: false` runs the tests anyway.

**The runner restricts the test files to `./e2e/**/*.spec.ts`.** `obsidian-test`'s own default matches every `*.test.ts` too, which would bundle the plugin's Vitest unit tests into Obsidian. `testPattern` changes the glob.

It launches Obsidian with the `obsidian` command. When that is not on `PATH`, name the executable with `obsidianCommand`. Do not point `vaultPath` at the demo vault: `obsidian-test` installs the plugin into the vault it is given.

**`obsidian-test` 0.1.2 does not run on Windows.** Its bundle step fails with `Could not resolve "./runners/dynamic.js"`, because it matches a module path against a `/`-separated suffix, and on Windows the path has `\` separators. Run it on macOS or Linux, for example in CI, until a release fixes it.
