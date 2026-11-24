// A rule: every public declaration has a doc comment. It covers what `jsdoc/require-jsdoc` cannot:
// the exported classes, interfaces and type aliases, and the properties and signatures they expose.
// A member is public unless it is marked private or protected, or is a `#private` field. Functions
// and methods are left to `jsdoc/require-jsdoc`.

/** Nodes that make a declaration local: what is declared inside one is not public. */
const LOCAL_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
  "BlockStatement",
]);

/** Whether a node is declared at the top of an exported declaration, with no function between. */
function isExported(node) {
  for (let current = node; current; current = current.parent) {
    if (current.type === "ExportNamedDeclaration") {
      return true;
    }
    if (LOCAL_SCOPES.has(current.type)) {
      return false;
    }
  }
  return false;
}

/** Whether a class member is hidden from the public API. */
function isHidden(node) {
  return node.accessibility === "private"
    || node.accessibility === "protected"
    || node.key?.type === "PrivateIdentifier";
}

/** The name a declaration or member is known by, for the message. */
function nameOf(node) {
  return node.id?.name ?? node.key?.name ?? node.key?.value ?? "(anonymous)";
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Every public class, interface, type alias and member has a doc comment." },
    schema: [],
    messages: {
      missing: "Public {{kind}} '{{name}}' needs a doc comment (/** ... */).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Whether the comment before the node (or its export) is a doc comment. */
    function hasDocComment(node) {
      const target = node.parent?.type === "ExportNamedDeclaration" ? node.parent : node;
      const last = sourceCode.getCommentsBefore(target)
        .at(-1);
      return last !== undefined && last.type === "Block" && last.value.startsWith("*");
    }

    /** Reports a public declaration that has no doc comment. */
    function require(node, kind) {
      if (!hasDocComment(node)) {
        context.report({ node, messageId: "missing", data: { kind, name: nameOf(node) } });
      }
    }

    return {
      ClassDeclaration(node) {
        if (isExported(node)) {
          require(node, "class");
        }
      },
      TSInterfaceDeclaration(node) {
        if (isExported(node)) {
          require(node, "interface");
        }
      },
      TSTypeAliasDeclaration(node) {
        if (isExported(node)) {
          require(node, "type");
        }
      },
      PropertyDefinition(node) {
        if (isExported(node) && !isHidden(node)) {
          require(node, "property");
        }
      },
      TSPropertySignature(node) {
        if (isExported(node)) {
          require(node, "property");
        }
      },
      TSMethodSignature(node) {
        if (isExported(node)) {
          require(node, "method");
        }
      },
    };
  },
};
