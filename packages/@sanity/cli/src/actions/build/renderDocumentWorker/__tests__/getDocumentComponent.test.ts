import path from 'node:path'
import {type MessagePort} from 'node:worker_threads'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {buildDebug} from '../../buildDebug.js'
import {BasicDocument} from '../components/BasicDocument.jsx'
import {DefaultDocument} from '../components/DefaultDocument.jsx'
import {getDocumentComponent} from '../getDocumentComponent.js'
import {tryLoadDocumentComponent} from '../tryLoadDocumentComponent.js'

// Mock all dependencies
vi.mock('../../buildDebug.js')
vi.mock('../tryLoadDocumentComponent.js')

const mockBuildDebug = vi.mocked(buildDebug)
const mockTryLoadDocumentComponent = vi.mocked(tryLoadDocumentComponent)

describe('getDocumentComponent', () => {
  let mockParent: MessagePort
  const mockStudioRootPath = '/mock/studio/path'

  beforeEach(() => {
    vi.clearAllMocks()
    // Create a mock MessagePort with the postMessage method
    mockParent = {
      postMessage: vi.fn(),
    } as unknown as MessagePort

    // Set up default return value for process.cwd() mock
    vi.spyOn(process, 'cwd').mockReturnValue('/current/working/directory')
  })

  test('should return BasicDocument when isApp is true and no user-defined component exists', async () => {
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    const result = await getDocumentComponent(mockParent, mockStudioRootPath, true)

    expect(result).toBe(BasicDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Loading default document component from `sanity` module',
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Attempting to load user-defined document component from %s',
      mockStudioRootPath,
    )
    expect(mockBuildDebug).toHaveBeenCalledWith('Using default document component')
    expect(mockTryLoadDocumentComponent).toHaveBeenCalledWith(mockStudioRootPath)
  })

  test('should return DefaultDocument when isApp is false and no user-defined component exists', async () => {
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    const result = await getDocumentComponent(mockParent, mockStudioRootPath, false)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Loading default document component from `sanity` module',
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Attempting to load user-defined document component from %s',
      mockStudioRootPath,
    )
    expect(mockBuildDebug).toHaveBeenCalledWith('Using default document component')
    expect(mockTryLoadDocumentComponent).toHaveBeenCalledWith(mockStudioRootPath)
  })

  test('should return DefaultDocument when isApp is undefined and no user-defined component exists', async () => {
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Loading default document component from `sanity` module',
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Attempting to load user-defined document component from %s',
      mockStudioRootPath,
    )
    expect(mockBuildDebug).toHaveBeenCalledWith('Using default document component')
    expect(mockTryLoadDocumentComponent).toHaveBeenCalledWith(mockStudioRootPath)
  })

  test('should return user-defined component with default export function', async () => {
    const mockUserComponent = vi.fn()
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {
        default: mockUserComponent,
      },
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(mockUserComponent)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Found user defined document component at %s',
      mockComponentPath,
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component is a function, assuming valid',
    )
    expect(mockTryLoadDocumentComponent).toHaveBeenCalledWith(mockStudioRootPath)
  })

  test('should return user-defined component with CommonJS export function', async () => {
    const mockUserComponent = vi.fn()
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: mockUserComponent, // CommonJS style export without default
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(mockUserComponent)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'Found user defined document component at %s',
      mockComponentPath,
    )
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component is a function, assuming valid',
    )
    expect(mockTryLoadDocumentComponent).toHaveBeenCalledWith(mockStudioRootPath)
  })

  test('should handle non-function default export and post warning message', async () => {
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890
    const mockRelativePath = 'mock/user/component.js'

    vi.spyOn(path, 'relative').mockReturnValue(mockRelativePath)

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {
        default: 'not-a-function',
        namedExport1: vi.fn(),
        namedExport2: 'some-value',
      },
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component did not have a default export',
    )
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      message: [
        `${mockRelativePath} did not have a default export that is a React component (type was string)`,
        'Named exports/properties found: default, namedExport1, namedExport2',
        'Using default document component from "sanity".',
      ],
      type: 'warning',
      warnKey: `${mockRelativePath}/${mockModified}`,
    })
    expect(path.relative).toHaveBeenCalledWith('/current/working/directory', mockComponentPath)
  })

  test('should handle undefined default export and post warning message', async () => {
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890
    const mockRelativePath = 'mock/user/component.js'

    vi.spyOn(path, 'relative').mockReturnValue(mockRelativePath)

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {
        namedExport1: vi.fn(),
        namedExport2: 'some-value',
      },
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component did not have a default export',
    )
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      message: [
        `${mockRelativePath} did not have a default export that is a React component`,
        'Named exports/properties found: namedExport1, namedExport2',
        'Using default document component from "sanity".',
      ],
      type: 'warning',
      warnKey: `${mockRelativePath}/${mockModified}`,
    })
    expect(path.relative).toHaveBeenCalledWith('/current/working/directory', mockComponentPath)
  })

  test('should handle component with no named exports and post warning message', async () => {
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890
    const mockRelativePath = 'mock/user/component.js'

    vi.spyOn(path, 'relative').mockReturnValue(mockRelativePath)

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {
        default: null,
      },
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component did not have a default export',
    )
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      message: [
        `${mockRelativePath} did not have a default export that is a React component (type was object)`,
        'Named exports/properties found: default',
        'Using default document component from "sanity".',
      ],
      type: 'warning',
      warnKey: `${mockRelativePath}/${mockModified}`,
    })
  })

  test('should handle component with empty object and post warning message', async () => {
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890
    const mockRelativePath = 'mock/user/component.js'

    vi.spyOn(path, 'relative').mockReturnValue(mockRelativePath)

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {},
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(DefaultDocument)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component did not have a default export',
    )
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      message: [
        `${mockRelativePath} did not have a default export that is a React component`,
        'Named exports/properties found: None',
        'Using default document component from "sanity".',
      ],
      type: 'warning',
      warnKey: `${mockRelativePath}/${mockModified}`,
    })
  })

  test('should use different document component based on isApp parameter', async () => {
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    // Test with isApp = true
    const resultApp = await getDocumentComponent(mockParent, mockStudioRootPath, true)
    expect(resultApp).toBe(BasicDocument)

    // Reset mocks and test with isApp = false
    vi.clearAllMocks()
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    const resultStudio = await getDocumentComponent(mockParent, mockStudioRootPath, false)
    expect(resultStudio).toBe(DefaultDocument)
  })

  test('should prioritize default export over CommonJS when both exist', async () => {
    const mockDefaultComponent = vi.fn()
    const mockCommonJSComponent = vi.fn()
    const mockComponentPath = '/mock/user/component.js'
    const mockModified = 1_234_567_890

    mockTryLoadDocumentComponent.mockResolvedValue({
      component: {
        default: mockDefaultComponent,
        // This simulates a case where both default and CommonJS patterns might exist
        ...mockCommonJSComponent,
      },
      modified: mockModified,
      path: mockComponentPath,
    })

    const result = await getDocumentComponent(mockParent, mockStudioRootPath)

    expect(result).toBe(mockDefaultComponent)
    expect(mockBuildDebug).toHaveBeenCalledWith(
      'User defined document component is a function, assuming valid',
    )
  })

  test('should call all debug statements in correct order', async () => {
    mockTryLoadDocumentComponent.mockResolvedValue(null)

    await getDocumentComponent(mockParent, mockStudioRootPath)

    // Verify debug calls are made in the expected order
    expect(mockBuildDebug).toHaveBeenNthCalledWith(
      1,
      'Loading default document component from `sanity` module',
    )
    expect(mockBuildDebug).toHaveBeenNthCalledWith(
      2,
      'Attempting to load user-defined document component from %s',
      mockStudioRootPath,
    )
    expect(mockBuildDebug).toHaveBeenNthCalledWith(3, 'Using default document component')
  })
})
