import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type GroqDeclaration, type TypeGenConfig} from '@sanity/codegen'
import {afterAll, afterEach, describe, expect, test, vi} from 'vitest'

import {type ResolvedResource} from '../generateResourceTypes.js'
import {
  createGroqDeclarationsRunner,
  groqDeclarationOptions,
  planResourceGroqDeclarations,
  queryFolders,
} from '../groqDeclarations.js'

const mockGenerateGroqDeclarations = vi.hoisted(() => vi.fn())

vi.mock(import('@sanity/codegen'), async (importOriginal) => ({
  ...(await importOriginal()),
  generateGroqDeclarations: mockGenerateGroqDeclarations,
}))

// A real directory, because the plan looks for the `.groq` files a resource leaves untyped.
const workDir = mkdtempSync(path.join(tmpdir(), 'groq-declarations-'))
for (const file of [
  ['src', 'posts.groq'],
  ['src', 'production', 'authors.groq'],
  ['src', 'staging', 'books.groq'],
  ['queries', 'shared.groq'],
  ['src', 'node_modules', 'dependency', 'query.groq'],
]) {
  mkdirSync(path.join(workDir, ...file.slice(0, -1)), {recursive: true})
  writeFileSync(path.join(workDir, ...file), '*[_type == "book"]')
}

const config: TypeGenConfig = {
  formatGeneratedCode: false,
  generates: './sanity.types.ts',
  overloadClientMethods: false,
  path: './src/**/*.{ts,tsx,js,jsx}',
  schema: './schema.json',
}

const production = {dataset: 'production', generates: './production.ts', projectId: 'abc123'}
const staging = {
  dataset: 'staging',
  generates: './staging.ts',
  projectId: 'abc123',
  schema: './schema.staging.json',
}

/** Production's schema is fetched; staging's is a file. Each gets the query `path` given. */
function fetched(resourcePath?: string | string[]): ResolvedResource {
  const resource = resourcePath === undefined ? production : {...production, path: resourcePath}
  return {key: 'abc123.production', resource, schema: [], schemaVersion: 'v1'}
}

function local(resourcePath?: string | string[]): ResolvedResource {
  const resource = resourcePath === undefined ? staging : {...staging, path: resourcePath}
  return {key: 'abc123.staging', resource, schemaPath: './schema.staging.json'}
}

function plan(resolved: ResolvedResource[]) {
  return planResourceGroqDeclarations({config, resolved, workDir})
}

/** A promise and the function that resolves it, to hold a generation open. */
function createDeferred<T>(): {promise: Promise<T>; resolve: (value: T) => void} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {promise, resolve: (value) => resolvePromise?.(value)}
}

const untypedBecause =
  '"abc123.production" uses the schema bound to its dataset, and .groq files are typed against a schema file only. Set "schema" for this resource to type them.'

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  rmSync(workDir, {force: true, recursive: true})
})

describe('queryFolders', () => {
  test('is the static base of each pattern, relative to workDir', () => {
    expect(queryFolders('./src/**/*.{ts,tsx,js,jsx}', workDir)).toEqual(['src'])
    expect(queryFolders('./src/queries', workDir)).toEqual(['src/queries'])
    expect(queryFolders(path.join(workDir, 'src', '**', '*.ts'), workDir)).toEqual(['src'])
    expect(queryFolders('./lib/../queries/*.ts', workDir)).toEqual(['queries'])
    expect(queryFolders('../shared/**/*.ts', workDir)).toEqual(['../shared'])
  })

  test('is . for workDir itself', () => {
    expect(queryFolders('.', workDir)).toEqual(['.'])
    expect(queryFolders('**/*.ts', workDir)).toEqual(['.'])
  })

  test('lists each folder once, and skips exclusions and empty patterns', () => {
    expect(
      queryFolders(
        ['./src/**/*.ts', './src/**/*.tsx', '!./src/**/*.test.ts', '', './queries/staging/*.ts'],
        workDir,
      ),
    ).toEqual(['src', 'queries/staging'])
  })
})

describe('groqDeclarationOptions', () => {
  test('types the .groq files in the query folders against the schema', () => {
    expect(groqDeclarationOptions(config, workDir)).toEqual({
      path: ['src/**/*.groq'],
      root: workDir,
      schema: './schema.json',
    })
  })
})

