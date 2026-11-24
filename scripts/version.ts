/**
 * @file
 *
 * The release entry point: `npm run version '--' <type> [flags]`.
 *
 * The generic release bumps the version, settles `CHANGELOG.md`, commits, tags, pushes and creates the GitHub
 * release. The release carries no assets: the package is distributed through NPM, which
 * `.github/workflows/publish-npm.yml` publishes to from a fresh build when the release is published. The Claude Code
 * plugin's `plugin.json` carries the same version, written into the release commit, because Claude Code updates an
 * installed plugin only when that string changes.
 */

import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import {
  parseVersionArguments,
  updateVersion
} from '@mnaoumov/typescript-dev-toolkit/version';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { updateClaudePluginVersion } from './helpers/claude-plugin.ts';

await wrapCliTask(async () => {
  const [, , ...versionArguments] = process.argv;
  const { options, versionUpdateType } = parseVersionArguments(versionArguments);
  await updateVersion(versionUpdateType, {
    ...options,
    getReleaseAssetPaths: () => Promise.resolve([]),
    updateVersionInExtraFiles: (newVersion) => {
      updateClaudePluginVersion(fileURLToPath(new URL('..', import.meta.url)), newVersion);
      return noopAsync();
    }
  });
});
