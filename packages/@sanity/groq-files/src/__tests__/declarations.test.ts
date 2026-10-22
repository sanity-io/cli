import {mkdir, mkdtemp, readdir, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

import {declarationPath, generateGroqDeclarations} from '../declarations.js'
import {copyExampleProject, exampleTsconfig, runTsc, SCHEMA, TSC} from './exampleProject.js'

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
    await copyExampleProject(directory)
    await writeFile(
      join(directory, 'tsconfig.json'),
      exampleTsconfig({
        compilerOptions: {allowArbitraryExtensions: true},
        files: ['main.ts', 'check.ts'],
      }),
    )

    const written = await generateGroqDeclarations({directory})
    expect(written.map((file) => file.slice(directory.length + 1)).toSorted()).toEqual([
      'again.d.groq.ts',
      'postBySlug.d.groq.ts',
      'posts.d.groq.ts',
      'postsByRole.d.groq.ts',
      'postsByTags.d.groq.ts',
    ])

    await runTsc([process.execPath, TSC], directory)
    expect((await readdir(directory)).filter((name) => name.endsWith('.d.groq.ts'))).toHaveLength(5)
  })
})
