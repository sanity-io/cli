import {type ObjectAttribute, type SchemaType, type TypeNode} from 'groq-js'

interface FieldSegment {
  kind: 'field'
  name: string
}

interface DerefSegment {
  kind: 'deref'
}

export type PathSegment = DerefSegment | FieldSegment

type InlineLookup = (name: string) => TypeNode | undefined

/**
 * Prints a groq-js schema type as a TypeScript type.
 * String and number literals stay literal so enums inferred from the schema
 * show up as `"admin" | "member"`.
 */
export function lookupPathType(
  schema: SchemaType,
  documents: readonly string[] | undefined,
  segments: readonly PathSegment[],
): string | undefined {
  const names =
    documents ?? schema.flatMap((entry) => (entry.type === 'document' ? [entry.name] : []))
  const matches = names.flatMap((name) => {
    const document = schema.find((entry) => entry.type === 'document' && entry.name === name)
    if (!document || document.type !== 'document') return []
    const printed = resolveFromAttributes(document.attributes, segments, 0, schema, new Set())
    return printed === undefined ? [] : [printed]
  })
  if (matches.length === 0) return undefined
  return unionTypeStrings(matches)
}

export function unionTypeStrings(parts: readonly string[]): string {
  const flat = parts
    .flatMap((part) => splitTopLevelUnion(part))
    .filter((part) => part.length > 0 && part !== 'never')
  if (flat.length === 0) return 'never'
  if (flat.includes('unknown')) return 'unknown'

  let unique = [...new Set(flat)]
  if (unique.includes('string')) unique = unique.filter((part) => !isStringLiteral(part))
  if (unique.includes('number')) unique = unique.filter((part) => !isNumberLiteral(part))
  if (unique.includes('boolean')) {
    unique = unique.filter((part) => part !== 'true' && part !== 'false')
  }
  unique.sort((left, right) => left.localeCompare(right))
  return unique.join(' | ')
}

export function arrayOf(element: string): string {
  return element.includes(' ') || element.includes('|') ? `Array<${element}>` : `${element}[]`
}

function printType(type: TypeNode, lookupInline: InlineLookup, seen: Set<string>): string {
  switch (type.type) {
    case 'array': {
      return arrayOf(printType(type.of, lookupInline, seen))
    }
    case 'boolean': {
      return type.value === undefined ? 'boolean' : String(type.value)
    }
    case 'inline': {
      return printInline(type.name, lookupInline, seen)
    }
    case 'null': {
      return 'null'
    }
    case 'number': {
      return type.value === undefined ? 'number' : String(type.value)
    }
    case 'object': {
      return printObject(type.attributes, lookupInline, seen)
    }
    case 'string': {
      return type.value === undefined ? 'string' : JSON.stringify(type.value)
    }
    case 'union': {
      return unionTypeStrings(type.of.map((part) => printType(part, lookupInline, seen)))
    }
    case 'unknown': {
      return 'unknown'
    }
    default: {
      const unreachable: never = type
      return unreachable
    }
  }
}

function printInline(name: string, lookupInline: InlineLookup, seen: Set<string>): string {
  if (seen.has(name)) return 'unknown'
  const next = lookupInline(name)
  if (!next) return 'unknown'
  seen.add(name)
  const printed = printType(next, lookupInline, seen)
  seen.delete(name)
  return printed
}

function printObject(
  attributes: Record<string, ObjectAttribute>,
  lookupInline: InlineLookup,
  seen: Set<string>,
): string {
  const fields = Object.entries(attributes).map(([name, attribute]) => {
    const optional = attribute.optional ? '?' : ''
    return `${propertyKey(name)}${optional}: ${printType(attribute.value, lookupInline, seen)}`
  })
  if (fields.length === 0) return 'Record<string, unknown>'
  return `{${fields.join(', ')}}`
}

function resolveFromAttributes(
  attributes: Record<string, ObjectAttribute>,
  segments: readonly PathSegment[],
  index: number,
  schema: SchemaType,
  seen: Set<string>,
): string | undefined {
  if (index >= segments.length) return printObject(attributes, inlineLookup(schema), seen)
  const segment = segments[index]
  if (!segment || segment.kind === 'deref') return undefined
  const attribute = attributes[segment.name]
  if (!attribute) return undefined
  return resolveFromType(attribute.value, segments, index + 1, schema, seen)
}

function resolveFromType(
  type: TypeNode,
  segments: readonly PathSegment[],
  index: number,
  schema: SchemaType,
  seen: Set<string>,
): string | undefined {
  if (type.type === 'inline') {
    if (seen.has(type.name)) return undefined
    const next = inlineLookup(schema)(type.name)
    if (!next) return undefined
    seen.add(type.name)
    const printed = resolveFromType(next, segments, index, schema, seen)
    seen.delete(type.name)
    return printed
  }

  if (type.type === 'union') {
    const parts = type.of.flatMap((part) => {
      const printed = resolveFromType(part, segments, index, schema, seen)
      return printed === undefined ? [] : [printed]
    })
    return parts.length === 0 ? undefined : unionTypeStrings(parts)
  }

  if (index >= segments.length) return printType(type, inlineLookup(schema), seen)

  // A path that continues through an array field addresses its elements, as `tags[]` does.
  if (type.type === 'array') return resolveFromType(type.of, segments, index, schema, seen)

  const segment = segments[index]
  if (!segment) return undefined

  if (segment.kind === 'deref') {
    if (type.type !== 'object' || !type.dereferencesTo) return undefined
    const document = schema.find(
      (entry) => entry.type === 'document' && entry.name === type.dereferencesTo,
    )
    if (!document || document.type !== 'document') return undefined
    return resolveFromAttributes(document.attributes, segments, index + 1, schema, seen)
  }

  if (type.type === 'object') {
    return resolveFromAttributes(type.attributes, segments, index, schema, seen)
  }

  return undefined
}

function inlineLookup(schema: SchemaType): InlineLookup {
  return (name) => {
    const entry = schema.find((candidate) => candidate.type === 'type' && candidate.name === name)
    return entry && entry.type === 'type' ? entry.value : undefined
  }
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

function splitTopLevelUnion(type: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: "'" | '"' | undefined
  let start = 0

  for (let index = 0; index < type.length; index++) {
    const char = type[index]
    if (quote) {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '<' || char === '{' || char === '(') depth += 1
    if ((char === '>' || char === '}' || char === ')') && depth > 0) depth -= 1
    if (depth === 0 && type.startsWith(' | ', index)) {
      parts.push(type.slice(start, index).trim())
      index += 2
      start = index + 1
    }
  }

  parts.push(type.slice(start).trim())
  return parts.filter((part) => part.length > 0)
}

function isStringLiteral(type: string): boolean {
  return type.startsWith('"') && type.endsWith('"')
}

function isNumberLiteral(type: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(type)
}
