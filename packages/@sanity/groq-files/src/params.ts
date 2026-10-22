import {GroqSyntaxError, parse, type SchemaType} from 'groq-js'

import {arrayOf, lookupPathType, type PathSegment, unionTypeStrings} from './schemaTypes.js'

/**
 * groq-js 2.0 tags every AST node with `type`, but that union is not exported
 * as a declaration consumers can narrow. This is the slice the walker reads.
 */
interface GroqNode {
  type: string

  alternatives?: Array<{condition: GroqNode; value: GroqNode}>
  arg?: GroqNode
  args?: GroqNode[]
  attributes?: GroqAttribute[]
  base?: GroqNode
  elements?: Array<{value: GroqNode}>
  expr?: GroqNode
  fallback?: GroqNode
  left?: GroqNode
  members?: GroqNode[]
  name?: string
  op?: string
  right?: GroqNode
  value?: unknown
}

interface GroqAttribute {
  type: string

  condition?: GroqNode
  value?: GroqNode
}

export interface GroqParam {
  name: string
  type: string
}

export type ParamInference = {error: unknown; ok: false} | {ok: true; params: GroqParam[]}

/**
 * `[$start..$end]` and `[0...$end]`. groq-js only parses a slice when both bounds are
 * constants, so these are substituted before parsing, the way `@sanity/codegen` does. A bare
 * `[$index]` is left alone: GROQ reads it as a filter until the value is known, and so does
 * typegen, so the placeholder stays `unknown` and the result stays an array.
 */
const SLICE_PARAM = /\[\s*(?:\$(\w+)|\d+)\s*\.\.\.?\s*(?:\$(\w+)|\d+)\s*\]/g
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g
const NO_DOCUMENTS: readonly string[] = []

/**
 * Infers a params object from `$param` placeholders.
 * Comparisons against schema fields use that field's type, including string
 * enums. Slice bounds are numbers. A placeholder we cannot place is `unknown`,
 * which still makes the key required.
 */
export function inferGroqParams(query: string, schema: SchemaType): ParamInference {
  const sliceParams = sliceParamNames(query)
  const substituted: Record<string, number> = {}
  for (const name of sliceParams) substituted[name] = 0

  let ast: GroqNode
  try {
    ast = parse(query, {params: substituted}) as unknown as GroqNode
  } catch (error) {
    return {error, ok: false}
  }

  const types = new Map<string, string[]>()
  const see = (name: string) => {
    if (!types.has(name)) types.set(name, [])
  }
  const add = (name: string, type: string) => {
    see(name)
    types.get(name)?.push(type)
  }

  walk(ast, {documents: undefined, schema}, see, add)
  for (const name of sliceParams) add(name, 'number')

  return {
    ok: true,
    params: [...types].map(([name, parts]) => ({
      name,
      type: parts.length === 0 ? 'unknown' : unionTypeStrings(parts),
    })),
  }
}

export function syntaxDiagnostic(error: unknown): {message: string; position: number} {
  if (error instanceof GroqSyntaxError) {
    return {message: error.message, position: error.position}
  }
  return {
    message: error instanceof Error ? error.message : 'GROQ syntax error',
    position: 0,
  }
}

interface WalkContext {
  documents: readonly string[] | undefined
  schema: SchemaType
}

function walk(
  node: GroqNode,
  context: WalkContext,
  see: (name: string) => void,
  add: (name: string, type: string) => void,
): void {
  if (node.type === 'Filter') {
    if (node.expr) walk(node.expr, {...context, documents: documentsOf(node)}, see, add)
    if (node.base) walk(node.base, context, see, add)
    return
  }

  if (node.type === 'OpCall') noteComparison(node, context, add)
  if (node.type === 'Parameter' && node.name) see(node.name)

  for (const child of childExpressions(node)) walk(child, context, see, add)
}

function noteComparison(
  node: GroqNode,
  context: WalkContext,
  add: (name: string, type: string) => void,
): void {
  const left = node.left ? asParameter(node.left) : undefined
  const right = node.right ? asParameter(node.right) : undefined
  if ((left && right) || (!left && !right)) return
  const param = left ?? right
  const other = left ? node.right : node.left
  if (!param?.name || !other || !node.op) return
  const inferred = inferCounterpart(other, node.op, Boolean(left), context)
  if (inferred) add(param.name, inferred)
}

