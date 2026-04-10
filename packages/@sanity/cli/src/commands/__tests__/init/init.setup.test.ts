import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {InitCommand} from '../../init.js'

const mocks = vi.hoisted(() => ({
  checkIsRemoteTemplate: vi.fn().mockReturnValue(false),
  detectFrameworkRecord: vi.fn(),
  getById: vi.fn(),
  getGitHubRepoInfo: vi.fn(),
}))

vi.mock('../../../util/detectFramework.js', () => ({
  detectFrameworkRecord: mocks.detectFrameworkRecord,
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
    {flag1: 'project=test', flag2: 'project-name=test'},
    {flag1: 'project-name=test', flag2: 'create-project=test'},
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

  test('does not require --dataset in unattended mode, defaults to production', async () => {
    // Mock no framework or a non-Next.js framework
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    const {error} = await testCommand(InitCommand, ['--yes', '--project=test-project'], {
      mocks: {
        ...defaultMocks,
      },
    })

    // Should pass dataset validation and reach the output-path check instead
    expect(error?.message).not.toContain('--dataset')
    expect(error?.message).toContain('`--output-path` must be specified in unattended mode')
  })

  test('throws error when `output-path` is not used in unattended mode with non-nextjs project', async () => {
    // Mock no framework or a non-Next.js framework
    mocks.detectFrameworkRecord.mockResolvedValueOnce(null)

    const {error} = await testCommand(InitCommand, ['--yes', '--project=test-project'], {
      mocks: {
        ...defaultMocks,
      },
    })

    // Should throw output-path error for non-Next.js projects
    expect(error?.message).toContain('`--output-path` must be specified in unattended mode')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when in unattended mode and `project` and `project-name` not set', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({
      name: 'Next.js',
      slug: 'nextjs',
    })

    const {error} = await testCommand(
      InitCommand,
      [
        '--yes',
        '--dataset=production',
        // Deliberately omitting --project and --project-name
      ],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(error?.message).toContain(
      '`--project <id>` or `--project-name <name>` must be specified in unattended mode',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when in unattended mode and `project-name` set without `organization`', async () => {
    mocks.detectFrameworkRecord.mockResolvedValueOnce({
      name: 'Next.js',
      slug: 'nextjs',
    })

    const {error} = await testCommand(
      InitCommand,
      ['--yes', '--dataset=production', '--project-name=test'],
      {
        mocks: {
          ...defaultMocks,
        },
      },
    )

    expect(error?.message).toContain(
      '`--project-name` requires `--organization <id>` in unattended mode',
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
