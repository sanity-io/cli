import {mkdir, writeFile} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {convertToSystemPath, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ExtractSchemaCommand} from '../extract.js'

vi.mock('node:fs/promises')

const defaultMocks = {
  projectRoot: {
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    type: 'studio' as const,
  },
}

vi.mock('../../../util/getWorkspace.js', () => ({
  getWorkspace: vi.fn().mockReturnValue({}),
}))

vi.mock('../../../util/importStudioConfig.js', async () => ({
  importStudioConfig: vi.fn(),
}))

vi.mock('@sanity/schema/_internal', () => ({
  extractSchema: vi.fn().mockReturnValue([
    {
      fields: [
        {
          name: 'type',
          title: 'string',
        },
      ],
      name: 'post',
      type: 'document',
    },
  ]),
}))

const mockMkdir = vi.mocked(mkdir)
const mockWriteFile = vi.mocked(writeFile)

describe('#schema:extract', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show --help text', async () => {
    const {stdout} = await runCommand('schema extract --help')

    expect(stdout).toMatchInlineSnapshot(`
      "Extracts a JSON representation of a Sanity schema within a Studio context.

      USAGE
        $ sanity schema extract [--enforce-required-fields] [--format <format>]
          [--path <value>] [--workspace <name>]

      FLAGS
        --enforce-required-fields  Makes the schema generated treat fields marked as
                                   required as non-optional
        --format=<format>          [default: groq-type-nodes] Format the schema as
                                   GROQ type nodes. Only available format at the
                                   moment.
        --path=<value>             Optional path to specify destination of the schema
                                   file
        --workspace=<name>         The name of the workspace to generate a schema for

      DESCRIPTION
        Extracts a JSON representation of a Sanity schema within a Studio context.

        **Note**: This command is experimental and subject to change.

      EXAMPLES
        Extracts schema types in a Sanity project with more than one workspace

          $ sanity schema extract --workspace default

      "
    `)
  })

  test('should extract schema', async () => {
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr} = await testCommand(ExtractSchemaCommand, [], {mocks: defaultMocks})

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('schema.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"post\"`),
    )
  })

  test('should extract schema with enforce-required-fields flag', async () => {
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr} = await testCommand(ExtractSchemaCommand, ['--enforce-required-fields'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('Extracting schema with enforced required fields')
  })

  test('should extract schema with path flag', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr} = await testCommand(ExtractSchemaCommand, ['--path', '/test'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Extracted schema')

    expect(mockMkdir).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/test'),
      {recursive: true},
    )

    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/test/schema.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"post\"`),
    )
  })

  test('throws an error if format flag is not groq-type-nodes', async () => {
    const {error, stderr} = await testCommand(ExtractSchemaCommand, ['--format', 'test-format'], {
      mocks: defaultMocks,
    })

    expect(stderr).toContain('Extracting schema')
    expect(stderr).toContain('Failed to extract schema')
    expect(error?.message).toContain('Unsupported format: "test-format"')
  })
})
