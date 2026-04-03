import {type ExprNode, parse} from 'groq-js'

/**
 * Validates that a string is a syntactically valid GROQ object projection
 * suitable for embeddings indexing.
 *
 * Rejects:
 * - Invalid GROQ syntax
 * - Non-object expressions (filters, function calls, literals, etc.)
 * - Dereferences (`->`) -- the indexer cannot resolve cross-document references
 * - Full queries (`*[...]`) -- dataset scans are not supported
 * - `user::` namespace functions -- user-defined functions are not available
 */
export function validateProjection(projection: string): void {
  const tree = parse(projection)
  if (tree.type !== 'Object') {
    throw new Error(
      `Expected a GROQ projection (e.g. "{ title, body }"), but received a ${tree.type} expression`,
    )
  }
  walk(tree)
}

function walk(node: ExprNode | undefined): void {
  if (!node) return

  switch (node.type) {
    case 'AccessAttribute':
    case 'AccessElement':
    case 'ArrayCoerce':
    case 'Asc':
    case 'Desc':
    case 'Group':
    case 'Neg':
    case 'Not':
    case 'Pos':
    case 'Slice': {
      walk(node.base)
      break
    }
    case 'And':
    case 'OpCall':
    case 'Or': {
      walk(node.left)
      walk(node.right)
      break
    }
    case 'Array': {
      for (const el of node.elements) walk(el.value)
      break
    }
    case 'Everything': {
      throw new Error('Projection must not contain full queries (*[...])')
    }
    case 'Deref': {
      throw new Error('Projection must not contain dereferences (->)')
    }
    case 'FuncCall': {
      if (node.namespace === 'user') {
        throw new Error('Projection must not contain user:: functions')
      }
      for (const arg of node.args) walk(arg)
      break
    }
    case 'Filter':
    case 'FlatMap':
    case 'Map':
    case 'Projection': {
      walk(node.base)
      walk(node.expr)
      break
    }
    case 'InRange': {
      walk(node.base)
      walk(node.left)
      walk(node.right)
      break
    }
    case 'Object': {
      for (const attr of node.attributes) {
        switch (attr.type) {
          case 'ObjectAttributeValue':
          case 'ObjectSplat': {
            walk(attr.value)
            break
          }
          case 'ObjectConditionalSplat': {
            walk(attr.condition)
            walk(attr.value)
            break
          }
          default:
        }
      }
      break
    }
    case 'PipeFuncCall': {
      walk(node.base)
      for (const arg of node.args) walk(arg)
      break
    }
    case 'Select': {
      for (const alt of node.alternatives) {
        walk(alt.condition)
        walk(alt.value)
      }
      walk(node.fallback)
      break
    }
    default:
  }
}
