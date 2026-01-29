import {access, mkdir, writeFile} from 'node:fs/promises'

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

const mockAccess = vi.mocked(access)
const mockMkdir = vi.mocked(mkdir)
const mockWriteFile = vi.mocked(writeFile)

describe('#manifest:extract', () => {
  afterEach(() => {
    vi.clearAllMocks()
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

    expect(mockMkdir).toHaveBeenCalledWith(convertToSystemPath('/test/path/dist/static'), {
      recursive: true,
    })

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

    expect(mockMkdir).toHaveBeenCalledWith(convertToSystemPath('/test/path/test/static'), {
      recursive: true,
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/path/test/static/create-manifest.json'),
      // eslint-disable-next-line no-useless-escape
      expect.stringContaining(`\"name\": \"test-name\"`),
    )
  })
})
