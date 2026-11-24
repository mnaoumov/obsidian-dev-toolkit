---
name: test
description: Unit-test and integration-test an Obsidian plugin that uses @mnaoumov/obsidian-dev-toolkit (`npm test`, `npm run test:coverage`, `npm run test:integration`, `defineObsidianPluginVitestConfig`, `defineObsidianPluginJestConfig`, the `unit-tests` and `integration-tests:*` projects). Use it to write or run tests against mocked or real Obsidian, to fix "Cannot redefine property: window" under the `vmThreads` pool, an integration suite that refuses a stale `dist/build`, an `evalInObsidian` closure that times out at the 30 s cap, a custom project that collects every test file, or a run that fails only on a busy machine. Not for build or mobile-load failures (build), releasing (release) or the demo vault's coverage and button suites (demo-vault).
---

# Test an Obsidian plugin with `@mnaoumov/obsidian-dev-toolkit`

Run every command from the plugin root. Full guides: [Testing](https://mnaoumov.dev/obsidian-dev-toolkit/guides/testing/), [End-to-end testing](https://mnaoumov.dev/obsidian-dev-toolkit/guides/e2e-testing/) and [Performance vaults](https://mnaoumov.dev/obsidian-dev-toolkit/guides/performance-vaults/).

## Commands

- `npm test`: the unit tests (`unit-tests` and every `unit-tests:*` project). Arguments after `--` reach `vitest`: `npm test -- src/foo.test.ts`.
- `npm run test:coverage`: the same under the coverage thresholds the plugin sets.
- `npm run test:integration`: every `integration-tests:*` project against a real Obsidian, through `obsidian-integration-testing`. `test:integration:desktop`, `test:integration:android` and `test:integration:no-app` run one family.
- `npx vitest run --project=<name> <file>`: one project, one file. Use it to tell a real failure from machine load.
- `npm run gate`: the branch gate, the same checks the release runs first. Run it before committing.

## The configuration

```typescript
// scripts/vitest-config.ts
import { defineObsidianPluginVitestConfig } from '@mnaoumov/obsidian-dev-toolkit/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig();
```

| Project | Collects |
| --- | --- |
| `unit-tests` | `*.test.ts` minus every `*.integration.test.ts`, in `jsdom`, `obsidian` mapped onto `obsidian-test-mocks` |
| `integration-tests:no-app` | `*.no-app.integration.test.ts`, no Obsidian at all |
| `integration-tests:desktop` | `*.desktop.integration.test.ts` and `*.cross-platform.integration.test.ts`, plugin enabled at startup |
| `integration-tests:desktop:after-layout-ready` | the same files, plugin enabled once the layout is ready |
| `integration-tests:desktop-performance` | `*.desktop-performance.integration.test.ts` |
| `integration-tests:android` | `*.android.integration.test.ts` and `*.cross-platform.integration.test.ts` |

A behavior that must hold on both platforms lives in ONE `*.cross-platform.integration.test.ts` file with plain `describe` / `it`. Customize with `editContext(context)` (edit the standard projects) and `customProjects(context)` (add projects). A `Jest` plugin uses `defineObsidianPluginJestConfig` from `@mnaoumov/obsidian-dev-toolkit/test-runners/jest-config` and installs `jest`, `ts-jest`, `jest-environment-jsdom` and `@jest/globals`.

The setup endpoint `@mnaoumov/obsidian-dev-toolkit/vitest-setup` (`/jest-setup` for `Jest`) is already listed by both configurations. It resets `@mnaoumov/obsidian-lib`'s shared state before each test and enables async-operation tracking, so a test awaits `waitForAllAsyncOperations()` from `@mnaoumov/typescript-test-toolkit/async-operation-tracking` instead of sleeping.

## Traps

| Symptom | Cause and fix |
| --- | --- |
| `Cannot redefine property: window` (or `document`, `location`, `top`) | `unit-tests` runs on `pool: 'vmThreads'`, where those four are not configurable. Add the file to `context.globalStubTestFiles`; it moves to a `unit-tests:global-stubs` sibling on the default pool. |
| `crypto.subtle`, `TextEncoder` or a stream class is undefined in a unit test | The VM pool lacks some Node web globals; the setup endpoint restores them. Check the setup file is still listed. |
| An integration project refuses to start: build missing or older than the source | The integration scripts never build. Run `npm run build` first; testing a stale `main.js` would read old code as a defect. |
| A custom project throws at load, or runs the unit suites under Obsidian | Every custom project must declare its own `include`. Spread a standard one (`...context.desktop`) and override `include`. |
| A project is declared but nothing runs it | Add it to `scripts/test-integration.ts` too. A file whose suffix no project collects reports nothing, which looks like passing. |
| `CDP command timed out` or a bare `Test timed out` inside `evalInObsidian` | One closure is capped at 30 s. The `obsidian-dev-toolkit/no-over-cap-wait-in-eval-in-obsidian` lint rule reports the budget. Use `pollInObsidian` (a short read in Obsidian, the wait in Node) instead of a longer `waitUntil`. |
| A `lib.<helper>` is undefined inside `evalInObsidian` | Register the library resolver in the global setup and setup file, as the Testing guide's three steps show. |
| A notice assertion fails only when the machine is idle | A notice is replaced by the next one. Record it with a `MutationObserver` installed before the action, never by sampling the DOM afterwards. |
| A test passes alone and times out in the full run | Machine load. Re-run the file alone; raise the project's `testTimeout`, never a per-file `vi.setConfig`. |
| Desktop passes and Android fails at setup | One Android emulator at a time on the machine. Re-run once the other run ends. |

## Stop and recover

1. Read the first failing test's own message, not the summary line.
2. Re-run that one file in its project. If it passes there, it was load or ordering.
3. For an integration failure, rebuild first (`npm run build`), then re-run.
4. Prove a new assertion is not vacuous: break the code under test once and watch the test fail on its own message.
