import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockGetIt = vi.hoisted(() => vi.fn())
const mockHttpErrors = vi.hoisted(() => vi.fn())
const mockHeaders = vi.hoisted(() => vi.fn())
const mockDebug = vi.hoisted(() => vi.fn())
const mockPromise = vi.hoisted(() => vi.fn())
const mockReadPackageUpSync = vi.hoisted(() => vi.fn())

vi.mock('get-it', () => ({
  getIt: mockGetIt,
}))

vi.mock('get-it/middleware', () => ({
  debug: mockDebug,
  headers: mockHeaders,
  httpErrors: mockHttpErrors,
  promise: mockPromise,
}))

vi.mock('read-package-up', () => ({
  readPackageUpSync: mockReadPackageUpSync,
}))

describe('#createRequester', () => {
  let createRequester: (typeof import('../createRequester.js'))['createRequester']

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset modules to get a fresh cache for each test
    vi.resetModules()
    const mod = await import('../createRequester.js')
    createRequester = mod.createRequester

    mockReadPackageUpSync.mockReturnValue({
      packageJson: {name: '@sanity/cli-core', version: '1.0.0'},
      path: '/packages/@sanity/cli-core/package.json',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('applies all default middleware in correct order', () => {
    const httpErrorsResult = {id: 'httpErrors'}
    const headersResult = {id: 'headers'}
    const debugResult = {id: 'debug'}
    const promiseResult = {id: 'promise'}

    mockHttpErrors.mockReturnValue(httpErrorsResult)
    mockHeaders.mockReturnValue(headersResult)
    mockDebug.mockReturnValue(debugResult)
    mockPromise.mockReturnValue(promiseResult)

    createRequester()

    expect(mockHttpErrors).toHaveBeenCalledOnce()
    expect(mockHeaders).toHaveBeenCalledWith(
      expect.objectContaining({'User-Agent': '@sanity/cli-core@1.0.0'}),
    )
    expect(mockDebug).toHaveBeenCalledWith({namespace: 'sanity:cli', verbose: true})
    expect(mockPromise).toHaveBeenCalledWith({onlyBody: true})

    // Verify order: httpErrors, headers, debug, promise
    expect(mockGetIt).toHaveBeenCalledWith([
      httpErrorsResult,
      headersResult,
      debugResult,
      promiseResult,
    ])
  })

  test('caches package info across calls', () => {
    mockHttpErrors.mockReturnValue({})
    mockHeaders.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester()
    createRequester()

    // readPackageUpSync should only be called once due to caching
    expect(mockReadPackageUpSync).toHaveBeenCalledOnce()
  })

  test('disables httpErrors when set to false', () => {
    const headersResult = {id: 'headers'}
    const debugResult = {id: 'debug'}
    const promiseResult = {id: 'promise'}

    mockHeaders.mockReturnValue(headersResult)
    mockDebug.mockReturnValue(debugResult)
    mockPromise.mockReturnValue(promiseResult)

    createRequester({middleware: {httpErrors: false}})

    expect(mockHttpErrors).not.toHaveBeenCalled()
    expect(mockGetIt).toHaveBeenCalledWith([headersResult, debugResult, promiseResult])
  })

  test('disables promise when set to false', () => {
    const httpErrorsResult = {id: 'httpErrors'}
    const headersResult = {id: 'headers'}
    const debugResult = {id: 'debug'}

    mockHttpErrors.mockReturnValue(httpErrorsResult)
    mockHeaders.mockReturnValue(headersResult)
    mockDebug.mockReturnValue(debugResult)

    createRequester({middleware: {promise: false}})

    expect(mockPromise).not.toHaveBeenCalled()
    expect(mockGetIt).toHaveBeenCalledWith([httpErrorsResult, headersResult, debugResult])
  })

  test('customizes promise options', () => {
    mockHttpErrors.mockReturnValue({})
    mockHeaders.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester({middleware: {promise: {onlyBody: false}}})

    expect(mockPromise).toHaveBeenCalledWith({onlyBody: false})
  })

  test('disables headers when set to false', () => {
    const httpErrorsResult = {id: 'httpErrors'}
    const debugResult = {id: 'debug'}
    const promiseResult = {id: 'promise'}

    mockHttpErrors.mockReturnValue(httpErrorsResult)
    mockDebug.mockReturnValue(debugResult)
    mockPromise.mockReturnValue(promiseResult)

    createRequester({middleware: {headers: false}})

    expect(mockHeaders).not.toHaveBeenCalled()
    expect(mockGetIt).toHaveBeenCalledWith([httpErrorsResult, debugResult, promiseResult])
  })

  test('does not call readPackageUpSync when headers disabled', () => {
    mockHttpErrors.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester({middleware: {headers: false}})

    expect(mockReadPackageUpSync).not.toHaveBeenCalled()
  })

  test('merges custom headers with default User-Agent', () => {
    mockHttpErrors.mockReturnValue({})
    mockHeaders.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester({middleware: {headers: {'X-Custom': 'value'}}})

    expect(mockHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        'User-Agent': '@sanity/cli-core@1.0.0',
        'X-Custom': 'value',
      }),
    )
  })

  test('allows overriding default User-Agent header', () => {
    mockHttpErrors.mockReturnValue({})
    mockHeaders.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester({middleware: {headers: {'User-Agent': 'custom-agent'}}})

    expect(mockHeaders).toHaveBeenCalledWith(
      expect.objectContaining({'User-Agent': 'custom-agent'}),
    )
  })

  test('disables debug when set to false', () => {
    const httpErrorsResult = {id: 'httpErrors'}
    const headersResult = {id: 'headers'}
    const promiseResult = {id: 'promise'}

    mockHttpErrors.mockReturnValue(httpErrorsResult)
    mockHeaders.mockReturnValue(headersResult)
    mockPromise.mockReturnValue(promiseResult)

    createRequester({middleware: {debug: false}})

    expect(mockDebug).not.toHaveBeenCalled()
    expect(mockGetIt).toHaveBeenCalledWith([httpErrorsResult, headersResult, promiseResult])
  })

  test('customizes debug options', () => {
    mockHttpErrors.mockReturnValue({})
    mockHeaders.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    createRequester({middleware: {debug: {namespace: 'sanity:custom'}}})

    expect(mockDebug).toHaveBeenCalledWith({namespace: 'sanity:custom', verbose: true})
  })

  test('can disable all middleware', () => {
    createRequester({
      middleware: {
        debug: false,
        headers: false,
        httpErrors: false,
        promise: false,
      },
    })

    expect(mockHttpErrors).not.toHaveBeenCalled()
    expect(mockHeaders).not.toHaveBeenCalled()
    expect(mockDebug).not.toHaveBeenCalled()
    expect(mockPromise).not.toHaveBeenCalled()
    expect(mockGetIt).toHaveBeenCalledWith([])
  })

  test('throws when package.json cannot be found', () => {
    mockReadPackageUpSync.mockReturnValue(undefined)

    mockHttpErrors.mockReturnValue({})
    mockDebug.mockReturnValue({})
    mockPromise.mockReturnValue({})

    expect(() => createRequester()).toThrow(
      'Unable to resolve @sanity/cli-core package root',
    )
  })
})
