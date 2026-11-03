import type {
  BuildResult,
  OutputFile
} from 'esbuild';

import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import {
  expect,
  it,
  vi
} from 'vitest';

import { bundleInlineWorker } from './inline-worker.ts';

vi.mock('esbuild', () => ({ build: vi.fn() }));

it('exports readable worker source and watches every bundled input', async () => {
  vi.mocked(build).mockResolvedValue(strictProxy<BuildResult>({
    metafile: { inputs: { 'answer.ts': {}, 'compute.worker.ts': {} } },
    outputFiles: [strictProxy<OutputFile>({ text: 'self.postMessage(42);' })]
  }));
  const result = await bundleInlineWorker(resolve('compute.worker.ts'));
  expect(result.code).toBe('export default "self.postMessage(42);";\n');
  expect(result.dependencies).toEqual([resolve('answer.ts'), resolve('compute.worker.ts')]);
  expect(build).toHaveBeenCalledWith(expect.objectContaining({
    bundle: true,
    format: 'iife',
    loader: { '.wasm': 'binary' },
    platform: 'browser',
    write: false
  }));
});

it('rejects a worker build without JavaScript output', async () => {
  vi.mocked(build).mockResolvedValue(strictProxy<BuildResult>({ metafile: { inputs: {} }, outputFiles: [] }));
  await expect(bundleInlineWorker(resolve('missing.worker.ts'))).rejects.toThrow('Worker build produced no JavaScript');
});
