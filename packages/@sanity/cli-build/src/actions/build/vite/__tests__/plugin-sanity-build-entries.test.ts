import {
  getLocalPackageDir as mockGetLocalPackageDir,
  readPackageJson as mockReadPackageJson,
} from '@sanity/cli-test/mocks/cli-core/package-manager'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {sanityBuildEntries} from '../plugin-sanity-build-entries.js'

vi.mock(
  '@sanity/cli-core/package-manager',
  () => import('@sanity/cli-test/mocks/cli-core/package-manager'),
)
vi.mock('../../renderDocument.js', () => ({
  renderDocument: vi
    .fn()
    .mockResolvedValue('<html><head></head><body><div id="root"></div></body></html>'),
}))

function makeBundle() {
  return {
    'static/sanity-abc.js': {
      facadeModuleId: '/project/.sanity/runtime/app.js',
      fileName: 'static/sanity-abc.js',
      imports: [],
      name: 'sanity',
      type: 'chunk',
      viteMetadata: {importedCss: undefined},
    },
  }
}

async function emitIndexHtml(bridge?: boolean, isApp?: boolean): Promise<string> {
  const plugin = sanityBuildEntries({basePath: '/', bridge, cwd: '/project', isApp})

  let emitted: {fileName: string; source: string} | undefined
  const context = {
    emitFile: (file: {fileName: string; source: string}) => {
      emitted = file
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (plugin.generateBundle as any).call(context, {}, makeBundle())

  if (!emitted) throw new Error('index.html was not emitted')
  return emitted.source
}

describe('sanityBuildEntries index.html', () => {
  beforeEach(() => {
    mockGetLocalPackageDir.mockReturnValue('/project/node_modules/sanity')
    mockReadPackageJson.mockResolvedValue({
      name: 'sanity',
      sanityCliCapabilities: {authHashStash: 1},
      version: '6.20.0',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('injects the core-ui bridge script by default', async () => {
    const html = await emitIndexHtml()
    expect(html).toContain('bridge.js')
  })

  test('omits the bridge script when bridge is false', async () => {
    const html = await emitIndexHtml(false)
    expect(html).not.toContain('bridge.js')
    // The document itself is still emitted.
    expect(html).toContain('id="root"')
  })

  test('injects the auth hash script first in head for studios', async () => {
    const html = await emitIndexHtml()
    expect(mockGetLocalPackageDir).toHaveBeenCalledWith('sanity', '/project')
    expect(html).toMatch(/^<html><head>\n<script>[^<]*__SANITY_AUTH_HASH_PARAMS__/)
  })

  test("omits the auth hash script when sanity doesn't read the stash", async () => {
    mockReadPackageJson.mockResolvedValue({name: 'sanity', version: '6.19.0'})
    const html = await emitIndexHtml()
    expect(html).not.toContain('__SANITY_AUTH_HASH_PARAMS__')
  })

  test('omits the auth hash script for apps', async () => {
    const html = await emitIndexHtml(undefined, true)
    expect(mockReadPackageJson).not.toHaveBeenCalled()
    expect(html).not.toContain('__SANITY_AUTH_HASH_PARAMS__')
  })
})
