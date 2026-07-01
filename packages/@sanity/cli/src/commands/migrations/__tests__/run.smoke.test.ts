import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {testCommand} from '@sanity/cli-test'
import {at, defineMigration, setIfMissing} from '@sanity/migrate'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {RunMigrationCommand} from '../run.js'

// Smoke / integration test.
//
// Unlike run.test.ts, this file intentionally does NOT mock @sanity/migrate. It
// runs the real `dryRun` engine end-to-end against a local dataset export, so a
// runtime break in the @sanity/migrate contract (e.g. after a dependency upgrade
// where the API shape changed but the TypeScript types still happen to line up)
// is caught here even though the mocked unit tests would keep passing.
//
// It stays offline: dry-run-from-export reads a local archive instead of the API,
// and the migration never touches `context.client`, so no network call is made.
// Only CLI-side infrastructure is mocked: project-client auth and the on-disk
// migration-script lookup.

const mocks = vi.hoisted(() => ({
  getProjectCliClient: vi.fn(),
  resolveMigrationScript: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getProjectCliClient: mocks.getProjectCliClient,
}))

vi.mock('../../../actions/migration/resolveMigrationScript.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../actions/migration/resolveMigrationScript.js')
  >()),
  resolveMigrationScript: mocks.resolveMigrationScript,
}))

const exportArchive = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'example-export.tar.gz',
)

// A real migration definition (real defineMigration/at/setIfMissing from the package).
const migration = defineMigration({
  documentTypes: ['post'],
  migrate: {
    document() {
      return at('seen', setIfMissing(true))
    },
  },
  title: 'Add seen flag',
})

describe('#migration:run (smoke - real @sanity/migrate engine)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('dry-runs a real migration against a local export and prints generated mutations', async () => {
    mocks.getProjectCliClient.mockResolvedValue({
      config: () => ({
        apiHost: 'https://api.sanity.io',
        apiVersion: 'v2024-01-29',
        dataset: 'production',
        projectId: 'test-project',
        token: 'fake-token',
      }),
    })
    mocks.resolveMigrationScript.mockResolvedValue([
      {
        absolutePath: '/test/project/migrations/add-seen.js',
        mod: {default: migration},
        relativePath: 'migrations/add-seen.js',
      },
    ])

    const {error, stdout} = await testCommand(
      RunMigrationCommand,
      ['add-seen', '--from-export', exportArchive],
      {
        mocks: {
          cliConfig: {api: {dataset: 'production', projectId: 'test-project'}},
          projectRoot: {
            directory: '/test/project',
            path: '/test/project/sanity.config.ts',
            type: 'studio' as const,
          },
        },
      },
    )

    if (error) throw error

    // Header echoed by the CLI for a dry run.
    expect(stdout).toContain('Running migration "add-seen" in dry mode')
    expect(stdout).toContain(`Using export ${exportArchive}`)

    // Mutations actually produced by the REAL engine for both documents in the export.
    expect(stdout).toContain('post-1')
    expect(stdout).toContain('post-2')
    expect(stdout).toContain('seen')
    expect(stdout).toContain('setIfMissing(true)')
  })
})
