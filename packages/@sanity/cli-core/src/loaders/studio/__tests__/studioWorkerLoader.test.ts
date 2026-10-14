import {afterEach, expect, test, vi} from 'vitest'

const {doImport} = vi.hoisted(() => ({doImport: vi.fn()}))
vi.mock(import('../../../util/doImport.js'), () => ({doImport}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.resetModules()
})

test.each([undefined, '', 'false', '1', 'TRUE'])(
  'keeps the existing loader for %s',
  async (value) => {
    vi.stubEnv('SANITY_CLI_STUDIO_WORKER_BUNDLE', value)
    await import('../studioWorkerLoader.worker.js')
    expect(doImport).toHaveBeenCalledExactlyOnceWith(
      new URL('../studioWorkerModuleLoader.worker.js', import.meta.url).href,
    )
  },
)

test('loads the bundled worker only with an explicit opt-in', async () => {
  vi.stubEnv('SANITY_CLI_STUDIO_WORKER_BUNDLE', 'true')
  await import('../studioWorkerLoader.worker.js')
  expect(doImport).toHaveBeenCalledExactlyOnceWith(
    new URL('../studioWorkerBundleLoader.worker.js', import.meta.url).href,
  )
})
