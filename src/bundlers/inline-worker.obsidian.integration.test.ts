/**
 * @file
 *
 * Executes a bundled worker with inlined WASM through the real Obsidian browser Worker API.
 */

import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import {
  expect,
  it
} from 'vitest';

import { bundleInlineWorker } from './inline-worker.ts';

it('runs the bundled worker and its WASM from a Blob URL in Obsidian', async () => {
  const result = await bundleInlineWorker(join(import.meta.dirname, '../../test-fixtures/features/workers/src/compute.worker.ts'));
  const source = JSON.parse(result.code.slice('export default '.length, -2)) as string;
  const answer = await evalInObsidian({
    callback: async ({ source: workerSource }) => {
      const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const timeoutInMilliseconds = 5000;
      let timeout: number | undefined;
      try {
        return await new Promise<number>((resolve, reject) => {
          timeout = window.setTimeout(() => {
            reject(new Error('Worker did not answer'));
          }, timeoutInMilliseconds);
          worker.addEventListener('message', ($event: MessageEvent<number>): void => {
            resolve($event.data);
          }, { once: true });
          worker.addEventListener('error', ($event): void => {
            reject(new Error($event.message));
          }, { once: true });
        });
      } finally {
        window.clearTimeout(timeout);
        worker.terminate();
        URL.revokeObjectURL(url);
      }
    },
    input: { source }
  });
  expect(answer).toBe(84);
});
