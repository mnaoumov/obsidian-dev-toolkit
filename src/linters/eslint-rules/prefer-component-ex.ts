/**
 * @file
 *
 * ESLint rule: prefer-component-ex
 *
 * Reports a class that extends Obsidian's raw `Component` (`import { Component } from 'obsidian'`, or
 * `obsidian.Component` through a namespace import) and points it to `ComponentEx` from `@mnaoumov/obsidian-lib`.
 * `ComponentEx` is a `Component` that also tracks its children, makes an async load awaitable (`onloadAsync`,
 * `loadWithPromises`) and collects its load errors, implements `Disposable`, and refuses a child added after unload
 * instead of leaking it. Every plugin built with this toolkit already depends on `obsidian-lib`, so a raw `Component`
 * gives all of that up for nothing.
 *
 * A class extending another Obsidian `Component` subclass (`Plugin`, `View`, `MarkdownRenderChild`, `Modal`...) is
 * not reported: only a direct `extends Component` is. A genuine exception, such as `ComponentEx` itself, disables
 * the rule on the line with its reason.
 *
 * The autofix runs only when the swap is mechanical: the superclass is the named `Component` import, and the class
 * declares no member that `ComponentEx` already defines, since a member with such a name would override or clash
 * with it. The fix replaces the superclass, adds the `ComponentEx` import unless one is there, and removes the
 * `Component` import specifier when the superclass was its only reference.
 */
import type { TSESTree } from '@typescript-eslint/utils';
import type { Rule } from 'eslint';

import { toTSESTreeNode } from '@mnaoumov/typescript-dev-toolkit/linters/eslint-rules/ts-estree-node';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  AST_NODE_TYPES,
  TSESLint
} from '@typescript-eslint/utils';

/**
Message ID reported for a class that extends Obsidian's raw `Component`.
 */
export const MESSAGE_ID = 'preferComponentEx';

/**
The module `ComponentEx` is imported from by the autofix.
 */
export const COMPONENT_EX_MODULE = '@mnaoumov/obsidian-lib/components/component-ex';

/**
The modules a `ComponentEx` import is recognized from.
 */
const COMPONENT_EX_MODULES = new Set([
  '@mnaoumov/obsidian-lib',
  '@mnaoumov/obsidian-lib/components',
  COMPONENT_EX_MODULE
]);

const COMPONENT_EX_NAME = 'ComponentEx';
const COMPONENT_NAME = 'Component';
const OBSIDIAN_MODULE = 'obsidian';

/**
 * The members `ComponentEx` declares, public, protected and private alike. A class declaring one of them is not
 * autofixed, because the member would override or clash with the one it inherits.
 */
const COMPONENT_EX_MEMBER_NAMES = new Set([
  'addChild',
  'appendEagerLoadStep',
  'appendSequentialLoadStep',
  'captureError',
  'captureSettled',
  'captureSync',
  'childrenSet',
  'ensureLoaded',
  'extractLoadPromisable',
  'findInFlightAncestryLoadPromise',
  'getInFlightAncestryLoadPromise',
  'getInFlightLoadPromise',
  'hasBeenLoaded',
  'hasChild',
  'hasLoadErrors',
  'isUnloaded',
  'load',
  'loadErrors',
  'loadPromise',
  'loadWithPromises',
  'onloadAsync',
  'parentComponent',
  'registerAsyncDisposable',
  'registerDisposable',
  'removeChild',
  'resetLoadState',
  'runAndCapture',
  'setLoadPromise',
  'waitForAncestryLoad'
]);

type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

type RuleContext = Readonly<TSESLint.RuleContext<typeof MESSAGE_ID, []>>;

/**
 * ESLint rule preferring `ComponentEx` from `@mnaoumov/obsidian-lib` over Obsidian's raw `Component` as a base class.
 */
