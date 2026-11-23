import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {parseArguments} from '../../../util/parseArguments.js'
import {CreateProjectCommand} from '../create.js'

const mockCreateDataset = vi.hoisted(() => vi.fn())
const mockValidateDatasetName = vi.hoisted(() => vi.fn())
const mockGetOrganization = vi.hoisted(() => vi.fn())
const mockCreateProject = vi.hoisted(() => vi.fn())
const mockSetProjectLogo = vi.hoisted(() => vi.fn())
const mockGetProjectFeatures = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockGetManageUrl = vi.hoisted(() => vi.fn())
const mockPromptForProjectName = vi.hoisted(() => vi.fn())
const mockPromptForDefaultConfig = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('../../../actions/dataset/create.js', () => ({
  createDataset: mockCreateDataset,
}))
vi.mock('../../../actions/dataset/validateDatasetName.js', () => ({
  validateDatasetName: mockValidateDatasetName,
}))
vi.mock('../../../actions/organizations/getOrganization.js', () => ({
  getOrganization: mockGetOrganization,
}))
vi.mock('../../../actions/projects/getManageUrl.js', () => ({
  getManageUrl: mockGetManageUrl,
}))
vi.mock('../../../prompts/promptForDatasetName.js', () => ({
  promptForDatasetName: mockPromptForDatasetName,
}))
vi.mock('../../../prompts/promptForDefaultConfig.js', () => ({
  promptForDefaultConfig: mockPromptForDefaultConfig,
}))
vi.mock('../../../prompts/promptForProjectName.js', () => ({
  promptForProjectName: mockPromptForProjectName,
}))
vi.mock('../../../services/datasets.js', () => ({
  listDatasets: mockListDatasets,
}))
vi.mock('../../../services/organizations.js', () => ({})) // prevent loading of the types
vi.mock('../../../services/getProjectFeatures.js', () => ({
  getProjectFeatures: mockGetProjectFeatures,
}))
vi.mock('../../../services/projects.js', () => ({
  createProject: mockCreateProject,
  setProjectLogo: mockSetProjectLogo,
}))
vi.mock('../../../services/user.js', () => ({
  getCliUser: vi.fn(),
}))

const mockOrg = {id: 'org-1', name: 'Org 1', slug: 'org-1'}
const mockProject = {
  displayName: 'My Project',
  id: 'proj-123',
  projectId: 'proj-123',
}
const mockDataset = {aclMode: 'private', datasetName: 'dataset'}
const mockManageUrl = 'sanity.lol'
const logoUrl = 'https://cdn.sanity.io/projects/proj-123/images/abc-64x64.png'

let dir: string
let logoPath: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'project-create-'))
  logoPath = path.join(dir, 'logo.png')
  await writeFile(logoPath, 'png bytes')
  await writeFile(path.join(dir, 'large.png'), Buffer.alloc(5 * 1024 * 1024 + 1))
})

afterAll(async () => {
  await rm(dir, {force: true, recursive: true})
})

