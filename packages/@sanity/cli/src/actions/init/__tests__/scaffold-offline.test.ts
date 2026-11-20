import fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {expect, test, vi} from 'vitest'

import {bootstrapLocalTemplate} from '../bootstrapLocalTemplate.js'

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../updateInitialTemplateMetadata.js', () => ({updateInitialTemplateMetadata: vi.fn()}))
vi.mock('../../../util/resolveLatestVersions.js', () => ({
  resolveLatestVersions: async (packages: Record<string, string>) =>
    Object.fromEntries(Object.keys(packages).map((name) => [name, '9.9.9'])),
}))
const templates = new URL('../../../../templates/', import.meta.url)
const sentinel = 'Existing instructions stay byte-for-byte.\n'

test.each([
  ['clean', false, false, 'shared/AGENTS.md'],
  ['clean', false, true, 'keep'],
  ['app-quickstart', false, false, 'app-quickstart/AGENTS.md'],
  ['app-sanity-ui', false, false, 'app-sanity-ui/AGENTS.md'],
  ['app-quickstart', true, false, 'shared/dashboard/app-quickstart/AGENTS.md'],
  ['app-sanity-ui', true, false, 'shared/dashboard/app-sanity-ui/AGENTS.md'],
  ['media-library-config', false, false, null],
])('%s workbench=%s existing=%s', async (templateName, workbench, existing, expected) => {
  const outputPath = await fs.mkdtemp(path.join(tmpdir(), 'critic-scaffold-'))
  try {
    const agentPath = path.join(outputPath, 'AGENTS.md')
    const warn = vi.fn()
    if (existing) await fs.writeFile(agentPath, sentinel)
    await bootstrapLocalTemplate({
      output: {log: vi.fn(), warn} as never,
      outputPath,
      overwriteFiles: existing,
      packageName: 'critic-test',
      templateName,
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org-1',
        projectId: 'abc123de',
        projectName: 'Review project',
        workbench,
      },
    })
    if (expected === null) {
      await expect(fs.readFile(agentPath, 'utf8')).rejects.toMatchObject({code: 'ENOENT'})
    } else {
      const bytes =
        expected === 'keep' ? sentinel : await fs.readFile(new URL(expected, templates), 'utf8')
      expect(await fs.readFile(agentPath, 'utf8')).toBe(bytes)
    }
    if (existing) expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('AGENTS.md'))
    const manifest = JSON.parse(await fs.readFile(path.join(outputPath, 'package.json'), 'utf8'))
    expect(manifest.scripts.deploy).toBe('sanity deploy')
    if (templateName === 'clean') expect(manifest.dependencies.groq).toBeUndefined()
  } finally {
    await fs.rm(outputPath, {force: true, recursive: true})
  }
})
