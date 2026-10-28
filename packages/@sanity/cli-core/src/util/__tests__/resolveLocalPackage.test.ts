import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'

import {moduleResolve} from 'import-meta-resolve'
import {afterEach, describe, expect, test, vi} from 'vitest'

const mockRequireResolve = vi.hoisted(() => vi.fn())

vi.mock('node:module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:module')>()),
  createRequire: vi.fn(() => ({resolve: mockRequireResolve})),
}))
vi.mock('import-meta-resolve', () => ({moduleResolve: vi.fn()}))

const mockedCreateRequire = vi.mocked(createRequire)
const mockedModuleResolve = vi.mocked(moduleResolve)
const {resolvePackageUrl} = await import('../resolveLocalPackage.js')
const originalPnpDescriptor = Object.getOwnPropertyDescriptor(process.versions, 'pnp')

describe('resolvePackageUrl', () => {
  afterEach(() => {
    vi.clearAllMocks()
    if (originalPnpDescriptor) {
      Object.defineProperty(process.versions, 'pnp', originalPnpDescriptor)
    } else {
      Reflect.deleteProperty(process.versions, 'pnp')
    }
  })

  test('uses ESM resolution for standard installs', () => {
    Reflect.deleteProperty(process.versions, 'pnp')
    const parentUrl = new URL('file:///project/sanity.config.mjs')
    const packageUrl = new URL('file:///project/node_modules/sanity/lib/index.js')
    mockedModuleResolve.mockReturnValue(packageUrl)

    expect(resolvePackageUrl('sanity', parentUrl)).toBe(packageUrl)
    expect(mockedModuleResolve).toHaveBeenCalledWith('sanity', parentUrl)
    expect(mockedCreateRequire).not.toHaveBeenCalled()
  })

  test("uses package-manager-aware resolution for Yarn Plug'n'Play", () => {
    Object.defineProperty(process.versions, 'pnp', {configurable: true, value: '3'})
    const parentUrl = new URL('file:///project/sanity.config.mjs')
    const packagePath = '/project/.yarn/cache/sanity.zip/node_modules/sanity/lib/index.js'
    mockRequireResolve.mockReturnValue(packagePath)

    expect(resolvePackageUrl('sanity', parentUrl)).toEqual(pathToFileURL(packagePath))
    expect(mockedCreateRequire).toHaveBeenCalledWith(parentUrl)
    expect(mockRequireResolve).toHaveBeenCalledWith('sanity')
    expect(mockedModuleResolve).not.toHaveBeenCalled()
  })
})
