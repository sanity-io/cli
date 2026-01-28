import {access, mkdir, writeFile} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {input} from '@sanity/cli-core/ux'
import {convertToSystemPath, testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {MediaCreateAspectCommand} from '../create-aspect.js'

vi.mock('node:fs/promises')
vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
  }
})

const mockInput = vi.mocked(input)
const mockMkdir = vi.mocked(mkdir)
const mockAccess = vi.mocked(access)
const mockWriteFile = vi.mocked(writeFile)

const defaultMocks = {
  cliConfig: {
    mediaLibrary: {
      aspectsPath: '/test/project/aspects',
    },
  },
  projectRoot: {
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    root: '/test/project',
    type: 'studio' as const,
  },
}

describe('#media:create-aspect', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('should show help text correctly', async () => {
    const {stdout} = await runCommand(['media create-aspect --help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Create a new aspect definition file

      USAGE
        $ sanity media create-aspect

      DESCRIPTION
        Create a new aspect definition file

      EXAMPLES
        Create a new aspect definition file

          $ sanity media create-aspect

      "
    `)
  })

  test('should create aspect file successfully', async () => {
    mockInput
      .mockResolvedValueOnce('My Test Aspect') // title
      .mockResolvedValueOnce('myTestAspect') // name

    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    const {stderr, stdout} = await testCommand(MediaCreateAspectCommand, [], {mocks: defaultMocks})

    expect(stderr).toBe('')
    expect(stdout).toContain('✓ Aspect created!')
    expect(stdout).toContain('myTestAspect.ts')
    expect(stdout).toContain('Next steps:')
    expect(stdout).toContain('sanity media deploy-aspect myTestAspect')

    expect(mockMkdir).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects'),
      {recursive: true},
    )
    expect(mockAccess).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects/myTestAspect.ts'),
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects/myTestAspect.ts'),
      expect.stringContaining("name: 'myTestAspect'"),
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      convertToSystemPath('/test/project/aspects/myTestAspect.ts'),
      expect.stringContaining("title: 'My Test Aspect'"),
    )
  })

  test('should generate safe name from title when no name provided', async () => {
    // Mock user inputs - no name provided, should use default based on title
    mockInput
      .mockResolvedValueOnce('My Complex Title!@#') // title
      .mockResolvedValueOnce('myComplexTitle') // name based on title

    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    await testCommand(MediaCreateAspectCommand, [], {mocks: defaultMocks})

    // Should have called writeFile with a safe name
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/myComplexTitle/),
      expect.any(String),
    )
  })

  test('should handle file conflict gracefully', async () => {
    mockInput.mockResolvedValueOnce('Existing Aspect').mockResolvedValueOnce('existingAspect')

    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const {error} = await testCommand(MediaCreateAspectCommand, [], {mocks: defaultMocks})

    expect(error?.message).toContain('A file already exists at')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test.each([
    ['when mediaLibrary not configured', {}],
    ['when mediaLibrary.aspectsPath is undefined', {mediaLibrary: {}}],
  ])('should throw error %s', async (_, config) => {
    const {error} = await testCommand(MediaCreateAspectCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: config,
      },
    })

    expect(error?.message).toContain('media library aspects path')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should create directory if it does not exist', async () => {
    mockInput.mockResolvedValueOnce('Test Aspect').mockResolvedValueOnce('testAspect')

    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    await testCommand(MediaCreateAspectCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          mediaLibrary: {
            aspectsPath: '/new/aspects/path',
          },
        },
      },
    })

    expect(mockMkdir).toHaveBeenCalledWith(
      convertToSystemPath('/new/aspects/path'),
      {recursive: true},
    )
  })

  test('should generate correct template content', async () => {
    mockInput.mockResolvedValueOnce('Custom Aspect').mockResolvedValueOnce('customAspect')

    mockMkdir.mockResolvedValue(undefined)
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))
    mockWriteFile.mockResolvedValue(undefined)

    await testCommand(MediaCreateAspectCommand, [], {mocks: defaultMocks})

    const writeCall = mockWriteFile.mock.calls[0]
    const generatedContent = writeCall?.[1] as string

    expect(generatedContent).toMatchInlineSnapshot(`
      "import {defineAssetAspect, defineField} from 'sanity'

      export default defineAssetAspect({
        name: 'customAspect',
        title: 'Custom Aspect',
        type: 'object',
        fields: [
          defineField({
            name: 'string',
            title: 'Plain String',
            type: 'string',
          }),
        ],
      })
      "
    `)
  })
})
