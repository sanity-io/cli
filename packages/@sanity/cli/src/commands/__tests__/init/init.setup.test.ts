import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init'

const mocks = vi.hoisted(() => ({
  checkIsRemoteTemplate: vi.fn().mockReturnValue(false),
  detectFrameworkRecord: vi.fn(),
  getById: vi.fn(),
  getGitHubRepoInfo: vi.fn(),
}))

vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
  LocalFileSystemDetector: vi.fn(),
}))

vi.mock('../../../actions/init/remoteTemplate.js', () => ({
  checkIsRemoteTemplate: mocks.checkIsRemoteTemplate,
  getGitHubRepoInfo: mocks.getGitHubRepoInfo,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      users: {
        getById: mocks.getById,
      } as never,
    }),
  }
})

// Set default mock behavior for getById
mocks.getById.mockResolvedValue({
  email: 'test@example.com',
  id: 'user-123',
  name: 'Test User',
  provider: 'saml-123',
})

const defaultMocks = {
  projectRoot: {
    directory: '/test/work/dir',
    path: '/test/work/dir',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#init: oclif command setup', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

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
                  --[no-]overwrite-files       Overwrite existing files
                  --package-manager=<manager>  Specify which package manager to use
                                               [allowed: npm, yarn, pnpm]
                  --project=<id>               Project ID to use for the studio
                  --project-plan=<name>        Optionally select a plan for a new project
                  --provider=<provider>        Login provider to use
                  --template=<template>        Project template to use [default: "clean"]
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
    const {error} = await testCommand(InitCommand, [`--${flag1}`, `--${flag2}`], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    const [name1] = flag1.split('=')
    const [name2, value2 = 'true'] = flag2.split('=')

    expect(error?.message).toContain(
      `--${name2}=${value2} cannot also be provided when using --${name1}`,
    )
    expect(error?.oclif?.exit).toBe(2)
  })

  test.each([
    {flag: 'env', message: 'Env filename (`--env`) must start with `.env`', value: 'invalid.txt'},
    {
      flag: 'visibility',
      message: 'Expected --visibility=opaque to be one of: public, private',
      value: 'opaque',
    },
    {
      flag: 'package-manager',
      message: 'Expected --package-manager=pnm to be one of: npm, yarn, pnpm',
      value: 'pnm',
    },
  ])('throws error when `$flag` value is invalid', async ({flag, message, value}) => {
    const {error} = await testCommand(InitCommand, [`--${flag}=${value}`], {
      mocks: {
        isInteractive: true,
        token: 'test-token',
      },
    })

    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(2)
  })

  test('throws error when type argument is passed', async () => {
    const {error} = await testCommand(InitCommand, ['bad-argument'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Unknown init type "bad-argument"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws deprecation error when type argument is passed with `plugin`', async () => {
    const {error} = await testCommand(InitCommand, ['plugin'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain('Initializing plugins through the CLI is no longer supported')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when `reconfigure` flag is passed', async () => {
    const {error} = await testCommand(InitCommand, ['--reconfigure'], {
      mocks: {
        ...defaultMocks,
        isInteractive: true,
      },
    })

    expect(error?.message).toContain(
      '--reconfigure is deprecated - manual configuration is now required',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when framework and remote template are used together', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({
      name: 'Next.js',
      slug: 'nextjs',
    })
    mocks.checkIsRemoteTemplate.mockReturnValueOnce(true)
    mocks.getGitHubRepoInfo.mockResolvedValueOnce({
      branch: 'main',
      owner: 'sanity-io',
      repo: 'sanity',
    })

    const {error} = await testCommand(
      InitCommand,
      ['--template=https://github.com/sanity-io/sanity'],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    expect(error?.message).toContain(
      'A remote template cannot be used with a detected framework. Detected: Next.js',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when in unattended mode and `dataset` is not set', async () => {
    const {error} = await testCommand(InitCommand, ['--yes'], {
      mocks: {
        ...defaultMocks,
      },
    })

    expect(error?.message).toContain('`--dataset` must be specified in unattended mode')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when `output-path` is not used in unattended mode with non-nextjs project', async () => {
    // Mock no framework or a non-Next.js framework
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--dataset=production', '--project=test-project'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    // Should throw output-path error for non-Next.js projects
    expect(error?.message).toContain('`--output-path` must be specified in unattended mode')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when in unattended mode and `project` and `create-project` not set', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({
      name: 'Next.js',
      slug: 'nextjs',
    })

    const {error} = await testCommand(
      InitCommand,
      [
        '--yes',
        '--dataset=production',
        // Deliberately omitting --project and --create-project
      ],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(error?.message).toContain(
      '`--project <id>` or `--create-project <name>` must be specified in unattended mode',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when in unattended mode and `create-project` not set with `organization`', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({
      name: 'Next.js',
      slug: 'nextjs',
    })

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--dataset=production', '--create-project=test'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(error?.message).toContain(
      '--create-project is not supported in unattended mode without an organization, please specify an organization with `--organization <id>`',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('logs properly if app template flag is not valid', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    const {stdout} = await testCommand(
      InitCommand,
      [
        '--template=invalid-template-name', // Not a valid app template
      ],
      {
        mocks: {
          ...defaultMocks,
          isInteractive: true,
        },
      },
    )

    // When template is not an app template, it should log "Fetching existing projects"
    expect(stdout).toContain('Fetching existing projects')
  })
})
