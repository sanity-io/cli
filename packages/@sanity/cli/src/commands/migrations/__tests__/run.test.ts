import {readdir} from 'node:fs/promises'

import {testCommand} from '@sanity/cli-test'
import {type Migration} from '@sanity/migrate'
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {RunMigrationCommand} from '../run.js'

const mocks = vi.hoisted(() => {
  const spinnerInstance = {
    start: vi.fn(),
    stop: vi.fn(),
    stopAndPersist: vi.fn(),
    text: '',
  }
  spinnerInstance.start.mockReturnValue(spinnerInstance)
  spinnerInstance.stop.mockReturnValue(spinnerInstance)
  spinnerInstance.stopAndPersist.mockReturnValue(spinnerInstance)
  return {
    confirm: vi.fn(),
    dryRun: vi.fn(),
    readdir: vi.fn(),
    resolveMigrationScript: vi.fn(),
    run: vi.fn(),
    spinner: vi.fn(() => spinnerInstance),
    spinnerInstance,
  }
})

vi.mock('node:fs/promises', () => ({
  readdir: mocks.readdir,
}))

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    confirm: mocks.confirm,
    spinner: mocks.spinner,
  }
})

const mockProjectRoot = vi.hoisted(() => ({
  directory: '/test/project',
  path: '/test/project/sanity.config.ts',
  type: 'studio' as const,
}))

const defaultMocks = {
  cliConfig: {
    api: {
      projectId: 'test-project',
    },
  },
  projectRoot: mockProjectRoot,
}

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      config: vi.fn().mockReturnValue({
        apiHost: 'https://api.sanity.io',
        apiVersion: 'v2024-01-29',
        dataset: 'production',
        projectId: 'test-project',
        token: 'mock-token',
      }),
    }),
  }
})

vi.mock('@sanity/migrate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/migrate')>()),
  dryRun: mocks.dryRun,
  run: mocks.run,
}))

vi.mock(import('../../../actions/migration/resolveMigrationScript.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveMigrationScript: mocks.resolveMigrationScript,
  }
})

