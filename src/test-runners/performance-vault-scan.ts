/**
 * @file
 *
 * Node-side startup readiness polling for an exactly sized performance vault.
 */

/**
Inputs for waiting until a performance vault is ready for measurements.
 */
export interface WaitForPerformanceVaultScanParams {
  /**
  A generated note with metadata (for example links/link-0.md).
   */
  readonly cachePath: string;
  /**
  Exact file count, including fixtures and any files added by setup.
   */
  readonly expectedFileCount: number;
  /**
  Poll interval in milliseconds. Defaults to 2000.
   */
  readonly intervalInMilliseconds?: number;
  /**
  Consecutive fully ready samples required. Defaults to three.
   */
  readonly stablePollsRequired?: number;
  /**
  Overall Node-side timeout in milliseconds. Defaults to 240,000.
   */
  readonly timeoutInMilliseconds?: number;
  /**
  Path of the owned temporary vault.
   */
  readonly vaultPath: string;
}

const DEFAULT_INTERVAL_IN_MILLISECONDS = 2000;
const DEFAULT_STABLE_POLLS_REQUIRED = 3;
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 240_000;

/**
 * Waits outside the transport evaluation cap. Any bad sample resets stability, including a
 * metadata task starting after the file count settled. The optional harness loads only at call time.
 *
 * @param params - Expected corpus and polling budget.
 * @returns A promise resolving after consecutive ready samples.
 */
export async function waitForPerformanceVaultScan(params: WaitForPerformanceVaultScanParams): Promise<void> {
  const {
    cachePath,
    expectedFileCount,
    intervalInMilliseconds = DEFAULT_INTERVAL_IN_MILLISECONDS,
    stablePollsRequired = DEFAULT_STABLE_POLLS_REQUIRED,
    timeoutInMilliseconds = DEFAULT_TIMEOUT_IN_MILLISECONDS,
    vaultPath
  } = params;
  for (const [name, value] of Object.entries({ expectedFileCount, intervalInMilliseconds, stablePollsRequired, timeoutInMilliseconds })) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  if (!cachePath || !vaultPath) {
    throw new RangeError('cachePath and vaultPath must not be empty');
  }
  let stablePolls = 0;
  const { pollInObsidian } = await import('obsidian-integration-testing');
  await pollInObsidian({
    input: { cachePath },
    intervalInMilliseconds,
    poll({ app, cachePath: path }) {
      return {
        fileCount: app.vault.getFiles().length,
        isCacheReady: !!app.metadataCache.getCache(path),
        isCacheSettled: app.metadataCache.inProgressTaskCount === 0
      };
    },
    timeoutInMilliseconds,
    timeoutMessage: `the performance vault to have exactly ${String(expectedFileCount)} files, cached ${cachePath} and no metadata tasks`,
    until(status) {
      stablePolls = status.fileCount === expectedFileCount && status.isCacheReady && status.isCacheSettled ? stablePolls + 1 : 0;
      return stablePolls >= stablePollsRequired;
    },
    vaultPath
  });
}
