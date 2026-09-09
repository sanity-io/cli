import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {scaffoldAndInstall, selectTemplate, templateChoices} from '../scaffoldTemplate.js'
import {type InitOptions} from '../types.js'

const mockPromptForTypeScript = vi.hoisted(() => vi.fn())
const mockBootstrapTemplate = vi.hoisted(() => vi.fn())
const mockInstallDeclaredPackages = vi.hoisted(() => vi.fn())
const mockResolvePackageManager = vi.hoisted(() => vi.fn())
const mockTryGitInit = vi.hoisted(() => vi.fn())
const mockWriteStagingEnvIfNeeded = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/init/promptForTypescript.js', () => ({
  promptForTypeScript: mockPromptForTypeScript,
}))
vi.mock('../bootstrapTemplate.js', () => ({
  bootstrapTemplate: mockBootstrapTemplate,
}))
vi.mock('../git.js', () => ({
  tryGitInit: mockTryGitInit,
}))
vi.mock('../resolvePackageManager.js', () => ({
  resolvePackageManager: mockResolvePackageManager,
}))
// Partial mocks: `selectTemplate` relies on the real `initHelpers` exports, and
// the skip message is built from the real `getInstallCommand`.
vi.mock('../initHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../initHelpers.js')>()),
  writeStagingEnvIfNeeded: mockWriteStagingEnvIfNeeded,
}))
vi.mock('../../../util/packageManager/installPackages.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/packageManager/installPackages.js')>()),
  installDeclaredPackages: mockInstallDeclaredPackages,
}))

function initOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    autoUpdates: true,
    bare: false,
    datasetDefault: false,
    fromCreate: false,
    install: true,
    mcpMode: 'skip',
    skillsMode: 'skip',
    unattended: true,
    ...overrides,
  }
}

describe('templateChoices', () => {
  test('offers the page-builder template', () => {
    const values = templateChoices.map((choice) => choice.value)
    expect(values).toContain('page-builder')
  })
})

describe('selectTemplate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('forces TypeScript for shopify when --no-typescript is passed', async () => {
    const result = await selectTemplate({
      options: initOptions({template: 'shopify', typescript: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('shopify')
    expect(result.useTypeScript).toBe(true)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })

  test('does not prompt for TypeScript when shopify is selected interactively', async () => {
    const result = await selectTemplate({
      options: initOptions({template: 'shopify', typescript: undefined, unattended: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('shopify')
    expect(result.useTypeScript).toBe(true)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })

  test('still honours --no-typescript for JavaScript-authored templates', async () => {
    const result = await selectTemplate({
      options: initOptions({template: 'clean', typescript: false}),
      remoteTemplateInfo: undefined,
      trace: {log: vi.fn()} as never,
    })

    expect(result.templateName).toBe('clean')
    expect(result.useTypeScript).toBe(false)
    expect(mockPromptForTypeScript).not.toHaveBeenCalled()
  })
})

describe('scaffoldAndInstall', () => {
  const outputLog = vi.fn()

  function scaffoldArgs(optionOverrides: Partial<InitOptions> = {}) {
    return {
      datasetName: 'production',
      defaults: {projectName: 'My Project'},
      displayName: 'My Project',
      options: initOptions({git: false, ...optionOverrides}),
      organizationId: undefined,
      output: {log: outputLog} as never,
      outputPath: '/tmp/my-project',
      projectId: 'abc123',
      remoteTemplateInfo: undefined,
      sluggedName: 'my-project',
      templateName: 'clean',
      trace: {log: vi.fn()} as never,
      useTypeScript: true,
      workbench: false,
      workDir: '/tmp',
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockResolvePackageManager.mockResolvedValue('pnpm')
  })

  test('installs declared packages by default', async () => {
    const {pkgManager} = await scaffoldAndInstall(scaffoldArgs())

    expect(pkgManager).toBe('pnpm')
    expect(mockBootstrapTemplate).toHaveBeenCalledOnce()
    expect(mockInstallDeclaredPackages).toHaveBeenCalledWith(
      '/tmp/my-project',
      'pnpm',
      expect.objectContaining({workDir: '/tmp'}),
    )
  })

  test('skips the install and names the command to run with install: false', async () => {
    await scaffoldAndInstall(scaffoldArgs({install: false}))

    expect(mockInstallDeclaredPackages).not.toHaveBeenCalled()
    // The template is still written out - only the install is skipped
    expect(mockBootstrapTemplate).toHaveBeenCalledOnce()
    expect(outputLog.mock.calls.flat().join('\n')).toContain(
      'Skipped dependency install. Run pnpm install to install them.',
    )
  })

  // Package manager resolution follows the run mode alone - skipping the
  // install changes what we do with the answer, not whether we can ask for it
  test.each([
    {expected: true, install: true, unattended: false},
    {expected: true, install: false, unattended: false},
    {expected: false, install: true, unattended: true},
    {expected: false, install: false, unattended: true},
  ])(
    'resolves the package manager with interactive: $expected when unattended is $unattended and install is $install',
    async ({expected, install, unattended}) => {
      await scaffoldAndInstall(scaffoldArgs({install, unattended}))

      expect(mockResolvePackageManager).toHaveBeenCalledWith(
        expect.objectContaining({interactive: expected}),
      )
    },
  )

  test('initializes git regardless of whether dependencies were installed', async () => {
    await scaffoldAndInstall(scaffoldArgs({git: 'initial commit', install: false}))

    expect(mockTryGitInit).toHaveBeenCalledWith('/tmp/my-project', 'initial commit')
  })
})
