import {readFileSync} from 'node:fs'

import {type SchemaType} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {evaluateGroqModule, variableNameFromFilename} from '../evaluateGroqModule.js'

const schema = JSON.parse(
  readFileSync(new URL('../../example/schema.json', import.meta.url), 'utf8'),
) as SchemaType

function normalize(text: string): string {
  return text
    .replaceAll(/^\/\/ (Source|Variable): .*$/gm, '')
    .replaceAll(/\b[AB]Result\b/g, 'Result_')
}

function example(name: string): string {
  return readFileSync(new URL(`../../example/${name}`, import.meta.url), 'utf8')
}

describe('evaluateGroqModule', () => {
  it('names a result from the filename', () => {
    expect(variableNameFromFilename('post-by-slug.groq')).toBe('postBySlug')
    expect(variableNameFromFilename('1post.groq')).toBe('_1post')
    expect(variableNameFromFilename('.groq')).toBe('query')
  })

  it('types an array query and a sliced query from the schema', async () => {
    const posts = await evaluateGroqModule({
      content: example('posts.groq'),
      filename: 'posts.groq',
      schema,
    })
    const bySlug = await evaluateGroqModule({
      content: example('postBySlug.groq'),
      filename: 'postBySlug.groq',
      schema,
    })

    expect(posts.diagnostics).toEqual([])
    expect(bySlug.diagnostics).toEqual([])
    expect(posts.params).toEqual([])
    expect(bySlug.params).toEqual([{name: 'slug', type: 'string'}])
    expect(posts.text).toContain('type PostsResult = Array<{')
    expect(posts.text).toContain('role: "admin" | "member"')
    expect(posts.text).toContain('type Params = Record<string, never>')
    expect(posts.text).toContain(
      'declare const query: GroqQuery<"*[_type == \\"post\\"]{title, role}", Result, Params>',
    )
    expect(bySlug.text).toContain('type Params = {slug: string}')
    expect(bySlug.text).toContain('| null')
  })

  it('exports the typed query as default and the two types, nothing global', async () => {
    const full = await evaluateGroqModule({
      content: '*[_type == "post"]',
      filename: 'full.groq',
      schema,
    })
    const exportLines = full.text.split('\n').filter((line) => line.startsWith('export'))
    expect(exportLines).toEqual(['export default query', 'export type {Params, Result}'])
    expect(full.text).not.toContain('declare module')
    expect(full.text).not.toContain('declare global')
    expect(full.text).not.toContain('SanityQueries')
    expect(full.text).not.toContain('AllSanitySchemaTypes')
    expect(full.text).not.toContain('export type Post')
    expect(full.text).toContain('[internalGroqTypeReferenceTo]?: "author"')
    expect(full.text).toContain(
      'import {type GroqQuery, internalGroqTypeReferenceTo} from "@sanity/groq-files/types"',
    )

    const projection = await evaluateGroqModule({
      content: '*[_type == "post"]{title}',
      filename: 'titles.groq',
      schema,
    })
    expect(projection.text).not.toContain('internalGroqTypeReferenceTo')
  })

  it('writes the same text for the same query in two files, apart from the file name', async () => {
    const a = await evaluateGroqModule({content: '*[_type == "post"]', filename: 'a.groq', schema})
    const b = await evaluateGroqModule({content: '*[_type == "post"]', filename: 'b.groq', schema})
    expect(normalize(a.text)).toBe(normalize(b.text))
  })

  it('keeps the import resolvable when the query or schema cannot be typed', async () => {
    const empty = await evaluateGroqModule({content: '  \n', filename: 'empty.groq', schema})
    expect(empty.query).toBe('')
    expect(empty.text).toContain('export default query')
    expect(empty.diagnostics[0]?.code).toBe(1)

    const syntax = await evaluateGroqModule({content: '\n[', filename: 'bad.groq', schema})
    expect(syntax.diagnostics[0]?.start).toBe(2)
    expect(syntax.diagnostics[0]?.code).toBe(2)
    expect(syntax.text).toContain('export default query')
    expect(syntax.text).toContain('type Result = unknown')

    const missing = await evaluateGroqModule({
      content: '*[_type == "post"]',
      filename: 'posts.groq',
      schemaNote: 'No schema file.',
    })
    expect(missing.text).toContain('type Result = unknown')
    expect(missing.text).toContain('// No schema file.')
    expect(missing.text).toContain('GroqQuery<"*[_type == \\"post\\"]", Result, Params>')
    expect(missing.diagnostics[0]?.messageText).toBe('No schema file.')
    expect(missing.diagnostics[0]?.code).toBe(3)

    const failing = await evaluateGroqModule({
      content: '*[_type == "post"]{...}[0]->',
      filename: 'odd.groq',
      schema: [{attributes: {}, name: 'post', type: 'document'}] as unknown as SchemaType,
    })
    expect(failing.text).toContain('export default query')
  })

  it('reports a diagnostic when typegen rejects the query', async () => {
    const broken = await evaluateGroqModule({
      content: '*[_type == "post"]{title}',
      filename: 'posts.groq',
      schema: [{name: 'post', type: 'nope'}] as unknown as SchemaType,
    })
    expect(broken.diagnostics.map((item) => item.code)).toEqual([4])
    expect(broken.text).toContain('type Result = unknown')
  })
})
