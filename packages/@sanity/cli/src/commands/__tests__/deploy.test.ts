import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../test/mockSanityCommand.js'

const {MockedSanityCommand, mocks} = createMockSanityCommand()
const mockIsWorkbenchApp = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, isWorkbenchApp: mockIsWorkbenchApp, SanityCommand: MockedSanityCommand}
})

const mockRunDeploy = vi.hoisted(() => vi.fn())
const mockDetermineIsApp = vi.hoisted(() => vi.fn())
const mockDirIsEmptyOrNonExistent = vi.hoisted(() => vi.fn())

vi.mock('../../actions/deploy/runDeploy.js', () => ({runDeploy: mockRunDeploy}))
vi.mock('../../actions/deploy/coreApp.js', () => ({coreAppAdapter: {type: 'coreApp'}}))
vi.mock('../../actions/deploy/studio.js', () => ({studioAdapter: {type: 'studio'}}))
vi.mock('../../actions/deploy/workbench.js', () => ({
  workbenchAppAdapter: {type: 'coreApp', workbench: true},
  workbenchStudioAdapter: {type: 'studio', workbench: true},
}))
vi.mock('../../util/determineIsApp.js', () => ({determineIsApp: mockDetermineIsApp}))
vi.mock('../../util/dirIsEmptyOrNonExistent.js', () => ({
  dirIsEmptyOrNonExistent: mockDirIsEmptyOrNonExistent,
}))

const {DeployCommand} = await import('../deploy.js')

const adapterArg = () => mockRunDeploy.mock.calls.at(-1)?.[1]

describe('#deploy', () => {
  beforeEach(() => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue({})
    mocks.SanityCmdGetProjectRoot.mockResolvedValue({
      directory: '/root',
      path: '/root/sanity.cli.ts',
    })
    mocks.SanityCmdIsUnattended.mockReturnValue(true)
    mockDetermineIsApp.mockReturnValue(false)
    mockIsWorkbenchApp.mockReturnValue(false)
    mockDirIsEmptyOrNonExistent.mockResolvedValue(true)
  })
  afterEach(() => vi.clearAllMocks())

  test('routes apps to the coreApp adapter', async () => {
    mockDetermineIsApp.mockReturnValue(true)
    await DeployCommand.run([])
    expect(mockRunDeploy).toHaveBeenCalledTimes(1)
    expect(adapterArg()).toEqual({type: 'coreApp'})
  })

  test('routes studios to the studio adapter', async () => {
    mockDetermineIsApp.mockReturnValue(false)
    await DeployCommand.run([])
    expect(mockRunDeploy).toHaveBeenCalledTimes(1)
    expect(adapterArg()).toEqual({type: 'studio'})
  })

  test('routes workbench apps to the workbench adapters', async () => {
    mockIsWorkbenchApp.mockReturnValue(true)

    mockDetermineIsApp.mockReturnValue(true)
    await DeployCommand.run([])
    expect(adapterArg()).toEqual({type: 'coreApp', workbench: true})

    mockDetermineIsApp.mockReturnValue(false)
    await DeployCommand.run([])
    expect(adapterArg()).toEqual({type: 'studio', workbench: true})
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
    expect(mockRunDeploy).toHaveBeenCalledWith(
      expect.objectContaining({flags: expect.objectContaining({yes: true})}),
      expect.anything(),
    )
  })
})
