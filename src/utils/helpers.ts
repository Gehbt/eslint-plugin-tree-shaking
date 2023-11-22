const TREE_SHAKING_COMMENT_ID = "tree-shaking";

import { pureFunctions } from "../utils/pure-functions";

const getRootNode = (node) => {
  if (node.type === "MemberExpression") {
    return getRootNode(node.object);
  }
  return node;
};

const getChildScopeForNodeIfExists = (node, currentScope) =>
  currentScope.childScopes.find((scope) => scope.block === node);

const getLocalVariable = (variableName, scope) => {
  const variableInCurrentScope = scope.variables.find(({ name }) => name === variableName);
  return (
    variableInCurrentScope ||
    (scope.upper && scope.upper.type !== "global" && getLocalVariable(variableName, scope.upper))
  );
};

const flattenMemberExpressionIfPossible = (node) => {
  switch (node.type) {
    case "MemberExpression":
      if (node.computed || node.property.type !== "Identifier") {
        return null;
      }
      // eslint-disable-next-line no-case-declarations
      const flattenedParent = flattenMemberExpressionIfPossible(node.object);
      return flattenedParent && `${flattenedParent}.${node.property.name}`;
    case "Identifier":
      return node.name;
    default:
      return null;
  }
};

const hasPureNotation = (node, context) => {
  const leadingComments = context.getSourceCode().getCommentsBefore(node);
  if (leadingComments.length) {
    const lastComment = leadingComments[leadingComments.length - 1].value;

    // https://rollupjs.org/configuration-options/#treeshake-annotations
    if (["@__PURE__", "#__PURE__"].includes(lastComment)) {
      return true;
    }
  }
};

const isPureFunction = (node, context) => {
  if (hasPureNotation(node, context)) return true;

  const flattenedExpression = flattenMemberExpressionIfPossible(node);
  if (context.options.length > 0) {
    if (
      context.options[0].noSideEffectsWhenCalled.find(
        (whiteListedFunction) => whiteListedFunction.function === flattenedExpression,
      )
    ) {
      return true;
    }
  }
  return pureFunctions[flattenedExpression];
};

const noEffects = () => {};

const parseComment = (comment) =>
  comment.value
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

const getTreeShakingComments = (comments) => {
  const treeShakingComments = comments
    .map(parseComment)
    .filter(([id]) => id === TREE_SHAKING_COMMENT_ID)
    .map((tokens) => tokens.slice(1))
    .reduce((result, tokens) => result.concat(tokens), []);
  return { has: (token) => treeShakingComments.indexOf(token) >= 0 };
};

const isFunctionSideEffectFree = (functionName, moduleName, contextOptions) => {
  if (contextOptions.length === 0) {
    return false;
  }

  for (const whiteListedFunction of contextOptions[0].noSideEffectsWhenCalled) {
    if (
      (whiteListedFunction.module === moduleName ||
        (whiteListedFunction.module === "#local" && moduleName[0] === ".")) &&
      (whiteListedFunction.functions === "*" ||
        whiteListedFunction.functions.includes(functionName))
    ) {
      return true;
    }
  }
  return false;
};

const isLocalVariableAWhitelistedModule = (variable, property, contextOptions) => {
  if (
    variable.scope.type === "module" &&
    variable.defs[0].parent &&
    variable.defs[0].parent.source
  ) {
    return isFunctionSideEffectFree(property, variable.defs[0].parent.source.value, contextOptions);
  }
  return false;
};

const isFirstLetterUpperCase = (string) => string[0] >= "A" && string[0] <= "Z";

export {
  getChildScopeForNodeIfExists,
  getLocalVariable,
  isLocalVariableAWhitelistedModule,
  getRootNode,
  getTreeShakingComments,
  isFunctionSideEffectFree,
  isFirstLetterUpperCase,
  isPureFunction,
  noEffects,
  hasPureNotation,
};
