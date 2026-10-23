import {type Output} from '@sanity/cli-core'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {initApp, warnIfNoActiveMediaLibrary} from '../initApp.js'
import {type InitOptions} from '../types.js'

const mockGetMediaLibrariesForOrganization = vi.hoisted(() => vi.fn())
const mockGetPostInitMCPPrompt = vi.hoisted(() => vi.fn())
const mockScaffoldAndInstall = vi.hoisted(() => vi.fn())
const mockSelectTemplate = vi.hoisted(() => vi.fn())

vi.mock('../../../services/mediaLibraries.js', () => ({
  getMediaLibrariesForOrganization: mockGetMediaLibrariesForOrganization,
}))
vi.mock('../initHelpers.js', () => ({
  getPostInitMCPPrompt: mockGetPostInitMCPPrompt,
}))
vi.mock('../scaffoldTemplate.js', () => ({
  scaffoldAndInstall: mockScaffoldAndInstall,
  selectTemplate: mockSelectTemplate,
}))

const mockOutput = () => ({log: vi.fn(), warn: vi.fn()}) as unknown as Output

/** Drives the real media branch of `initApp` end to end with the scaffolding mocked. */
async function runMediaInit({mcpConfigured = []}: {mcpConfigured?: string[]} = {}) {
  mockSelectTemplate.mockResolvedValue({
    template: {},
    templateName: 'media-library-config',
    useTypeScript: true,
  })
  mockScaffoldAndInstall.mockResolvedValue({pkgManager: 'npm'})
  mockGetPostInitMCPPrompt.mockResolvedValue('MCP is ready to use')

  const output = mockOutput()
  await initApp({
    datasetName: '',
    defaults: {projectName: ''},
    mcpConfigured: mcpConfigured as never,
    options: {install: true} as InitOptions,
    organizationId: 'org-1',
    output,
    outputPath: '/tmp/out',
    projectId: '',
    remoteTemplateInfo: undefined,
    sluggedName: 'my-config',
    trace: {log: vi.fn()} as never,
    workbench: false,
    workDir: '/tmp/out',
  })
  return output
}

describe('initApp with the media-library-config template', () => {
  afterEach(() => vi.clearAllMocks())

  test('prints the media success output and consults the library warning', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([])

    const output = await runMediaInit()

    const logs = vi.mocked(output.log).mock.calls.flat().join('\n')
    expect(logs).toContain('Your Media Library config app has been scaffolded.')
    expect(logs).toContain('Configured for organization')
    expect(logs).toContain('npx sanity deploy')
    // The media branch must actually run the helper: no active library warns.
    expect(mockGetMediaLibrariesForOrganization).toHaveBeenCalledWith('org-1')
    expect(vi.mocked(output.warn).mock.calls.flat().join('\n')).toContain(
      'has no active Media Library',
    )
  })

  test('still confirms MCP setup before the early return', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([
      {id: 'library-1', organizationId: 'org-1', status: 'active'},
    ])

    const output = await runMediaInit({mcpConfigured: ['cursor']})

    const logs = vi.mocked(output.log).mock.calls.flat().join('\n')
    expect(mockGetPostInitMCPPrompt).toHaveBeenCalledWith(['cursor'])
    expect(logs).toContain('MCP is ready to use')
    expect(logs).toContain('https://mcp.sanity.io')
  })
})

describe('warnIfNoActiveMediaLibrary', () => {
  afterEach(() => vi.clearAllMocks())

  test('stays quiet when the organization has an active library', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([
      {id: 'library-1', organizationId: 'org-1', status: 'active'},
    ])
    const output = mockOutput()

    await expect(warnIfNoActiveMediaLibrary('org-1', output)).resolves.toBe(true)

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('warns with the Manage URL when the organization has no active library', async () => {
    mockGetMediaLibrariesForOrganization.mockResolvedValue([])
    const output = mockOutput()

    await expect(warnIfNoActiveMediaLibrary('org-1', output)).resolves.toBe(false)

    expect(output.warn).toHaveBeenCalledTimes(1)
    const message = vi.mocked(output.warn).mock.calls[0][0]
    expect(message).toContain('org-1 has no active Media Library')
    expect(message).toContain('/manage')
    // output.warn adds oclif's `Warning:` prefix; the message must not stack
    // its own symbol or leading newline on top of it.
    expect(message).not.toMatch(/^\s/)
    expect(message).not.toContain('⚠')
  })

  test('swallows lookup failures — the hint must never block init', async () => {
    mockGetMediaLibrariesForOrganization.mockRejectedValue(new Error('offline'))
    const output = mockOutput()

    // `false` rather than a throw: follow-up suggestions (the pull-aspects
    // hint) must stay silent in the unknown case, and init must not block.
    await expect(warnIfNoActiveMediaLibrary('org-1', output)).resolves.toBe(false)

    expect(output.warn).not.toHaveBeenCalled()
  })
})
