import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, rmdir, stat, unlink, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {mockApi, testCommand, testFixture} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test} from 'vitest'

import {TypegenGenerateCommand} from '../../../../src/commands/typegen/generate.js'
import {
  SCHEMA_BINDING_API_VERSION,
  SCHEMA_DESCRIPTOR_API_VERSION,
} from '../../../../src/services/schemas.js'

/** A descriptor read from the schema API for a test project, with a required `book.title`. */
const descriptor = JSON.parse(
  await readFile(
    new URL('../../../__fixtures__/typegen/schema-descriptor.json', import.meta.url),
    'utf8',
  ),
)

/** The same `book` type as the descriptor, but its `title` is a number. */
const stagingSchema = [
  {
    attributes: {
      _id: {type: 'objectAttribute', value: {type: 'string'}},
      _type: {type: 'objectAttribute', value: {type: 'string', value: 'book'}},
      title: {optional: true, type: 'objectAttribute', value: {type: 'number'}},
    },
    name: 'book',
    type: 'document',
  },
]

const query = `import {defineQuery} from 'groq'

export const bookTitleQuery = defineQuery('*[_type == "book"][0]{title}')
`

/** The same query as `bookTitleQuery`, in its own file. */
const groqFile = '*[_type == "book"][0]{title}\n'

async function setUpProject(typegen: Record<string, unknown>): Promise<string> {
  const cwd = await testFixture('basic-app')
  process.chdir(cwd)

  await writeFile(
    join(cwd, 'sanity.cli.ts'),
    `export default ${JSON.stringify({typegen: {formatGeneratedCode: false, ...typegen}}, null, 2)}\n`,
  )
  await writeFile(join(cwd, 'staging.schema.json'), JSON.stringify(stagingSchema))
  for (const dataset of ['production', 'staging']) {
    await mkdir(join(cwd, 'src', dataset), {recursive: true})
    await writeFile(join(cwd, 'src', dataset, 'queries.ts'), query)
  }
  return cwd
}

const production = {
  dataset: 'production',
  enforceRequiredFields: true,
  generates: './src/production.types.ts',
  path: './src/production/*.ts',
  projectId: 'abc123',
}
const staging = {
  dataset: 'staging',
  generates: './src/staging.types.ts',
  path: './src/staging/*.ts',
  projectId: 'abc123',
  schema: './staging.schema.json',
}

function mockBinding(projectId: string, dataset: string) {
  return mockApi({
    apiVersion: SCHEMA_BINDING_API_VERSION,
    uri: `/schemas/dataset/${projectId}.${dataset}`,
  })
}

