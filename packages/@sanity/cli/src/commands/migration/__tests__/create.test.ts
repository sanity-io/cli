import {access, mkdir, writeFile} from 'node:fs/promises'

import {runCommand} from '@oclif/test'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {CreateMigrationCommand} from '../create.js'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  findProjectRoot: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))

const mockTemplates = vi.hoisted(() => ({
  minimalAdvanced: vi.fn(),
  minimalSimple: vi.fn(),
  renameField: vi.fn(),
  renameType: vi.fn(),
  stringToPTE: vi.fn(),
}))

vi.mock('node:fs')

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: mocks.confirm,
  input: mocks.input,
  select: mocks.select,
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: mocks.findProjectRoot,
}))

vi.mock('../../../actions/migration/templates/index.js', () => mockTemplates)

const mockConfirm = mocks.confirm
const mockFindProjectRoot = mocks.findProjectRoot
const mockInput = mocks.input
const mockSelect = mocks.select
const mockAccess = vi.mocked(access)
const mockMkdir = vi.mocked(mkdir)
const mockWriteFile = vi.mocked(writeFile)

describe('#migration:create', () => {
  beforeEach(() => {
    mockFindProjectRoot.mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['migration create', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Create a new migration within your project

      USAGE
        $ sanity migration create [TITLE]

      ARGUMENTS
        [TITLE]  Title of migration

      DESCRIPTION
        Create a new migration within your project

      EXAMPLES
        Create a new migration, prompting for title and options

          $ sanity migration create

        Create a new migration with the provided title, prompting for options

          $ sanity migration create "Rename field from location to address"

      "
    `)
  })

  test('prompts user to enter title when no title argument is provided', async () => {
    await testCommand(CreateMigrationCommand)

    expect(mockInput).toHaveBeenCalledWith({
      message: 'Title of migration (e.g. "Rename field from location to address")',
      validate: expect.any(Function),
    })
  })

  test('skips title prompt when title is provided', async () => {
    await testCommand(CreateMigrationCommand, ['Migration Title'])

    expect(mockInput).toHaveBeenCalledWith({
      message:
        'Type of documents to migrate. You can add multiple types separated by comma (optional)',
    })
  })

  test('errors gracefully if findProjectRoot fails', async () => {
    mockFindProjectRoot.mockRejectedValue(new Error('No project root found'))

    const {error} = await testCommand(CreateMigrationCommand, ['Migration Title'])

    expect(error?.message).toContain('No project root found')
  })

  test('prompts user for type of documents for migration after a valid migration name has been entered', async () => {
    mockInput.mockResolvedValueOnce('Migration Title')

    await testCommand(CreateMigrationCommand)

    expect(mockInput.mock.calls[1][0]).toStrictEqual({
      message:
        'Type of documents to migrate. You can add multiple types separated by comma (optional)',
    })
  })

  test('prompts user for template selection after migration name and optional document types', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')

    await testCommand(CreateMigrationCommand, ['Migration Title'])

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {
          name: 'Minimalistic migration to get you started',
          value: 'Minimalistic migration to get you started',
        },
        {
          name: 'Rename an object type',
          value: 'Rename an object type',
        },
        {
          name: 'Rename a field',
          value: 'Rename a field',
        },
        {
          name: 'Convert string field to Portable Text',
          value: 'Convert string field to Portable Text',
        },
        {
          name: 'Advanced template using async iterators providing more fine grained control',
          value: 'Advanced template using async iterators providing more fine grained control',
        },
      ],
      message: 'Select a template',
    })
  })

  test('creates directory when it does not exist', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'))

    await testCommand(CreateMigrationCommand, ['Migration Title'])

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('/test/path/migrations/migration-title'),
      {
        recursive: true,
      },
    )
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  test('prompts the user to overwrite when directory already exists', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockConfirm.mockResolvedValue(true)

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockConfirm).toHaveBeenCalledWith({
      default: false,
      message: expect.stringContaining(
        'Migration directory /test/path/migrations/my-migration already exists. Overwrite?',
      ),
    })
    expect(mockMkdir).toHaveBeenCalled()
  })

  test('does not create directory when user declines overwrite', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockConfirm.mockResolvedValue(false)

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockConfirm).toHaveBeenCalled()
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  test('creates directory after user confirms overwrite', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockConfirm.mockResolvedValue(true)

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockConfirm).toHaveBeenCalled()
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('test/path/migrations/my-migration'),
      {
        recursive: true,
      },
    )
  })

  test('exits gracefully when directory creation fails', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockMkdir.mockRejectedValue(new Error('Permission denied'))

    const {error} = await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to create migration directory: Permission denied')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  test('output migration instructions after migrations folder has been created', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    const {stdout} = await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockWriteFile).toHaveBeenCalled()

    expect(stdout).toMatchInlineSnapshot(`
      "
      ✓ Migration created!

      Next steps:
      Open /test/path/migrations/my-migration/index.ts in your code editor and write the code for your migration.
      Dry run the migration with:
      \`sanity migration run my-migration --project=<projectId> --dataset <dataset> \`
      Run the migration against a dataset with:
       \`sanity migration run my-migration --project=<projectId> --dataset <dataset> --no-dry-run\`

      👉 Learn more about schema and content migrations at https://www.sanity.io/docs/schema-and-content-migrations
      "
    `)
  })

  test('creates minimalSimple template in migration folder when user selects it', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Minimalistic migration to get you started')
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockTemplates.minimalSimple).toHaveBeenCalled()
  })

  test('creates renameType template in migration folder when user selects it', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename an object type')
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockTemplates.renameType).toHaveBeenCalled()
  })

  test('creates renameField template in migration folder when user selects it', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Rename a field')
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockTemplates.renameField).toHaveBeenCalled()
  })

  test('creates stringToPTE template in migration folder when user selects it', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue('Convert string field to Portable Text')
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockTemplates.stringToPTE).toHaveBeenCalled()
  })

  test('creates minimalAdvanced template in migration folder when user selects it', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue(
      'Advanced template using async iterators providing more fine grained control',
    )
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')

    await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(mockTemplates.minimalAdvanced).toHaveBeenCalled()
  })

  test('exits gracefully when writing the template to the directory fails', async () => {
    mockInput.mockResolvedValueOnce('document-1, document-2, document-3')
    mockSelect.mockResolvedValue(
      'Advanced template using async iterators providing more fine grained control',
    )
    mockAccess.mockResolvedValue()
    mockMkdir.mockResolvedValue('test/path/migrations/my-migration')
    mockWriteFile.mockRejectedValue(new Error('Permission denied'))

    const {error, stdout} = await testCommand(CreateMigrationCommand, ['My Migration'])

    expect(error).toBeDefined()
    expect(error?.message).toContain('Failed to create migration file: Permission denied')
    expect(stdout).toBe('')
  })
})
