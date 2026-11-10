import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import {
  findSyntaxProblem,
  validateBuiltSyntax
} from './validate-built-syntax.ts';

describe('findSyntaxProblem', () => {
  it('accepts a valid ES module', () => {
    expect(findSyntaxProblem('a.mjs', 'export const a = await import("./b.mjs");')).toBeNull();
  });

  it('accepts a CommonJS module with a top-level return and a hashbang', () => {
    expect(findSyntaxProblem('a.cjs', '#!/usr/bin/env node\nif (x) { return; }\nmodule.exports = 1;')).toBeNull();
  });

  it('reports the 9.1.0 shape: a string ended early by a re-quoted import()', () => {
    const problem = findSyntaxProblem('rule.mjs', 'const message = "A dynamic `import("{{specifier}}")` stays";');
    expect(problem?.path).toBe('rule.mjs');
    expect(problem?.message).toMatch(/\(1:\d+\)/);
  });
});

describe('validateBuiltSyntax', () => {
  let root = '';

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('parses every module under the folders, skips other files and missing folders', async () => {
    root = await mkdtemp(join(tmpdir(), 'validate-built-syntax-'));
    await mkdir(join(root, 'lib', 'nested'), { recursive: true });
    await writeFile(join(root, 'lib', 'good.mjs'), 'export {};');
    await writeFile(join(root, 'lib', 'nested', 'bad.js'), 'const = 1;');
    await writeFile(join(root, 'lib', 'notes.d.ts'), 'const = 1;');

    const result = await validateBuiltSyntax([join(root, 'lib'), join(root, 'missing')]);

    expect(result.checkedCount).toBe(2);
    expect(result.problems.map((problem) => problem.path)).toEqual([join(root, 'lib', 'nested', 'bad.js')]);
  });
});
