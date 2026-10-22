import {access, mkdir, mkdtemp, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {describe, expect, it} from 'vitest'

import {copyExampleProject, exampleTsconfig, PACKAGE_ROOT, runTsc} from './exampleProject.js'

// Opt-in smoke test against a TypeScript 7.1 `tsc` that has content mappers.
// It drives the built mapper (`dist/bin/contentMapper.js`), so build first:
//
//   pnpm --filter @sanity/groq-files build
//   GROQ_FILES_TSC71=/path/to/node_modules/.bin/tsc pnpm test:unit contentMapper.ts71
const TSC71 = process.env.GROQ_FILES_TSC71

const SHOP_SCHEMA = JSON.stringify([
  {
    attributes: {
      _type: {type: 'objectAttribute', value: {type: 'string', value: 'product'}},
      price: {type: 'objectAttribute', value: {type: 'number'}},
      sku: {type: 'objectAttribute', value: {type: 'string'}},
    },
    name: 'product',
    type: 'document',
  },
])

const SHOP_CHECK = (groqFile: string) => `import {type GroqResult} from '@sanity/groq-files/types'

import getProducts from './${groqFile}'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

export type _Products = Expect<Equal<GroqResult<typeof getProducts>, Array<{sku: string; price: number}>>>
export const text: string = getProducts
`

describe.skipIf(!TSC71)('TypeScript 7.1 content mapper', () => {
  it('type-checks the example through --runExternalCode without any .d.groq.ts', async () => {
    const directory = await setup()
    await copyExampleProject(directory)
    await writeFile(join(directory, 'tsconfig.json'), tsconfig(['main.ts', 'check.ts']))

    const stdout = await runTsc([TSC71 ?? '', '--runExternalCode'], directory)
    expect(stdout).toBe('')

    // A query that does not parse surfaces the mapper's diagnostic at the .groq file.
    await writeFile(join(directory, 'bad.groq'), '*[_type == "post"\n')
    await writeFile(join(directory, 'bad.ts'), "import bad from './bad.groq'\n\nexport {bad}\n")
    await writeFile(join(directory, 'tsconfig.json'), tsconfig(['main.ts', 'check.ts', 'bad.ts']))
    await expect(runTsc([TSC71 ?? '', '--runExternalCode'], directory)).rejects.toThrow(
      /bad\.groq\(1,\d+\): error sanity-groq2/,
    )
  }, 120_000)

  it('types two folders against two schemas from one mapper entry with resources', async () => {
    const directory = await setup()
    await copyExampleProject(join(directory, 'blog'))
    await mkdir(join(directory, 'shop'))
    await writeFile(join(directory, 'shop', 'schema.json'), SHOP_SCHEMA)
    await writeFile(join(directory, 'shop', 'products.groq'), '*[_type == "product"]{sku, price}\n')
    await writeFile(join(directory, 'shop', 'check.ts'), SHOP_CHECK('products.groq'))
    await writeFile(
      join(directory, 'tsconfig.json'),
      exampleTsconfig({
        contentMappers: [
          {
            extensions: ['.groq'],
            options: {
              resources: [
                {path: 'blog', schema: 'blog/schema.json'},
                {path: 'shop', schema: 'shop/schema.json'},
              ],
            },
            package: '@sanity/groq-files',
          },
        ],
        files: ['blog/main.ts', 'blog/check.ts', 'shop/check.ts'],
      }),
    )

    expect(await runTsc([TSC71 ?? '', '--runExternalCode'], directory)).toBe('')
  }, 120_000)

  it('needs distinct extensions for two mapper entries, which also works', async () => {
    const directory = await setup()
    await copyExampleProject(join(directory, 'blog'))
    await mkdir(join(directory, 'shop'))
    await writeFile(join(directory, 'shop', 'schema.json'), SHOP_SCHEMA)
    await writeFile(
      join(directory, 'shop', 'products.shop.groq'),
      '*[_type == "product"]{sku, price}\n',
    )
    await writeFile(join(directory, 'shop', 'check.ts'), SHOP_CHECK('products.shop.groq'))
    const files = ['blog/main.ts', 'blog/check.ts', 'shop/check.ts']

    // TypeScript 7.1 has no per-entry include, and refuses two entries for the same extension.
    await writeFile(
      join(directory, 'tsconfig.json'),
      exampleTsconfig({
        contentMappers: [
          {
            extensions: ['.groq'],
            options: {schema: 'blog/schema.json'},
            package: '@sanity/groq-files',
          },
          {
            extensions: ['.groq'],
            options: {schema: 'shop/schema.json'},
            package: '@sanity/groq-files',
          },
        ],
        files,
      }),
    )
    await expect(runTsc([TSC71 ?? '', '--runExternalCode'], directory)).rejects.toThrow(/TS18067/)

    await writeFile(
      join(directory, 'tsconfig.json'),
      exampleTsconfig({
        contentMappers: [
          {
            extensions: ['.groq'],
            options: {schema: 'blog/schema.json'},
            package: '@sanity/groq-files',
          },
          {
            extensions: ['.shop.groq'],
            options: {schema: 'shop/schema.json'},
            package: '@sanity/groq-files',
          },
        ],
        files,
      }),
    )
    expect(await runTsc([TSC71 ?? '', '--runExternalCode'], directory)).toBe('')
  }, 120_000)
})

async function setup(): Promise<string> {
  const mapper = join(PACKAGE_ROOT, 'dist/bin/contentMapper.js')
  await access(mapper).catch(() => {
    throw new Error(`${mapper} is missing. Run "pnpm --filter @sanity/groq-files build" first.`)
  })
  const directory = await mkdtemp(join(tmpdir(), 'groq-ts71-'))
  await mkdir(join(directory, 'node_modules', '@sanity'), {recursive: true})
  await symlink(PACKAGE_ROOT, join(directory, 'node_modules', '@sanity', 'groq-files'), 'dir')
  await writeFile(join(directory, 'package.json'), '{"type": "module"}\n')
  return directory
}

function tsconfig(files: string[]): string {
  return exampleTsconfig({
    contentMappers: [
      {extensions: ['.groq'], options: {schema: './schema.json'}, package: '@sanity/groq-files'},
    ],
    files,
  })
}
