/**
 * @file
 *
 * ESLint rule: require-plugin-api-contract-schemas
 *
 * Reports a method entry of a plugin API contract that lacks an `input` or an `output` schema.
 *
 * A typed `PluginApiContract<MyApi>` already refuses such an entry at compile time. The untyped default, the
 * structurally typed contracts a provider ships beside its `api.d.ts`, and every repository still on
 * `obsidian-dev-utils` get no such check, so a `{}` entry there compiles, declares only that the method exists, and
 * validates nothing. This rule closes that gap for every contract it can recognize.
 *
 * An object literal is read as a contract when it is:
 *
 * - the initializer of a variable typed `PluginApiContract` (or `TypedPluginApiContract`);
 * - the operand of `satisfies PluginApiContract` or `as PluginApiContract`;
 * - the value of a `contract` property of an object literal, as passed to `publishPluginApi`, `watchPluginApi` or
 *   `findPluginApi`;
 * - the initializer of a variable named `*_API_CONTRACT`, optionally followed by a `_V<n>` version suffix.
 *
 * Each of its entries is a method entry. An entry, or a contract, written as the name of a `const` is followed to
 * that constant's object literal, so a method contract shared by several entries is checked once per entry.
 *
 * Not attempted: an entry built by a call, read from another module, or carrying a spread cannot be read
 * statically, so it is skipped. The rule under-reports rather than guessing.
 */
import type { TSESTree } from '@typescript-eslint/utils';
import type {
  Rule,
  Scope
} from 'eslint';

import { toTSESTreeNode } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/ts-estree-node';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

/**
 * Message ID reported for a method entry that lacks a schema.
 */
export const MESSAGE_ID = 'requirePluginApiContractSchemas';

/**
 * The type names that mark an object literal as a plugin API contract.
 */
const CONTRACT_TYPE_NAMES = new Set(['PluginApiContract', 'TypedPluginApiContract']);

/**
 * The name of a variable holding a plugin API contract, such as `MY_API_CONTRACT` or `MY_API_CONTRACT_V2`.
 */
const CONTRACT_VARIABLE_NAME_PATTERN = /_API_CONTRACT(?:_V\d+)?$/;

/**
 * The property a contract is passed under.
 */
const CONTRACT_PROPERTY_NAME = 'contract';

/**
 * The schemas every method entry must declare.
 */
const REQUIRED_SCHEMA_NAMES = ['input', 'output'] as const;

/**
 * ESLint rule requiring both an `input` and an `output` schema on every method entry of a plugin API contract.
 */
export const requirePluginApiContractSchemas: Rule.RuleModule = {
  create(context) {
    const checkedContracts = new Set<TSESTree.ObjectExpression>();

    return {
      'Property'(node: Rule.Node): void {
        const propertyNode = toTSESTreeNode(node) as TSESTree.Property;
        if (
          propertyNode.parent.type === AST_NODE_TYPES.ObjectExpression && !propertyNode.computed
          && readKeyName(propertyNode.key) === CONTRACT_PROPERTY_NAME
        ) {
          reportContractEntries(propertyNode.value);
        }
      },
      'TSAsExpression, TSSatisfiesExpression'(node: Rule.Node): void {
        const expressionNode = toTSESTreeNode(node) as TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression;
        if (isContractType(expressionNode.typeAnnotation)) {
          reportContractEntries(expressionNode.expression);
        }
      },
      'VariableDeclarator'(node: Rule.Node): void {
        const declaratorNode = toTSESTreeNode(node) as TSESTree.VariableDeclarator;
        if (declaratorNode.id.type !== AST_NODE_TYPES.Identifier || !declaratorNode.init) {
          return;
        }

        const typeNode = declaratorNode.id.typeAnnotation?.typeAnnotation;
        if (CONTRACT_VARIABLE_NAME_PATTERN.test(declaratorNode.id.name) || (typeNode !== undefined && isContractType(typeNode))) {
          reportContractEntries(declaratorNode.init);
        }
      }
    };

    function reportContractEntries(node: TSESTree.Node): void {
      const contractNode = resolveObjectLiteral(node, context);
      if (!contractNode || checkedContracts.has(contractNode)) {
        return;
      }

      checkedContracts.add(contractNode);

      for (const entry of contractNode.properties) {
        if (entry.type !== AST_NODE_TYPES.Property) {
          continue;
        }

        const missingSchemaNames = readMissingSchemaNames(entry.value, context);
        if (missingSchemaNames.length === 0) {
          continue;
        }

        context.report({
          data: {
            method: (entry.computed ? null : readKeyName(entry.key)) ?? '[computed]',
            missing: missingSchemaNames.map((name) => `\`${name}\``).join(' and ')
          },
          loc: entry.key.loc,
          messageId: MESSAGE_ID
        });
      }
    }
  },
  meta: {
    docs: {
      description: 'Require an `input` and an `output` schema on every method entry of a plugin API contract'
    },
    messages: {
      [MESSAGE_ID]: 'The plugin API contract entry `{{ method }}` declares no {{ missing }} schema. Give every method entry both an `input` schema over its argument list and an `output` schema over its awaited return value.'
    },
    schema: [],
    type: 'problem'
  }
};

