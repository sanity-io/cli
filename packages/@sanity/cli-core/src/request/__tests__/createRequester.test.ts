import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

const mockCreateGetItRequester = vi.hoisted(() => vi.fn())
const mockDebugMiddleware = vi.hoisted(() => vi.fn())
const mockDebugIt = vi.hoisted(() => vi.fn())
const mockPackageUp = vi.hoisted(() => vi.fn())
const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('get-it', () => ({
  createRequester: mockCreateGetItRequester,
}))

vi.mock('get-it/middleware', () => ({
  debug: mockDebugMiddleware,
}))

vi.mock('debug', () => ({
  default: mockDebugIt,
}))

vi.mock('empathic/package', () => ({
  up: mockPackageUp,
}))

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}))

describe('#createRequester', () => {
  let createRequester: (typeof import('../createRequester.js'))['createRequester']

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset modules to get a fresh cache for each test
    vi.resetModules()
    const mod = await import('../createRequester.js')
    createRequester = mod.createRequester

    mockPackageUp.mockReturnValue('/packages/@sanity/cli-core/package.json')
    mockReadFileSync.mockReturnValue(JSON.stringify({name: '@sanity/cli-core', version: '1.0.0'}))
    mockDebugIt.mockReturnValue(vi.fn())
    mockDebugMiddleware.mockReturnValue({id: 'debug'})
    mockCreateGetItRequester.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('applies default debug middleware and User-Agent headers', () => {
    const debugResult = {id: 'debug'}
    const logFn = vi.fn()
    mockDebugIt.mockReturnValue(logFn)
    mockDebugMiddleware.mockReturnValue(debugResult)

    createRequester()

    expect(mockDebugIt).toHaveBeenCalledWith('sanity:cli')
    expect(mockDebugMiddleware).toHaveBeenCalledWith({log: logFn, verbose: true})
    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
        middleware: [debugResult],
      }),
    )
  })

  test('does not resolve package info until User-Agent header is accessed', () => {
    createRequester()

    expect(mockPackageUp).not.toHaveBeenCalled()

    const headersObj = mockCreateGetItRequester.mock.calls[0][0].headers as Record<string, string>
    expect(headersObj['User-Agent']).toBe('@sanity/cli-core@1.0.0')

    expect(mockPackageUp).toHaveBeenCalledOnce()
  })

  test('caches package info across calls', () => {
    createRequester()
    createRequester()

    const firstHeaders = mockCreateGetItRequester.mock.calls[0][0].headers as Record<string, string>
    const secondHeaders = mockCreateGetItRequester.mock.calls[1][0].headers as Record<
      string,
      string
    >
    expect(firstHeaders['User-Agent']).toBe('@sanity/cli-core@1.0.0')
    expect(secondHeaders['User-Agent']).toBe('@sanity/cli-core@1.0.0')

    // package resolution should only happen once due to caching
    expect(mockPackageUp).toHaveBeenCalledOnce()
  })

  test('disables httpErrors when set to false', () => {
    createRequester({httpErrors: false})

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({httpErrors: false}),
    )
  })

  test('disables headers when set to false', () => {
    createRequester({headers: false})

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({headers: undefined}),
    )
    expect(mockPackageUp).not.toHaveBeenCalled()
  })

  test('merges custom headers with default User-Agent', () => {
    createRequester({headers: {'X-Custom': 'value'}})

    const headersObj = mockCreateGetItRequester.mock.calls[0][0].headers as Record<string, string>
    expect(headersObj['X-Custom']).toBe('value')
    expect(headersObj['User-Agent']).toBe('@sanity/cli-core@1.0.0')
  })

  test('allows overriding default User-Agent header', () => {
    createRequester({headers: {'User-Agent': 'custom-agent'}})

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({'User-Agent': 'custom-agent'}),
      }),
    )
    // Should not resolve package info when User-Agent is overridden
    expect(mockPackageUp).not.toHaveBeenCalled()
  })

  test('detects User-Agent overrides case-insensitively', () => {
    createRequester({headers: {'uSeR-aGeNt': 'custom-agent'}})

    const headersObj = mockCreateGetItRequester.mock.calls[0][0].headers as Record<string, string>
    expect(headersObj['uSeR-aGeNt']).toBe('custom-agent')
    expect(headersObj['User-Agent']).toBeUndefined()
    expect(mockPackageUp).not.toHaveBeenCalled()
  })

  test('disables debug when set to false', () => {
    createRequester({debug: false})

    expect(mockDebugMiddleware).not.toHaveBeenCalled()
    expect(mockCreateGetItRequester).toHaveBeenCalledWith(expect.objectContaining({middleware: []}))
  })

  test('customizes debug options', () => {
    const logFn = vi.fn()
    mockDebugIt.mockReturnValue(logFn)

    createRequester({debug: {namespace: 'sanity:custom'}})

    expect(mockDebugIt).toHaveBeenCalledWith('sanity:custom')
    expect(mockDebugMiddleware).toHaveBeenCalledWith({log: logFn, verbose: true})
  })

  test('passes additional middleware through', () => {
    const retryMw = Object.assign(vi.fn(), {id: 'retry'})
    const debugResult = {id: 'debug'}
    mockDebugMiddleware.mockReturnValue(debugResult)

    createRequester({middleware: [retryMw]})

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        middleware: [retryMw, debugResult],
      }),
    )
  })

  test('forwards base, timeout, fetch, and as options', () => {
    const fetchFn = vi.fn()
    createRequester({
      as: 'json',
      base: 'https://api.example.com',
      fetch: fetchFn,
      timeout: 5000,
    })

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        as: 'json',
        base: 'https://api.example.com',
        fetch: fetchFn,
        timeout: 5000,
      }),
    )
  })

  test('can disable all defaults', () => {
    createRequester({
      debug: false,
      headers: false,
      httpErrors: false,
    })

    expect(mockDebugMiddleware).not.toHaveBeenCalled()
    expect(mockCreateGetItRequester).toHaveBeenCalledWith({
      headers: undefined,
      httpErrors: false,
      middleware: [],
    })
  })

  test('forwards unknown get-it options untouched', () => {
    createRequester({credentials: 'include'})

    expect(mockCreateGetItRequester).toHaveBeenCalledWith(
      expect.objectContaining({credentials: 'include'}),
    )
  })

  test('throws when package.json cannot be found', () => {
    mockPackageUp.mockReturnValue(undefined)

    createRequester()

    // The error is thrown lazily when the User-Agent getter is accessed
    const headersObj = mockCreateGetItRequester.mock.calls[0][0].headers as Record<string, string>
    expect(() => headersObj['User-Agent']).toThrow(
      'Unable to resolve @sanity/cli-core package root',
    )
  })
})
