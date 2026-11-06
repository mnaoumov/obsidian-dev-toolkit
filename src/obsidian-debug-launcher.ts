/**
 * @file
 *
 * Starts desktop Obsidian with the Electron renderer's remote debugging endpoint open, so an IDE can attach to it.
 *
 * The endpoint is Chromium's `--remote-debugging-port`, not Obsidian's own debug setting. Obsidian is a single-instance
 * app: launching it while it already runs hands the request to the running process, which keeps whatever flags it was
 * started with. So the launcher never trusts the spawn alone; it reports success only once the endpoint answers and
 * says it is Obsidian.
 */

import { exec } from '@mnaoumov/typescript-dev-toolkit/exec';
import { sleep } from '@mnaoumov/typescript-lib/async';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

/**
 * The renderer debugging port used when none is given.
 */
export const DEFAULT_REMOTE_DEBUGGING_PORT = 9222;

const DEFAULT_TIMEOUT_IN_MILLISECONDS = 30_000;
const MAX_PORT = 65_535;
const POLL_INTERVAL_IN_MILLISECONDS = 250;
const OBSIDIAN_USER_AGENT_PATTERN = /\bobsidian\/[\d.]+/i;

/**
 * Options for {@link startObsidianForDebugging}.
 */
export interface StartObsidianForDebuggingOptions {
  /**
   * The Obsidian executable to start.
   *
   * @default The installed Obsidian, found by {@link resolveObsidianExecutable}.
   */
  readonly executablePath?: string;
  /**
   * Further arguments passed to Obsidian after `--remote-debugging-port`.
   *
   * @default `[]`
   */
  readonly extraArguments?: readonly string[];
  /**
   * The renderer's remote debugging port.
   *
   * @default {@link DEFAULT_REMOTE_DEBUGGING_PORT}
   */
  readonly port?: number;
  /**
   * How long to wait for the endpoint to answer after starting Obsidian.
   *
   * @default `30000`
   */
  readonly timeoutInMilliseconds?: number;
}

/**
 * The result of {@link startObsidianForDebugging}.
 */
export interface StartObsidianForDebuggingResult {
  /**
   * The executable that was started, or `undefined` when an Obsidian already listened on the port.
   */
  readonly executablePath: string | undefined;
  /**
   * The port the endpoint answers on.
   */
  readonly port: number;
  /**
   * The `User-Agent` the endpoint reported.
   */
  readonly userAgent: string;
  /**
   * Whether an Obsidian already listened on the port, so nothing was started.
   */
  readonly wasAlreadyListening: boolean;
}

interface DebuggingEndpointVersion {
  readonly 'User-Agent'?: unknown;
}

interface ExitState {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Set by the child's `exit` listener after the launch resolves.
  hasExited: boolean;
}

/**
 * Resolves the installed desktop Obsidian executable.
 *
 * Looks on `PATH` first (preferring a real executable over a `scoop` shim), then at the installer's location:
 * `%LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe` on Windows and `/Applications/Obsidian.app` on macOS. On Linux only
 * `PATH` is searched.
 *
 * @returns A {@link Promise} that resolves to the absolute path of the executable.
 * @throws If no installed Obsidian is found.
 */
export async function resolveObsidianExecutable(): Promise<string> {
  if (process.platform === 'win32') {
    const fromPath = await findInPath('where.exe', 'Obsidian.exe');
    if (fromPath) {
      return fromPath;
    }
    const installerPath = String.raw`${process.env['LOCALAPPDATA'] ?? ''}\Programs\Obsidian\Obsidian.exe`;
    if (existsSync(installerPath)) {
      return installerPath;
    }
    throw new Error(`Obsidian was not found on PATH or at \`${installerPath}\`. Pass --executable=<path to Obsidian.exe>.`);
  }

  if (process.platform === 'darwin') {
    const standardPath = '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
    if (existsSync(standardPath)) {
      return standardPath;
    }
    throw new Error(`Obsidian was not found at \`${standardPath}\`. Pass --executable=<path to the Obsidian binary>.`);
  }

  const fromPath = await findInPath('which', 'obsidian');
  if (fromPath) {
    return fromPath;
  }
  throw new Error('Obsidian was not found on PATH. Pass --executable=<path to the Obsidian executable or AppImage>.');
}

