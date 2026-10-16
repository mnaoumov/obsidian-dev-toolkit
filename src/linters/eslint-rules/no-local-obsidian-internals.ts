/**
 * @file
 *
 * ESLint rule: no-local-obsidian-internals
 *
 * Reports every member a `declare module 'obsidian'` augmentation adds to Obsidian's types.
 *
 * Obsidian's internal (undocumented) API is typed in `obsidian-typings`, where each member is checked against the
 * shipped `app.js` on every release that has it. A local augmentation is a second, unchecked copy of the same
 * claim: it drifts from what Obsidian actually ships, and when `obsidian-typings` gains the member the two
 * declarations merge silently, or clash. The fix for a member `obsidian-typings` lacks or declares wrongly goes
 * into `obsidian-typings`, and the consumer imports it from there.
 *
 * One shape is exempt: an overload of `on`, `off`, `trigger` or `tryTrigger` whose first parameter is a
 * string-literal type, or a union of them. That is how a plugin types its OWN custom events on `Workspace` or
 * another `Events` subclass, so it describes the plugin's code rather than Obsidian's. A name typed through an
 * alias (`name: MyEventName`) is recognized only when the file is linted with type information, which the shared
 * configuration always has.
 *
 * Only the module named exactly `obsidian` is read. A `declare module 'obsidian-typings'` augmentation of
 * `PluginsPluginsRecord` is `obsidian-typings`' designed extension point for third-party plugin types, and is
 * not reported.
 *
 * Not attempted: a local interface or an inline cast that spells an internal shape cannot be told apart from a
 * repository's own types mechanically, so those are left to review.
 */
import type {
  ParserServices,
  TSESTree
} from '@typescript-eslint/utils';
import type { Rule } from 'eslint';
import type { TypeNode } from 'typescript';

import { toTSESTreeNode } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/ts-estree-node';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

/**
Message ID reported for a member a `declare module 'obsidian'` augmentation adds.
 */
export const MESSAGE_ID = 'noLocalObsidianInternals';

/**
The module name whose augmentations are reported.
 */
const OBSIDIAN_MODULE_NAME = 'obsidian';

/**
The `Events` methods a custom-event overload may be declared on.
 */
const EVENT_METHOD_NAMES = new Set(['off', 'on', 'trigger', 'tryTrigger']);

/**
 * Checks whether a type is a string-literal type, or a union made only of them.
 */
type StringLiteralTypeCheck = (typeNode: TSESTree.TypeNode) => boolean;

/**
 * ESLint rule disallowing locally declared Obsidian internals in a `declare module 'obsidian'` augmentation.
 */
export const noLocalObsidianInternals: Rule.RuleModule = {
  create(context) {
    return {
      'TSModuleDeclaration'(node: Rule.Node): void {
        const moduleNode = toTSESTreeNode(node) as TSESTree.TSModuleDeclaration;

        if (moduleNode.id.type !== AST_NODE_TYPES.Literal || moduleNode.id.value !== OBSIDIAN_MODULE_NAME || !moduleNode.body) {
          return;
        }

        const isStringLiteralType = createStringLiteralTypeCheck(context);

        for (const statement of moduleNode.body.body) {
          for (const reported of collectReportedNodes(statement, isStringLiteralType)) {
            context.report({
              data: { name: describeNode(reported) },
              loc: reported.loc,
              messageId: MESSAGE_ID
            });
          }
        }
      }
    };
  },
  meta: {
    docs: {
      description: 'Disallow declaring Obsidian internals locally in a `declare module \'obsidian\'` augmentation'
    },
    messages: {
      [MESSAGE_ID]: '`{{ name }}` declares Obsidian API locally. Import it from `obsidian-typings` instead, adding it there first if it is missing or wrong. Only a custom-event overload of `on` / `off` / `trigger` / `tryTrigger` may stay here.'
    },
    schema: [],
    type: 'problem'
  }
};

/**
 * Collects the nodes to report for one statement of a `declare module 'obsidian'` block.
 *
 * An interface is reported member by member, so a custom-event overload can sit beside a reported member, and its
 * `extends` clause is reported too, since that bolts members on as surely as declaring them. Any other statement
 * (a class, a function, a type alias, a variable) is reported whole.
 *
 * @param statement - A statement of the module block.
 * @param isStringLiteralType - The check of whether a type is a string-literal type or a union of them.
 * @returns The nodes to report.
 */
