import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../init'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  createDataset: vi.fn(),
  createOrganization: vi.fn(),
  createProject: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getById: vi.fn().mockResolvedValue({
    email: 'test@example.com',
    id: 'user-123',
    name: 'Test User',
    provider: 'saml-123',
  }),
  getOrganizationChoices: vi.fn(),
  getOrganizationsWithAttachGrantInfo: vi.fn(),
  input: vi.fn(),
  listOrganizations: vi.fn(),
  login: vi.fn(),
  request: vi.fn(),
  select: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../../cli-core/src/services/apiClient.js', () => ({
  getGlobalCliClient: vi.fn().mockResolvedValue({
    request: mocks.request,
    users: {
      getById: mocks.getById,
    },
  }),
}))

vi.mock('../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('@sanity/cli-core/ux', () => ({
  confirm: mocks.confirm,
  input: mocks.input,
  select: mocks.select,
}))

vi.mock('../../actions/auth/login/index.js', () => ({
  login: mocks.login,
}))

vi.mock('../../actions/organizations/getOrganizationChoices.js', () => ({
  getOrganizationChoices: mocks.getOrganizationChoices,
}))

vi.mock('../../actions/organizations/getOrganizationsWithAttachGrantInfo.js', () => ({
  getOrganizationsWithAttachGrantInfo: mocks.getOrganizationsWithAttachGrantInfo,
}))

vi.mock('../../services/datasets.js', () => ({
  createDataset: mocks.createDataset,
}))

vi.mock('../../services/organizations.js', () => ({
  createOrganization: mocks.createOrganization,
  listOrganizations: mocks.listOrganizations,
}))

vi.mock('../../services/projects.js', () => ({
  createProject: mocks.createProject,
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    spinner: mocks.spinner,
  }
})

vi.mock('../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
}))

const httpError = Object.assign(new Error('Not Found'), {
  message: 'Coupon not found',
  response: {
    body: {},
    headers: {},
    method: '',
    statusCode: 404,
    url: '',
  },
  statusCode: 404,
})

