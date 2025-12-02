import {readdir} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {type Migration} from '@sanity/migrate'
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {RunMigrationCommand} from '../run.js'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  dryRun: vi.fn(),
  getCliConfig: vi.fn(),
  getProjectCliClient: vi.fn(),
  readdir: vi.fn(),
  resolveMigrationScript: vi.fn(),
  run: vi.fn(),
  spinner: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readdir: mocks.readdir,
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: mocks.confirm,
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/project',
    path: '/test/project/sanity.config.ts',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: mocks.getCliConfig,
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: mocks.getProjectCliClient,
}))

vi.mock('@sanity/migrate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/migrate')>()
  return {
    ...actual,
    dryRun: mocks.dryRun,
    run: mocks.run,
  }
})

vi.mock('../../../utils/migration/resolveMigrationScript.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/migrate')>()
  return {
    ...actual,
    resolveMigrationScript: mocks.resolveMigrationScript,
  }
})

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    spinner: mocks.spinner,
  }
})

const mockConfirm = mocks.confirm
const mockDryRun = mocks.dryRun
const mockGetCliConfig = mocks.getCliConfig
const mockGetProjectCliClient = mocks.getProjectCliClient
const mockReaddir = mocks.readdir
const mockResolveMigrationScript = mocks.resolveMigrationScript
const mockRun = mocks.run
const mockSpinner = mocks.spinner

