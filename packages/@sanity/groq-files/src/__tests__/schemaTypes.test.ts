import {type SchemaType} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {arrayOf, lookupPathType, unionTypeStrings} from '../schemaTypes.js'

const schema: SchemaType = [
  {
    attributes: {
      _type: {type: 'objectAttribute', value: {type: 'string', value: 'thing'}},
      count: {type: 'objectAttribute', value: {type: 'number', value: 3}},
      empty: {type: 'objectAttribute', value: {attributes: {}, type: 'object'}},
      flag: {type: 'objectAttribute', value: {type: 'boolean', value: true}},
      flags: {type: 'objectAttribute', value: {of: {type: 'boolean'}, type: 'array'}},
      loop: {type: 'objectAttribute', value: {name: 'loop', type: 'inline'}},
      mystery: {type: 'objectAttribute', value: {type: 'unknown'}},
      nothing: {type: 'objectAttribute', value: {type: 'null'}},
      'odd-key': {type: 'objectAttribute', value: {type: 'string'}},
      shape: {type: 'objectAttribute', value: {name: 'shape', type: 'inline'}},
      shapes: {
        type: 'objectAttribute',
        value: {of: {name: 'shape', type: 'inline'}, type: 'array'},
      },
      undefinedInline: {type: 'objectAttribute', value: {name: 'missing', type: 'inline'}},
      union: {
        type: 'objectAttribute',
        value: {
          of: [
            {
              attributes: {kind: {type: 'objectAttribute', value: {type: 'string', value: 'a'}}},
              type: 'object',
            },
            {
              attributes: {kind: {type: 'objectAttribute', value: {type: 'string', value: 'b'}}},
              type: 'object',
            },
          ],
          type: 'union',
        },
      },
    },
    name: 'thing',
    type: 'document',
  },
  {
    name: 'shape',
    type: 'type',
    value: {
      attributes: {
        label: {optional: true, type: 'objectAttribute', value: {type: 'string'}},
        size: {
          type: 'objectAttribute',
          value: {of: [{type: 'string', value: 's'}, {type: 'string'}], type: 'union'},
        },
      },
      type: 'object',
    },
  },
  {
    name: 'loop',
    type: 'type',
    value: {
      attributes: {next: {type: 'objectAttribute', value: {name: 'loop', type: 'inline'}}},
      type: 'object',
    },
  },
]

function lookup(path: string, documents?: string[]): string | undefined {
  const segments = path
    .split('.')
    .map((name) => (name === '->' ? {kind: 'deref' as const} : {kind: 'field' as const, name}))
  return lookupPathType(schema, documents, segments)
}

describe('schema type printing', () => {
  it('prints literals, arrays, inline types, and unions', () => {
    expect(lookup('count')).toBe('3')
    expect(lookup('flag')).toBe('true')
    expect(lookup('flags')).toBe('boolean[]')
    expect(lookup('nothing')).toBe('null')
    expect(lookup('mystery')).toBe('unknown')
    expect(lookup('empty')).toBe('Record<string, unknown>')
    expect(lookup('shape')).toBe('{label?: string, size: string}')
    expect(lookup('shapes')).toBe('Array<{label?: string, size: string}>')
    expect(lookup('shapes.label')).toBe('string')
    expect(lookup('shape.size')).toBe('string')
    expect(lookup('union.kind')).toBe('"a" | "b"')
    expect(lookup('union')).toBe('{kind: "a"} | {kind: "b"}')
    expect(lookup('odd-key')).toBe('string')
  })

  it('stops at cycles, unknown inline types, and paths that do not exist', () => {
    expect(lookup('loop')).toBe('{next: unknown}')
    expect(lookup('loop.next')).toBeUndefined()
    expect(lookup('undefinedInline')).toBeUndefined()
    expect(lookup('undefinedInline.x')).toBeUndefined()
    expect(lookup('missing')).toBeUndefined()
    expect(lookup('count.x')).toBeUndefined()
    expect(lookup('count.->')).toBeUndefined()
    expect(lookup('shape.->')).toBeUndefined()
    expect(lookup('flag', ['nope'])).toBeUndefined()
    expect(lookupPathType(schema, undefined, [])).toContain('_type: "thing"')
  })

  it('dedupes unions and lets a primitive absorb its literals', () => {
    expect(unionTypeStrings(['"a"', 'string', '"b"'])).toBe('string')
    expect(unionTypeStrings(['1', 'number', '2.5', '-3'])).toBe('number')
    expect(unionTypeStrings(['true', 'boolean'])).toBe('boolean')
    expect(unionTypeStrings(['"b"', '"a"', '"a"'])).toBe('"a" | "b"')
    expect(unionTypeStrings(['string', 'unknown'])).toBe('unknown')
    expect(unionTypeStrings([])).toBe('never')
    expect(unionTypeStrings(['never'])).toBe('never')
    expect(
      unionTypeStrings(['Array<"a" | "b">', '{x: "c" | "d"}', '"x | y"', '"q\\"r" | "z"']),
    ).toBe('"q\\"r" | "x | y" | "z" | {x: "c" | "d"} | Array<"a" | "b">')
    expect(unionTypeStrings(["'a | b'"])).toBe("'a | b'")
  })

  it('prints arrays with the generic form when the element is not a plain name', () => {
    expect(arrayOf('string')).toBe('string[]')
    expect(arrayOf('"a" | "b"')).toBe('Array<"a" | "b">')
    expect(arrayOf('{x: number}')).toBe('Array<{x: number}>')
  })
})