describe('planResourceGroqDeclarations', () => {
  test('types each resource with a schema file in its own folders', async () => {
    const other: ResolvedResource = {
      key: 'abc123.other',
      resource: {...staging, dataset: 'other', path: './src/*.ts'},
      schemaPath: './schema.staging.json',
    }

    await expect(
      plan([local(['./src/staging/*.ts', './queries/**/*.ts']), other]),
    ).resolves.toEqual({
      options: {
        path: ['src/staging/**/*.groq', 'queries/**/*.groq', 'src/**/*.groq'],
        resources: [
          {path: ['src/staging', 'queries'], schema: './schema.staging.json'},
          {path: ['src'], schema: './schema.staging.json'},
        ],
        root: workDir,
      },
      warnings: [],
    })
  })

  test('leaves out a resource whose schema is fetched, and names the files it leaves untyped', async () => {
    await expect(
      plan([fetched('./src/production/*.ts'), local('./src/staging/*.ts')]),
    ).resolves.toEqual({
      options: {
        path: ['src/staging/**/*.groq'],
        resources: [{path: ['src/staging'], schema: './schema.staging.json'}],
        root: workDir,
      },
      warnings: [`No declarations for the 1 .groq file under "src/production": ${untypedBecause}`],
    })
  })

  test('plans no declarations when every schema is fetched', async () => {
    await expect(plan([fetched()])).resolves.toEqual({
      warnings: [`No declarations for the 3 .groq files under "src": ${untypedBecause}`],
    })
  })

  test('warns about nothing when there is no .groq file to leave untyped', async () => {
    await expect(
      plan([fetched('./lib/**/*.ts'), local('./src/staging/*.ts')]),
    ).resolves.toMatchObject({warnings: []})
  })

  test('warns once about a file in the folders of two resources with fetched schemas', async () => {
    const other = {...fetched('./src/production/*.ts'), key: 'abc123.other'}

    const {warnings} = await plan([fetched(), other])

    expect(warnings).toEqual([
      `No declarations for the 3 .groq files under "src": ${untypedBecause}`,
    ])
  })

  describe('a file in the folders of a resource with a schema file and of one without', () => {
    test('belongs to the nested folder: the resource with the schema file types it', async () => {
      const {options, warnings} = await plan([fetched(), local('./src/staging/*.ts')])

      expect(options?.path).toEqual(['src/staging/**/*.groq'])
      expect(warnings).toEqual([
        `No declarations for the 2 .groq files under "src": ${untypedBecause}`,
      ])
    })

    test('belongs to the nested folder: the resource without is left out of its folder', async () => {
      const {options, warnings} = await plan([fetched('./src/production/*.ts'), local()])

      expect(options?.path).toEqual(['src/**/*.groq', '!src/production/**'])
      expect(warnings).toEqual([
        `No declarations for the 1 .groq file under "src/production": ${untypedBecause}`,
      ])
    })

    test('belongs to the resource listed first when the folders are the same', async () => {
      const fetchedFirst = await plan([fetched(), local()])
      expect(fetchedFirst.options?.path).toEqual(['src/**/*.groq', '!src/**'])
      expect(fetchedFirst.warnings).toEqual([
        `No declarations for the 3 .groq files under "src": ${untypedBecause}`,
      ])

      const localFirst = await plan([local(), fetched()])
      expect(localFirst.options?.path).toEqual(['src/**/*.groq'])
      expect(localFirst.warnings).toEqual([])
    })

    test('belongs to the resource with the longest folder, wherever that folder is', async () => {
      // As codegen measures it: production's `queries/production` is longer than `src/staging`.
      const {options, warnings} = await plan([
        fetched(['./src/**/*.ts', './queries/production/**/*.ts']),
        local('./src/staging/*.ts'),
      ])

      expect(options?.path).toEqual(['src/staging/**/*.groq', '!src/staging/**'])
      expect(warnings).toEqual([
        `No declarations for the 3 .groq files under "src": ${untypedBecause}`,
      ])
    })

    test('is found anywhere in the project when the folder is .', async () => {
      const {options, warnings} = await plan([fetched('.'), local()])

      expect(options?.path).toEqual(['src/**/*.groq'])
      expect(warnings).toEqual([
        `No declarations for the 1 .groq file in the project: ${untypedBecause}`,
      ])

      const wholeProject = await plan([fetched('.'), local('.')])
      expect(wholeProject.options?.path).toEqual(['**/*.groq', '!**'])
      expect(wholeProject.warnings).toEqual([
        `No declarations for the 4 .groq files in the project: ${untypedBecause}`,
      ])
    })
  })
})

describe('createGroqDeclarationsRunner', () => {
  const options = {path: ['src/**/*.groq'], root: workDir, schema: './schema.json'}
  const declaration: GroqDeclaration = {
    declaration: path.join(workDir, 'src', 'posts.d.groq.ts'),
    diagnostics: [],
    file: path.join(workDir, 'src', 'posts.groq'),
    written: true,
  }

  test('generates with the options and reports the declarations', async () => {
    mockGenerateGroqDeclarations.mockResolvedValue([declaration])
    const onGenerated = vi.fn()
    const onError = vi.fn()

    await createGroqDeclarationsRunner({onError, onGenerated, options})()

    expect(mockGenerateGroqDeclarations).toHaveBeenCalledExactlyOnceWith(options)
    expect(onGenerated).toHaveBeenCalledExactlyOnceWith([declaration])
    expect(onError).not.toHaveBeenCalled()
  })

  test('reports a failure instead of throwing', async () => {
    const error = new Error('No schema file at schema.json')
    mockGenerateGroqDeclarations.mockRejectedValue(error)
    const onGenerated = vi.fn()
    const onError = vi.fn()

    await createGroqDeclarationsRunner({onError, onGenerated, options})()

    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(onGenerated).not.toHaveBeenCalled()
  })

  test('runs once more after runs requested during a run', async () => {
    const firstGeneration = createDeferred<GroqDeclaration[]>()
    mockGenerateGroqDeclarations
      .mockImplementationOnce(() => firstGeneration.promise)
      .mockResolvedValue([])
    const onGenerated = vi.fn()
    const run = createGroqDeclarationsRunner({onError: vi.fn(), onGenerated, options})

    const first = run()
    await run()
    await run()
    expect(mockGenerateGroqDeclarations).toHaveBeenCalledOnce()

    firstGeneration.resolve([declaration])
    await first
    expect(mockGenerateGroqDeclarations).toHaveBeenCalledTimes(2)
    expect(onGenerated.mock.calls).toEqual([[[declaration]], [[]]])
  })
})