describe('#migration:run', () => {
  beforeAll(() => {
    mockReaddir.mockResolvedValue([
      {isDirectory: () => false, name: 'my-migration.js'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
    ])

    mockResolveMigrationScript.mockResolvedValue([
      {
        absolutePath: '/test/project/migrations/my-migration.js',
        mod: {
          default: {
            documentTypes: ['article'],
            migrate: vi.fn(),
            title: 'My Migration',
          } as Migration,
        },
        relativePath: 'migrations/my-migration.js',
      },
    ])
  })
  beforeEach(() => {
    mocks.getCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      config: vi.fn().mockReturnValue({
        apiHost: 'https://api.sanity.io',
        apiVersion: 'v2024-01-29',
        dataset: 'production',
        projectId: 'test-project',
        token: 'mock-token',
      }),
    } as never)

    mockDryRun.mockImplementation(async function* () {
      yield {
        id: 'RDP0avd8MWK480sF2ok0FJ',
        patches: [{op: {type: 'setIfMissing', value: undefined}, path: ['creator']}],
        type: 'patch',
      }
      yield {
        id: 'RDP0avd8MWK480sF2ok0FJ',
        patches: [{op: {type: 'unset'}, path: ['author']}],
        type: 'patch',
      }
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['migration run', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Run a migration against a dataset

      USAGE
        $ sanity migration run [ID] [--api-version <value>] [--concurrency
          <value>] [--confirm] [--dataset <value>] [--dry-run] [--from-export <value>]
          [--progress] [--project <value>]

      ARGUMENTS
        ID  ID

      FLAGS
        --api-version=<value>  API version to use when migrating. Defaults to
                               v2024-01-29.
        --concurrency=<value>  [default: 6] How many mutation requests to run in
                               parallel. Must be between 1 and 10. Default: 6.
        --[no-]confirm         Prompt for confirmation before running the migration
                               (default: true). Use --no-confirm to skip.
        --dataset=<value>      Dataset to migrate. Defaults to the dataset configured
                               in your Sanity CLI config.
        --[no-]dry-run         By default the migration runs in dry mode. Use
                               --no-dry-run to migrate dataset.
        --from-export=<value>  Use a local dataset export as source for migration
                               instead of calling the Sanity API. Note: this is only
                               supported for dry runs.
        --[no-]progress        Display progress during migration (default: true). Use
                               --no-progress to hide output.
        --project=<value>      Project ID of the dataset to migrate. Defaults to the
                               projectId configured in your Sanity CLI config.

      DESCRIPTION
        Run a migration against a dataset

      EXAMPLES
        dry run the migration

          $ sanity migration run <id>

        execute the migration against a dataset

          $ sanity migration run <id> --no-dry-run --project xyz --dataset staging

        execute the migration using a dataset export as the source

          $ sanity migration run <id> --from-export=production.tar.gz --no-dry-run \\
            --project xyz --dataset staging

      "
    `)
  })

  test('errors when user only enters projectId flag', async () => {
    const {error} = await testCommand(RunMigrationCommand, [
      'my-migration',
      '--project',
      'test-project',
    ])

    expect(error?.message).toContain(
      'If either --dataset or --project is provided, both must be provided',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when user only enters dataset flag', async () => {
    const {error} = await testCommand(RunMigrationCommand, [
      'my-migration',
      '--dataset',
      'production',
    ])

    expect(error?.message).toContain(
      'If either --dataset or --project is provided, both must be provided',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no projectId flag is passed or available from config', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(error?.message).toContain(
      'sanity.cli.js does not contain a project identifier ("api.projectId") and no --project option was provided.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no dataset flag is passed or available from config', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: {
        dataset: undefined,
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(error?.message).toContain(
      'sanity.cli.js does not contain a dataset identifier ("api.dataset") and no --dataset option was provided.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows warning when user does not provide migration id', async () => {
    const {error, stderr, stdout} = await testCommand(RunMigrationCommand, [])

    expect(stderr).toContain('Migration ID must be provided')
    expect(stdout).toContain('my-migration')
    expect(stdout).toContain('My Migration')
    expect(stdout).toContain('ID')
    expect(stdout).toContain('Title')
    expect(stdout).toContain('Run `sanity migration run <ID>` to run a migration')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if more than one migration have the same name', async () => {
    mockReaddir.mockResolvedValue([
      {isDirectory: () => false, name: 'rename-tags.js'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
      {isDirectory: () => false, name: 'rename-tags.js'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
    ])

    mockResolveMigrationScript.mockResolvedValueOnce([
      {
        absolutePath: '/test/project/migrations/rename-tags.js',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'Rename tags to categories',
          } as Migration,
        },
        relativePath: 'migrations/rename-tags.js',
      },
      {
        absolutePath: '/test/project/migrations/rename-tags.js',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'Rename tags to categories',
          } as Migration,
        },
        relativePath: 'migrations/rename-tags.js',
      },
    ])

    const {error} = await testCommand(RunMigrationCommand, ['rename-tags'])

    expect(error?.message).toContain('Found multiple migrations for "rename-tags"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if there is no script attached to migration', async () => {
    mockResolveMigrationScript.mockResolvedValueOnce([])

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(error?.message).toContain('No migration found for "my-migration"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if the migration script contains up in mod property', async () => {
    mockResolveMigrationScript.mockResolvedValueOnce([
      {
        absolutePath: '/test/project/migrations/my-migration.ts',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'My migration',
          } as Migration,
          up: vi.fn(),
        },
        relativePath: 'migrations/my-migration.ts',
      },
    ])

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(error?.message).toContain('Only "up" migrations are supported at this time')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if the migration script contains down in mod property', async () => {
    mockResolveMigrationScript.mockResolvedValueOnce([
      {
        absolutePath: '/test/project/migrations/my-migration.ts',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'My migration',
          } as Migration,
          down: vi.fn(),
        },
        relativePath: 'migrations/my-migration.ts',
      },
    ])

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(error?.message).toContain('Only "up" migrations are supported at this time')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if from-export and no-dry-run flags are passed', async () => {
    const {error} = await testCommand(RunMigrationCommand, [
      'my-migration',
      '--from-export',
      'production.tar.gz',
      '--no-dry-run',
    ])

    expect(error?.message).toContain('Can only dry run migrations from a dataset export file')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if concurrency flag is passed with value greater than the max concurrency value', async () => {
    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--concurrency', '11'])

    expect(error?.message).toContain('Concurrency exceeds the maximum allowed value of 10')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if concurrency flag is passed with 0', async () => {
    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--concurrency', '0'])

    expect(error?.message).toContain('Concurrency must be a positive number, got 0')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('runs dry run migration by default', async () => {
    const {stdout} = await testCommand(RunMigrationCommand, ['my-migration'])

    expect(stdout).toContain('Running migration "my-migration" in dry mode')
    expect(stdout).toContain('Project id:  test-project')
    expect(stdout).toContain('Dataset:     production')
    expect(stdout).toContain(`[patch] [article] RDP0avd8MWK480sF2ok0FJ`)
    expect(stdout).toContain(`creator ....................... setIfMissing(undefined)`)
    expect(stdout).toContain(`[patch] [article] RDP0avd8MWK480sF2ok0FJ`)
    expect(stdout).toContain(`author ........................ unset()`)
  })

  test('runs dry run migration from export', async () => {
    const {stdout} = await testCommand(RunMigrationCommand, [
      'my-migration',
      '--from-export',
      'production.tar.gz',
    ])

    expect(stdout).toContain('Running migration "my-migration" in dry mode')
    expect(stdout).toContain('Using export production.tar.gz')
  })

  test('errors when users passes no-dry-run flag and says no to confirm prompt', async () => {
    mockConfirm.mockResolvedValueOnce(false)

    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'])

    expect(mockConfirm).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'This migration will run on the production dataset in test-project project. Are you sure?',
      ),
    })
    expect(error?.oclif?.exit).toBe(1)
  })

  test('successfully calls migration when user confirms yes', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      stopAndPersist: vi.fn().mockReturnThis(),
      text: '',
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    mockRun.mockImplementation(async (config) => {
      if (config.onProgress) {
        config.onProgress({
          completedTransactions: [{id: 'tx-1', mutations: []}],
          currentTransactions: [],
          documents: 100,
          done: true,
          mutations: 50,
          pending: 0,
        })
      }
    })

    const {stdout} = await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'])

    expect(stdout).toContain('Note: During migrations, your webhooks stay active.')
    expect(stdout).toContain(
      'To adjust them, launch the management interface with sanity manage, navigate to the API settings, and toggle the webhooks before and after the migration as needed.',
    )
    expect(mockSpinner).toHaveBeenCalledWith('Running migration "my-migration"')
    expect(mockSpinnerInstance.stopAndPersist).toHaveBeenCalled()
    expect(mockSpinnerInstance.text).toContain('Migration "my-migration" completed')
    expect(mockSpinnerInstance.text).toContain('Project id:  test-project')
    expect(mockSpinnerInstance.text).toContain('Dataset:     production')
    expect(mockSpinnerInstance.text).toContain('100 documents processed')
    expect(mockSpinnerInstance.text).toContain('50 mutations generated')
    expect(mockSpinnerInstance.text).toContain('1 transactions committed')
    expect(mockSpinnerInstance.stop).toHaveBeenCalled()
  })

  test('shows progress updates while migration is running', async () => {
    mockConfirm.mockResolvedValueOnce(true)

    const mockSpinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      stopAndPersist: vi.fn().mockReturnThis(),
      text: '',
    }
    mockSpinner.mockReturnValue(mockSpinnerInstance as never)

    mockRun.mockImplementation(async (config) => {
      if (config.onProgress) {
        config.onProgress({
          completedTransactions: [],
          currentTransactions: [{id: 'tx-1', mutations: [], type: 'transaction'}],
          documents: 50,
          done: false,
          mutations: 25,
          pending: 5,
        })
      }
    })

    await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'])

    expect(mockSpinner).toHaveBeenCalledWith('Running migration "my-migration"')
    expect(mockSpinnerInstance.text).toContain('Project id:')
    expect(mockSpinnerInstance.text).toContain('test-project')
    expect(mockSpinnerInstance.text).toContain('Dataset:')
    expect(mockSpinnerInstance.text).toContain('production')
    expect(mockSpinnerInstance.text).toContain('Document type:')
    expect(mockSpinnerInstance.text).toContain('article')
    expect(mockSpinnerInstance.text).toContain('50 documents processed…')
    expect(mockSpinnerInstance.text).toContain('25 mutations generated…')
    expect(mockSpinnerInstance.text).toContain('5 requests pending…')
    expect(mockSpinnerInstance.text).toContain('0 transactions committed.')
    expect(mockSpinnerInstance.text).toContain('» [transaction] tx-1')
  })
})
