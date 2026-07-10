import {describe, expect, test, vi} from 'vitest'

import {buildWorkbenchHost} from '../buildWorkbenchHost.js'

const mockBuild = vi.hoisted(() => vi.fn())
const mockWriteWorkbenchRuntime = vi.hoisted(() =>
  vi.fn().mockResolvedValue('/project/.sanity/workbench'),
)

vi.mock('vite', () => ({build: mockBuild}))
vi.mock('../../dev/writeWorkbenchRuntime.js', () => ({
  writeWorkbenchRuntime: mockWriteWorkbenchRuntime,
}))

describe('buildWorkbenchHost', () => {
  test('writes the runtime shell and bundles it into the federation output dir', async () => {
    await buildWorkbenchHost({
      basePath: '/',
      cwd: '/project',
      minify: true,
      organizationId: 'org-123',
      outputDir: '/project/dist',
      sourceMap: false,
    })

    expect(mockWriteWorkbenchRuntime).toHaveBeenCalledWith({
      cwd: '/project',
      organizationId: 'org-123',
      reactStrictMode: false,
    })
    expect(mockBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        base: '/',
        build: expect.objectContaining({
          emptyOutDir: false,
          minify: true,
          outDir: '/project/dist',
          sourcemap: false,
        }),
        mode: 'production',
        root: '/project/.sanity/workbench',
      }),
    )
  })
})