describe('#typegen:generate with typegen.resources', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    cleanAll()
  })

  test('generates a file per resource from a bound schema and a local schema', async () => {
    const cwd = await setUpProject({resources: [production, staging]})
    mockBinding('abc123', 'production').reply(
      200,
      {
        _meta: {producer: 'api', schemaVersion: 'uEiB-test', source: null, sourceLabel: null},
        name: 'schema',
        types: [],
      },
      // The API sends this for every vX request.
      {
        'x-sanity-warning':
          'This is an experimental API version, which will change without warning and may have serious bugs.',
      },
    )
    mockApi({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      uri: '/descriptors/schemas/uEiB-test',
    }).reply(200, descriptor)

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [])
    if (error) throw error

    expect(pendingMocks()).toEqual([])
    expect(stderr).toContain('Fetched the schema bound to abc123.production (uEiB-test)')
    expect(stderr).not.toContain('experimental API version')
    expect(stderr).not.toContain('which will change without warning')

    const productionTypes = await readFile(join(cwd, 'src', 'production.types.ts'), 'utf8')
    expect(productionTypes).toContain('"abc123.production": AllSanitySchemaTypes')
    expect(productionTypes).toMatch(/export type Book = \{[^}]*\btitle: string;/)
    expect(productionTypes).toMatch(
      /"abc123\.production": \{\s*["']\*\[_type == \\?"book\\?"\]\[0\]\{title\}["']: BookTitleQueryResult;/,
    )

    const stagingTypes = await readFile(join(cwd, 'src', 'staging.types.ts'), 'utf8')
    expect(stagingTypes).toContain('"abc123.staging": AllSanitySchemaTypes')
    // A projection of an optional field is null when the field is missing.
    expect(stagingTypes).toMatch(/export type BookTitleQueryResult = \{\s*title: number \| null;/)

    // With more than one resource, the flat client query map would conflict across files.
    for (const types of [productionTypes, stagingTypes]) {
      expect(types).not.toContain('declare module "@sanity/client"')
    }
  })

  test('writes nothing when a dataset has no bound schema', async () => {
    const cwd = await setUpProject({resources: [staging, production]})
    mockBinding('abc123', 'production').reply(404, {
      error: 'Not Found',
      message: 'No default schema binding found for dataset abc123.production',
      statusCode: 404,
    })

    const {error} = await testCommand(TypegenGenerateCommand, [])

    expect(error?.message).toContain('No schema is bound to dataset "abc123.production"')
    expect(error?.oclif?.exit).toBe(1)
    expect(existsSync(join(cwd, 'src', 'staging.types.ts'))).toBe(false)
    expect(existsSync(join(cwd, 'src', 'production.types.ts'))).toBe(false)
  })

  test('writes nothing when a later local schema file is malformed', async () => {
    const cwd = await setUpProject({resources: [production, staging]})
    await writeFile(join(cwd, 'staging.schema.json'), JSON.stringify(stagingSchema).slice(0, 40))
    mockBinding('abc123', 'production').reply(200, {
      _meta: {producer: 'api', schemaVersion: 'uEiB-test', source: null, sourceLabel: null},
      name: 'schema',
      types: [],
    })
    mockApi({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      uri: '/descriptors/schemas/uEiB-test',
    }).reply(200, descriptor)

    const {error} = await testCommand(TypegenGenerateCommand, [])

    expect(error?.message).toContain('Schema file for "abc123.staging" is not valid JSON')
    expect(error?.oclif?.exit).toBe(1)
    expect(existsSync(join(cwd, 'src', 'production.types.ts'))).toBe(false)
    expect(existsSync(join(cwd, 'src', 'staging.types.ts'))).toBe(false)
  })

  test('types the .groq files in the folders of each resource with a schema file', async () => {
    const cwd = await setUpProject({resources: [production, staging]})
    await writeFile(join(cwd, 'src', 'staging', 'bookTitle.groq'), groqFile)
    await writeFile(join(cwd, 'src', 'production', 'bookTitle.groq'), groqFile)
    mockBinding('abc123', 'production').reply(200, {
      _meta: {producer: 'api', schemaVersion: 'uEiB-test', source: null, sourceLabel: null},
      name: 'schema',
      types: [],
    })
    mockApi({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      uri: '/descriptors/schemas/uEiB-test',
    }).reply(200, descriptor)

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [])
    if (error) throw error

    // Staging's schema is a file, so its `.groq` file is typed against it.
    const declaration = await readFile(join(cwd, 'src', 'staging', 'bookTitle.d.groq.ts'), 'utf8')
    expect(declaration).toMatch(/export type QueryResponse = \{\s*title: number \| null;/)
    expect(declaration).toContain('export default query')
    expect(stderr).toContain('Generated declarations for 1 .groq file')

    // Production's is fetched, which .groq files cannot be typed against yet.
    expect(existsSync(join(cwd, 'src', 'production', 'bookTitle.d.groq.ts'))).toBe(false)
    expect(stderr).toContain('No declarations for the 1 .groq file under "src/production"')
  })
})

