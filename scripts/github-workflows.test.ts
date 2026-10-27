// The reusable workflows plugins call (`.github/workflows/obsidian-plugin-*.yml`): their inputs, the steps two of them
// must keep identical, and their shell steps, each run under bash the way a runner runs it, with `gh` faked and the
// badge branch pushed to a local repository.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  delimiter,
  join,
  resolve
} from 'node:path';
import process from 'node:process';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';
import { parse } from 'yaml';

interface PublishResult {
  readonly calls: string[];
  readonly outputs: string;
  readonly result: StepResult;
}

interface StepResult {
  readonly output: string;
  readonly status: null | number;
}

interface Workflow {
  readonly jobs: Record<string, WorkflowJob>;
  readonly on: WorkflowTriggers;
}

interface WorkflowCall {
  readonly inputs: Record<string, WorkflowInput>;
}

interface WorkflowInput {
  readonly default: boolean | string;
  readonly description: string;
  readonly type: 'boolean' | 'string';
}

interface WorkflowJob {
  readonly steps: WorkflowStep[];
}

interface WorkflowStep {
  readonly env?: Record<string, string>;
  readonly if?: string;
  readonly name: string;
  readonly run?: string;
  readonly uses?: string;
  readonly with?: Record<string, string>;
}

interface WorkflowTriggers {
  readonly workflow_call: WorkflowCall;
}

const WORKFLOWS_FOLDER = resolve(import.meta.dirname, '../.github/workflows');
const SHARED_SETUP_STEPS = ['Resolve settings', 'Setup pnpm', 'Setup Bun', 'Enable Corepack', 'Setup Node.js'];
const BASH = findBash();
// Every case under bash spawns processes, which a full gate slows by an order of magnitude while the other test projects
// run beside it: measured alone at 0.1-1.5 s a case and 6-9 s a badge case, under the gate one case took 5.5 s and one
// badge case 37 s. So the budgets are sized for a loaded full run, not for the file alone.
const BASH_TIMEOUT_IN_MILLISECONDS = 60_000;
const GIT_TIMEOUT_IN_MILLISECONDS = 180_000;

function findBash(): null | string {
  if (process.platform !== 'win32') {
    return 'bash';
  }
  // Git for Windows ships the bash a Windows developer has; `git --exec-path` is `<git>/<mingw>/libexec/git-core`.
  const execPath = spawnSync('git', ['--exec-path'], { encoding: 'utf-8' }).stdout.trim();
  const bash = execPath ? join(execPath, '../../../bin/bash.exe') : '';
  return bash && existsSync(bash) ? bash : null;
}

function getRun(workflow: Workflow, name: string): string {
  const { run } = getStep(workflow, name);
  if (run === undefined) {
    throw new Error(`Step '${name}' runs no script.`);
  }
  return run;
}

function getStep(workflow: Workflow, name: string): WorkflowStep {
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) {
    throw new Error(`No step '${name}'.`);
  }
  return step;
}

function parseOutputs(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split('\n').filter((line) => line.includes('=')).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    })
  );
}

async function readWorkflow(name: string): Promise<Workflow> {
  return parse(await readFile(join(WORKFLOWS_FOLDER, name), 'utf-8')) as Workflow;
}

