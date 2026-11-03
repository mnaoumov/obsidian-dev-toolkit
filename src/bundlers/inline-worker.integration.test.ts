/**
 * @file
 *
 * Builds inline workers with every adapter and executes their source in a browser-shaped worker context.
 */

import {
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  afterAll,
  expect,
  it,
  vi
} from 'vitest';

import {
  BUILD_TIMEOUT_IN_MILLISECONDS,
  buildFixture,
  BUNDLER_CASES,
  createFixtureFolder
} from '../../scripts/helpers/bundler-fixture.ts';

const folders: string[] = [];

interface WorkerExports {
  readonly source: string;
}

afterAll(() => {
  for (const folder of folders) {
    rmSync(folder, { force: true, recursive: true });
  }
});

it.each(BUNDLER_CASES)('bundles and runs a worker with $bundler (development: $isDevelopment)', ({ bundler, isDevelopment }) => {
  const folder = createFixtureFolder('workers');
  folders.push(folder);
  const dist = buildFixture(folder, bundler, isDevelopment);
  expect(readdirSync(dist).every((file) => ['.hotreload', 'main.js', 'manifest.json'].includes(file))).toBe(true);
  const $module = { exports: {} };
  runInNewContext(readFileSync(join(dist, 'main.js'), 'utf-8'), { exports: $module.exports, module: $module, require: createRequire(import.meta.url) });
  const exported = $module.exports as WorkerExports;
  expect(exported.source).toContain('postMessage');
  const postMessage = vi.fn();
  runInNewContext(exported.source, { atob, postMessage });
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(84);
}, BUILD_TIMEOUT_IN_MILLISECONDS);