function inferCounterpart(
  node: GroqNode,
  op: string,
  paramOnLeft: boolean,
  context: WalkContext,
): string | undefined {
  if (op === 'match') return 'string'
  if (op === 'in') {
    if (paramOnLeft) return elementType(node, context)
    const inner = valueType(node, context)
    return inner === undefined ? undefined : arrayOf(inner)
  }
  return valueType(node, context)
}

function valueType(node: GroqNode, context: WalkContext): string | undefined {
  if (node.type === 'Group') return node.base ? valueType(node.base, context) : undefined
  if (node.type === 'Value') return widened(node.value)
  const path = readPath(node)
  if (!path) return undefined
  return lookupPathType(context.schema, context.documents, path)
}

function elementType(node: GroqNode, context: WalkContext): string | undefined {
  if (node.type === 'Group') return node.base ? elementType(node.base, context) : undefined
  if (node.type === 'Array') {
    const parts = (node.elements ?? []).flatMap((element) => {
      if (element.value.type !== 'Value') {
        const typed = valueType(element.value, context)
        return typed === undefined ? [] : [typed]
      }
      const literal = literalType(element.value.value)
      return literal === undefined ? [] : [literal]
    })
    return parts.length === 0 ? undefined : unionTypeStrings(parts)
  }

  const inner = valueType(node, context)
  if (inner === undefined) return undefined
  if (inner.endsWith('[]')) return inner.slice(0, -2)
  if (inner.startsWith('Array<') && inner.endsWith('>')) return inner.slice('Array<'.length, -1)
  return inner
}

function widened(value: unknown): string | undefined {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value === null) return 'null'
  return undefined
}

function literalType(value: unknown): string | undefined {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  return undefined
}

function asParameter(node: GroqNode): GroqNode | undefined {
  if (node.type === 'Parameter') return node
  if (node.type === 'Group' && node.base) return asParameter(node.base)
  return undefined
}

function readPath(node: GroqNode): PathSegment[] | undefined {
  if (node.type === 'Group') return node.base ? readPath(node.base) : undefined
  // `@` and `^` depend on the scope groq-js is evaluating, which this walk does not track.
  if (node.type === 'Deref') {
    if (!node.base) return undefined
    const base = readPath(node.base)
    if (!base) return undefined
    return [...base, {kind: 'deref'}]
  }
  if (node.type === 'AccessAttribute') return readAttribute(node)
  return undefined
}

function readAttribute(node: GroqNode): PathSegment[] | undefined {
  if (!node.name) return undefined
  const base = node.base ? readPath(node.base) : []
  if (!base) return undefined
  return [...base, {kind: 'field', name: node.name}]
}

/**
 * The document types the elements of `node` can have. `*` is every document, each filter in
 * the chain narrows, and an expression that is not a document set (an attribute, a projection)
 * has none, so comparisons inside it are left `unknown`.
 */
function documentsOf(node: GroqNode): readonly string[] | undefined {
  switch (node.type) {
    case 'AccessElement':
    case 'ArrayCoerce':
    case 'Group':
    case 'PipeFuncCall':
    case 'Slice': {
      return node.base ? documentsOf(node.base) : NO_DOCUMENTS
    }
    case 'Everything': {
      return undefined
    }
    case 'Filter': {
      const base = node.base ? documentsOf(node.base) : NO_DOCUMENTS
      return narrowDocuments(base, node.expr ? documentNamesIn(node.expr) : undefined)
    }
    default: {
      return NO_DOCUMENTS
    }
  }
}

/**
 * The document types a filter expression can match, read from `_type == "x"` and
 * `_type in ["x", "y"]`. `undefined` means the expression does not constrain the type: a
 * negation, or an `||` with an unconstrained side.
 */
