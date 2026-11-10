/**
 * @file
 *
 * Parses every emitted JavaScript module of the published output, so a bundle that does not parse fails the build
 * instead of shipping.
 *
 * @remarks
 * `9.1.0` shipped `no-dynamic-node-builtin-import.mjs` with a syntax error: the library build's extension rewrite
 * matched an `import('…')` inside a string literal and re-quoted it with double quotes, which ended the string. Nothing
 * after `esbuild` checked the text it wrote, so every consumer's lint aborted on load.
 */

import type { Options } from 'acorn';

import { parse } from 'acorn';
import {
  readdir,
  readFile
} from 'node:fs/promises';
import {
  extname,
  join
} from 'node:path';

const MODULE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);

/**
 * A module that failed to parse.
 */
export interface SyntaxProblem {
  /**
   * The parser's message, with its line and column.
   */
  readonly message: string;

  /**
   * The module's path.
   */
  readonly path: string;
}

/**
 * The outcome of {@link validateBuiltSyntax}.
 */
export interface ValidateBuiltSyntaxResult {
  /**
   * How many modules were parsed.
   */
  readonly checkedCount: number;

  /**
   * The modules that failed to parse.
   */
  readonly problems: readonly SyntaxProblem[];
}

/**
 * Parses one module's text the way Node would load it.
 *
 * @param path - The module's path; its extension picks the source type.
 * @param text - The module's text.
 * @returns The problem, or `null` when the text parses.
 */
export function findSyntaxProblem(path: string, text: string): null | SyntaxProblem {
  const isCommonJs = extname(path) === '.cjs';
  const options: Options = {
    allowHashBang: true,
    allowReturnOutsideFunction: isCommonJs,
    ecmaVersion: 'latest',
    sourceType: isCommonJs ? 'script' : 'module'
  };

  try {
    parse(text, options);
    return null;
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
      path
    };
  }
}

/**
 * Parses every `.cjs`, `.js` and `.mjs` file under the given folders.
 *
 * @param folders - The folders to scan, recursively; a missing one is skipped.
 * @returns The modules that failed to parse, and how many were checked.
 */
export async function validateBuiltSyntax(folders: readonly string[]): Promise<ValidateBuiltSyntaxResult> {
  const problems: SyntaxProblem[] = [];
  let checkedCount = 0;

  for (const folder of folders) {
    for (const path of await listModules(folder)) {
      checkedCount++;
      const problem = findSyntaxProblem(path, await readFile(path, 'utf-8'));
      if (problem) {
        problems.push(problem);
      }
    }
  }

  return { checkedCount, problems };
}

async function listModules(folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(folder, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && MODULE_EXTENSIONS.has(extname(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}
