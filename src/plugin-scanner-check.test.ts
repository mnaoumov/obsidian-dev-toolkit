import { join } from '@mnaoumov/typescript-lib/path';
import dedent from 'dedent';
import { existsSync } from 'node:fs';
import {
  mkdtemp,
  readFile,
  rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import process from 'node:process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  formatWorkflowCommandOutput,
  OBSIDIAN_WORKFLOWS_VERSION,
  runScannerCheck
} from './plugin-scanner-check.ts';

interface ExecCallOptions {
  readonly env: NodeJS.ProcessEnv;
}

const { mockExec, mockGetRootFolder } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockGetRootFolder: vi.fn<() => null | string>()
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/exec', () => ({
  exec: mockExec
}));

vi.mock('@mnaoumov/typescript-dev-toolkit/root', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-dev-toolkit/root')>(),
  getRootFolder: mockGetRootFolder
}));

function stubFetch(body: string, init?: ResponseInit): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn(() => Promise.resolve(new Response(body, init)));
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

describe('formatWorkflowCommandOutput', () => {
  it('should turn workflow commands into plain lines', () => {
    expect(formatWorkflowCommandOutput(dedent`
      ::group::Lint
      Installing...
      [{"filePath":"a.ts","messages":[]}]
      ::error title=scanner-eslint%3A x,file=src/a.ts,line=11,col=3::[scanner-eslint] Bad%2C really 100%25%0A next
      ::warning file=styles.css::No line
      ::notice::Plain notice
      ::endgroup::
      ::set-output name=type::plugin
      ::debug ignored::x
      odd=::warning bad,=x::y
    `)).toBe(dedent`
      == Lint
      Installing...
      error: src/a.ts:11 [scanner-eslint] Bad, really 100%
       next
      warning: styles.css No line
      notice: Plain notice
      odd=::warning bad,=x::y
    `);
  });

  it('should split CRLF output, drop a property without a value and decode a carriage return', () => {
    expect(formatWorkflowCommandOutput('::error bad,=x::y%0D\r\nlast')).toBe('error: y\r\nlast');
  });
});

describe('runScannerCheck', () => {
  let rootFolder: string;

  beforeEach(async () => {
    rootFolder = await mkdtemp(join(tmpdir(), 'plugin-scanner-check-'));
    mockExec.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(rootFolder, { force: true, recursive: true });
  });

  it('should download the action once and run it with the inputs of a strict scanner run', async () => {
    type ExecCall = [string[], ExecCallOptions];
    const mockFetch = stubFetch('// action');
    mockExec.mockResolvedValue({ exitCode: 1, stderr: '', stdout: '::error::Bad' });

    const result = await runScannerCheck({ repository: 'jane/tabs', rootFolder });

    expect(result).toEqual({ exitCode: 1, output: 'error: Bad' });
    expect(mockFetch).toHaveBeenCalledWith(`https://raw.githubusercontent.com/obsidianmd/obsidian-workflows/${OBSIDIAN_WORKFLOWS_VERSION}/dist/index.js`);
    const actionPath = join(rootFolder, 'node_modules/.cache/obsidian-dev-toolkit/obsidian-workflows', OBSIDIAN_WORKFLOWS_VERSION, 'index.mjs');
    expect(await readFile(actionPath, 'utf-8')).toBe('// action');
    const [command, options] = mockExec.mock.calls[0] as ExecCall;
    expect(command).toEqual([process.execPath, actionPath]);
    expect(options.env).toMatchObject({
      'GITHUB_REPOSITORY': 'jane/tabs',
      'GITHUB_WORKSPACE': rootFolder,
      'INPUT_BUILD': 'false',
      'INPUT_MODE': 'pr',
      'INPUT_SCANNER-LINT': 'true',
      'INPUT_STRICT': 'true',
      'INPUT_TYPE': 'plugin'
    });
    expect(existsSync(options.env['GITHUB_STEP_SUMMARY'] ?? '')).toBe(false);

    mockExec.mockResolvedValue({ exitCode: null, stderr: '::warning::late', stdout: '' });
    expect(await runScannerCheck({ rootFolder, shouldBeStrict: false })).toEqual({ exitCode: 1, output: 'warning: late' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, secondOptions] = mockExec.mock.calls[1] as ExecCall;
    expect(secondOptions.env['INPUT_STRICT']).toBe('false');
  });

  it('should default to the project root', async () => {
    mockGetRootFolder.mockReturnValue(rootFolder);
    const mockFetch = stubFetch('x');
    mockExec.mockResolvedValue({ exitCode: 0, stderr: '', stdout: 'ok' });
    expect(await runScannerCheck({ version: 'v9.9.9' })).toEqual({ exitCode: 0, output: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith('https://raw.githubusercontent.com/obsidianmd/obsidian-workflows/v9.9.9/dist/index.js');
  });

  it('should fail when the download fails', async () => {
    stubFetch('', { status: 404 });
    await expect(runScannerCheck({ rootFolder })).rejects.toThrow('HTTP 404');
    expect(mockExec).not.toHaveBeenCalled();
  });
});
