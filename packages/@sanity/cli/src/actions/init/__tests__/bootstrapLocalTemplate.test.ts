import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {bootstrapLocalTemplate} from '../bootstrapLocalTemplate.js'

vi.mock('../../../util/resolveLatestVersions.js', () => ({
  resolveLatestVersions: vi.fn().mockImplementation(async (deps: Record<string, string>) => {
    const resolved: Record<string, string> = {}
    for (const key of Object.keys(deps)) resolved[key] = '1.0.0'
    return resolved
  }),
}))

vi.mock('../updateInitialTemplateMetadata.js', () => ({
  updateInitialTemplateMetadata: vi.fn().mockResolvedValue(undefined),
}))

function makeOutput() {
  return {
    clear: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    print: vi.fn(),
    spinner: vi.fn(() => ({
      start: () => ({fail: vi.fn(), succeed: vi.fn()}),
    })),
    warn: vi.fn(),
  } as unknown as Output
}

describe('bootstrapLocalTemplate (app templates)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'cli-bootstrap-'))
  })
  afterEach(async () => {
    await rm(tmp, {force: true, recursive: true})
    vi.clearAllMocks()
  })

  test('renders projectId and dataset into App.tsx when provided', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-app',
      templateName: 'app-quickstart',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        federation: false,
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'my-app',
      },
    })

    const appTsx = await readFile(path.join(tmp, 'src', 'App.tsx'), 'utf8')
    expect(appTsx).toContain(`projectId: 'abc123'`)
    expect(appTsx).toContain(`dataset: 'production'`)
    expect(appTsx).not.toContain('%projectId%')
    expect(appTsx).not.toContain('%dataset%')
  })

  test('renders empty strings into App.tsx when user skipped project selection', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-app',
      templateName: 'app-sanity-ui',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: '',
        federation: false,
        organizationId: 'org1',
        projectId: '',
        projectName: 'my-app',
      },
    })

    const appTsx = await readFile(path.join(tmp, 'src', 'App.tsx'), 'utf8')
    expect(appTsx).toContain(`projectId: ''`)
    expect(appTsx).toContain(`dataset: ''`)
    expect(appTsx).not.toContain('%projectId%')
    expect(appTsx).not.toContain('%dataset%')
  })
})
