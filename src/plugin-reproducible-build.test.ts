import type {
  ReproducibleBuildCommandResult,
  ReproducibleBuildDependencies,
  ReproducibleBuildRunOptions
} from '@mnaoumov/typescript-dev-toolkit/reproducible-build';

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  assertObsidianPluginReproducibleBuild,
  getObsidianPluginReproducibleOutputPaths
} from './plugin-reproducible-build.ts';

interface BuildCall {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>> | undefined;
}

interface FakeOptions {
  readonly copyFiles?: Readonly<Record<string, string>>;
  readonly projectExitCode?: number;
  readonly projectFiles: Readonly<Record<string, string>>;
}

interface FakeWorld {
  readonly builds: BuildCall[];
  readonly dependencies: ReproducibleBuildDependencies;
}

const SUCCESS: ReproducibleBuildCommandResult = { exitCode: 0, stderr: '', stdout: '' };

describe('plugin-reproducible-build', () => {
  let projectFolder: string;

  beforeEach(() => {
    projectFolder = mkdtempSync(join(tmpdir(), 'plugin-reproducible-build-'));
  });

  afterEach(() => {
    rmSync(projectFolder, { force: true, recursive: true });
  });

  function createWorld(options: FakeOptions): FakeWorld {
    const builds: BuildCall[] = [];
    const dependencies: ReproducibleBuildDependencies = {
      log(): void {
        // Progress is not asserted.
      },
      // eslint-disable-next-line @typescript-eslint/require-await -- Implements an async interface.
      async run(command: readonly string[], runOptions: ReproducibleBuildRunOptions): Promise<ReproducibleBuildCommandResult> {
        if (command[0] === 'git' && command.includes('rev-parse')) {
          return { exitCode: 0, stderr: '', stdout: 'abc1234\n' };
        }
        if (command[0] === 'npm') {
          builds.push({ cwd: runOptions.cwd, env: runOptions.env });
          const isProject = runOptions.cwd === projectFolder;
          if (isProject && options.projectExitCode !== undefined) {
            return { exitCode: options.projectExitCode, stderr: 'boom', stdout: 'compiling' };
          }
          writeFiles(runOptions.cwd, isProject ? options.projectFiles : options.copyFiles ?? options.projectFiles);
        }
        return SUCCESS;
      }
    };
    return { builds, dependencies };
  }

  describe('assertObsidianPluginReproducibleBuild', () => {
    it('compares main.js alone when the build writes no styles.css, and builds the copy with preserved symlinks', async () => {
      const world = createWorld({ projectFiles: { 'dist/build/main.js': 'bundle' } });
      await assertObsidianPluginReproducibleBuild({ dependencies: world.dependencies, projectFolder });
      expect(world.builds).toHaveLength(2);
      expect(world.builds[0]?.cwd).toBe(projectFolder);
      expect(world.builds[1]?.env).toEqual({ NODE_PRESERVE_SYMLINKS: '1' });
    });

    it('reports a styles.css that differs', async () => {
      const world = createWorld({
        copyFiles: { 'dist/build/main.js': 'bundle', 'dist/build/styles.css': 'b' },
        projectFiles: { 'dist/build/main.js': 'bundle', 'dist/build/styles.css': 'a' }
      });
      await expect(assertObsidianPluginReproducibleBuild({ dependencies: world.dependencies, projectFolder })).rejects.toThrow(
        'dist/build/styles.css differs'
      );
    });

    it('reports a main.js the committed tree does not build', async () => {
      const world = createWorld({ copyFiles: {}, projectFiles: { 'dist/build/main.js': 'bundle' } });
      await expect(assertObsidianPluginReproducibleBuild({ dependencies: world.dependencies, projectFolder })).rejects.toThrow(
        'dist/build/main.js is built from the working tree but not from the committed tree'
      );
    });

    it('fails when the working tree does not build', async () => {
      const world = createWorld({ projectExitCode: 2, projectFiles: {} });
      await expect(assertObsidianPluginReproducibleBuild({ dependencies: world.dependencies, projectFolder })).rejects.toThrow(
        /the working tree does not build: npm run build exited with 2\.\ncompiling\nboom/
      );
    });

    it('compares the output the last build left when told not to build the working tree', async () => {
      writeFiles(projectFolder, { 'out/main.js': 'bundle' });
      const world = createWorld({ projectFiles: { 'out/main.js': 'bundle' } });
      await assertObsidianPluginReproducibleBuild({
        buildCommand: ['npm', 'run', 'build:plugin'],
        dependencies: world.dependencies,
        distFolder: 'out',
        projectFolder,
        shouldBuildWorkingTree: false
      });
      expect(world.builds.map((build) => build.cwd)).not.toContain(projectFolder);
    });

    it('compares the given output paths instead', async () => {
      const world = createWorld({ projectFiles: { 'dist/build/main.js': 'bundle', 'dist/build/manifest.json': '{}' } });
      await assertObsidianPluginReproducibleBuild({ dependencies: world.dependencies, outputPaths: ['dist/build'], projectFolder });
      expect(world.builds).toHaveLength(2);
    });
  });

  describe('getObsidianPluginReproducibleOutputPaths', () => {
    it('names main.js, and styles.css when present, under an absolute dist folder', () => {
      writeFiles(projectFolder, { 'custom/styles.css': '' });
      expect(getObsidianPluginReproducibleOutputPaths({ distFolder: join(projectFolder, 'custom'), projectFolder })).toEqual([
        'custom/main.js',
        'custom/styles.css'
      ]);
    });
  });
});

function writeFiles(folder: string, files: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(folder, path);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}