export const preferComponentEx: Rule.RuleModule = {
  create(context) {
    const tsContext = castTo<RuleContext>(context);
    return {
      ClassDeclaration(node: Rule.Node): void {
        reportClass(tsContext, toTSESTreeNode(node) as ClassNode);
      },
      ClassExpression(node: Rule.Node): void {
        reportClass(tsContext, toTSESTreeNode(node) as ClassNode);
      }
    };
  },
  meta: {
    docs: {
      description: 'Prefer `ComponentEx` from `@mnaoumov/obsidian-lib` over Obsidian\'s raw `Component` as a base class'
    },
    fixable: 'code',
    messages: {
      [MESSAGE_ID]: 'Extend `ComponentEx` from `@mnaoumov/obsidian-lib` instead of Obsidian\'s raw `Component`: it tracks its children, makes an async load awaitable and implements `Disposable`. If the raw `Component` is really needed here, disable this rule on the line with the reason.'
    },
    schema: [],
    type: 'suggestion'
  }
};

function buildFix(context: RuleContext, classNode: ClassNode, componentVariable: TSESLint.Scope.Variable): null | TSESLint.ReportFixFunction {
  if (hasComponentExMember(classNode)) {
    return null;
  }

  const superClass = classNode.superClass;
  /* v8 ignore start -- Only called for a class whose superclass was resolved to the `Component` import. */
  if (!superClass) {
    return null;
  }
  /* v8 ignore stop */

  const sourceCode = context.sourceCode;
  const program = sourceCode.ast;
  const existingComponentExName = findComponentExImportName(program);
  const componentExName = existingComponentExName ?? COMPONENT_EX_NAME;

  if (existingComponentExName === null && findVariable(sourceCode.getScope(classNode), COMPONENT_EX_NAME)) {
    return null;
  }

  return (fixer) => {
    const fixes: TSESLint.RuleFix[] = [fixer.replaceText(superClass, componentExName)];
    const importText = `import { ${COMPONENT_EX_NAME} } from '${COMPONENT_EX_MODULE}';`;
    const shouldRemoveComponentImport = componentVariable.references.length === 1;
    const componentDeclaration = componentVariable.defs[0]?.parent;

    if (
      existingComponentExName === null && shouldRemoveComponentImport
      && componentDeclaration?.type === AST_NODE_TYPES.ImportDeclaration && componentDeclaration.specifiers.length === 1
    ) {
      // The `obsidian` import goes away whole: the `ComponentEx` import takes its place, so the two edits never overlap.
      fixes.push(fixer.replaceText(componentDeclaration, importText));
      return fixes;
    }

    if (existingComponentExName === null) {
      const lastImport = findLastImportDeclaration(program);
      /* v8 ignore next -- The superclass is an `obsidian` import, so the file always has an import declaration. */
      fixes.push(lastImport ? fixer.insertTextAfter(lastImport, `\n${importText}`) : fixer.insertTextBeforeRange([0, 0], `${importText}\n`));
    }

    if (shouldRemoveComponentImport) {
      fixes.push(...removeImportSpecifier(context, fixer, componentVariable));
    }

    return fixes;
  };
}

function findComponentExImportName(program: TSESTree.Program): null | string {
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration || statement.importKind === 'type'
      || !COMPONENT_EX_MODULES.has(statement.source.value)
    ) {
      continue;
    }

    for (const specifier of statement.specifiers) {
      if (
        specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type'
        && getImportedName(specifier) === COMPONENT_EX_NAME
      ) {
        return specifier.local.name;
      }
    }
  }

  return null;
}

function findLastImportDeclaration(program: TSESTree.Program): null | TSESTree.ImportDeclaration {
  let lastImport: null | TSESTree.ImportDeclaration = null;
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      lastImport = statement;
    }
  }
  return lastImport;
}

