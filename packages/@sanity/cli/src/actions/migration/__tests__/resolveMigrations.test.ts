import {readdir} from 'node:fs/promises'

import {type Migration} from '@sanity/migrate'
import {afterEach, expect, test, vi} from 'vitest'

import {resolveMigrations} from '../resolveMigrations.js'

const mocks = vi.hoisted(() => ({
  readdir: vi.fn(),
  resolveMigrationScript: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readdir: mocks.readdir,
}))

// Keep the real isLoadableMigrationScript; only stub the on-disk resolution.
vi.mock('../resolveMigrationScript.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../resolveMigrationScript.js')>()),
  resolveMigrationScript: mocks.resolveMigrationScript,
}))

const mockReaddir = vi.mocked(readdir)
const mockResolveMigrationScript = mocks.resolveMigrationScript

const migration = {migrate: vi.fn(), title: 'Rename field'} as unknown as Migration

afterEach(() => {
  vi.clearAllMocks()
})

test('returns a migration id only once when multiple loadable candidates resolve for one entry', async () => {
  mockReaddir.mockResolvedValue([
    {isDirectory: () => true, name: 'rename-field'} as unknown as Awaited<
      ReturnType<typeof readdir>
    >[0],
  ])

  // e.g. both `rename-field.ts` and `rename-field/index.ts` exist and load.
  mockResolveMigrationScript.mockResolvedValue([
    {
      absolutePath: '/p/migrations/rename-field.ts',
      mod: {default: migration},
      relativePath: 'migrations/rename-field.ts',
    },
    {
      absolutePath: '/p/migrations/rename-field/index.ts',
      mod: {default: migration},
      relativePath: 'migrations/rename-field/index.ts',
    },
  ])

  const result = await resolveMigrations('/p')

  expect(result).toHaveLength(1)
  expect(result[0]?.id).toBe('rename-field')
})

test('returns a migration id only once when a file and a directory share the same base name', async () => {
  mockReaddir.mockResolvedValue([
    {isDirectory: () => false, name: 'rename-field.ts'} as unknown as Awaited<
      ReturnType<typeof readdir>
    >[0],
    {isDirectory: () => true, name: 'rename-field'} as unknown as Awaited<
      ReturnType<typeof readdir>
    >[0],
  ])

  mockResolveMigrationScript.mockResolvedValue([
    {
      absolutePath: '/p/migrations/rename-field.ts',
      mod: {default: migration},
      relativePath: 'migrations/rename-field.ts',
    },
  ])

  const result = await resolveMigrations('/p')

  expect(result).toHaveLength(1)
  expect(result[0]?.id).toBe('rename-field')
})