/**
 * Starts desktop Obsidian with `--remote-debugging-port` and waits until its renderer endpoint answers.
 *
 * When an Obsidian already answers on the port, nothing is started. It does not build or enable a plugin, and it does
 * not attach a debugger.
 *
 * @param options - The {@link StartObsidianForDebuggingOptions}.
 * @returns A {@link Promise} that resolves to the {@link StartObsidianForDebuggingResult}.
 * @throws If the port is invalid or taken by something other than Obsidian, the executable cannot be started, or the
 *   endpoint does not answer in time, which is what an Obsidian already running without the flag causes.
 */
export async function startObsidianForDebugging(options: StartObsidianForDebuggingOptions = {}): Promise<StartObsidianForDebuggingResult> {
  const { extraArguments = [], port = DEFAULT_REMOTE_DEBUGGING_PORT, timeoutInMilliseconds = DEFAULT_TIMEOUT_IN_MILLISECONDS } = options;
  if (!Number.isSafeInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error('The debugging port must be an integer between 1 and 65535.');
  }

  const existingUserAgent = await probeEndpoint(port);
  if (existingUserAgent !== undefined) {
    return { executablePath: undefined, port, userAgent: existingUserAgent, wasAlreadyListening: true };
  }

  const executablePath = options.executablePath ?? await resolveObsidianExecutable();
  const exitState = await launchDetached(executablePath, [`--remote-debugging-port=${String(port)}`, ...extraArguments]);

  const deadline = Date.now() + timeoutInMilliseconds;
  for (;;) {
    const hasExited = exitState.hasExited;
    const userAgent = await probeEndpoint(port);
    if (userAgent !== undefined) {
      return { executablePath, port, userAgent, wasAlreadyListening: false };
    }
    if (hasExited) {
      throw new Error(
        `Obsidian exited without opening the debugging port ${String(port)}. An Obsidian that was already running, `
          + 'without that port, most likely received the request instead. Quit every Obsidian window, including the '
          + 'system tray icon, and run this again.'
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Obsidian did not open the debugging port ${String(port)} within ${String(timeoutInMilliseconds)} ms. If Obsidian `
          + 'was already running, quit every Obsidian window and run this again.'
      );
    }
    await sleep({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }
}

async function findInPath(lookupCommand: string, executableName: string): Promise<string | undefined> {
  let output: string;
  try {
    output = await exec([lookupCommand, executableName], { isQuiet: true, shouldFailIfCalledFromOutsideRoot: false });
  } catch {
    return undefined;
  }
  const candidates = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && existsSync(line));
  // A `scoop` shim forwards to Obsidian's console binary, which exits at once instead of starting the app.
  return candidates.find((candidate) => !isShim(candidate)) ?? candidates[0];
}

function isShim(executablePath: string): boolean {
  const shimMarkerPath = executablePath.replace(/\.[^.\\/]+$/, '.shim');
  return shimMarkerPath !== executablePath && existsSync(shimMarkerPath);
}

async function launchDetached(executablePath: string, launchArguments: readonly string[]): Promise<ExitState> {
  const exitState: ExitState = { hasExited: false };
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executablePath, [...launchArguments], { detached: true, stdio: 'ignore' });
    child.once('error', (error) => {
      reject(new Error(`Could not start \`${executablePath}\`: ${error.message}`, { cause: error }));
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('exit', () => {
      exitState.hasExited = true;
    });
  });
  return exitState;
}

async function probeEndpoint(port: number): Promise<string | undefined> {
  let response: Response;
  try {
    // eslint-disable-next-line no-restricted-globals -- We run this outside of Obsidian, so we don't have `requestUrl()`.
    response = await fetch(`http://127.0.0.1:${String(port)}/json/version`);
  } catch {
    return undefined;
  }
  let version: DebuggingEndpointVersion;
  try {
    version = await response.json() as DebuggingEndpointVersion;
  } catch {
    version = {};
  }
  const userAgent = typeof version['User-Agent'] === 'string' ? version['User-Agent'] : '';
  if (!response.ok || !OBSIDIAN_USER_AGENT_PATTERN.test(userAgent)) {
    throw new Error(`Port ${String(port)} is already in use by something other than Obsidian (${userAgent || `HTTP ${String(response.status)}`}). Pass --port=<another port>.`);
  }
  return userAgent;
}
