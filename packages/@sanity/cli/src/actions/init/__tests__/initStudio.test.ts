import {beforeEach, describe, expect, test, vi} from 'vitest'

import {initStudio} from '../initStudio.js'

const mockUpdateProjectInitializedAt = vi.hoisted(() => vi.fn())
const mockScaffoldAndInstall = vi.hoisted(() => vi.fn())
const mockSelectTemplate = vi.hoisted(() => vi.fn())

vi.mock('../../../services/projects.js', () => ({
  updateProjectInitializedAt: mockUpdateProjectInitializedAt,
}))
vi.mock('../scaffoldTemplate.js', () => ({
  scaffoldAndInstall: mockScaffoldAndInstall,
  selectTemplate: mockSelectTemplate,
}))

const mockOutputLog = vi.fn()
const output = {log: mockOutputLog} as never
const trace = {error: vi.fn(), log: vi.fn()} as never
const args = {
  datasetName: 'production',
  defaults: {projectName: 'My Project'},
  displayName: 'My Project',
  isFirstProject: false,
  mcpConfigured: [],
  options: {unattended: true},
  organizationId: undefined,
  output,
  outputPath: '/tmp/my-project/sanity',
  projectId: 'abc123',
  remoteTemplateInfo: undefined,
  sluggedName: 'sanity-studio',
  trace,
  workbench: false,
  workDir: '/tmp/my-project',
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateProjectInitializedAt.mockResolvedValue(undefined)
  mockSelectTemplate.mockResolvedValue({
    template: {},
    templateName: 'clean',
    useTypeScript: true,
  })
  mockScaffoldAndInstall.mockResolvedValue({pkgManager: 'npm'})
})

describe('initStudio', () => {
  test('lets the parent mint flow own the generated-project outro', async () => {
    await initStudio({...args, preclaim: true} as never)

    expect(mockScaffoldAndInstall).toHaveBeenCalled()
    expect(mockOutputLog).not.toHaveBeenCalled()
  })

  test('keeps the standalone Studio outro for regular init calls', async () => {
    await initStudio({...args, preclaim: false} as never)

    const lines = mockOutputLog.mock.calls.flat().join('\n')
    expect(lines).toContain('Success! Your Studio has been created')
    expect(lines).toContain('Get started by running npm run dev')
  })
})
