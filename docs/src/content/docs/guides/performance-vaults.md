---
title: Performance vaults
description: Generate an exactly sized, deterministic UTF-8 corpus and wait for Obsidian's startup indexing before measuring.
---

Use the shared performance corpus when comparing indexing or search implementations. `generatePerformanceVault()` returns a map accepted by `TemporaryVault.populate()`: exactly 37,000 markdown notes containing exactly 110,000,000 UTF-8 content bytes by default. The byte total includes scenario notes and excludes paths, configuration, plugins and filesystem metadata. MB means decimal megabytes here.

```typescript
import { generatePerformanceVault } from '@mnaoumov/obsidian-dev-toolkit/test-runners/performance-vault';

const files = generatePerformanceVault({
  cyrillicShare: 0.25,
  noteCount: 37_000,
  totalBytes: 110_000_000
});
```

The result is deterministic, including insertion order and directory layout. It reads no environment variables and writes no files. `cyrillicShare` selects the fraction of **filler notes** containing Cyrillic prose, rounded down; it is neither a byte ratio nor a fraction of all characters. Filler notes repeat ordinary prose, with spaces absorbing the final byte remainder without splitting a Unicode character. This is a reproducible synthetic workload; its repeated vocabulary does not model the term distribution of a personal vault.

The default scenarios preserve the `Advanced Metadata Cache` performance suites' paths:

1. `target.md` and 50 `links/link-<n>.md` notes linking to it (`linkerCount`).
2. 1,000 `mentions/note-<n>.md` prose notes (`mentionCount`), every 25th containing an unlinked mention of the target (`mentionInterval`, starting at zero).
3. `delete-target.md` and two identical folders, `to-delete-a` and `to-delete-b`, each containing 1,000 linking notes (`deletionCount`). Deleting one with a plugin enabled and the other disabled compares the same cascade.
4. All remaining notes under `big/dir-<n>/file-<n>.md`, 30 per folder (`filesPerFolder`).

The two target notes always exist. Scenario counts may be zero, but the exact `noteCount` must leave at least one filler note. The byte budget must fit every scenario and at least one sentence in every filler note. Invalid counts, fractions or budgets throw `RangeError`. Exported `PERFORMANCE_VAULT_*` path constants keep consumers aligned with the fixtures. A consumer migrating from AMC's former helper must include its scenario notes in `noteCount`; that helper counted filler notes only.

## Populate before opening Obsidian

In the performance project's global setup module, export the hooks returned by the factory:

```typescript
import { createPerformanceVaultSetup } from '@mnaoumov/obsidian-dev-toolkit/test-runners/performance-vault-setup';

export const { setup, teardown } = await createPerformanceVaultSetup({
  cyrillicShare: 0.25,
  noteCount: 37_000,
  totalBytes: 110_000_000
});
```

Set that module as the performance project's `globalSetup`, retaining the harness's `setupFiles` and serial file execution. The factory delegates to `obsidian-integration-testing/vitest-global-setup-plugin` and supplies a `populate` callback that runs before Obsidian opens. All three modules can load without the optional harness installed; setup and readiness import it only when called. Install `obsidian-integration-testing` to use those functions.

## Wait before measuring

The measurement suite waits for startup indexing in Node:

```typescript
import { waitForPerformanceVaultScan } from '@mnaoumov/obsidian-dev-toolkit/test-runners/performance-vault-scan';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  await waitForPerformanceVaultScan({
    cachePath: 'links/link-0.md',
    expectedFileCount: 37_000,
    vaultPath: getTemporaryVault().path
  });
}, 300_000);
```

Readiness requires the **exact expected file count**, metadata for `cachePath`, and zero metadata parse tasks for three consecutive polls. Every failing sample resets that streak, even if the file count stays unchanged. Set `cachePath` to an existing note with metadata when disabling the link fixtures. Include any additional files your setup creates in `expectedFileCount`; an incomplete but stable scan and an oversized vault both fail readiness.

The default interval is 2,000 ms and the overall timeout is 240,000 ms, configurable through `intervalInMilliseconds`, `timeoutInMilliseconds` and `stablePollsRequired`. Each transport evaluation only reads the status; the long wait runs in Node through `pollInObsidian`, outside the per-evaluation cap. Give the enclosing Vitest hook enough time for the overall budget. Run performance files serially and cap workers at the machine's assigned budget, including `BULK_CORES` during bulk work.
