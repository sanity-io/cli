import {mkdtemp, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {selectTemplate} from '../../../../src/actions/init/scaffoldTemplate.js'
import {type InitOptions} from '../../../../src/actions/init/types.js'

vi.mock('../../../../src/util/resolveLatestVersions.js', () => ({
  resolveLatestVersions: vi.fn().mockImplementation(async (deps: Record<string, string>) => {
    return Object.fromEntries(Object.keys(deps).map((key) => [key, '1.0.0']))
  }),
}))

vi.mock('../../../../src/actions/init/updateInitialTemplateMetadata.js', () => ({
  updateInitialTemplateMetadata: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const {bootstrapLocalTemplate} =
  await import('../../../../src/actions/init/bootstrapLocalTemplate.js')

function makeOutput() {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

function initOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    autoUpdates: true,
    bare: false,
    datasetDefault: false,
    fromCreate: false,
    mcpMode: 'skip',
    skillsMode: 'skip',
    unattended: true,
    ...overrides,
  }
}

describe('shopify typescriptOnly scaffold', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, {force: true, recursive: true})))
    vi.clearAllMocks()
  })

  test('--no-typescript --template shopify still writes a coherent TypeScript project', async () => {
    const outputPath = await mkdtemp(path.join(tmpdir(), 'cli-shopify-ts-only-'))
    dirs.push(outputPath)

    const selected = await selectTemplate({
      options: initOptions({template: 'shopify', typescript: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(selected.templateName).toBe('shopify')
    expect(selected.useTypeScript).toBe(true)

    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath,
      packageName: 'shopify-ts-only',
      templateName: selected.templateName,
      useTypeScript: selected.useTypeScript,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'Shopify TS Only',
        workbench: false,
      },
    })

    const files = (await readdir(outputPath, {recursive: true})).toSorted()
    const jsFiles = files.filter((name) => name.endsWith('.js') || name.endsWith('.jsx'))

    expect(files).toContain('sanity.config.ts')
    expect(files).toContain('sanity.cli.ts')
    expect(files).toContain('tsconfig.json')
    expect(files).toContain('schemaTypes/index.ts')
    expect(files).toContain('components/studio/Navbar.tsx')
    expect(files).toContain('plugins/customDocumentActions/types.ts')
    expect(files).not.toContain('sanity.config.js')
    expect(files).not.toContain('sanity.cli.js')
    expect(jsFiles).toEqual([])
  })
})