describe('#projects:create', () => {
  beforeEach(() => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockValidateDatasetName.mockReturnValue(null) // returns error if invalid
    mockGetOrganization.mockResolvedValue(mockOrg)
    mockCreateProject.mockResolvedValue(mockProject)
    mockGetProjectFeatures.mockResolvedValue(['privateDataset'])
    mockListDatasets.mockResolvedValue([])
    mockCreateDataset.mockImplementation((opts) => ({
      ...mockDataset,
      ...(opts.datasetName ? {datasetName: opts.datasetName} : {}),
    }))
    mockGetManageUrl.mockReturnValue(mockManageUrl)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('throws error if provided invalid dataset flag', async () => {
    const datasetError = 'terrible name'
    mockValidateDatasetName.mockReturnValue(datasetError) // returns error if invalid
    await expect(CreateProjectCommand.run(['--dataset=~~invalid-name'])).rejects.toMatchObject({
      message: expect.stringContaining(datasetError),
      oclif: {exit: exitCodes.USAGE_ERROR},
    })
  })

  test('errors when retrieving organization fails', async () => {
    const err = new Error('boom')
    mockGetOrganization.mockRejectedValue(err)
    await CreateProjectCommand.run(['My Project'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to retrieve an organization.*boom/i),
      {
        exit: exitCodes.RUNTIME_ERROR,
      },
    )
  })

  test('errors when create project fails', async () => {
    const err = new Error('boom')
    mockCreateProject.mockRejectedValue(err)
    await CreateProjectCommand.run(['My Project', '--organization=org-1'])

    expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to create project.*boom/i),
      {
        exit: exitCodes.RUNTIME_ERROR,
      },
    )
  })

  test('prompts for project name when not provided', async () => {
    const customProjName = 'My Custom Project'
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockPromptForProjectName.mockResolvedValue(customProjName)

    await CreateProjectCommand.run(['--organization=org-1'])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mockPromptForProjectName).toHaveBeenCalled()
    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({displayName: customProjName}),
    )
  })

  describe('in unattended mode', () => {
    beforeEach(() => {
      mocks.SanityCmdIsUnattended.mockReturnValue(true)
    })
    test('creates project with dataset when dataset name provided as flag', async () => {
      mockCreateDataset.mockResolvedValue({
        aclMode: 'private',
        datasetName: 'staging',
      })

      await CreateProjectCommand.run([
        '--yes',
        '--dataset=staging',
        '--dataset-visibility=private',
        '--organization=org-1',
      ])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Project created successfully'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(mockProject.displayName),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(mockProject.projectId),
      )
      expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/Dataset: staging/i),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringMatching(mockManageUrl))
    })

    test('creates project without dataset if no dataset name provided as flag', async () => {
      await CreateProjectCommand.run(['--yes', '--organization=org-1'])

      expect(mockListDatasets).not.toHaveBeenCalled()
      expect(mockCreateDataset).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Project created successfully'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(mockProject.displayName),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(mockProject.projectId),
      )
      expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(expect.stringMatching(/Dataset:/i))
    })
  })

  test('creates project with dataset when user confirms and chooses default config', async () => {
    mockCreateDataset.mockResolvedValue({
      aclMode: 'private',
      datasetName: 'production',
    })
    uxMocks.confirm.mockResolvedValue(true) // Would you like to create a dataset?
    mockPromptForDefaultConfig.mockResolvedValue(true) // sets dataset name to production

    await CreateProjectCommand.run(['New Project'])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Project created successfully'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.displayName),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.projectId),
    )
    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringMatching(/Dataset:/i))
    expect(mockCreateDataset).toHaveBeenCalledWith(
      expect.objectContaining({datasetName: 'production'}),
    )
  })

  test('creates project with dataset when user confirms but chooses not default config and is prompted for dataset name', async () => {
    mockCreateDataset.mockResolvedValue({
      aclMode: 'private',
      datasetName: 'staging',
    })
    uxMocks.confirm.mockResolvedValue(true) // Would you like to create a dataset?
    mockPromptForDefaultConfig.mockResolvedValue(false)
    mockPromptForDatasetName.mockResolvedValue('staging')

    await CreateProjectCommand.run(['New Project'])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Project created successfully'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.displayName),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.projectId),
    )
    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringMatching(/Dataset:/i))
    expect(mockCreateDataset).toHaveBeenCalledWith(
      expect.objectContaining({datasetName: 'staging'}),
    )
  })

  test('warns user when dataset creation fails', async () => {
    mockCreateDataset.mockRejectedValue(new Error('Failed to create Dataset'))

    await CreateProjectCommand.run(['My Project', '--dataset=production', '--organization=org-1'])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Project created successfully'),
    )
    expect(mocks.SanityCmdOutput.logDiagnostic).toHaveBeenCalledWith(
      expect.stringContaining('Project created but dataset creation failed'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.displayName),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockProject.projectId),
    )
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
      expect.stringMatching(/Dataset: production/i),
    )
  })

  test('creates project with JSON output', async () => {
    await CreateProjectCommand.run(['My Project', '--organization=org-1', '--json'])

    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.logJson).toHaveBeenCalledWith(mockProject)
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Project created successfully'),
    )
  })

  test('keeps JSON output parseable when creating a dataset', async () => {
    await CreateProjectCommand.run([
      'My Project',
      '--organization=org-1',
      '--dataset=production',
      '--json',
    ])

    expect(mocks.SanityCmdOutput.logJson).toHaveBeenCalledExactlyOnceWith(mockProject)
    expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalled()
    expect(mockCreateDataset).toHaveBeenCalledWith(expect.objectContaining({silent: true}))
  })

  describe('with a logo', () => {
    test('redacts the logo path from command telemetry', () => {
      const result = parseArguments(
        ['node', 'sanity', 'projects', 'create', '--logo=/Users/test/acme/logo.png'],
        CreateProjectCommand,
      )

      expect(result.extraArguments).toEqual(['--logo'])
    })

    test('creates the project, then sets its logo', async () => {
      mockSetProjectLogo.mockResolvedValue({logoUrl})

      await CreateProjectCommand.run(['My Project', '--organization=org-1', '--logo', logoPath])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mockSetProjectLogo).toHaveBeenCalledExactlyOnceWith('proj-123', {
        contentType: 'image/png',
        image: Buffer.from('png bytes'),
      })
      expect(mockCreateProject.mock.invocationCallOrder[0]).toBeLessThan(
        mockSetProjectLogo.mock.invocationCallOrder[0],
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(`Logo: ${logoUrl}`)
    })

    test('includes the logo URL in JSON output', async () => {
      mockSetProjectLogo.mockResolvedValue({logoUrl})

      await CreateProjectCommand.run([
        'My Project',
        '--organization=org-1',
        '--logo',
        logoPath,
        '--json',
      ])

      expect(mocks.SanityCmdOutput.logJson).toHaveBeenCalledExactlyOnceWith({
        ...mockProject,
        logoUrl,
      })
    })

    test('keeps the project and warns why when the API rejects the logo', async () => {
      mockSetProjectLogo.mockRejectedValue(new Error('The image could not be processed'))

      await CreateProjectCommand.run(['My Project', '--organization=org-1', '--logo', logoPath])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.logDiagnostic).toHaveBeenCalledWith(
        `Warning: Project created but its logo wasn't set: The image could not be processed\nTo set it, go to ${mockManageUrl}`,
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Project created successfully'),
      )
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(expect.stringContaining('Logo:'))
    })

    test.each([
      ['a file that does not exist', () => path.join(dir, 'missing.png'), "Couldn't find"],
      ['an unsupported file type', () => './logo.psd', "isn't a supported image type"],
      ['an empty logo path', () => '', '--logo needs the path to an image file'],
      [
        'a file over 5 MB',
        () => path.join(dir, 'large.png'),
        'is larger than 5 MB, the upload limit',
      ],
    ])('creates nothing when given %s', async (_label, getPath, message) => {
      await CreateProjectCommand.run(['My Project', '--organization=org-1', '--logo', getPath()])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(expect.stringContaining(message), {
        exit: exitCodes.RUNTIME_ERROR,
      })
      expect(mockCreateProject).not.toHaveBeenCalled()
      expect(mockSetProjectLogo).not.toHaveBeenCalled()
    })
  })
})