// The runner's default shell for `run`.
function runStep(script: string, cwd: string, env: Record<string, string>): StepResult {
  const result = spawnSync(BASH ?? 'bash', ['--noprofile', '--norc', '-e', '-c', script], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...env }
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

describe('the reusable workflows', () => {
  it.each(['obsidian-plugin-ci.yml', 'obsidian-plugin-release.yml', 'obsidian-plugin-attest-release-assets.yml'])(
    '%s should be callable, with every input described and defaulted',
    async (name) => {
      const workflow = await readWorkflow(name);
      const inputs = Object.entries(workflow.on.workflow_call.inputs);
      expect(inputs.length).toBeGreaterThan(0);
      for (const [inputName, input] of inputs) {
        expect(input.description, inputName).not.toBe('');
        expect(typeof input.default, inputName).toBe(input.type);
      }
    }
  );

  it('should keep the settings and setup steps of CI and release identical', async () => {
    const ci = await readWorkflow('obsidian-plugin-ci.yml');
    const release = await readWorkflow('obsidian-plugin-release.yml');
    for (const name of SHARED_SETUP_STEPS) {
      expect(getStep(release, name), name).toEqual(getStep(ci, name));
    }
    for (const name of ['package-manager', 'node-version', 'node-version-file', 'install-command']) {
      expect(release.on.workflow_call.inputs[name], name).toEqual(ci.on.workflow_call.inputs[name]);
    }
  });

  it('should publish the badge only on a push to the default branch', async () => {
    const ci = await readWorkflow('obsidian-plugin-ci.yml');
    expect(getStep(ci, 'Publish the coverage badge').if).toBe(
      'inputs.coverage-badge && github.event_name == \'push\' && github.ref == format(\'refs/heads/{0}\', github.event.repository.default_branch)'
    );
  });
});

describe.skipIf(BASH === null)('the workflow steps under bash', { timeout: BASH_TIMEOUT_IN_MILLISECONDS }, () => {
  let folder = '';

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'github-workflows-'));
  });

  afterEach(async () => {
    await rm(folder, { force: true, recursive: true });
  });

  describe('Resolve settings', () => {
    async function resolveSettings(env: Record<string, string>): Promise<Record<string, string>> {
      const ci = await readWorkflow('obsidian-plugin-ci.yml');
      const outputPath = join(folder, 'output');
      await writeFile(outputPath, '');
      const result = runStep(getRun(ci, 'Resolve settings'), folder, {
        GITHUB_OUTPUT: toPosix(outputPath),
        INSTALL_COMMAND: '',
        NODE_VERSION: '',
        NODE_VERSION_FILE: '.nvmrc',
        PACKAGE_MANAGER: 'npm',
        ...env
      });
      expect(result.status, result.output).toBe(0);
      return parseOutputs(await readFile(outputPath, 'utf-8'));
    }

    it.each([
      ['npm', { cache: 'npm', exec: 'npx --no-install', install: 'npm ci', run: 'npm run' }],
      ['pnpm', { cache: 'pnpm', exec: 'pnpm exec', install: 'pnpm install --frozen-lockfile', run: 'pnpm run' }],
      ['yarn', { cache: 'yarn', exec: 'yarn run', install: 'yarn install --frozen-lockfile', run: 'yarn run' }],
      ['bun', { cache: '', exec: 'bun x', install: 'bun install --frozen-lockfile', run: 'bun run' }]
    ])('should derive the %s commands', async (packageManager, expected) => {
      expect(await resolveSettings({ PACKAGE_MANAGER: packageManager })).toMatchObject(expected);
    });

    it('should install with --immutable under Yarn Berry', async () => {
      await writeFile(join(folder, '.yarnrc.yml'), '');
      expect(await resolveSettings({ PACKAGE_MANAGER: 'yarn' })).toMatchObject({ install: 'yarn install --immutable' });
    });

    it('should take the caller\'s install command', async () => {
      expect(await resolveSettings({ INSTALL_COMMAND: 'npm install' })).toMatchObject({ install: 'npm install' });
    });

    it('should refuse an unknown package manager', async () => {
      const ci = await readWorkflow('obsidian-plugin-ci.yml');
      const result = runStep(getRun(ci, 'Resolve settings'), folder, {
        GITHUB_OUTPUT: toPosix(join(folder, 'output')),
        PACKAGE_MANAGER: 'deno'
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain('::error::Unknown package-manager \'deno\'');
    });

    it('should prefer node-version, then the version file, then the latest LTS', async () => {
      expect(await resolveSettings({ NODE_VERSION: '24' })).toMatchObject({ 'node-version': '24', 'node-version-file': '' });
      expect(await resolveSettings({})).toMatchObject({ 'node-version': 'lts/*', 'node-version-file': '' });
      await writeFile(join(folder, '.nvmrc'), '24\n');
      expect(await resolveSettings({})).toMatchObject({ 'node-version': '', 'node-version-file': '.nvmrc' });
    });
  });

  describe('Gate and Build', () => {
    it.each([
      ['obsidian-plugin-ci.yml', 'Gate', 'GATE_COMMAND', 'gate'],
      ['obsidian-plugin-release.yml', 'Build', 'BUILD_COMMAND', 'build']
    ])('%s %s should run the package manager\'s script, or the caller\'s command', async (name, step, variable, script) => {
      const run = getRun(await readWorkflow(name), step);
      const echo = { RUN: 'echo pm-run' };
      expect(runStep(run, folder, { ...echo, [variable]: '' }).output).toBe(`pm-run ${script}\n`);
      expect(runStep(run, folder, { ...echo, [variable]: 'echo own command' }).output).toBe('own command\n');
    });
  });

  describe('Check the tag', () => {
    async function runTagCheck(tag: string): Promise<null | number> {
      const release = await readWorkflow('obsidian-plugin-release.yml');
      return runStep(getRun(release, 'Check the tag'), folder, { TAG: tag }).status;
    }

    beforeEach(async () => {
      await writeFile(join(folder, 'manifest.json'), JSON.stringify({ version: '1.2.3' }));
    });

    it('should pass a tag that is the manifest version', async () => {
      expect(await runTagCheck('1.2.3')).toBe(0);
    });

    it('should fail a tag that is not', async () => {
      const release = await readWorkflow('obsidian-plugin-release.yml');
      const result = runStep(getRun(release, 'Check the tag'), folder, { TAG: 'v1.2.3' });
      expect(result.status).toBe(1);
      expect(result.output).toContain('::error::The tag \'v1.2.3\' is not the version in manifest.json (\'1.2.3\')');
    });

    it('should check a pre-release tag against manifest-beta.json', async () => {
      await writeFile(join(folder, 'manifest-beta.json'), JSON.stringify({ version: '1.3.0-beta.1' }));
      expect(await runTagCheck('1.3.0-beta.1')).toBe(0);
      expect(await runTagCheck('1.3.0-beta.2')).toBe(1);
    });

    it('should check a pre-release tag against manifest.json without a manifest-beta.json', async () => {
      await writeFile(join(folder, 'manifest.json'), JSON.stringify({ version: '1.3.0-beta.1' }));
      expect(await runTagCheck('1.3.0-beta.1')).toBe(0);
    });
  });

  describe('Publish the release', () => {
    let ghLog = '';

    async function publish(env: Record<string, string>, isExistingRelease = false): Promise<PublishResult> {
      const release = await readWorkflow('obsidian-plugin-release.yml');
      const binFolder = join(folder, 'bin');
      await mkdir(binFolder, { recursive: true });
      // Records every call; `gh release view` succeeds only for an existing release.
      await writeFile(
        join(binFolder, 'gh'),
        `#!/usr/bin/env bash\necho "$*" >> "${toPosix(ghLog)}"\nif [ "$2" = view ]; then exit ${isExistingRelease ? '0' : '1'}; fi\n`,
        { mode: 0o755 }
      );
      const outputPath = join(folder, 'output');
      await writeFile(outputPath, '');
      const result = runStep(getRun(release, 'Publish the release'), folder, {
        DRAFT: 'false',
        GITHUB_OUTPUT: toPosix(outputPath),
        PATH: `${binFolder}${delimiter}${process.env['PATH'] ?? ''}`,
        TAG: '1.2.3',
        ...env
      });
      const ghLogText = existsSync(ghLog) ? await readFile(ghLog, 'utf-8') : '';
      const calls = ghLogText ? ghLogText.trim().split('\n') : [];
      const outputs = await readFile(outputPath, 'utf-8');
      return { calls, outputs, result };
    }

    beforeEach(async () => {
      ghLog = join(folder, 'gh.log');
      await mkdir(join(folder, 'dist', 'build'), { recursive: true });
      await writeFile(join(folder, 'dist', 'build', 'main.js'), 'main');
      await writeFile(join(folder, 'dist', 'build', 'manifest.json'), '{}');
      await writeFile(join(folder, 'dist', 'build', 'styles.css'), '');
    });

    it('should create the release with every non-empty file in dist/build', async () => {
      const { calls, outputs, result } = await publish({});
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain('::warning::Leaving out dist/build/styles.css');
      expect(calls).toEqual([
        'release view 1.2.3',
        'release create 1.2.3 dist/build/main.js dist/build/manifest.json --title 1.2.3 --generate-notes --verify-tag'
      ]);
      expect(outputs).toBe('assets<<EOF\ndist/build/main.js\ndist/build/manifest.json\nEOF\n');
    });

    it('should make a pre-release of a tag with a dash, and a draft on request', async () => {
      const { calls } = await publish({ DRAFT: 'true', TAG: '1.3.0-beta.1' });
      expect(calls.at(-1)).toBe(
        'release create 1.3.0-beta.1 dist/build/main.js dist/build/manifest.json --title 1.3.0-beta.1 --generate-notes --verify-tag --prerelease --draft'
      );
    });

    it('should replace the assets of a release that exists', async () => {
      const { calls } = await publish({}, true);
      expect(calls.at(-1)).toBe('release upload 1.2.3 dist/build/main.js dist/build/manifest.json --clobber');
    });

    it('should fail when dist/build has nothing to release', async () => {
      await rm(join(folder, 'dist'), { recursive: true });
      const { calls, result } = await publish({});
      expect(result.status).toBe(1);
      expect(result.output).toContain('::error::dist/build has no file to release.');
      expect(calls).toEqual([]);
    });
  });

  // Each case spawns a dozen git processes, which take seconds on Windows.
  describe('Publish the coverage badge', { timeout: GIT_TIMEOUT_IN_MILLISECONDS }, () => {
    const REPOSITORY = 'owner/plugin';
    const TOKEN = 'token';
    let remote = '';

    async function publishBadge(svg: string): Promise<StepResult> {
      const ci = await readWorkflow('obsidian-plugin-ci.yml');
      const workspace = join(folder, 'workspace');
      await mkdir(join(workspace, 'coverage'), { recursive: true });
      await writeFile(join(workspace, 'coverage', 'coverage-badge.svg'), svg);
      const runnerTemporary = join(folder, 'runner-temp');
      await mkdir(runnerTemporary, { recursive: true });
      return runStep(getRun(ci, 'Publish the coverage badge'), workspace, {
        BRANCH: 'badges',
        GH_TOKEN: TOKEN,
        GIT_CONFIG_GLOBAL: join(folder, 'gitconfig'),
        GIT_CONFIG_NOSYSTEM: '1',
        GITHUB_REPOSITORY: REPOSITORY,
        GITHUB_WORKSPACE: toPosix(workspace),
        RUNNER_TEMP: toPosix(runnerTemporary)
      });
    }

    function git(...$arguments: string[]): string {
      return spawnSync('git', ['--git-dir', remote, ...$arguments], { encoding: 'utf-8' }).stdout.trim();
    }

    beforeEach(async () => {
      remote = join(folder, 'remote.git');
      spawnSync('git', ['init', '-q', '--bare', remote]);
      // The step pushes to github.com; this sends that URL to the local repository instead.
      await writeFile(
        join(folder, 'gitconfig'),
        `[url "${toPosix(remote)}"]\n\tinsteadOf = https://x-access-token:${TOKEN}@github.com/${REPOSITORY}.git\n`
      );
    }, BASH_TIMEOUT_IN_MILLISECONDS);

    it('should create the branch, update it, and leave an unchanged badge alone', async () => {
      const first = await publishBadge('<svg>1</svg>');
      expect(first.status, first.output).toBe(0);
      expect(git('show', 'badges:coverage.svg')).toBe('<svg>1</svg>');

      const second = await publishBadge('<svg>2</svg>');
      expect(second.status, second.output).toBe(0);
      expect(git('show', 'badges:coverage.svg')).toBe('<svg>2</svg>');
      expect(git('log', '--format=%s', 'badges').split('\n')).toEqual([
        'chore: update the coverage badge [skip ci]',
        'chore: update the coverage badge [skip ci]'
      ]);

      const third = await publishBadge('<svg>2</svg>');
      expect(third.status, third.output).toBe(0);
      expect(third.output).toContain('The coverage badge is unchanged.');
      expect(git('rev-list', '--count', 'badges')).toBe('2');
    });

    it('should keep the other files of the branch', async () => {
      const seed = join(folder, 'seed');
      spawnSync('git', ['init', '-q', '-b', 'badges', seed]);
      await writeFile(join(seed, 'other.svg'), '<svg>other</svg>');
      spawnSync('git', ['-C', seed, 'add', '.']);
      spawnSync('git', ['-C', seed, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'seed']);
      spawnSync('git', ['-C', seed, 'push', '-q', remote, 'badges']);

      const result = await publishBadge('<svg>1</svg>');
      expect(result.status, result.output).toBe(0);
      expect(git('ls-tree', '--name-only', 'badges').split('\n')).toEqual(['coverage.svg', 'other.svg']);
    });
  });
});
