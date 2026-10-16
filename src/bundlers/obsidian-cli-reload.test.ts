import type { ExecResult } from '@mnaoumov/typescript-dev-toolkit/exec';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { reloadPluginWithObsidianCli } from './obsidian-cli-reload.ts';

const mocks = vi.hoisted(() => ({
  exec: vi.fn()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/exec', () => ({
  exec: mocks.exec
}));

const PARAMS = { pluginId: 'my-plugin', vaultName: 'My Vault' };

function result(stdout: string, exitCode = 0, stderr = ''): ExecResult {
  return { exitCode, exitSignal: null, stderr, stdout };
}

describe('reloadPluginWithObsidianCli', () => {
  beforeEach(() => {
    mocks.exec.mockReset();
  });

  it('reloads the plugin in the named vault', async () => {
    mocks.exec.mockResolvedValueOnce(result('Reloaded: my-plugin\n'));

    await reloadPluginWithObsidianCli(PARAMS);

    expect(mocks.exec).toHaveBeenCalledTimes(1);
    expect(mocks.exec).toHaveBeenCalledWith(['obsidian', 'vault=My Vault', 'plugin:reload', 'id=my-plugin'], {
      isQuiet: true,
      shouldIgnoreExitCode: true,
      shouldIncludeDetails: true
    });
  });

  it('loads the manifests and enables a plugin Obsidian does not know yet', async () => {
    mocks.exec
      .mockResolvedValueOnce(result('Error: Plugin "my-plugin" not found. Use "plugins" to list available plugins.'))
      .mockResolvedValueOnce(result('=> true'));

    await reloadPluginWithObsidianCli(PARAMS);

    expect(mocks.exec).toHaveBeenCalledTimes(2);
    expect(mocks.exec).toHaveBeenLastCalledWith(
      ['obsidian', 'vault=My Vault', 'eval', 'code=app.plugins.loadManifests().then(() => app.plugins.enablePluginAndSave("my-plugin"))'],
      expect.anything()
    );
  });

  it('reports a failure to enable a new plugin', async () => {
    mocks.exec
      .mockResolvedValueOnce(result('Error: Plugin "my-plugin" not found.'))
      .mockResolvedValueOnce(result('Error: boom'));

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toThrow(
      'The Obsidian CLI could not enable new plugin \'my-plugin\' in vault \'My Vault\': Error: boom'
    );
  });

  it('reports a vault the CLI does not know, though the CLI exits with code 0', async () => {
    mocks.exec.mockResolvedValueOnce(result('Vault not found.'));

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toThrow(
      /could not reload plugin 'my-plugin' in vault 'My Vault': Vault not found\.\nTurn the Obsidian CLI on/u
    );
  });

  it('reports any other error the CLI prints', async () => {
    mocks.exec.mockResolvedValueOnce(result('Error: Command "plugin:reload" not found.'));

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toThrow('Error: Command "plugin:reload" not found.');
  });

  it('reports a CLI that is not installed, with its stderr', async () => {
    mocks.exec.mockResolvedValueOnce(result('', 1, '\'obsidian\' is not recognized as an internal or external command'));

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toThrow(
      /The Obsidian CLI \(`obsidian`\) failed: 'obsidian' is not recognized.*\nTurn the Obsidian CLI on in Obsidian/su
    );
  });

  it('reports a failing CLI that printed nothing by its exit code', async () => {
    mocks.exec.mockResolvedValueOnce(result('', 127));

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toThrow('failed: exit code 127');
  });

  it('reports a CLI that could not be started at all', async () => {
    const cause = new Error('spawn failed');
    mocks.exec.mockRejectedValueOnce(cause);

    await expect(reloadPluginWithObsidianCli(PARAMS)).rejects.toMatchObject({
      cause,
      message: expect.stringContaining('could not be started') as unknown
    });
  });
});