const mockConfirm = mocks.confirm
const mockDryRun = mocks.dryRun
const mockReaddir = mocks.readdir
const mockResolveMigrationScript = mocks.resolveMigrationScript
const mockRun = mocks.run
const mockSpinner = mocks.spinnerInstance

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
    mockSpinner.text = ''
  })

  test('errors when user only enters projectId flag', async () => {
    const {error} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--project', 'test-project'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error?.message).toContain(
      'If either --dataset or --project is provided, both must be provided',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when user only enters dataset flag', async () => {
    const {error} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--dataset', 'production'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error?.message).toContain(
      'If either --dataset or --project is provided, both must be provided',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no projectId flag is passed or available from config', async () => {
    const {error} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: undefined,
          },
        },
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no dataset flag is passed or available from config', async () => {
    const {error} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: undefined,
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error?.message).toContain(
      'sanity.cli.js does not contain a dataset identifier ("api.dataset") and no --dataset option was provided.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('uses --project and --dataset flags even when cli config has no projectId', async () => {
    const {error, stdout} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--project', 'flag-project', '--dataset', 'flag-dataset'],
      {
        mocks: {
          ...defaultMocks,
          // No projectId/dataset resolvable from config — only the flags provide them.
          cliConfig: {api: {}},
        },
      },
    )

    if (error) throw error
    expect(stdout).toContain('Running migration "my-migration" in dry mode')
    expect(mockDryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({dataset: 'flag-dataset', projectId: 'flag-project'}),
      }),
      expect.objectContaining({title: 'My Migration'}),
    )
  })

  test('shows warning when user does not provide migration id', async () => {
    const {error, stderr, stdout} = await testCommand(RunMigrationCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(stderr).toContain('Migration ID must be provided')
    expect(stdout).toContain('my-migration')
    expect(stdout).toContain('My Migration')
    expect(stdout).toContain('ID')
    expect(stdout).toContain('Title')
    expect(stdout).toContain('Run `sanity migration run <ID>` to run a migration')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows friendly guidance instead of crashing when run without an id and the migrations folder is missing', async () => {
    const enoent = Object.assign(
      new Error("ENOENT: no such file or directory, scandir 'migrations'"),
      {code: 'ENOENT'},
    )
    mockReaddir.mockRejectedValueOnce(enoent)

    const {error, stderr, stdout} = await testCommand(RunMigrationCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(`${stdout}${stderr}`).not.toContain('ENOENT')
    expect(stdout).toContain('sanity migration create')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('lists migrations without an id even when project and dataset are not configured', async () => {
    const {error, stderr, stdout} = await testCommand(RunMigrationCommand, [], {
      mocks: {
        ...defaultMocks,
        // Like `migrations list`, listing should only need a project root.
        cliConfig: {api: {}},
      },
    })

    expect(stderr).toContain('Migration ID must be provided')
    expect(stdout).toContain('my-migration')
    expect(stdout).toContain('My Migration')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('surfaces a clear error when listing migrations fails for a non-ENOENT reason', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('Unexpected token in migration file'))

    const {error} = await testCommand(RunMigrationCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unexpected token in migration file')
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

    const {error} = await testCommand(RunMigrationCommand, ['rename-tags'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error?.message).toContain('Found multiple migrations for "rename-tags"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if there is no script attached to migration', async () => {
    mockResolveMigrationScript.mockResolvedValueOnce([])

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

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

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error?.message).toContain('Named "up"/"down" migration exports are not supported')
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

    const {error} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error?.message).toContain('Named "up"/"down" migration exports are not supported')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if from-export and no-dry-run flags are passed', async () => {
    const {error} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--from-export', 'production.tar.gz', '--no-dry-run'],
      {
        mocks: {
          ...defaultMocks,
          cliConfig: {
            api: {
              dataset: 'production',
              projectId: 'test-project',
            },
          },
        },
      },
    )

    expect(error?.message).toContain('Can only dry run migrations from a dataset export file')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if concurrency flag is passed with value greater than the max concurrency value', async () => {
    const {error} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--concurrency', '11'],
      {
        mocks: {
          ...defaultMocks,
          cliConfig: {
            api: {
              dataset: 'production',
              projectId: 'test-project',
            },
          },
        },
      },
    )

    expect(error?.message).toContain('Concurrency exceeds the maximum allowed value of 10')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error if concurrency flag is passed with 0', async () => {
    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--concurrency', '0'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error?.message).toContain('Concurrency must be a positive number, got 0')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('runs dry run migration by default', async () => {
    const {stdout} = await testCommand(RunMigrationCommand, ['my-migration'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(stdout).toContain('Running migration "my-migration" in dry mode')
    expect(stdout).toContain('Project id:  test-project')
    expect(stdout).toContain('Dataset:     production')
    expect(stdout).toContain(`[patch] [article] RDP0avd8MWK480sF2ok0FJ`)
    expect(stdout).toContain(`creator ....................... setIfMissing(undefined)`)
    expect(stdout).toContain(`[patch] [article] RDP0avd8MWK480sF2ok0FJ`)
    expect(stdout).toContain(`author ........................ unset()`)

    // Verify the CLI handed @sanity/migrate the right info: full API config
    // (incl. token + apiVersion) and the resolved migration as the source.
    expect(mockDryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          apiHost: 'https://api.sanity.io',
          apiVersion: 'v2024-01-29',
          dataset: 'production',
          projectId: 'test-project',
          token: 'mock-token',
        }),
        exportPath: undefined,
      }),
      expect.objectContaining({documentTypes: ['article'], title: 'My Migration'}),
    )
  })

  test('runs dry run migration from export', async () => {
    const {stdout} = await testCommand(
      RunMigrationCommand,
      ['my-migration', '--from-export', 'production.tar.gz'],
      {
        mocks: {
          ...defaultMocks,
          cliConfig: {
            api: {
              dataset: 'production',
              projectId: 'test-project',
            },
          },
        },
      },
    )

    expect(stdout).toContain('Running migration "my-migration" in dry mode')
    expect(stdout).toContain('Using export production.tar.gz')

    // The local export path is forwarded to @sanity/migrate as the source.
    expect(mockDryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({projectId: 'test-project', token: 'mock-token'}),
        exportPath: 'production.tar.gz',
      }),
      expect.objectContaining({title: 'My Migration'}),
    )
  })

  test('errors when users passes no-dry-run flag and says no to confirm prompt', async () => {
    mockConfirm.mockResolvedValueOnce(false)

    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(mockConfirm).toHaveBeenCalledWith({
      message: expect.stringContaining('Are you sure?'),
    })
    // Verify the message contains the key info (may be wrapped in ANSI codes on some Node versions)
    const confirmMessage = mockConfirm.mock.calls[0]?.[0]?.message ?? ''
    expect(confirmMessage).toContain('production')
    expect(confirmMessage).toContain('test-project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('successfully calls migration when user confirms yes', async () => {
    mockConfirm.mockResolvedValueOnce(true)

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

    const {stdout} = await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(stdout).toContain('Note: During migrations, your webhooks stay active.')
    expect(stdout).toContain(
      'To adjust them, launch the management interface with sanity manage, navigate to the API settings, and toggle the webhooks before and after the migration as needed.',
    )
    expect(mocks.spinner).toHaveBeenCalledWith(
      expect.stringContaining('Running migration "my-migration"'),
    )
    // The spinner is finalized exactly once, when the migration reports done.
    expect(mockSpinner.stopAndPersist).toHaveBeenCalledTimes(1)
    expect(mockSpinner.text).toContain('Migration "my-migration" completed')
    expect(mockSpinner.text).toContain('Project id:  test-project')
    expect(mockSpinner.text).toContain('Dataset:     production')
    expect(mockSpinner.text).toContain('100 documents processed')
    expect(mockSpinner.text).toContain('50 mutations generated')
    expect(mockSpinner.text).toContain('1 transactions committed')

    // Verify the CLI invoked the real run() entrypoint with the full API config,
    // the validated concurrency, a progress callback, and the resolved migration.
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        api: expect.objectContaining({
          apiHost: 'https://api.sanity.io',
          apiVersion: 'v2024-01-29',
          dataset: 'production',
          projectId: 'test-project',
          token: 'mock-token',
        }),
        concurrency: expect.any(Number),
        onProgress: expect.any(Function),
      }),
      expect.objectContaining({documentTypes: ['article'], title: 'My Migration'}),
    )
  })

  test('shows progress updates while migration is running', async () => {
    mockConfirm.mockResolvedValueOnce(true)

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

    await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    // While the migration is still running it should update the spinner, not
    // finalize it (stopAndPersist) on every in-progress callback.
    expect(mockSpinner.stopAndPersist).not.toHaveBeenCalled()
    expect(mockSpinner.text).toContain('Running migration "my-migration"')
    expect(mockSpinner.text).toContain('Project id:')
    expect(mockSpinner.text).toContain('test-project')
    expect(mockSpinner.text).toContain('Dataset:')
    expect(mockSpinner.text).toContain('production')
    expect(mockSpinner.text).toContain('Document type:')
    expect(mockSpinner.text).toContain('article')
    expect(mockSpinner.text).toContain('50 documents processed…')
    expect(mockSpinner.text).toContain('25 mutations generated…')
    expect(mockSpinner.text).toContain('5 requests pending…')
    expect(mockSpinner.text).toContain('0 transactions committed.')
    expect(mockSpinner.text).toContain('» [transaction] tx-1')
  })

  test('stops the spinner when the migration run throws', async () => {
    mockConfirm.mockResolvedValueOnce(true)
    mockRun.mockRejectedValueOnce(new Error('migration failed'))

    const {error} = await testCommand(RunMigrationCommand, ['my-migration', '--no-dry-run'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'test-project',
          },
        },
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('migration failed')
    // The spinner must be stopped even when run() rejects, so it does not keep
    // animating after the command has failed.
    expect(mockSpinner.stop).toHaveBeenCalled()
  })
})
