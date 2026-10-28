import {afterEach, describe, expect, test, vi} from 'vitest'

import {doImport} from '../../doImport.js'
import {resolveLocalPackagePath} from '../../resolveLocalPackage.js'
import {getStudioEnvironmentVariables} from '../getStudioEnvironmentVariables.js'

vi.mock('../../doImport.js', () => ({doImport: vi.fn()}))
vi.mock('../../resolveLocalPackage.js', () => ({resolveLocalPackagePath: vi.fn()}))

const mockedDoImport = vi.mocked(doImport)
const mockedResolveLocalPackagePath = vi.mocked(resolveLocalPackagePath)

describe('getStudioEnvironmentVariables', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('loads the Studio-local sanity environment helper', async () => {
    const rootPath = '/project/studio'
    const sanityCliUrl = new URL('file:///project/studio/node_modules/sanity/lib/cli.js')
    const environment = {SANITY_STUDIO_DATASET: 'production'}
    const getEnvVars = vi.fn().mockResolvedValue(environment)
    mockedResolveLocalPackagePath.mockReturnValue(sanityCliUrl)
    mockedDoImport.mockResolvedValue({getStudioEnvironmentVariables: getEnvVars})

    await expect(getStudioEnvironmentVariables(rootPath)).resolves.toEqual(environment)
    expect(mockedResolveLocalPackagePath).toHaveBeenCalledWith('sanity/cli', rootPath)
    expect(mockedDoImport).toHaveBeenCalledWith(sanityCliUrl.href)
    expect(getEnvVars).toHaveBeenCalledWith(rootPath)
  })

  test('rejects a sanity/cli module without the environment helper', async () => {
    mockedResolveLocalPackagePath.mockReturnValue(new URL('file:///sanity/cli.js'))
    mockedDoImport.mockResolvedValue({})

    await expect(getStudioEnvironmentVariables('/project')).rejects.toThrow(
      'Expected `getStudioEnvironmentVariables` from `sanity/cli` to be a function',
    )
  })

  test('wraps import errors', async () => {
    mockedResolveLocalPackagePath.mockReturnValue(new URL('file:///sanity/cli.js'))
    mockedDoImport.mockRejectedValue(new Error('broken import'))

    await expect(getStudioEnvironmentVariables('/project')).rejects.toThrow(
      'Failed to import getStudioEnvironmentVariables from sanity/cli module: broken import',
    )
  })
})
