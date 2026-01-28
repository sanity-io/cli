import {access, mkdir, writeFile} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {convertToSystemPath, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ExtractManifestCommand} from '../extract.js'

vi.mock('node:fs/promises')

vi.mock('../../../util/importStudioConfig.js', async () => ({
  importStudioConfig: vi.fn(),
}))

vi.mock('../../../util/readModuleVersion.js', () => ({
  readModuleVersion: vi.fn(),
}))

vi.mock('../../../actions/manifest/extractWorkspaceManifest.js', async () => ({
  extractWorkspaceManifest: vi.fn().mockResolvedValue([
    {
      basePath: '/',
      dataset: 'test',
      name: 'test-name',
      projectId: 'test-project-id',
      schema: [
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
      ],
      title: 'Test Studio',
      tools: [
        {
          icon: null,
          name: 'structure',
          title: 'Structure',
          type: 'sanity/structure',
        },
      ],
    },
  ]),
}))

const NO_ERROR = {}

const mockAccess = vi.mocked(access)
const mockMkdir = vi.mocked(mkdir)
const mockWriteFile = vi.mocked(writeFile)

describe('#manifest:extract', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show --help text', async () => {
    const {error = NO_ERROR, stdout} = await runCommand('manifest extract --help')

    expect(error, 'should not error').toStrictEqual(NO_ERROR)
    expect(stdout).toMatchInlineSnapshot(`
      "Extracts the studio configuration as one or more JSON manifest files.

      USAGE
        $ sanity manifest extract [--path <value>]

      FLAGS
        --path=<value>  [default: /dist/static] Optional path to specify destination
                        directory of the manifest files

      DESCRIPTION
        Extracts the studio configuration as one or more JSON manifest files.

        **Note**: This command is experimental and subject to change. It is currently
        intended for use with Create only.

      EXAMPLES
        Extracts manifests

          $ sanity manifest extract

        Extracts manifests into /public/static

          $ sanity manifest extract --path /public/static

      "
    `)
  })

  test('should extract manifest files', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr} = await testCommand(ExtractManifestCommand, [], {
      mocks: {
        projectRoot: {
          directory: '/test/path',
          path: '/test/path/sanity.config.ts',
          type: 'studio',
        },
      },
    })

    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')

    expect(mockMkdir).toHaveBeenCalledWith(
      convertToSystemPath('/test/path/dist/static'),
      {recursive: true},
    )

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('create-schema.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"post\"`),
    )

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('create-tools.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"structure\"`),
    )

    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/path/dist/static/create-manifest.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"test-name\"`),
    )
  })

  test('should extract manifest files with path flag', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr} = await testCommand(ExtractManifestCommand, ['--path', '/test/static'], {
      mocks: {
        projectRoot: {
          directory: '/test/path',
          path: '/test/path/sanity.config.ts',
          type: 'studio',
        },
      },
    })

    expect(stderr).toContain('Extracting manifest')
    expect(stderr).toContain('Extracted manifest')

    expect(mockMkdir).toHaveBeenCalledWith(
      convertToSystemPath('/test/path/test/static'),
      {recursive: true},
    )

    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/path/test/static/create-manifest.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"test-name\"`),
    )
  })
})
