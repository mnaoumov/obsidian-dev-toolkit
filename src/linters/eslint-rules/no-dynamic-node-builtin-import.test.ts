import { toRuleTesterModule } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/rule-tester-helper';
import { RuleTester } from '@typescript-eslint/rule-tester';
import {
  afterAll,
  describe,
  it
} from 'vitest';

import {
  MESSAGE_ID,
  noDynamicNodeBuiltinImport
} from './no-dynamic-node-builtin-import.ts';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

interface ExpectedError {
  readonly data: SpecifierData;
  readonly messageId: string;
}

interface SpecifierData {
  readonly specifier: string;
}

function error(specifier: string): ExpectedError {
  return { data: { specifier }, messageId: MESSAGE_ID };
}

ruleTester.run('no-dynamic-node-builtin-import', toRuleTesterModule(noDynamicNodeBuiltinImport), {
  invalid: [
    {
      code: 'const { execFile } = await import(\'node:child_process\');',
      errors: [error('node:child_process')],
      name: 'a node: prefixed builtin'
    },
    {
      code: 'await import("fs/promises");',
      errors: [error('fs/promises')],
      name: 'a bare builtin subpath'
    },
    {
      code: 'void import(`path`);',
      errors: [error('path')],
      name: 'a template literal without substitutions'
    },
    {
      code: 'if (Platform.isDesktopApp) { await import(\'node:util\'); }',
      errors: [error('node:util')],
      name: 'a platform-gated call, which still fails in the renderer'
    }
  ],
  valid: [
    {
      code: 'import { execFile } from \'node:child_process\';',
      name: 'a static import, which esbuild compiles to require()'
    },
    {
      code: 'type Fs = typeof import(\'node:fs\'); const fs = require(\'node:fs\') as typeof import(\'node:fs\');',
      name: 'an import type query, which emits nothing'
    },
    {
      code: 'const { runGit } = await import(\'./desktop-git-runner.ts\'); await import(\'obsidian\'); await import(\'pathe\');',
      name: 'a module that is not a builtin'
    },
    {
      // eslint-disable-next-line no-template-curly-in-string -- The fixture is source code holding a template literal.
      code: 'await import(name); await import(`node:${name}`); await import(42);',
      name: 'a specifier that is not a static string'
    },
    {
      code: 'await import(\'test\');',
      name: 'a name that is a builtin only with the node: prefix'
    }
  ]
});