describe('#init', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('oclif command setup', () => {
    test('--help works', async () => {
      const {stdout} = await runCommand('init --help')

      expect(stdout).toMatchInlineSnapshot(String.raw`
        "Initialize a new Sanity Studio, project and/or app

        USAGE
          $ sanity init [--json] [--auto-updates | --bare] [--coupon
            <code> | --project-plan <name>] [--dataset <name> | --dataset-default]
            [--env <filename> | ] [--git <message> | ] [--mcp]
            [--nextjs-add-config-files] [--nextjs-append-env] [--nextjs-embed-studio]
            [--organization <id>] [--output-path <path> | ] [--overwrite-files]
            [--package-manager <manager> | ] [--project <id> | --create-project <name>]
            [--provider <provider>] [--template <template> | ] [--typescript | ]
            [--visibility <mode>] [-y]

        FLAGS
          -y, --yes                        Unattended mode, answers "yes" to any
                                           "yes/no" prompt and otherwise uses defaults
              --[no-]auto-updates          Enable auto updates of studio versions
              --bare                       Skip the Studio initialization and only print
                                           the selected project ID and dataset name to
                                           stdout
              --coupon=<code>              Optionally select a coupon for a new project
                                           (cannot be used with --project-plan)
              --create-project=<name>      Create a new project with the given name
              --dataset=<name>             Dataset name for the studio
              --dataset-default            Set up a project with a public dataset named
                                           "production"
              --env=<filename>             Write environment variables to file
              --[no-]git=<message>         Specify a commit message for initial commit,
                                           or disable git init
              --[no-]mcp                   Enable AI editor integration (MCP) setup
              --organization=<id>          Organization ID to use for the project
              --output-path=<path>         Path to write studio project to
              --overwrite-files            Overwrite existing files
              --package-manager=<manager>  Specify which package manager to use
                                           [allowed: npm, yarn, pnpm]
              --project=<id>               Project ID to use for the studio
              --project-plan=<name>        Optionally select a plan for a new project
              --provider=<provider>        Login provider to use
              --template=<template>        [default: clean] Project template to use
                                           [default: "clean"]
              --[no-]typescript            Enable TypeScript support
              --visibility=<mode>          Visibility mode for dataset

        GLOBAL FLAGS
          --json  Format output as json.

        NEXT.JS FLAGS
          --[no-]nextjs-add-config-files  Add config files to Next.js project
          --[no-]nextjs-append-env        Append project ID and dataset to .env file
          --[no-]nextjs-embed-studio      Embed the Studio in Next.js application

        DESCRIPTION
          Initialize a new Sanity Studio, project and/or app

        EXAMPLES
          $ sanity init

          Initialize a new project with a public dataset named "production"

            $ sanity init --dataset-default

          Initialize a project with the given project ID and dataset to the given path

            $ sanity init -y --project abc123 --dataset production --output-path \
              ~/myproj

          Initialize a project with the given project ID and dataset using the moviedb
          template to the given path

            $ sanity init -y --project abc123 --dataset staging --template moviedb \
              --output-path .

          Create a brand new project with name "Movies Unlimited"

            $ sanity init -y --create-project "Movies Unlimited" --dataset moviedb \
              --visibility private --template moviedb --output-path \
              /Users/espenh/movies-unlimited

        "
      `)
    })

    test.each([
      {flag1: 'auto-updates', flag2: 'bare'},
      {flag1: 'coupon=123', flag2: 'project-plan=123'},
      {flag1: 'dataset="123', flag2: 'dataset-default'},
      {flag1: 'env=.env', flag2: 'bare'},
      {flag1: 'git=test', flag2: 'bare'},
      {flag1: 'no-git', flag2: 'git=test'},
      {flag1: 'output-path=/test-path', flag2: 'bare'},
      {flag1: 'package-manager=pnpm', flag2: 'bare'},
      {flag1: 'template=test', flag2: 'bare'},
      {flag1: 'typescript', flag2: 'bare'},
      {flag1: 'project=test', flag2: 'create-project=test'},
    ])('throws error when `$flag1` and `$flag2` flags are both passed', async ({flag1, flag2}) => {
      const {error} = await testCommand(InitCommand, [`--${flag1}`, `--${flag2}`])

      const [name1] = flag1.split('=')
      const [name2, value2 = 'true'] = flag2.split('=')

      expect(error?.message).toContain(
        `--${name2}=${value2} cannot also be provided when using --${name1}`,
      )
    })

    test('throws error when `env` flag is passed with invalid value', async () => {
      const {error} = await testCommand(InitCommand, ['--env=invalid.txt'])

      expect(error?.message).toContain('Env filename (`--env`) must start with `.env`')
    })

    test('throws error when `visibility` flag is passed with invalid option', async () => {
      const {error} = await testCommand(InitCommand, ['--visibility=opaque'])

      expect(error?.message).toContain('Expected --visibility=opaque to be one of: public, private')
    })

    test('throws error when `package-manager` flag is passed with invalid option', async () => {
      const {error} = await testCommand(InitCommand, ['--package-manager=pnm'])

      expect(error?.message).toContain(
        'Expected --package-manager=pnm to be one of: npm, yarn, pnpm',
      )
    })

    test('throws error when type argument is passed', async () => {
      const {error} = await testCommand(InitCommand, ['bad-argument'])

      expect(error?.message).toContain('Unknown init type "bad-argument"')
    })

    test('throws deprecation error when type argument is passed with `plugin`', async () => {
      const {error} = await testCommand(InitCommand, ['plugin'])

      expect(error?.message).toContain(
        'Initializing plugins through the CLI is no longer supported',
      )
    })

    test('throws deprecation error when type argument is passed with `plugin`', async () => {
      const {error} = await testCommand(InitCommand, ['plugin'])

      expect(error?.message).toContain(
        'Initializing plugins through the CLI is no longer supported',
      )
    })

    test('throws error when `reconfigure` flag is passed', async () => {
      const {error} = await testCommand(InitCommand, ['--reconfigure'])

      expect(error?.message).toContain(
        '--reconfigure is deprecated - manual configuration is now required',
      )
    })

    test('throws error when in unattended mode and `dataset` is not set', async () => {
      const {error} = await testCommand(InitCommand, ['--yes'])

      expect(error?.message).toContain('`--dataset` must be specified in unattended mode')
    })

    test('throws error when `output-path` is not used in unattended mode with non-nextjs project', async () => {
      // Mock no framework or a non-Next.js framework
      mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

      const {error} = await testCommand(InitCommand, [
        '--yes',
        '--dataset=production',
        '--project=test-project',
      ])

      // Should throw output-path error for non-Next.js projects
      expect(error?.message).toContain('`--output-path` must be specified in unattended mode')
    })

    test('throws error when in unattended mode and `project` and `create-project` not set', async () => {
      mocks.detectFrameworkRecord.mockResolvedValueOnce({
        name: 'Next.js',
        slug: 'nextjs',
      })

      const {error} = await testCommand(InitCommand, [
        '--yes',
        '--dataset=production',
        // Deliberately omitting --project and --create-project
      ])

      expect(error?.message).toContain(
        '`--project <id>` or `--create-project <name>` must be specified in unattended mode',
      )
    })

    test('throws error when in unattended mode and `create-project` not set with `organization`', async () => {
      mocks.detectFrameworkRecord.mockResolvedValueOnce({
        name: 'Next.js',
        slug: 'nextjs',
      })

      const {error} = await testCommand(InitCommand, [
        '--yes',
        '--dataset=production',
        '--create-project=test',
      ])

      expect(error?.message).toContain(
        '--create-project is not supported in unattended mode without an organization, please specify an organization with `--organization <id>`',
      )
    })
  })

  describe('framework detection', () => {
    test('throws error when framework and remote template are used together', async () => {
      mocks.detectFrameworkRecord.mockResolvedValue({
        name: 'Next.js',
        slug: 'nextjs',
      })

      const {error} = await testCommand(InitCommand, [
        '--template=https://github.com/sanity-io/sanity',
      ])

      expect(error?.message).toContain(
        'A remote template cannot be used with a detected framework. Detected: Next.js',
      )
    })
  })

  describe('retrieving plan', () => {
    test('returns undefined when no plan or coupon is provided', async () => {
      const {error} = await testCommand(InitCommand)

      expect(error).toBeUndefined()
    })

    describe('coupon', () => {
      test('validates coupon when --coupon flag is provided', async () => {
        mocks.request.mockResolvedValueOnce([{id: 'test-plan-id'}])

        const {error, stdout} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

        expect(error).toBeUndefined()
        expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
        expect(stdout).toContain('Coupon "TESTCOUPON123" validated!')
      })

      test('throws error if coupon not found with provided code', async () => {
        mocks.request.mockResolvedValueOnce([])

        const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

        expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
        expect(error?.message).toContain('Unable to validate coupon, please try again later:')
        expect(error?.message).toContain('No plans found for coupon code "TESTCOUPON123"')
      })

      test('throws error if coupon does not have attached plan id', async () => {
        mocks.request.mockResolvedValueOnce([{id: undefined}])

        const {error} = await testCommand(InitCommand, ['--coupon=TESTCOUPON123', '--bare'])

        expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/coupon/TESTCOUPON123'})
        expect(error?.message).toContain('Unable to validate coupon, please try again later:')
        expect(error?.message).toContain('Unable to find a plan from coupon code')
      })

      test('uses default plan when coupon does not exist and cli in unattended mode', async () => {
        mocks.request.mockRejectedValueOnce(httpError)

        const {error, stderr, stdout} = await testCommand(InitCommand, [
          '--coupon=INVALID123',
          '--yes',
          '--dataset=test',
          '--project==test',
        ])

        expect(error).toBe(undefined)
        expect(stderr).toContain(
          'Warning: Coupon "INVALID123" is not available - using default plan',
        )
        expect(stdout).toContain('Using default plan.')
      })

      test('uses default plan when user says confirms yes', async () => {
        mocks.request.mockRejectedValueOnce(httpError)
        mocks.confirm.mockResolvedValue(true)

        const {error, stdout} = await testCommand(InitCommand, ['--coupon=INVALID123'])

        expect(error).toBeUndefined()
        expect(mocks.confirm).toHaveBeenCalledWith({
          default: true,
          message: 'Coupon "INVALID123" is not available, use default plan instead?',
        })
        expect(stdout).toContain('Using default plan.')
      })

      test('throws error when user confirms no to use default plans', async () => {
        mocks.request.mockRejectedValueOnce(httpError)
        mocks.confirm.mockResolvedValue(false)

        const {error} = await testCommand(InitCommand, ['--coupon=INVALID123'])

        expect(error?.message).toContain('Coupon "INVALID123" does not exist')
      })
    })

    describe('plan', () => {
      test('returns when client request for plan is successful', async () => {
        mocks.request.mockResolvedValueOnce([{id: 'test-plan-id'}])

        const {error} = await testCommand(InitCommand, ['--project-plan=growth'])

        expect(error).toBeUndefined()
        expect(mocks.request).toHaveBeenCalledWith({uri: 'plans/growth'})
      })

      test('throw error when no plan id is returned by request', async () => {
        mocks.request.mockResolvedValueOnce([{id: undefined}])

        const {error} = await testCommand(InitCommand, ['--project-plan=growth'])
        expect(error?.message).toContain('Unable to validate plan, please try again later:')
        expect(error?.message).toContain('Unable to find a plan with id growth')
      })

      test('uses default plan when plan id does not exist and cli in unattended mode', async () => {
        mocks.request.mockRejectedValueOnce(httpError)

        const {error, stderr, stdout} = await testCommand(InitCommand, [
          '--project-plan=growth',
          '--yes',
          '--dataset=test',
          '--project==test',
        ])

        expect(error).toBe(undefined)
        expect(stderr).toContain(
          'Warning: Project plan "growth" does not exist - using default plan',
        )
        expect(stdout).toContain('Using default plan.')
      })

      test('uses default plan when user says confirms yes', async () => {
        process.stdin.isTTY = true
        mocks.request.mockRejectedValueOnce(httpError)
        mocks.confirm.mockResolvedValue(true)

        const {error, stdout} = await testCommand(InitCommand, ['--project-plan=growth'])

        expect(error).toBeUndefined()
        expect(mocks.confirm).toHaveBeenCalledWith({
          default: true,
          message: 'Project plan "growth" does not exist, use default plan instead?',
        })
        expect(stdout).toContain('Using default plan.')
      })

      test('throws error when user says confirms no', async () => {
        process.stdin.isTTY = true
        mocks.request.mockRejectedValueOnce(httpError)
        mocks.confirm.mockResolvedValue(false)

        const {error} = await testCommand(InitCommand, ['--project-plan=growth'])

        expect(error?.message).toContain('Plan id "growth" does not exist')
      })
    })
  })

  describe('authenticating', () => {
    test('user is authenticated with valid token', async () => {
      const {error, stdout} = await testCommand(InitCommand, [])

      expect(error).toBeUndefined()
      expect(stdout).toContain('You are logged in as test@example.com using SAML')
    })

    test('throws error user is authenticated with invalid token in unattended mode', async () => {
      mocks.getById.mockRejectedValueOnce('Invalid token')

      const {error} = await testCommand(InitCommand, ['--yes', '--dataset=test', '--project==test'])

      expect(error?.message).toContain(
        'Must be logged in to run this command in unattended mode, run `sanity login`',
      )
    })

    test('calls login when token invalid and not in unattended mode', async () => {
      process.stdin.isTTY = true
      mocks.getById.mockRejectedValueOnce('Invalid token')

      const {error} = await testCommand(InitCommand, [])

      expect(error).toBe(undefined)
      expect(mocks.login).toHaveBeenCalled()
    })
  })

  describe('template', () => {
    test('logs properly if app template flag is not valid', async () => {
      mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

      const {stdout} = await testCommand(InitCommand, [
        '--template=invalid-template-name', // Not a valid app template
      ])

      // When template is not an app template, it should log "Fetching existing projects"
      expect(stdout).toContain('Fetching existing projects')
    })
  })

  describe('create new project', () => {
    test('prompts user to create new organization if they have none', async () => {
      // Mock no framework detection
      mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

      // Mock listOrganizations to return empty array (user has no organizations)
      mocks.listOrganizations.mockResolvedValueOnce([])

      // Mock input prompt for organization name
      mocks.input.mockResolvedValueOnce('My New Organization')

      // Mock createOrganization to return the created organization
      mocks.createOrganization.mockResolvedValueOnce({
        createdByUserId: 'user-123',
        defaultRoleName: null,
        features: [],
        id: 'org-123',
        members: [],
        name: 'My New Organization',
        slug: 'my-new-organization',
      })

      // Mock createProject to return the created project with correct structure
      mocks.createProject.mockResolvedValueOnce({
        displayName: 'Test Project',
        projectId: 'project-123',
      })

      // Mock createDataset
      mocks.createDataset.mockResolvedValueOnce(undefined)

      // Mock spinner instance
      const mockSpinnerInstance = {
        fail: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      }
      mocks.spinner.mockReturnValue(mockSpinnerInstance)

      await testCommand(InitCommand, [
        '--create-project=Test Project',
        '--dataset=production',
        '--output-path=./test-project',
      ])

      // Verify listOrganizations was called
      expect(mocks.listOrganizations).toHaveBeenCalled()

      // Verify input prompt was called with correct parameters
      expect(mocks.input).toHaveBeenCalledWith(
        expect.objectContaining({
          default: 'Test User',
          message: 'Organization name:',
        }),
      )

      // Verify createOrganization was called with the input value
      expect(mocks.createOrganization).toHaveBeenCalledWith('My New Organization')

      // Verify createProject was called
      expect(mocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test Project',
          organizationId: 'org-123',
        }),
      )

      // Verify createDataset was called
      expect(mocks.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          aclMode: undefined,
          datasetName: 'production',
          projectId: 'project-123',
        }),
      )

      // Verify spinner was called with correct text
      expect(mocks.spinner).toHaveBeenCalledWith('Creating organization')
      expect(mocks.spinner).toHaveBeenCalledWith('Creating dataset')
    })

    test('prompts user to select then create a new organization', async () => {
      // Mock no framework detection
      mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

      // Mock listOrganizations to return existing organizations
      mocks.listOrganizations.mockResolvedValueOnce([
        {
          id: 'existing-org-123',
          name: 'Existing Organization',
          slug: 'existing-organization',
        },
      ])

      // Mock getOrganizationsWithAttachGrantInfo to return organizations with attach grant
      mocks.getOrganizationsWithAttachGrantInfo.mockResolvedValueOnce([
        {
          hasAttachGrant: true,
          organization: {
            id: 'existing-org-123',
            name: 'Existing Organization',
            slug: 'existing-organization',
          },
        },
      ])

      // Mock getOrganizationChoices to return choices including create new option
      mocks.getOrganizationChoices.mockReturnValueOnce([
        {name: 'Existing Organization [existing-org-123]', value: 'existing-org-123'},
        {name: 'Create new organization', value: '-new-'},
      ])

      // Mock select prompt - user chooses to create new organization
      mocks.select.mockResolvedValueOnce('-new-')

      // Mock input prompt for new organization name
      mocks.input.mockResolvedValueOnce('Brand New Organization')

      // Mock createOrganization to return the newly created organization
      mocks.createOrganization.mockResolvedValueOnce({
        createdByUserId: 'user-123',
        defaultRoleName: null,
        features: [],
        id: 'new-org-456',
        members: [],
        name: 'Brand New Organization',
        slug: 'brand-new-organization',
      })

      // Mock createProject to return the created project
      mocks.createProject.mockResolvedValueOnce({
        displayName: 'Test Project',
        projectId: 'project-123',
      })

      // Mock createDataset
      mocks.createDataset.mockResolvedValueOnce(undefined)

      // Mock spinner instance
      const mockSpinnerInstance = {
        fail: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn().mockReturnThis(),
      }
      mocks.spinner.mockReturnValue(mockSpinnerInstance)

      await testCommand(InitCommand, [
        '--create-project=Test Project',
        '--dataset=production',
        '--output-path=./test-project',
      ])

      // Verify createOrganization was called with the input value
      expect(mocks.createOrganization).toHaveBeenCalledWith('Brand New Organization')

      // Verify createProject was called
      expect(mocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Test Project',
          organizationId: 'new-org-456',
        }),
      )

      // Verify createDataset was called
      expect(mocks.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          aclMode: undefined,
          datasetName: 'production',
          projectId: 'project-123',
        }),
      )

      // Verify spinner was called with correct text
      expect(mocks.spinner).toHaveBeenCalledWith('Creating organization')
      expect(mocks.spinner).toHaveBeenCalledWith('Creating dataset')
    })
  })
})