/** Resolves once `check` returns true, or rejects after `timeout` milliseconds. */
async function waitUntil(check: () => Promise<boolean>, timeout = 20_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function fileIncludes(path: string, text: string): Promise<boolean> {
  try {
    return (await readFile(path, 'utf8')).includes(text)
  } catch {
    return false
  }
}

/**
 * Runs the command with `--watch`. `stop` calls the SIGINT handler the command registered, and
 * none registered by anything else.
 */
function startWatching() {
  const otherListeners = new Set(process.listeners('SIGINT'))
  const promise = testCommand(TypegenGenerateCommand, ['--watch'])
  const stop = () => {
    process.listeners('SIGINT').find((listener) => !otherListeners.has(listener))?.('SIGINT')
  }
  return {promise, stop}
}

describe('#typegen:generate --watch with typegen.resources', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    cleanAll()
  })

  test('generates again when a query changes, and not when it writes its own output', async () => {
    // The output matches the query pattern, as in the App SDK guide.
    const cwd = await setUpProject({resources: [{...staging, generates: './src/staging/types.ts'}]})
    const output = join(cwd, 'src', 'staging', 'types.ts')

    const {promise, stop} = startWatching()
    try {
      await waitUntil(() => fileIncludes(output, 'BookTitleQueryResult'))

      await writeFile(
        join(cwd, 'src', 'staging', 'queries.ts'),
        `${query}\nexport const bookIdsQuery = defineQuery('*[_type == "book"]._id')\n`,
      )
      await waitUntil(() => fileIncludes(output, 'BookIdsQueryResult'))

      // A run started by writing the output would write it again about a second later.
      const {mtimeMs} = await stat(output)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      expect((await stat(output)).mtimeMs).toBe(mtimeMs)
    } finally {
      stop()
    }

    const {error, stdout} = await promise
    if (error) throw error
    expect(stdout).toContain('change: src/staging/queries.ts')
    expect(stdout).not.toContain('types.ts')
  })

  test('picks up a query directory that is removed with its parent and created again', async () => {
    const cwd = await setUpProject({
      resources: [{...staging, generates: './staging.types.ts', path: './queries/staging/*.ts'}],
    })
    await mkdir(join(cwd, 'queries', 'staging'), {recursive: true})
    await writeFile(join(cwd, 'queries', 'staging', 'queries.ts'), query)
    const output = join(cwd, 'staging.types.ts')

    const {promise, stop} = startWatching()
    try {
      await waitUntil(() => fileIncludes(output, 'BookTitleQueryResult'))

      // As when switching to a git branch without the directory and back: the file, then each
      // directory up to `queries`, without pauses. Then wait for the run that the removal starts,
      // so only a renewed watch can see the directory come back.
      await unlink(join(cwd, 'queries', 'staging', 'queries.ts'))
      await rmdir(join(cwd, 'queries', 'staging'))
      await rmdir(join(cwd, 'queries'))
      await waitUntil(async () => !(await fileIncludes(output, 'BookTitleQueryResult')))

      await mkdir(join(cwd, 'queries', 'staging'), {recursive: true})
      await writeFile(
        join(cwd, 'queries', 'staging', 'queries.ts'),
        `${query}\nexport const bookIdsQuery = defineQuery('*[_type == "book"]._id')\n`,
      )
      await waitUntil(() => fileIncludes(output, 'BookIdsQueryResult'))
    } finally {
      stop()
    }

    const {error} = await promise
    if (error) throw error
  })

  test('generates once a local schema file that was missing at startup appears', async () => {
    const cwd = await setUpProject({resources: [staging]})
    const schema = await readFile(join(cwd, 'staging.schema.json'), 'utf8')
    await rm(join(cwd, 'staging.schema.json'))
    const output = join(cwd, 'src', 'staging.types.ts')

    const {promise, stop} = startWatching()
    const capture = process.stderr.write
    let logged = ''
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
      logged += chunk.toString()
      return capture.call(process.stderr, chunk, ...rest)
    }) as typeof process.stderr.write
    try {
      await waitUntil(async () => logged.includes('Schema file not found'))
      expect(existsSync(output)).toBe(false)

      await writeFile(join(cwd, 'staging.schema.json'), schema)
      await waitUntil(() => fileIncludes(output, 'BookTitleQueryResult'))
    } finally {
      stop()
    }

    const {error, stderr} = await promise
    if (error) throw error
    expect(stderr).toContain('Failed to generate types for "abc123.staging": Schema file not found')
  })

  test('generates from the schema fetched at startup on every run', async () => {
    const cwd = await setUpProject({resources: [production, staging]})
    // Each mock answers one request.
    mockBinding('abc123', 'production').reply(200, {
      _meta: {producer: 'api', schemaVersion: 'uEiB-test', source: null, sourceLabel: null},
      name: 'schema',
      types: [],
    })
    mockApi({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      uri: '/descriptors/schemas/uEiB-test',
    }).reply(200, descriptor)
    const output = join(cwd, 'src', 'production.types.ts')

    const {promise, stop} = startWatching()
    try {
      await waitUntil(() => fileIncludes(join(cwd, 'src', 'staging.types.ts'), 'Book'))

      await writeFile(
        join(cwd, 'src', 'production', 'queries.ts'),
        `${query}\nexport const bookIdsQuery = defineQuery('*[_type == "book"]._id')\n`,
      )
      await waitUntil(() => fileIncludes(output, 'BookIdsQueryResult'))
    } finally {
      stop()
    }

    const {error, stderr} = await promise
    if (error) throw error
    expect(pendingMocks()).toEqual([])
    expect(stderr.match(/Fetched the schema bound to abc123\.production/g)).toHaveLength(1)
    // Still the fetched schema, in which `title` is required.
    expect(await readFile(output, 'utf8')).toMatch(/export type Book = \{[^}]*\btitle: string;/)
  })

  test('types a .groq file again when it changes, and not when it writes its declaration', async () => {
    const cwd = await setUpProject({resources: [staging]})
    const groq = join(cwd, 'src', 'staging', 'bookTitle.groq')
    await writeFile(groq, groqFile)
    const declaration = join(cwd, 'src', 'staging', 'bookTitle.d.groq.ts')

    const {promise, stop} = startWatching()
    try {
      await waitUntil(() => fileIncludes(declaration, 'title: number | null'))

      await writeFile(groq, '*[_type == "book"]._id\n')
      await waitUntil(() => fileIncludes(declaration, 'Array<string>'))

      // A run started by writing the declaration would write it again about a second later.
      const {mtimeMs} = await stat(declaration)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      expect((await stat(declaration)).mtimeMs).toBe(mtimeMs)
    } finally {
      stop()
    }

    const {error, stderr, stdout} = await promise
    if (error) throw error
    expect(stdout).toContain('change: src/staging/bookTitle.groq')
    expect(stdout).not.toContain('bookTitle.d.groq.ts')
    expect(stderr).toContain('Generated declarations for 1 .groq file')
  })
})

