import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {resolveLatestVersions} from '../../../../src/util/resolveLatestVersions.js'
import {bootstrapLocalTemplate} from '../../../../src/actions/init/bootstrapLocalTemplate.js'

vi.mock('../../../../src/util/resolveLatestVersions.js', () => ({
  resolveLatestVersions: vi.fn().mockImplementation(async (deps: Record<string, string>) => {
    const resolved: Record<string, string> = {}
    for (const key of Object.keys(deps)) resolved[key] = '1.0.0'
    return resolved
  }),
}))

vi.mock('../../../../src/actions/init/updateInitialTemplateMetadata.js', () => ({
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
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'my-app',
        workbench: false,
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
        organizationId: 'org1',
        projectId: '',
        projectName: 'my-app',
        workbench: false,
      },
    })

    const appTsx = await readFile(path.join(tmp, 'src', 'App.tsx'), 'utf8')
    expect(appTsx).toContain(`projectId: ''`)
    expect(appTsx).toContain(`dataset: ''`)
    expect(appTsx).not.toContain('%projectId%')
    expect(appTsx).not.toContain('%dataset%')
  })
})

describe('bootstrapLocalTemplate (workbench)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'cli-bootstrap-'))
  })
  afterEach(async () => {
    await rm(tmp, {force: true, recursive: true})
    vi.clearAllMocks()
  })

  test('overrides the `sanity` dependency with the `workbench` dist-tag when workbench is enabled', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-studio',
      templateName: 'clean',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'My Studio',
        workbench: true,
      },
    })

    expect(resolveLatestVersions).toHaveBeenCalledOnce()
    const resolvedDeps = vi.mocked(resolveLatestVersions).mock.calls[0][0]
    expect(resolvedDeps.sanity).toBe('workbench')

    const pkgJson = JSON.parse(await readFile(path.join(tmp, 'package.json'), 'utf8'))
    expect(pkgJson.dependencies.sanity).toBe('1.0.0')
  })

  test('keeps the `sanity` dependency on the `latest` dist-tag when workbench is disabled', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-studio',
      templateName: 'clean',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'My Studio',
        workbench: false,
      },
    })

    expect(resolveLatestVersions).toHaveBeenCalledOnce()
    const resolvedDeps = vi.mocked(resolveLatestVersions).mock.calls[0][0]
    expect(resolvedDeps.sanity).toBe('latest')
  })

  test('overrides the `sanity` devDependency for app templates when workbench is enabled', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-app',
      templateName: 'app-quickstart',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'my-app',
        workbench: true,
      },
    })

    expect(resolveLatestVersions).toHaveBeenCalledOnce()
    const resolvedDeps = vi.mocked(resolveLatestVersions).mock.calls[0][0]
    expect(resolvedDeps.sanity).toBe('workbench')
  })

  test('scaffolds a studio sanity.cli.ts branded with unstable_defineApp', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-studio',
      templateName: 'clean',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'My Studio',
        workbench: true,
      },
    })

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain(`import {defineCliConfig, unstable_defineApp} from 'sanity/cli'`)
    expect(cliConfig).toContain(`name: 'my-studio'`)
    expect(cliConfig).toContain(`title: 'My Studio'`)
    expect(cliConfig).toContain(`organizationId: 'org1'`)
    expect(cliConfig).toContain(`projectId: 'abc123'`)
    // Studios brand without an entry — studio app views aren't implemented yet
    expect(cliConfig).not.toContain('entry:')
  })

  test('scaffolds an app sanity.cli.ts branded with unstable_defineApp, keeping the entry', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-app',
      templateName: 'app-quickstart',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'My App',
        workbench: true,
      },
    })

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain(`import {defineCliConfig, unstable_defineApp} from 'sanity/cli'`)
    // App init derives `name` from the output directory, same as package.json
    const pkgJson = JSON.parse(await readFile(path.join(tmp, 'package.json'), 'utf8'))
    expect(cliConfig).toContain(`name: '${pkgJson.name}'`)
    expect(cliConfig).toContain(`title: 'My App'`)
    expect(cliConfig).toContain(`organizationId: 'org1'`)
    expect(cliConfig).toContain(`entry: './src/App.tsx'`)
  })

  test('scaffolds the plain sanity.cli.ts when workbench is disabled', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      outputPath: tmp,
      packageName: 'my-studio',
      templateName: 'clean',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: 'My Studio',
        workbench: false,
      },
    })

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).not.toContain('unstable_defineApp')
    expect(cliConfig).toContain(`projectId: 'abc123'`)
  })
})
