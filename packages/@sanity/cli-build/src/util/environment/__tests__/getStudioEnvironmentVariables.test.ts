import {resolveLocalPackagePath} from '@sanity/cli-core'
import {doImport} from '@sanity/cli-core/util'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getStudioEnvironmentVariables} from '../getStudioEnvironmentVariables.js'

vi.mock('@sanity/cli-core/util', () => ({doImport: vi.fn()}))
vi.mock('@sanity/cli-core', () => ({resolveLocalPackagePath: vi.fn()}))

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
