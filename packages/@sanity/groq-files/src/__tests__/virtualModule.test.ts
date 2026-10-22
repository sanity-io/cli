import {describe, expect, it} from 'vitest'

import {collectTypeReferences, renderVirtualModule} from '../virtualModule.js'

describe('renderVirtualModule', () => {
  it('renders an untyped module that still resolves', () => {
    const text = renderVirtualModule({
      diagnostics: ['No schema file.\nSecond line.'],
      params: [
        {name: 'slug', type: 'string'},
        {name: 'odd-name', type: 'number'},
      ],
      query: '*[slug.current == $slug]',
    })
    expect(text).toBe(`// No schema file.
// Second line.
import {type GroqQuery} from "@sanity/groq-files/types"

type Params = {slug: string, "odd-name": number}
type Result = unknown
declare const query: GroqQuery<"*[slug.current == $slug]", Result, Params>
export default query
export type {Params, Result}
`)
  })

  it('types a query without placeholders as taking no params', () => {
    const text = renderVirtualModule({
      params: [],
      query: '*',
      result: {
        code: 'export type AllResult = Array<string>;',
        name: 'AllResult',
        references: new Set(),
      },
    })
    expect(text).toContain('\ntype AllResult = Array<string>;\n')
    expect(text).toContain('type Params = Record<string, never>')
    expect(text).toContain('type Result = AllResult')
    expect(text).toContain('declare const query: GroqQuery<"*", Result, Params>')
    expect(text).not.toContain('declare global')
  })

  it('includes only the schema aliases the result refers to, transitively', () => {
    const text = renderVirtualModule({
      params: [],
      query: '*',
      result: {
        code: 'export type AllResult = Array<Post | ArrayOf<Tag>>;',
        name: 'AllResult',
        references: new Set(['ArrayOf', 'Post', 'Tag']),
      },
      schemaTypes: [
        {
          code: '// Source: schema.json\nexport type Author = {name: string};',
          name: 'Author',
          references: new Set(),
        },
        {
          code: 'export type Post = {author: Author};',
          name: 'Post',
          references: new Set(['Author']),
        },
        {code: 'export type Tag = {label: string};', name: 'Tag', references: new Set()},
        {code: 'export type Unused = {x: number};', name: 'Unused', references: new Set(['Post'])},
        {
          code: 'export type AllSanitySchemaTypes = Author | Post | Tag | Unused;',
          name: 'AllSanitySchemaTypes',
          references: new Set(['Author', 'Post', 'Tag', 'Unused']),
        },
      ],
    })
    expect(text).toContain('type ArrayOf<T> = Array<T & {_key: string}>')
    expect(text).toContain('// Source: schema.json\ntype Author = {name: string};')
    expect(text).toContain('\ntype Post = {author: Author};')
    expect(text).toContain('\ntype Tag = {label: string};')
    expect(text).not.toContain('Unused')
    expect(text).not.toContain('AllSanitySchemaTypes')
    expect(text).not.toContain('export type Post')
    expect(text).toContain('import {type GroqQuery} from "@sanity/groq-files/types"')
    expect(text).toContain('declare const query: GroqQuery<"*", Result, Params>')
  })
})

describe('collectTypeReferences', () => {
  it('reads type names and computed keys, not plain property names', () => {
    const names = collectTypeReferences({
      members: [
        {
          computed: false,
          key: {name: 'title', type: 'Identifier'},
          type: 'TSPropertySignature',
          typeAnnotation: {
            type: 'TSTypeAnnotation',
            typeAnnotation: {type: 'TSTypeReference', typeName: {name: 'Slug', type: 'Identifier'}},
          },
        },
        {
          computed: true,
          key: {name: 'internalGroqTypeReferenceTo', type: 'Identifier'},
          leadingComments: [{type: 'CommentLine', value: 'ignored'}],
          type: 'TSPropertySignature',
        },
        {
          computed: false,
          key: {name: 'method', type: 'Identifier'},
          parameters: [{name: 'arg', type: 'Identifier'}],
          type: 'TSMethodSignature',
        },
      ],
      type: 'TSTypeLiteral',
    })
    expect([...names].toSorted()).toEqual(['Slug', 'arg', 'internalGroqTypeReferenceTo'])
    expect(collectTypeReferences(null).size).toBe(0)
    expect(collectTypeReferences('x').size).toBe(0)
  })
})
