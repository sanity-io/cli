// @vitest-environment jsdom
import {join} from 'node:path'

import {
  getLocalPackageDir as mockGetLocalPackageDir,
  readPackageJson as mockReadPackageJson,
} from '@sanity/cli-test/mocks/cli-core/package-manager'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {
  decorateIndexWithAuthHashScript,
  sanityReadsAuthHashStash,
} from '../decorateIndexWithAuthHashScript'

vi.mock(
  '@sanity/cli-core/package-manager',
  () => import('@sanity/cli-test/mocks/cli-core/package-manager'),
)

const sampleHtml = '<html><head><script src="app.js"></script></head><body></body></html>'

function runScript(hash: string) {
  history.replaceState({key: 'state'}, '', `/studio/desk?foo=1${hash}`)
  const html = decorateIndexWithAuthHashScript('<head></head>')
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]
  if (!script) throw new Error('script not found')
  globalThis.eval(script)
}

const scope = globalThis as {__SANITY_AUTH_HASH_PARAMS__?: unknown}

afterEach(() => {
  delete scope.__SANITY_AUTH_HASH_PARAMS__
  vi.resetAllMocks()
})

describe('decorateIndexWithAuthHashScript', () => {
  test('injects the script as the first child of head', () => {
    const result = decorateIndexWithAuthHashScript(sampleHtml)

    expect(result.startsWith('<html><head>\n<script>')).toBe(true)
    expect(result.indexOf('__SANITY_AUTH_HASH_PARAMS__')).toBeLessThan(result.indexOf('app.js'))
  })

  test('handles head tag with attributes', () => {
    const result = decorateIndexWithAuthHashScript('<html><head lang="en"></head></html>')

    expect(result).toContain('<head lang="en">\n<script>')
  })

  test('removes the sid from the hash and stashes it', () => {
    runScript('#sid=abc%2B123')

    expect(location.hash).toBe('')
    expect(location.pathname + location.search).toBe('/studio/desk?foo=1')
    expect(history.state).toEqual({key: 'state'})
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toEqual({sid: 'abc%2B123'})
  })

  test('keeps other params in order', () => {
    runScript('#a=1&token=tok&b=2&claim=c&sid=s&c=3')

    expect(location.hash).toBe('#a=1&b=2&c=3')
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toEqual({claim: 'c', sid: 's', token: 'tok'})
  })

  test('does nothing when the hash has no secrets', () => {
    runScript('#mysid=1&foo=bar')

    expect(location.hash).toBe('#mysid=1&foo=bar')
    expect(scope.__SANITY_AUTH_HASH_PARAMS__).toBeUndefined()
  })
})

describe('sanityReadsAuthHashStash', () => {
  const sanityDir = '/project/node_modules/sanity'

  function mockManifest(manifest: Record<string, unknown>) {
    mockGetLocalPackageDir.mockReturnValue(sanityDir)
    mockReadPackageJson.mockResolvedValue({name: 'sanity', version: '6.20.0', ...manifest})
  }

  test('returns true when sanity declares the auth hash stash capability', async () => {
    mockManifest({sanityCliCapabilities: {authHashStash: 1}})

    await expect(sanityReadsAuthHashStash('/project')).resolves.toBe(true)
    expect(mockGetLocalPackageDir).toHaveBeenCalledWith('sanity', '/project')
    expect(mockReadPackageJson).toHaveBeenCalledWith(join(sanityDir, 'package.json'))
  })

  test.each([
    ['no capabilities', {}],
    ['no auth hash stash capability', {sanityCliCapabilities: {}}],
    ['an incompatible capability version', {sanityCliCapabilities: {authHashStash: 2}}],
    ['a capability version that is not a number', {sanityCliCapabilities: {authHashStash: '1'}}],
    ['capabilities that are not an object', {sanityCliCapabilities: 1}],
    ['null capabilities', {sanityCliCapabilities: null}],
  ])('returns false for %s', async (_, manifest) => {
    mockManifest(manifest)

    await expect(sanityReadsAuthHashStash('/project')).resolves.toBe(false)
  })

  test('returns false when sanity cannot be resolved', async () => {
    mockGetLocalPackageDir.mockImplementation(() => {
      throw new Error('Cannot find package')
    })

    await expect(sanityReadsAuthHashStash('/project')).resolves.toBe(false)
  })

  test('returns false when the sanity manifest cannot be read', async () => {
    mockGetLocalPackageDir.mockReturnValue(sanityDir)
    mockReadPackageJson.mockRejectedValue(new Error('Failed to read'))

    await expect(sanityReadsAuthHashStash('/project')).resolves.toBe(false)
  })
})