describe('#typegen:generate without typegen.resources', {timeout: 60 * 1000}, () => {
  test('types the .groq files in the query folders against the schema', async () => {
    const cwd = await setUpProject({
      generates: './src/sanity.types.ts',
      path: './src/staging/*.ts',
      schema: './staging.schema.json',
    })
    await writeFile(join(cwd, 'src', 'staging', 'bookTitle.groq'), groqFile)
    // Outside the folder the queries are read from, so not a query of this project.
    await writeFile(join(cwd, 'src', 'production', 'bookTitle.groq'), groqFile)

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [])
    if (error) throw error

    const declaration = await readFile(join(cwd, 'src', 'staging', 'bookTitle.d.groq.ts'), 'utf8')
    expect(declaration).toMatch(/export type QueryResponse = \{\s*title: number \| null;/)
    expect(declaration).toContain('export type QueryParams = Record<string, never>')
    expect(existsSync(join(cwd, 'src', 'production', 'bookTitle.d.groq.ts'))).toBe(false)
    expect(stderr).toContain('Generated declarations for 1 .groq file')
  })

  test('reports a .groq file with a syntax error, and still types it', async () => {
    const cwd = await setUpProject({
      generates: './src/sanity.types.ts',
      path: './src/staging/*.ts',
      schema: './staging.schema.json',
    })
    await writeFile(join(cwd, 'src', 'staging', 'broken.groq'), '*[_type == "book" &&\n')

    const {error, stderr} = await testCommand(TypegenGenerateCommand, [])
    if (error) throw error

    expect(stderr).toContain('src/staging/broken.groq: Syntax error in GROQ query')
    const declaration = await readFile(join(cwd, 'src', 'staging', 'broken.d.groq.ts'), 'utf8')
    expect(declaration).toContain('export type QueryResponse = unknown')
  })

  test('with --watch, types a .groq file again when it changes, and not when it writes its declaration', async () => {
    const cwd = await setUpProject({
      generates: './src/sanity.types.ts',
      path: './src/staging/*.ts',
      schema: './staging.schema.json',
    })
    const groq = join(cwd, 'src', 'staging', 'bookTitle.groq')
    await writeFile(groq, groqFile)
    const declaration = join(cwd, 'src', 'staging', 'bookTitle.d.groq.ts')
    const output = join(cwd, 'src', 'sanity.types.ts')

    const {promise, stop} = startWatching()
    try {
      await waitUntil(() => fileIncludes(declaration, 'title: number | null'))

      await writeFile(groq, '*[_type == "book"]._id\n')
      await waitUntil(() => fileIncludes(declaration, 'Array<string>'))

      // The declaration matches the query pattern. A run started by writing it would write the
      // types again about a second later.
      const {mtimeMs} = await stat(output)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      expect((await stat(output)).mtimeMs).toBe(mtimeMs)
    } finally {
      stop()
    }

    const {error, stderr, stdout} = await promise
    if (error) throw error
    expect(stdout).toContain('bookTitle.groq')
    expect(stdout).not.toContain('bookTitle.d.groq.ts')
    expect(stderr).toContain('Generated declarations for 1 .groq file')
  })

  test('generates one file from a single schema, as before resources were added', async () => {
    const cwd = await setUpProject({
      generates: './src/sanity.types.ts',
      path: './src/staging/*.ts',
      schema: './staging.schema.json',
    })

    const {error} = await testCommand(TypegenGenerateCommand, [])
    if (error) throw error

    const types = await readFile(join(cwd, 'src', 'sanity.types.ts'), 'utf8')
    expect(types).toMatch(/export type Book = \{[^}]*\btitle\?: number;/)
    expect(types).toMatch(/export type BookTitleQueryResult = \{\s*title: number \| null;/)
    // `overloadClientMethods` is on by default without resources, so the flat client query
    // map is still written.
    expect(types).toContain('declare module "@sanity/client"')
    expect(types).toMatch(
      /["']\*\[_type == \\?"book\\?"\]\[0\]\{title\}["']: BookTitleQueryResult;/,
    )
    expect(types).not.toContain('SanitySchemasByResource')
    expect(types).not.toContain('SanityQueriesByResource')
  })
})
