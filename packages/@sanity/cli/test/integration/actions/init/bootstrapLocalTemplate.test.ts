import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {spinner, spinnerStart, spinnerSucceed} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

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

    expect(spinner).toHaveBeenCalledWith('Bootstrapping files from template')

    expect(spinnerStart).toHaveBeenCalledTimes(3)
    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

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

    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

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

    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain(`import {defineCliConfig, unstable_defineApp} from 'sanity/cli'`)
    expect(cliConfig).toContain(`name: 'my-studio'`)
    expect(cliConfig).toContain(`title: 'My Studio'`)
    // `slug` defaults from the entered name/title, slugified
    expect(cliConfig).toContain(`slug: 'my-studio'`)
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

    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain(`import {defineCliConfig, unstable_defineApp} from 'sanity/cli'`)
    // App init derives `name` from the output directory, same as package.json
    const pkgJson = JSON.parse(await readFile(path.join(tmp, 'package.json'), 'utf8'))
    expect(cliConfig).toContain(`name: '${pkgJson.name}'`)
    expect(cliConfig).toContain(`title: 'My App'`)
    // App init derives `slug` from the output directory too, same as `name`
    expect(cliConfig).toContain(`slug: '${pkgJson.name}'`)
    expect(cliConfig).toContain(`organizationId: 'org1'`)
    expect(cliConfig).toContain(`entry: './src/App.tsx'`)
  })

  test('falls back to a non-empty slug when the name slugifies to nothing', async () => {
    await bootstrapLocalTemplate({
      output: makeOutput(),
      // A fully non-latin project name slugifies to '' — and so does the
      // pre-slugified package name derived from it upstream.
      outputPath: tmp,
      packageName: '',
      templateName: 'clean',
      useTypeScript: true,
      variables: {
        autoUpdates: false,
        dataset: 'production',
        organizationId: 'org1',
        projectId: 'abc123',
        projectName: '日本語プロジェクト',
        workbench: true,
      },
    })

    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain(`title: '日本語プロジェクト'`)
    // An empty `slug` would fail app config validation — the constant kicks in
    expect(cliConfig).not.toContain(`slug: ''`)
    expect(cliConfig).toContain(`slug: 'sanity-app'`)
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

    expect(spinnerSucceed).toHaveBeenCalledTimes(3)

    const cliConfig = await readFile(path.join(tmp, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).not.toContain('unstable_defineApp')
    expect(cliConfig).toContain(`projectId: 'abc123'`)
  })
})
