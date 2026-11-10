/**
 * @file
 *
 * ESLint rule: no-dynamic-node-builtin-import
 *
 * Reports a dynamic `import()` of a Node builtin - `import('node:child_process')`, or a bare builtin name such as
 * `import('fs/promises')` - in a plugin's shipped source. A plugin is bundled as CommonJS with the builtins external,
 * and `esbuild` then leaves such an `import()` as a native dynamic import in `main.js`, rather than turning it into a
 * `require()`. Obsidian's renderer cannot load a `node:` (or bare builtin) specifier through `import()`, so the code
 * fails only when the call runs, and a `catch` around it turns the failure into silence: a desktop git runner shipped
 * that way lost every git rename it was meant to record.
 *
 * The working shape is a static import in a `desktop-` module, which `esbuild` compiles to a `require()` that
 * Obsidian's desktop renderer resolves, reached from the cross-platform caller through a `Platform.isDesktopApp`-gated
 * dynamic `import()` of that module. The specifier is read when it is a string literal, or a template literal without
 * substitutions; a computed specifier is left alone. Tests are not linted by it: they run in Node, where the import
 * works.
 */

import type { Rule } from 'eslint';
import type {
  Expression,
  ImportExpression
} from 'estree';

import { isBuiltin } from 'node:module';

/**
 * Message ID reported for a dynamic import of a Node builtin.
 */
export const MESSAGE_ID = 'noDynamicNodeBuiltinImport';

/**
 * ESLint rule forbidding a dynamic `import()` of a Node builtin in plugin source.
 */
export const noDynamicNodeBuiltinImport: Rule.RuleModule = {
  create(context) {
    return {
      ImportExpression(node: ImportExpression): void {
        const specifier = getStaticSpecifier(node.source);
        if (specifier !== null && isBuiltin(specifier)) {
          context.report({
            data: { specifier },
            messageId: MESSAGE_ID,
            node
          });
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Forbid a dynamic `import()` of a Node builtin, which a CommonJS plugin bundle keeps as a native import that Obsidian\'s renderer cannot load'
    },
    messages: {
      [MESSAGE_ID]: 'A dynamic `import(\'{{specifier}}\')` stays a native `import()` in a CommonJS plugin bundle, and Obsidian\'s renderer cannot load it, so it fails when it runs. Import the builtin statically in a `desktop-` module, which `esbuild` compiles to `require()`, and reach that module through a `Platform.isDesktopApp`-gated dynamic `import()`.'
    },
    schema: [],
    type: 'problem'
  }
};

/**
 * Reads the specifier of an `import()` when it is static.
 *
 * @param source - The `import()` source expression.
 * @returns The specifier, or `null` when it is computed.
 */
function getStaticSpecifier(source: Expression): null | string {
  switch (source.type) {
    case 'Literal': {
      return typeof source.value === 'string' ? source.value : null;
    }
    case 'TemplateLiteral': {
      return source.expressions.length === 0 ? source.quasis.map((quasi) => quasi.value.cooked).join('') : null;
    }
    default: {
      return null;
    }
  }
}
