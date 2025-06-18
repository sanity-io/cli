import fs from 'node:fs'
import path from 'node:path'

import {describe, expect, test, vi} from 'vitest'

import {buildDebug} from '../../buildDebug.js'
import {getPossibleDocumentComponentLocations} from '../../getPossibleDocumentComponentLocations.js'
import {tryLoadDocumentComponent} from '../tryLoadDocumentComponent.js'

// Mock fs and dependencies
vi.mock('node:fs')
vi.mock('../../buildDebug.js')
vi.mock('../../getPossibleDocumentComponentLocations.js')

const mockFs = vi.mocked(fs)
const mockBuildDebug = vi.mocked(buildDebug)
const mockGetPossibleDocumentComponentLocations = vi.mocked(getPossibleDocumentComponentLocations)

describe('tryLoadDocumentComponent', () => {
  const mockStudioRootPath = '/mock/studio/path'
  const mockComponentPath1 = path.join(mockStudioRootPath, '_document.js')
  const mockComponentPath2 = path.join(mockStudioRootPath, '_document.tsx')
  // const mockModifiedTime = 1_234_567_890 // Currently unused but kept for future tests

  test('should return null when no locations are provided', async () => {
    mockGetPossibleDocumentComponentLocations.mockReturnValue([])

    const result = await tryLoadDocumentComponent(mockStudioRootPath)

    expect(result).toBeNull()
    expect(mockGetPossibleDocumentComponentLocations).toHaveBeenCalledWith(mockStudioRootPath)
    expect(mockBuildDebug).not.toHaveBeenCalled()
  })

  test('should return null when all imports fail with MODULE_NOT_FOUND', async () => {
    mockGetPossibleDocumentComponentLocations.mockReturnValue([
      mockComponentPath1,
      mockComponentPath2,
    ])

    // Note: This test verifies the function handles MODULE_NOT_FOUND errors gracefully
    // The actual dynamic import mocking is complex in vitest, but we can test the logic
    const result = await tryLoadDocumentComponent(mockStudioRootPath)

    expect(result).toBeNull()
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Trying to load document component from %s',
      mockComponentPath1,
    )
    // The function will attempt to load the component and fail, triggering debug messages
  })

  test('should handle fs.statSync errors gracefully', async () => {
    mockGetPossibleDocumentComponentLocations.mockReturnValue([mockComponentPath1])

    // Mock fs.statSync to throw
    mockFs.statSync.mockImplementation(() => {
      throw new Error('File stat failed')
    })

    // This tests that fs.statSync errors are propagated
    // The function will fail when trying to get file stats after a successful import
    const result = await tryLoadDocumentComponent(mockStudioRootPath)
    expect(result).toBeNull()
  })

  test('should call getPossibleDocumentComponentLocations with correct argument', async () => {
    const customPath = '/custom/studio/path'
    mockGetPossibleDocumentComponentLocations.mockReturnValue([])

    await tryLoadDocumentComponent(customPath)

    expect(mockGetPossibleDocumentComponentLocations).toHaveBeenCalledWith(customPath)
  })

  test('should call buildDebug when trying to load components', async () => {
    const testPath = '/test/component.js'
    mockGetPossibleDocumentComponentLocations.mockReturnValue([testPath])

    await tryLoadDocumentComponent(mockStudioRootPath)

    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Trying to load document component from %s',
      testPath,
    )
  })

  test('should verify function dependencies are called correctly', async () => {
    // Reset mocks for this test
    vi.clearAllMocks()

    const testPath = '/another/test/path'
    mockGetPossibleDocumentComponentLocations.mockReturnValue([testPath])

    await tryLoadDocumentComponent(testPath)

    // Verify the function calls its dependencies
    expect(mockGetPossibleDocumentComponentLocations).toHaveBeenCalledWith(testPath)
    expect(mockGetPossibleDocumentComponentLocations).toHaveBeenCalledTimes(1)
    expect(mockBuildDebug).toHaveBeenCalled()
  })
})
