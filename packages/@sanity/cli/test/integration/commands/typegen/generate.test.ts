import {existsSync} from 'node:fs'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
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

async function setUpProject(resources: unknown[]): Promise<string> {
  const cwd = await testFixture('basic-app')
  process.chdir(cwd)

  await writeFile(
    join(cwd, 'sanity.cli.ts'),
    `export default ${JSON.stringify({typegen: {formatGeneratedCode: false, resources}}, null, 2)}\n`,
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
    const cwd = await setUpProject([production, staging])
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
    const cwd = await setUpProject([staging, production])
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
    const cwd = await setUpProject([production, staging])
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
})
