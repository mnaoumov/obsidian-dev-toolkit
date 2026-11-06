/**
 * @file
 *
 * Verifies the Obsidian debugger configuration workflow.
 */

import {
  describe,
  expect,
  it
} from 'vitest';

import { createVsCodeDebugConfig } from './vscode-debug-config.ts';

describe('createVsCodeDebugConfig', () => {
  it('should map the package URL to the workspace even when the package name is scoped', () => {
    const config = createVsCodeDebugConfig({ pluginName: '@example/plugin' });
    expect(config.version).toBe('0.2.0');
    expect(config.configurations[0]).toMatchObject({
      address: '127.0.0.1',
      port: 9222,
      request: 'attach',
      sourceMapPathOverrides: {
        // eslint-disable-next-line no-template-curly-in-string -- This is a literal VS Code substitution variable.
        'app://obsidian.md/plugin:@example/plugin/*': '${workspaceFolder}/*'
      },
      sourceMaps: true,
      type: 'chrome',
      // eslint-disable-next-line no-template-curly-in-string -- This is a literal VS Code substitution variable.
      webRoot: '${workspaceFolder}'
    });
  });

  it('should use the requested debugging port', () => {
    expect(createVsCodeDebugConfig({ pluginName: 'plugin', port: 9333 }).configurations[0]?.port).toBe(9333);
  });

  it.each([0, -1, 65_536, 1.5, NaN])('should reject invalid port %s', (port) => {
    expect(() => createVsCodeDebugConfig({ pluginName: 'plugin', port })).toThrow('port');
  });

  it.each(['', '(unknown)', 'bad*name', 'bad?name', 'bad\nname'])('should reject an unusable package name %j', (pluginName) => {
    expect(() => createVsCodeDebugConfig({ pluginName })).toThrow('package name');
  });
});