function findVariable(initialScope: null | TSESLint.Scope.Scope, name: string): null | TSESLint.Scope.Variable {
  let scope = initialScope;
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

function getImportedName(specifier: TSESTree.ImportSpecifier): string {
  return specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : specifier.imported.value;
}

function getObsidianImportDefinition(variable: TSESLint.Scope.Variable): null | TSESTree.ImportClause {
  const definition = variable.defs[0];
  if (variable.defs.length !== 1 || definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding) {
    return null;
  }

  const declaration = definition.parent;
  const isObsidianValueImport = declaration.type === AST_NODE_TYPES.ImportDeclaration && declaration.importKind !== 'type'
    && declaration.source.value === OBSIDIAN_MODULE;
  return isObsidianValueImport ? definition.node as TSESTree.ImportClause : null;
}

function hasComponentExMember(classNode: ClassNode): boolean {
  return classNode.body.body.some((member) => {
    if (
      member.type !== AST_NODE_TYPES.MethodDefinition
      && member.type !== AST_NODE_TYPES.PropertyDefinition
      && member.type !== AST_NODE_TYPES.TSAbstractMethodDefinition
      && member.type !== AST_NODE_TYPES.TSAbstractPropertyDefinition
      && member.type !== AST_NODE_TYPES.AccessorProperty
    ) {
      return false;
    }

    const key = member.key;
    return member.computed ? isSymbolDispose(key) : key.type === AST_NODE_TYPES.Identifier && COMPONENT_EX_MEMBER_NAMES.has(key.name);
  });
}

function isObsidianComponentImport(variable: TSESLint.Scope.Variable): boolean {
  const specifier = getObsidianImportDefinition(variable);
  return specifier?.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type' && getImportedName(specifier) === COMPONENT_NAME;
}

function isObsidianNamespaceImport(variable: TSESLint.Scope.Variable): boolean {
  return getObsidianImportDefinition(variable)?.type === AST_NODE_TYPES.ImportNamespaceSpecifier;
}

function isSymbolDispose(key: TSESTree.Node): boolean {
  return key.type === AST_NODE_TYPES.MemberExpression && key.object.type === AST_NODE_TYPES.Identifier && key.object.name === 'Symbol'
    && key.property.type === AST_NODE_TYPES.Identifier && key.property.name === 'dispose';
}

function removeImportSpecifier(context: RuleContext, fixer: TSESLint.RuleFixer, variable: TSESLint.Scope.Variable): TSESLint.RuleFix[] {
  const definition = variable.defs[0];
  /* v8 ignore start -- Only called for a variable resolved to a named `obsidian` import. */
  if (definition?.type !== TSESLint.Scope.DefinitionType.ImportBinding) {
    return [];
  }
  /* v8 ignore stop */

  const specifier = definition.node as TSESTree.ImportSpecifier;
  const declaration = definition.parent as TSESTree.ImportDeclaration;
  const sourceCode = context.sourceCode;

  if (declaration.specifiers.length === 1) {
    const tokenAfter = sourceCode.getTokenAfter(declaration, { includeComments: true });
    const end = tokenAfter ? Math.min(tokenAfter.range[0], declaration.range[1] + 1) : declaration.range[1];
    return [fixer.removeRange([declaration.range[0], end])];
  }

  const tokenAfter = sourceCode.getTokenAfter(specifier);
  if (tokenAfter?.value === ',') {
    const next = sourceCode.getTokenAfter(tokenAfter, { includeComments: true });
    /* v8 ignore next -- A comma inside an import clause is always followed by another token. */
    const end = next ? next.range[0] : tokenAfter.range[1];
    return [fixer.removeRange([specifier.range[0], end])];
  }

  const tokenBefore = sourceCode.getTokenBefore(specifier);
  /* v8 ignore next -- A non-first specifier is always preceded by a comma. */
  const start = tokenBefore?.value === ',' ? tokenBefore.range[0] : specifier.range[0];
  return [fixer.removeRange([start, specifier.range[1]])];
}

function reportClass(context: RuleContext, classNode: ClassNode): void {
  const superClass = classNode.superClass;
  if (!superClass) {
    return;
  }

  const scope = context.sourceCode.getScope(classNode);

  if (superClass.type === AST_NODE_TYPES.Identifier) {
    const variable = findVariable(scope, superClass.name);
    if (!variable || !isObsidianComponentImport(variable)) {
      return;
    }

    context.report({
      fix: buildFix(context, classNode, variable),
      messageId: MESSAGE_ID,
      node: superClass
    });
    return;
  }

  if (
    superClass.type !== AST_NODE_TYPES.MemberExpression
    || superClass.computed
    || superClass.object.type !== AST_NODE_TYPES.Identifier
    || superClass.property.type !== AST_NODE_TYPES.Identifier
    || superClass.property.name !== COMPONENT_NAME
  ) {
    return;
  }

  const namespaceVariable = findVariable(scope, superClass.object.name);
  if (namespaceVariable && isObsidianNamespaceImport(namespaceVariable)) {
    context.report({
      messageId: MESSAGE_ID,
      node: superClass
    });
  }
}
