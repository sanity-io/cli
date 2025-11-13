import {readdir} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {type Migration} from '@sanity/migrate'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {resolveMigrationScript} from '../../../utils/migration/resolveMigrationScript.js'
import {ListMigrationCommand} from '../list.js'

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/project',
    root: '/test/project',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../utils/migration/resolveMigrationScript.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../utils/migration/resolveMigrationScript.js')>()
  return {
    ...actual,
    isLoadableMigrationScript: actual.isLoadableMigrationScript,
    resolveMigrationScript: vi.fn(),
  }
})

const mockReaddir = vi.mocked(readdir)
const mockResolveMigrationScript = vi.mocked(resolveMigrationScript)

describe('#migration:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['migration list', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "List available migrations

      USAGE
        $ sanity migration list

      DESCRIPTION
        List available migrations

      EXAMPLES
        List all available migrations in the project

          $ sanity migration list

      "
    `)
  })

  test('lists migrations successfully with various formats', async () => {
    // Mock readdir to return both files and directories with different extensions
    mockReaddir.mockResolvedValue([
      {isDirectory: () => false, name: 'add-author-field.ts'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
      {isDirectory: () => true, name: 'migration-dir'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
      {isDirectory: () => false, name: 'rename-tags.js'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
    ])

    // Mock resolveMigrationScript for .ts file
    mockResolveMigrationScript.mockResolvedValueOnce([
      {
        absolutePath: '/test/project/migrations/add-author-field.ts',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'Add author field to articles',
          } as Migration,
        },
        relativePath: 'migrations/add-author-field.ts',
      },
    ])

    // Mock resolveMigrationScript for directory
    mockResolveMigrationScript.mockResolvedValueOnce([
      {
        absolutePath: '/test/project/migrations/migration-dir/index.ts',
        mod: {
          default: {
            migrate: vi.fn(),
            title: 'Directory-based migration',
          } as Migration,
        },
        relativePath: 'migrations/migration-dir/index.ts',
      },
    ])

    // Mock resolveMigrationScript for .js file
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
    ])

    const {stdout} = await testCommand(ListMigrationCommand, [])

    // Verify count
    expect(stdout).toContain('Found 3 migrations in project')

    // Verify .ts file (extension removed)
    expect(stdout).toContain('add-author-field')
    expect(stdout).not.toContain('add-author-field.ts')
    expect(stdout).toContain('Add author field to articles')

    // Verify directory
    expect(stdout).toContain('migration-dir')
    expect(stdout).toContain('Directory-based migration')

    // Verify .js file (extension removed)
    expect(stdout).toContain('rename-tags')
    expect(stdout).not.toContain('rename-tags.js')
    expect(stdout).toContain('Rename tags to categories')

    expect(stdout).toContain('Run `sanity migration run <ID>` to run a migration')
  })

  test('handles empty migrations folder', async () => {
    // Mock readdir to return empty array
    mockReaddir.mockResolvedValue([])

    const {stdout} = await testCommand(ListMigrationCommand, [])

    expect(stdout).toContain('No migrations found in migrations folder of the project')
    expect(stdout).toContain('Run `sanity migration create <NAME>` to create a new migration')
  })

  test('handles missing migrations folder', async () => {
    // Mock readdir to throw ENOENT error
    const enoentError = new Error('ENOENT: no such file or directory')
    Object.assign(enoentError, {code: 'ENOENT'})
    mockReaddir.mockRejectedValue(enoentError)

    const {stdout} = await testCommand(ListMigrationCommand, [])

    expect(stdout).toContain('No migrations folder found in the project')
    expect(stdout).toContain('Run `sanity migration create <NAME>` to create a new migration')
  })

  test('handles migration loading errors', async () => {
    // Mock readdir to return migration files
    mockReaddir.mockResolvedValue([
      {isDirectory: () => false, name: 'broken-migration.ts'} as unknown as Awaited<
        ReturnType<typeof readdir>
      >[0],
    ])

    // Mock resolveMigrationScript to throw error
    mockResolveMigrationScript.mockRejectedValue(new Error('Syntax error in migration file'))

    const {error} = await testCommand(ListMigrationCommand, [])

    expect(error?.message).toContain('List migrations failed')
    expect(error?.message).toContain('Syntax error in migration file')
    expect(error?.oclif?.exit).toBe(1)
  })
})
