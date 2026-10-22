import {mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {describe, expect, it} from 'vitest'

import {createRuntimeModule, isGroqRequest, sliceQuery} from '../runtime.js'

describe('runtime module', () => {
  it('trims the query and keeps the offset of the first character', () => {
    expect(sliceQuery('\uFEFF  *[_type == "post"] \n')).toEqual({
      offset: 3,
      query: '*[_type == "post"]',
    })
  })

  it('recognizes groq imports, including queries and virtual ids', () => {
    expect(isGroqRequest('/app/posts.groq')).toBe(true)
    expect(isGroqRequest('/app/posts.groq?used')).toBe(true)
    expect(isGroqRequest('\0/app/posts.groq')).toBe(true)
    expect(isGroqRequest('/app/posts.ts')).toBe(false)
  })

  it('evaluates to the trimmed query string as the only export', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-runtime-'))
    const file = join(directory, 'mod.js')
    await writeFile(file, createRuntimeModule('  *[_type == "post"]{title}  '))
    const mod = (await import(pathToFileURL(file).href)) as {default: string}

    expect(Object.keys(mod)).toEqual(['default'])
    expect(mod.default).toBe('*[_type == "post"]{title}')
    expect(createRuntimeModule('a "quoted" \\ query\n')).toBe(
      'export default "a \\"quoted\\" \\\\ query"\n',
    )
  })
})
