import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../init'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  detectFrameworkRecord: vi.fn(),
  getById: vi.fn().mockResolvedValue({
    email: 'test@example.com',
    id: 'user-123',
    name: 'Test User',
    provider: 'saml-123',
  }),
  login: vi.fn(),
  request: vi.fn(),
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
}))

vi.mock('../../actions/auth/login/index.js', () => ({
  login: mocks.login,
}))

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

      expect(stdout).toMatchInlineSnapshot(`
        "Initialize a new Sanity Studio, project and/or app

        USAGE
          $ sanity init [--json] [--auto-updates | --bare] [--coupon
            <code> | --project-plan <name>] [--create-project <name>] [--dataset <name>
            | --dataset-default] [--env <filename> | ] [--git <message> | ] [--mcp]
            [--nextjs-add-config-files] [--nextjs-append-env] [--nextjs-embed-studio]
            [--organization <id>] [--output-path <path> | ] [--overwrite-files]
            [--package-manager <manager> | ] [--project <id>] [--provider <provider>]
            [--template <template> | ] [--typescript | ] [--visibility <mode>] [-y]

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

            $ sanity init -y --project abc123 --dataset production --output-path \\
              ~/myproj

          Initialize a project with the given project ID and dataset using the moviedb
          template to the given path

            $ sanity init -y --project abc123 --dataset staging --template moviedb \\
              --output-path .

          Create a brand new project with name "Movies Unlimited"

            $ sanity init -y --create-project "Movies Unlimited" --dataset moviedb \\
              --visibility private --template moviedb --output-path \\
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

    test('throws error user is authenticated with invlaid token in unattended mode', async () => {
      mocks.getById.mockRejectedValueOnce('Invalid token')

      const {error} = await testCommand(InitCommand, ['--yes'])

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
})