function collectReportedNodes(statement: TSESTree.ProgramStatement, isStringLiteralType: StringLiteralTypeCheck): TSESTree.Node[] {
  const declaration = statement.type === AST_NODE_TYPES.ExportNamedDeclaration && statement.declaration ? statement.declaration : statement;

  if (declaration.type !== AST_NODE_TYPES.TSInterfaceDeclaration) {
    return [declaration];
  }

  return [
    ...declaration.extends,
    ...declaration.body.body.filter((member) => !isCustomEventOverload(member, isStringLiteralType))
  ];
}

/**
 * Creates the check of whether a type is a string-literal type, or a union made only of them.
 *
 * A type written out as literals (`'my-event' | 'other-event'`) is recognized from the syntax alone. A type reached
 * through an alias (`name: MyEventName`) needs the type checker, so it is recognized only when the file is linted
 * with type information, and reported otherwise.
 *
 * @param context - The rule context.
 * @returns The check.
 */
function createStringLiteralTypeCheck(context: Rule.RuleContext): StringLiteralTypeCheck {
  const services = context.sourceCode.parserServices as ParserServices;
  const checker = services.program?.getTypeChecker() ?? null;

  return isStringLiteralType;

  function isStringLiteralType(typeNode: TSESTree.TypeNode): boolean {
    if (typeNode.type === AST_NODE_TYPES.TSUnionType) {
      return typeNode.types.every((member) => isStringLiteralType(member));
    }

    if (typeNode.type === AST_NODE_TYPES.TSLiteralType) {
      return typeNode.literal.type === AST_NODE_TYPES.Literal && typeof typeNode.literal.value === 'string';
    }

    if (!checker) {
      return false;
    }

    const type = checker.getTypeFromTypeNode(services.esTreeNodeToTSNodeMap.get(typeNode) as TypeNode);
    return type.isUnion() ? type.types.every((member) => member.isStringLiteral()) : type.isStringLiteral();
  }
}

/**
 * Names a reported node for the message.
 *
 * @param node - The reported node.
 * @returns The name to show.
 */
function describeNode(node: TSESTree.Node): string {
  switch (node.type) {
    case AST_NODE_TYPES.ClassDeclaration:
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.TSDeclareFunction:
    case AST_NODE_TYPES.TSEnumDeclaration:
    case AST_NODE_TYPES.TSModuleDeclaration:
    case AST_NODE_TYPES.TSTypeAliasDeclaration: {
      return node.id?.type === AST_NODE_TYPES.Identifier ? node.id.name : node.type;
    }
    case AST_NODE_TYPES.TSInterfaceHeritage: {
      return node.expression.type === AST_NODE_TYPES.Identifier ? `extends ${node.expression.name}` : 'extends';
    }
    case AST_NODE_TYPES.TSMethodSignature:
    case AST_NODE_TYPES.TSPropertySignature: {
      return readKeyName(node.key) ?? node.type;
    }
    default: {
      return node.type;
    }
  }
}

/**
 * Checks whether an interface member is a custom-event overload: an `on` / `off` / `trigger` / `tryTrigger` method
 * whose first parameter is typed as a string-literal type or a union of them.
 *
 * @param member - The interface member.
 * @param isStringLiteralType - The check of whether a type is a string-literal type or a union of them.
 * @returns `true` when the member is exempt.
 */
function isCustomEventOverload(member: TSESTree.TypeElement, isStringLiteralType: StringLiteralTypeCheck): boolean {
  if (member.type !== AST_NODE_TYPES.TSMethodSignature) {
    return false;
  }

  const name = readKeyName(member.key);
  if (name === null || !EVENT_METHOD_NAMES.has(name)) {
    return false;
  }

  const firstParameter = member.params[0];
  return firstParameter?.type === AST_NODE_TYPES.Identifier && firstParameter.typeAnnotation !== undefined
    && isStringLiteralType(firstParameter.typeAnnotation.typeAnnotation);
}

/**
 * Reads the name of a member key written as an identifier or a string literal.
 *
 * @param key - The member key.
 * @returns The name, or `null` for a computed key.
 */
function readKeyName(key: TSESTree.PropertyName): null | string {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string' ? key.value : null;
}