function documentNamesIn(node: GroqNode): readonly string[] | undefined {
  if (node.type === 'And') {
    const left = node.left ? documentNamesIn(node.left) : undefined
    const right = node.right ? documentNamesIn(node.right) : undefined
    return narrowDocuments(left, right)
  }
  if (node.type === 'Or') {
    const left = node.left ? documentNamesIn(node.left) : undefined
    const right = node.right ? documentNamesIn(node.right) : undefined
    return left && right ? [...new Set([...left, ...right])] : undefined
  }
  if (node.type === 'Group') return node.base ? documentNamesIn(node.base) : undefined
  if (node.type !== 'OpCall' || (node.op !== '==' && node.op !== 'in')) return undefined

  const left = node.left ? readPath(node.left) : undefined
  const right = node.right ? readPath(node.right) : undefined
  const typeOnLeft = isTypePath(left)
  const typeOnRight = isTypePath(right)
  if (!typeOnLeft && !typeOnRight) return undefined
  const valueNode = typeOnLeft ? node.right : node.left
  if (!valueNode) return undefined
  if (node.op === '==' && valueNode.type === 'Value' && typeof valueNode.value === 'string') {
    return [valueNode.value]
  }
  if (node.op === 'in' && valueNode.type === 'Array') {
    const names = (valueNode.elements ?? []).flatMap((element) =>
      element.value.type === 'Value' && typeof element.value.value === 'string'
        ? [element.value.value]
        : [],
    )
    return names.length > 0 ? names : undefined
  }
  return undefined
}

function isTypePath(path: PathSegment[] | undefined): boolean {
  return path?.length === 1 && path[0]?.kind === 'field' && path[0].name === '_type'
}

function narrowDocuments(
  current: readonly string[] | undefined,
  found: readonly string[] | undefined,
): readonly string[] | undefined {
  if (found === undefined) return current
  if (current === undefined) return found
  return found.filter((name) => current.includes(name))
}

function sliceParamNames(query: string): string[] {
  const names: string[] = []
  for (const match of blankStringLiterals(query).matchAll(SLICE_PARAM)) {
    if (match[1]) names.push(match[1])
    if (match[2]) names.push(match[2])
  }
  return names
}

/** Same length as `query`, with string literal contents replaced so brackets inside them are not read. */
function blankStringLiterals(query: string): string {
  return query.replaceAll(STRING_LITERAL, (literal) => ' '.repeat(literal.length))
}

function childExpressions(node: GroqNode): GroqNode[] {
  switch (node.type) {
    case 'AccessAttribute': {
      return node.base ? [node.base] : []
    }
    case 'AccessElement':
    case 'ArrayCoerce':
    case 'Asc':
    case 'Deref':
    case 'Desc':
    case 'Group':
    case 'Neg':
    case 'Not':
    case 'Pos':
    case 'Slice': {
      return present(node.base)
    }
    case 'And':
    case 'OpCall':
    case 'Or': {
      return present(node.left, node.right)
    }
    case 'Array': {
      return (node.elements ?? []).map((element) => element.value)
    }
    case 'Context':
    case 'Everything':
    case 'Parameter':
    case 'Parent':
    case 'This':
    case 'Value': {
      return []
    }
    case 'Filter':
    case 'FlatMap':
    case 'Map':
    case 'Projection': {
      return present(node.base, node.expr)
    }
    case 'FuncCall': {
      return node.args ?? []
    }
    case 'InRange': {
      return present(node.base, node.left, node.right)
    }
    case 'Object': {
      return (node.attributes ?? []).flatMap((attribute) => {
        if (attribute.type === 'ObjectConditionalSplat')
          return present(attribute.condition, attribute.value)
        if (attribute.type === 'ObjectAttributeValue' || attribute.type === 'ObjectSplat') {
          return present(attribute.value)
        }
        return []
      })
    }
    case 'PipeFuncCall': {
      return present(node.base, ...(node.args ?? []))
    }
    case 'Select': {
      return [
        ...(node.alternatives ?? []).flatMap((alternative) =>
          present(alternative.condition, alternative.value),
        ),
        ...present(node.fallback),
      ]
    }
    case 'SelectorFuncCall': {
      return present(node.arg)
    }
    case 'SelectorNested': {
      // `anywhere()` selectors are not used to infer params.
      return []
    }
    case 'Tuple': {
      return node.members ?? []
    }
    default: {
      return []
    }
  }
}

function present(...nodes: Array<GroqNode | undefined>): GroqNode[] {
  return nodes.filter((node): node is GroqNode => node !== undefined)
}
