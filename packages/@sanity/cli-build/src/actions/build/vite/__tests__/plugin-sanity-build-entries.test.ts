import {describe, expect, test, vi} from 'vitest'

import {sanityBuildEntries} from '../plugin-sanity-build-entries.js'

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

async function emitIndexHtml(bridge?: boolean): Promise<string> {
  const plugin = sanityBuildEntries({basePath: '/', bridge, cwd: '/project'})

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
})
