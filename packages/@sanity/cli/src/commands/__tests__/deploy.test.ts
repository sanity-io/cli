import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../test/mockSanityCommand.js'

const {MockedSanityCommand, mocks} = createMockSanityCommand()
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, SanityCommand: MockedSanityCommand}
})

const mockDeployApp = vi.hoisted(() => vi.fn())
const mockDeployStudio = vi.hoisted(() => vi.fn())
const mockDetermineIsApp = vi.hoisted(() => vi.fn())
const mockDirIsEmptyOrNonExistent = vi.hoisted(() => vi.fn())
const mockGetWorkbench = vi.hoisted(() => vi.fn())
const mockResolveWorkbenchConfig = vi.hoisted(() => vi.fn())

vi.mock('@sanity/workbench-cli/deploy', () => ({
  getWorkbench: mockGetWorkbench,
  resolveWorkbenchConfig: mockResolveWorkbenchConfig,
}))

vi.mock('../../actions/deploy/deployApp.js', () => ({deployApp: mockDeployApp}))
vi.mock('../../actions/deploy/deployStudio.js', () => ({deployStudio: mockDeployStudio}))
vi.mock('../../util/determineIsApp.js', () => ({determineIsApp: mockDetermineIsApp}))
vi.mock('../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: mockDirIsEmptyOrNonExistent,
}))

const {DeployCommand} = await import('../deploy.js')

describe('#deploy', () => {
  beforeEach(() => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue({})
    mocks.SanityCmdGetProjectRoot.mockResolvedValue({
      directory: '/root',
      path: '/root/sanity.cli.ts',
    })
    mocks.SanityCmdIsUnattended.mockReturnValue(true)
    mockDetermineIsApp.mockReturnValue(false)
    mockDirIsEmptyOrNonExistent.mockResolvedValue(true)
    mockGetWorkbench.mockReturnValue(null)
    mockResolveWorkbenchConfig.mockReturnValue(null)
  })
  afterEach(() => vi.clearAllMocks())

  test('routes apps to deployApp', async () => {
    mockDetermineIsApp.mockReturnValue(true)
    await DeployCommand.run([])
    expect(mockDeployApp).toHaveBeenCalledTimes(1)
    expect(mockDeployStudio).not.toHaveBeenCalled()
  })

  test('routes studios to deployStudio', async () => {
    mockDetermineIsApp.mockReturnValue(false)
    await DeployCommand.run([])
    expect(mockDeployStudio).toHaveBeenCalledTimes(1)
    expect(mockDeployApp).not.toHaveBeenCalled()
  })

  test('logs the build target for a custom output directory', async () => {
    await DeployCommand.run(['output'])
    expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(expect.stringContaining('Building to'))
  })

  test('keeps stdout clean for the JSON payload — no build-target line with --json', async () => {
    await DeployCommand.run(['output', '--json'])
    expect(mocks.SanityCmdOutputLog).not.toHaveBeenCalledWith(
      expect.stringContaining('Building to'),
    )
  })

  test('forces yes downstream in unattended mode so nested steps cannot prompt', async () => {
    await DeployCommand.run([])
    expect(mockDeployStudio).toHaveBeenCalledWith(
      expect.objectContaining({flags: expect.objectContaining({yes: true})}),
    )
  })

  test('passes an explicit creation request to app deployment', async () => {
    mockDetermineIsApp.mockReturnValue(true)
    await DeployCommand.run(['--create', '--title', 'My App'])

    expect(mockDeployApp).toHaveBeenCalledWith(
      expect.objectContaining({
        flags: expect.objectContaining({create: true, title: 'My App', yes: true}),
      }),
    )
  })

  test('rejects --create for a studio before deployment', async () => {
    await DeployCommand.run(['--create'])
    expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
      expect.stringContaining('For a studio, use --url'),
    )

    expect(mockDeployStudio).not.toHaveBeenCalled()
  })

  test.each([{deployment: {appId: 'existing-app'}}, {app: {id: 'legacy-app'}}])(
    'rejects --create with an app ID in %j',
    async (cliConfig) => {
      mockDetermineIsApp.mockReturnValue(true)
      mocks.SanityCmdGetCliConfig.mockResolvedValue(cliConfig)

      await DeployCommand.run(['--create'])
      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringContaining('Omit --create to deploy to that app'),
      )

      expect(mockDeployApp).not.toHaveBeenCalled()
    },
  )

  test.each(['workbench', 'media library'])(
    'rejects --create for a %s configuration',
    async (kind) => {
      mockDetermineIsApp.mockReturnValue(true)
      if (kind === 'workbench') mockGetWorkbench.mockReturnValue({})
      else mockResolveWorkbenchConfig.mockReturnValue({})

      await DeployCommand.run(['--create'])
      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringContaining('Omit --create and run sanity deploy'),
      )

      expect(mockDeployApp).not.toHaveBeenCalled()
    },
  )
})
