import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  join
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expect,
  it,
  vi
} from 'vitest';
import { createVitest } from 'vitest/node';

import { defineObsidianPluginVitestConfig } from './vitest-config.ts';

it('should run shared-vault files without overlap under an environment worker cap', async () => {
  const fixtureFolder = mkdtempSync(join(tmpdir(), 'obsidian-vitest-serial-'));
  const repoFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  symlinkSync(join(repoFolder, 'node_modules'), join(fixtureFolder, 'node_modules'), 'junction');
  mkdirSync(join(fixtureFolder, 'src'));
  const fixture = `
import { mkdirSync, rmdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { it } from 'vitest';
it('owns the shared vault exclusively', async () => {
  const lock = ${JSON.stringify(join(fixtureFolder, 'vault-lock'))};
  mkdirSync(lock);
  try {
    await setTimeout(100);
  } finally {
    rmdirSync(lock);
  }
});
`;
  for (const suffix of ['desktop', 'no-app', 'demo-vault']) {
    for (const name of ['first', 'second']) {
      writeFileSync(join(fixtureFolder, 'src', `${name}.${suffix}.integration.test.ts`), fixture);
    }
  }
  vi.stubEnv('VITEST_MAX_WORKERS', '2');
  const config = defineObsidianPluginVitestConfig({
    customProjects(context) {
      return [{ test: { ...context.desktop, include: ['src/**/*.demo-vault.integration.test.ts'], name: 'demo-vault' } }];
    },
    editContext(context) {
      context.desktop.globalSetup = [];
      context.desktop.setupFiles = [];
    }
  });
  const vitest = await createVitest({
    config: false,
    project: ['integration-tests:desktop', 'integration-tests:no-app', 'demo-vault'],
    reporters: [],
    root: fixtureFolder,
    watch: false
  }, config);
  try {
    await vitest.start();
    const modules = vitest.state.getTestModules();
    expect(modules).toHaveLength(6);
    expect(modules.map(($module) => $module.state())).toEqual(Array.from({ length: 6 }, () => 'passed'));
  } finally {
    await vitest.close();
    vi.unstubAllEnvs();
    // Remove the junction before the fixture directory so cleanup cannot traverse the repository's dependencies.
    unlinkSync(join(fixtureFolder, 'node_modules'));
    rmSync(fixtureFolder, { force: true, recursive: true });
  }
});
