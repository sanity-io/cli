import {execFile} from 'node:child_process'
import {cp, mkdir, mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {describe, expect, it} from 'vitest'

import {declarationPath, generateGroqDeclarations} from '../declarations.js'

const require = createRequire(import.meta.url)
const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const EXAMPLE = join(here, '../../example')
const SCHEMA = join(EXAMPLE, 'schema.json')
const TYPES_SOURCE = join(here, '../types.ts')
const CLIENT_TYPES = join(
  dirname(require.resolve('@sanity/client/package.json')),
  'dist/index.d.ts',
)
const TSC = require.resolve('typescript/bin/tsc')

describe('generateGroqDeclarations', () => {
  it('writes <name>.d.groq.ts, the file allowArbitraryExtensions resolves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-decl-'))
    await writeFile(join(directory, 'schema.json'), await readFile(SCHEMA))
    await mkdir(join(directory, 'queries'))
    await writeFile(join(directory, 'queries', 'posts.groq'), '*[_type == "post"]{title, role}\n')
    await mkdir(join(directory, 'node_modules'))
    await writeFile(join(directory, 'node_modules', 'skip.groq'), '*[]')

    const written = await generateGroqDeclarations({directory})
    expect(written).toEqual([join(directory, 'queries', 'posts.d.groq.ts')])
    expect(declarationPath('/app/posts.groq')).toBe('/app/posts.d.groq.ts')
    const text = await readFile(written[0] ?? '', 'utf8')
    expect(text).toContain('export default query')
    expect(text).toContain('title: string')
  })

  it('type-checks the example through `import ... from "./x.groq"` with TypeScript 6', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-example-'))
    await cp(EXAMPLE, directory, {
      filter: (source) => !source.endsWith('tsconfig.json'),
      recursive: true,
    })
    await writeFile(join(directory, 'check.ts'), checkSource())
    await writeFile(join(directory, 'tsconfig.json'), tsconfig())
    await writeFile(join(directory, 'package.json'), '{"type": "module"}\n')

    const written = await generateGroqDeclarations({directory})
    expect(written.map((file) => file.slice(directory.length + 1)).toSorted()).toEqual([
      'postBySlug.d.groq.ts',
      'posts.d.groq.ts',
      'postsByRole.d.groq.ts',
      'postsByTags.d.groq.ts',
    ])
    // Two files with the same query text must be interchangeable, with nothing global between them.
    await writeFile(join(directory, 'again.groq'), await readFile(join(directory, 'posts.groq')))
    await generateGroqDeclarations({directory})

    await runTsc(directory)
    expect((await readdir(directory)).filter((name) => name.endsWith('.d.groq.ts'))).toHaveLength(5)
  })
})

async function runTsc(directory: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [TSC, '--pretty', 'false', '-p', directory], {
      cwd: directory,
    })
  } catch (error) {
    const failed = error as {stderr?: string; stdout?: string}
    throw new Error(`${failed.stdout ?? ''}\n${failed.stderr ?? ''}`, {cause: error})
  }
}

function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        allowArbitraryExtensions: true,
        module: 'NodeNext',
        moduleDetection: 'force',
        moduleResolution: 'NodeNext',
        noEmit: true,
        noUnusedLocals: true,
        paths: {
          '@sanity/client': [CLIENT_TYPES],
          '@sanity/groq-files/types': [TYPES_SOURCE],
        },
        skipLibCheck: true,
        strict: true,
        target: 'ES2023',
        types: [],
        verbatimModuleSyntax: true,
      },
      files: ['main.ts', 'check.ts'],
    },
    null,
    2,
  )
}

function checkSource(): string {
  return `import {type SanityClient} from '@sanity/client'
import {type GroqParams, type GroqQuery, type GroqResult} from '@sanity/groq-files/types'

import getAgain from './again.groq'
import getBySlug, {type Params as SlugParams, type Result as SlugResult} from './postBySlug.groq'
import getPosts, {type Params as PostsParams, type Result as PostsResult} from './posts.groq'
import getByRole from './postsByRole.groq'
import getByTags from './postsByTags.groq'
import * as postsModule from './posts.groq'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false

declare const client: SanityClient

type PostItem = {role: 'admin' | 'member'; title: string}
const postsText = '*[_type == "post"]{title, role}'

// The default export is the query string literal, usable anywhere a string is.
export const asString: string = getPosts
export const asLiteral: typeof postsText = getPosts
export const inTemplate = \`\${getPosts} | order(title)\`
export const compared = getPosts === postsText
export type _Literal = Expect<typeof getPosts extends typeof postsText ? true : false>
export type _Branded = Expect<Equal<typeof getPosts, GroqQuery<typeof postsText, PostsResult, PostsParams>>>
// @ts-expect-error a different query text is a different type
export const otherText: typeof getPosts = '*[_type == "author"]'

// The result and params travel with the value.
export type _Posts = Expect<Equal<GroqResult<typeof getPosts>, Array<PostItem>>>
export type _PostsResult = Expect<Equal<PostsResult, Array<PostItem>>>
export type _PostsParams = Expect<Equal<PostsParams, Record<string, never>>>
export type _One = Expect<Equal<GroqResult<typeof getBySlug>, PostItem | null>>
export type _OneResult = Expect<Equal<SlugResult, PostItem | null>>
export type _SlugParams = Expect<Equal<SlugParams, {slug: string}>>
export type _SlugParamsCarried = Expect<Equal<GroqParams<typeof getBySlug>, {slug: string}>>
export type _Admins = Expect<Equal<GroqResult<typeof getByRole>, Array<{title: string; views: number}>>>
export type _RoleParams = Expect<Equal<GroqParams<typeof getByRole>, {role: 'admin' | 'member'}>>
export type _Tagged = Expect<Equal<GroqResult<typeof getByTags>, Array<{title: string; tags: Array<string> | null}>>>
export type _TagsParams = Expect<Equal<GroqParams<typeof getByTags>, {tags: Array<string>}>>
export type _SameAgain = Expect<Equal<typeof getPosts, typeof getAgain>>
export type _PlainString = Expect<Equal<GroqResult<string>, unknown>>
export type _PlainLiteral = Expect<Equal<GroqResult<typeof postsText>, unknown>>

// The module has exactly one runtime export, and no global declarations.
export type _OnlyDefault = Expect<Equal<keyof typeof postsModule, 'default'>>
declare const registry: SanityQueries
// @ts-expect-error nothing is registered in SanityQueries
export const notRegistered: PostsResult = registry[postsText]

// Today's @sanity/client accepts the value as a string and returns \`any\` unless told the type.
export const viaClient = await client.fetch(getPosts)
export type _ClientAny = Expect<IsAny<typeof viaClient>>
export const viaClientTyped = await client.fetch<GroqResult<typeof getPosts>>(getPosts)
export type _ClientTyped = Expect<Equal<typeof viaClientTyped, Array<PostItem>>>
export const viaSlug = await client.fetch<SlugResult>(getBySlug, {slug: 'hello'}, {perspective: 'published'})
export type _ClientSlug = Expect<Equal<typeof viaSlug, PostItem | null>>
`
}
