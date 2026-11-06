/**
 * @file
 *
 * Verifies how the debugging launcher finds Obsidian, starts it and reads its renderer endpoint.
 */

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
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
  resolveObsidianExecutable,
  startObsidianForDebugging
} from './obsidian-debug-launcher.ts';

vi.mock('@mnaoumov/typescript-dev-toolkit/exec', () => ({ exec: vi.fn() }));
vi.mock('@mnaoumov/typescript-lib/async', () => ({ sleep: vi.fn(() => noopAsync()) }));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: vi.fn() }));

const OBSIDIAN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0) obsidian/1.15.0 Chrome/150.0 Electron/43.8.4';
const originalPlatform = process.platform;
// `exec` is overloaded and `vi.mocked` types its last overload, the detailed one; the launcher calls the string one.
const execMock = vi.mocked(castTo<(command: string[], options: object) => Promise<string>>(exec));

// eslint-disable-next-line unicorn/prefer-event-target -- It stands in for a `ChildProcess`, which is a Node `EventEmitter`.
class FakeChildProcess extends EventEmitter {
  public readonly unref = vi.fn();
}

function endpointResponse(body: unknown, isOk = true, status = 200): Response {
  return castTo<Response>({
    json: () => body instanceof Error ? Promise.reject(body) : Promise.resolve(body),
    ok: isOk,
    status
  });
}

function mockSpawn(onSpawn: (child: FakeChildProcess) => void): FakeChildProcess {
  const child = new FakeChildProcess();
  vi.mocked(spawn).mockImplementation(() => {
    queueMicrotask(() => {
      onSpawn(child);
    });
    return castTo<ReturnType<typeof spawn>>(child);
  });
  return child;
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
}

describe('resolveObsidianExecutable', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.stubEnv('LOCALAPPDATA', String.raw`C:\Users\me\AppData\Local`);
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.unstubAllEnvs();
  });

  it('should prefer a real executable over a scoop shim on Windows', async () => {
    setPlatform('win32');
    const shim = String.raw`C:\scoop\shims\Obsidian.exe`;
    const real = String.raw`C:\scoop\apps\obsidian\current\Obsidian.exe`;
    execMock.mockResolvedValue(`${shim}\r\n${real}\r\n\r\n`);
    vi.mocked(existsSync).mockImplementation((path) => [real, shim, String.raw`C:\scoop\shims\Obsidian.shim`].includes(String(path)));
    expect(await resolveObsidianExecutable()).toBe(real);
    expect(exec).toHaveBeenCalledWith(['where.exe', 'Obsidian.exe'], { isQuiet: true, shouldFailIfCalledFromOutsideRoot: false });
  });

  it('should fall back to a shim when it is the only candidate', async () => {
    setPlatform('win32');
    const shim = String.raw`C:\scoop\shims\Obsidian.exe`;
    execMock.mockResolvedValue(shim);
    vi.mocked(existsSync).mockReturnValue(true);
    expect(await resolveObsidianExecutable()).toBe(shim);
  });

  it('should use the per-user installer location on Windows when PATH has none', async () => {
    setPlatform('win32');
    execMock.mockRejectedValue(new Error('not found'));
    const installerPath = String.raw`C:\Users\me\AppData\Local\Programs\Obsidian\Obsidian.exe`;
    vi.mocked(existsSync).mockImplementation((path) => path === installerPath);
    expect(await resolveObsidianExecutable()).toBe(installerPath);
  });

  it('should explain a missing Windows installation', async () => {
    setPlatform('win32');
    vi.stubEnv('LOCALAPPDATA', undefined);
    execMock.mockResolvedValue('');
    await expect(resolveObsidianExecutable()).rejects.toThrow(String.raw`\Programs\Obsidian\Obsidian.exe`);
  });

  it('should use the application bundle on macOS', async () => {
    setPlatform('darwin');
    vi.mocked(existsSync).mockReturnValue(true);
    expect(await resolveObsidianExecutable()).toBe('/Applications/Obsidian.app/Contents/MacOS/Obsidian');
    expect(exec).not.toHaveBeenCalled();
  });

  it('should explain a missing macOS installation', async () => {
    setPlatform('darwin');
    await expect(resolveObsidianExecutable()).rejects.toThrow('/Applications/Obsidian.app');
  });

  it('should search PATH on Linux', async () => {
    setPlatform('linux');
    execMock.mockResolvedValue('/usr/bin/obsidian\n');
    vi.mocked(existsSync).mockReturnValue(true);
    expect(await resolveObsidianExecutable()).toBe('/usr/bin/obsidian');
    expect(exec).toHaveBeenCalledWith(['which', 'obsidian'], { isQuiet: true, shouldFailIfCalledFromOutsideRoot: false });
  });

  it('should explain a missing Linux installation', async () => {
    setPlatform('linux');
    execMock.mockResolvedValue('');
    await expect(resolveObsidianExecutable()).rejects.toThrow('not found on PATH');
  });
});

