import fs from 'node:fs/promises'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {writeWorkbenchRuntime} from '../writeWorkbenchRuntime.js'

vi.mock('node:fs/promises', () => ({
  default: {mkdir: vi.fn(), writeFile: vi.fn()},
}))

const CWD = '/tmp/project'
const WORKBENCH_DIR = join(CWD, '.sanity', 'workbench')

/** The content the runtime wrote for `<workbench-dir>/<name>`. */
function written(name: string): string {
  const call = vi.mocked(fs.writeFile).mock.calls.find(([path]) => String(path).endsWith(name))
  return call?.[1] as string
}

describe('writeWorkbenchRuntime', () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('creates the workbench directory, writes both entry files, and returns the dir', async () => {
    const result = await writeWorkbenchRuntime({cwd: CWD, reactStrictMode: false})

    expect(result).toBe(WORKBENCH_DIR)
    expect(fs.mkdir).toHaveBeenCalledWith(WORKBENCH_DIR, {recursive: true})
    expect(fs.writeFile).toHaveBeenCalledWith(
      join(WORKBENCH_DIR, 'workbench.js'),
      expect.any(String),
    )
    expect(fs.writeFile).toHaveBeenCalledWith(join(WORKBENCH_DIR, 'index.html'), expect.any(String))
  })

  test('renders workbench.js with the default options and no leftover placeholders', async () => {
    await writeWorkbenchRuntime({cwd: CWD, reactStrictMode: false})

    const js = written('workbench.js')
    expect(js).toContain('import {renderWorkbench} from "sanity/workbench"')
    expect(js).toContain('document.getElementById("workbench")')
    expect(js).toContain('{organizationId: undefined}')
    expect(js).toContain('{reactStrictMode: false}')
    expect(js).not.toContain('%SANITY_WORKBENCH_')
  })

  test('substitutes reactStrictMode and a string organizationId', async () => {
    await writeWorkbenchRuntime({cwd: CWD, organizationId: 'org-123', reactStrictMode: true})

    const js = written('workbench.js')
    expect(js).toContain('{organizationId: "org-123"}')
    expect(js).toContain('{reactStrictMode: true}')
  })

  test('renders a well-formed index.html shell', async () => {
    await writeWorkbenchRuntime({cwd: CWD, reactStrictMode: false})

    const html = written('index.html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<meta charset="UTF-8" />')
    expect(html).toContain('<div id="workbench">')
    expect(html).toContain('<script type="module" src="./workbench.js">')
  })

  describe('staging runtime flag', () => {
    test.each([
      ['staging', true],
      ['production', false],
      [undefined, false],
    ])('with SANITY_INTERNAL_ENV=%s the shell sets the flag to %s', async (env, expected) => {
      vi.stubEnv('SANITY_INTERNAL_ENV', env)

      await writeWorkbenchRuntime({cwd: CWD, reactStrictMode: false})

      const html = written('index.html')
      expect(html).toContain(`<script>globalThis.__SANITY_STAGING__ = ${expected}</script>`)
    })
  })

  describe('prefetch hints', () => {
    test('emits preconnect and preload hints for a valid remote URL', async () => {
      await writeWorkbenchRuntime({
        cwd: CWD,
        reactStrictMode: false,
        remoteUrl: 'https://workbench.example/mf-manifest.json',
      })

      const html = written('index.html')
      expect(html).toContain('<link rel="preconnect" href="https://workbench.example" />')
      expect(html).toContain(
        '<link rel="preload" as="fetch" href="https://workbench.example/mf-manifest.json" crossorigin />',
      )
    })

    test.each([
      ['no remote URL', undefined],
      ['an invalid remote URL', 'not-a-url'],
    ])('omits hints for %s', async (_label, remoteUrl) => {
      await writeWorkbenchRuntime({cwd: CWD, reactStrictMode: false, remoteUrl})

      const html = written('index.html')
      expect(html).not.toContain('rel="preconnect"')
      expect(html).not.toContain('rel="preload"')
    })
  })
})