/**
 * Finds a variable by name, walking outwards from the given scope.
 *
 * @param scope - The scope to start from.
 * @param name - The variable's name.
 * @returns The variable, or `null` when nothing in scope declares that name.
 */
function findVariable(scope: Scope.Scope, name: string): null | Scope.Variable {
  let currentScope: null | Scope.Scope = scope;

  while (currentScope) {
    const variable = currentScope.set.get(name);
    if (variable) {
      return variable;
    }
    currentScope = currentScope.upper;
  }

  return null;
}

/**
 * Checks whether a type names a plugin API contract, directly or through a namespace.
 *
 * @param typeNode - The type.
 * @returns `true` when the type is a contract type.
 */
function isContractType(typeNode: TSESTree.TypeNode): boolean {
  if (typeNode.type !== AST_NODE_TYPES.TSTypeReference) {
    return false;
  }

  const typeName = typeNode.typeName;
  return typeName.type === AST_NODE_TYPES.Identifier ? CONTRACT_TYPE_NAMES.has(typeName.name) : typeName.type === AST_NODE_TYPES.TSQualifiedName && CONTRACT_TYPE_NAMES.has(typeName.right.name);
}

/**
 * Reads the name of a property key written as an identifier or a string literal.
 *
 * @param key - The property key.
 * @returns The name, or `null` for any other key.
 */
function readKeyName(key: TSESTree.Node): null | string {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  return key.type === AST_NODE_TYPES.Literal && typeof key.value === 'string' ? key.value : null;
}

/**
 * Reads which required schemas a method entry lacks.
 *
 * @param node - The entry's value.
 * @param context - The rule context, used to follow a constant.
 * @returns The missing schema names, empty when none is missing or the entry cannot be read statically.
 */
function readMissingSchemaNames(node: TSESTree.Node, context: Rule.RuleContext): string[] {
  const entryNode = resolveObjectLiteral(node, context);
  if (!entryNode) {
    return [];
  }

  const keyNames = new Set<string>();
  for (const member of entryNode.properties) {
    if (member.type !== AST_NODE_TYPES.Property) {
      return [];
    }

    const keyName = member.computed ? null : readKeyName(member.key);
    if (keyName !== null) {
      keyNames.add(keyName);
    }
  }

  return REQUIRED_SCHEMA_NAMES.filter((name) => !keyNames.has(name));
}

/**
 * Resolves an identifier to the initializer of the `const` it names.
 *
 * @param node - The identifier.
 * @param context - The rule context, used to resolve the identifier through scope.
 * @returns The initializer, or `null` when the identifier names anything else.
 */
function resolveConstInit(node: TSESTree.Identifier, context: Rule.RuleContext): null | TSESTree.Expression {
  const variable = findVariable(context.sourceCode.getScope(node), node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type !== 'Variable') {
    return null;
  }

  const declaratorNode = toTSESTreeNode(definition.node) as TSESTree.VariableDeclarator;
  const declarationNode = declaratorNode.parent;
  return declarationNode.kind === 'const' ? declaratorNode.init : null;
}

/**
 * Resolves an expression to the object literal it is, stepping through `as` / `satisfies` / `!` and following a
 * `const` it names.
 *
 * @param node - The expression.
 * @param context - The rule context, used to resolve an identifier through scope.
 * @returns The object literal, or `null` when the expression is not one statically.
 */
function resolveObjectLiteral(node: TSESTree.Node, context: Rule.RuleContext): null | TSESTree.ObjectExpression {
  const visitedNodes = new Set<TSESTree.Node>();
  let currentNode: TSESTree.Node = node;

  while (!visitedNodes.has(currentNode)) {
    visitedNodes.add(currentNode);

    switch (currentNode.type) {
      case AST_NODE_TYPES.Identifier: {
        const initNode = resolveConstInit(currentNode, context);
        if (!initNode) {
          return null;
        }
        currentNode = initNode;
        break;
      }
      case AST_NODE_TYPES.ObjectExpression: {
        return currentNode;
      }
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSSatisfiesExpression: {
        currentNode = currentNode.expression;
        break;
      }
      default: {
        return null;
      }
    }
  }

  return null;
}
