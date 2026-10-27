/**
 * @file
 *
 * Reusable Vitest global setup for a performance corpus, populated before Obsidian opens it.
 */

import type { GeneratePerformanceVaultOptions } from './performance-vault.ts';

import { generatePerformanceVault } from './performance-vault.ts';

/**
Corpus options passed to the reusable global setup.
 */
export type CreatePerformanceVaultSetupOptions = GeneratePerformanceVaultOptions;

/**
 * Creates the harness setup and teardown hooks with a reproducible corpus. Readiness is awaited
 * by the measurement suite with waitForPerformanceVaultScan(), after Obsidian has opened.
 *
 * @param options - Corpus dimensions and fixture counts.
 * @returns The harness global setup and teardown hooks.
 */
export async function createPerformanceVaultSetup(options: CreatePerformanceVaultSetupOptions = {}): Promise<ReturnType<typeof import('obsidian-integration-testing/vitest-global-setup-plugin').createSetup>> {
  const { createSetup } = await import('obsidian-integration-testing/vitest-global-setup-plugin');
  return createSetup({ populate: () => generatePerformanceVault(options) });
}