describe('startObsidianForDebugging', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setPlatform(originalPlatform);
  });

  it.each([0, 65_536, 1.5, NaN])('should reject invalid port %s', async (port) => {
    await expect(startObsidianForDebugging({ port })).rejects.toThrow('port must be an integer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should start nothing when Obsidian already listens on the port', async () => {
    fetchMock.mockResolvedValue(endpointResponse({ 'User-Agent': OBSIDIAN_USER_AGENT }));
    expect(await startObsidianForDebugging()).toEqual({
      executablePath: undefined,
      port: 9222,
      userAgent: OBSIDIAN_USER_AGENT,
      wasAlreadyListening: true
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9222/json/version');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    ['a browser', endpointResponse({ 'User-Agent': 'Mozilla/5.0 Chrome/150.0' }), 'Mozilla/5.0 Chrome/150.0'],
    ['a server that is not a debugging endpoint', endpointResponse(new Error('not JSON'), false, 404), 'HTTP 404'],
    ['an endpoint with no user agent', endpointResponse({ 'User-Agent': 7 }), 'HTTP 200']
  ])('should refuse a port taken by %s', async (_name, response, detail) => {
    fetchMock.mockResolvedValue(response);
    await expect(startObsidianForDebugging()).rejects.toThrow(`something other than Obsidian (${detail})`);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should start the given executable and wait until its endpoint answers', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(endpointResponse({ 'User-Agent': OBSIDIAN_USER_AGENT }));
    const child = mockSpawn((spawned) => spawned.emit('spawn'));
    expect(await startObsidianForDebugging({ executablePath: '/opt/obsidian', extraArguments: ['--disable-gpu'], port: 9333 })).toEqual({
      executablePath: '/opt/obsidian',
      port: 9333,
      userAgent: OBSIDIAN_USER_AGENT,
      wasAlreadyListening: false
    });
    expect(spawn).toHaveBeenCalledWith('/opt/obsidian', ['--remote-debugging-port=9333', '--disable-gpu'], { detached: true, stdio: 'ignore' });
    expect(child.unref).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should resolve the installed executable when none is given', async () => {
    setPlatform('darwin');
    vi.mocked(existsSync).mockReturnValue(true);
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(endpointResponse({ 'User-Agent': OBSIDIAN_USER_AGENT }));
    mockSpawn((spawned) => spawned.emit('spawn'));
    const result = await startObsidianForDebugging();
    expect(result.executablePath).toBe('/Applications/Obsidian.app/Contents/MacOS/Obsidian');
    expect(spawn).toHaveBeenCalledWith('/Applications/Obsidian.app/Contents/MacOS/Obsidian', ['--remote-debugging-port=9222'], expect.anything());
  });

  it('should report an Obsidian that exits without opening the port', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    mockSpawn((spawned) => {
      spawned.emit('spawn');
      spawned.emit('exit', 0);
    });
    await expect(startObsidianForDebugging({ executablePath: '/opt/obsidian' })).rejects.toThrow('exited without opening the debugging port 9222');
  });

  it('should give up when the endpoint does not answer in time', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    mockSpawn((spawned) => spawned.emit('spawn'));
    await expect(startObsidianForDebugging({ executablePath: '/opt/obsidian', timeoutInMilliseconds: 0 })).rejects.toThrow(
      'did not open the debugging port 9222 within 0 ms'
    );
  });

  it('should report an executable that cannot be started', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    mockSpawn((spawned) => spawned.emit('error', new Error('spawn ENOENT')));
    await expect(startObsidianForDebugging({ executablePath: '/missing' })).rejects.toThrow('Could not start `/missing`: spawn ENOENT');
  });
});
