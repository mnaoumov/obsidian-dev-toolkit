/**
 * @file
 *
 * Packs this package, installs the tarball into an empty project, loads every exported module as ESM and as CommonJS,
 * and runs the bins. Run it after `npm run build`.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { smokePack } from '@mnaoumov/typescript-dev-toolkit/pack-smoke';

// These commands have no `--help`, so an unknown option proves the bin loads and parses its arguments, with no side
// effect: run with no arguments, `deploy-to-device` calls `adb` and `start-obsidian-for-debugging` launches Obsidian.
const BINS_WITHOUT_HELP = [
  'check-plugin',
  'deploy-to-device',
  'generate-coverage-badge',
  'generate-vscode-debug-config',
  'start-obsidian-for-debugging',
  'update-workflow-pins'
];

await wrapCliTask(() =>
  smokePack({
    bins: BINS_WITHOUT_HELP.map((name) => ({
      arguments: ['--pack-smoke-unknown-option'],
      expectedExitCode: 1,
      name
    })),
    installedOptionalPeers: [
      {
        name: 'svelte',
        reason: '@mnaoumov/typescript-dev-toolkit, a dependency, depends on esbuild-svelte and svelte-check, which peer on it'
      }
    ],
    // A test setup module's whole job is its test runner or the integration harness, so it cannot load without it.
    peerBoundModules: [
      'demo-vault-buttons',
      'demo-vault-coverage',
      'integration-test-after-layout-ready-vitest-global-setup',
      'integration-test-setup',
      'integration-test-vitest-global-setup',
      'jest-setup',
      'test-runners/after-layout-ready-vitest-global-setup',
      'test-runners/integration-test-plugin',
      'vitest-setup'
    ]
  })
);
