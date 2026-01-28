import {existsSync, mkdirSync} from 'node:fs'
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises'
import path from 'node:path'

import {runCommand} from '@oclif/test'
import {confirm, input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DownloadBackupCommand} from '../download.js'

const mockListDatasets = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: mockListDatasets,
      } as never,
    }),
  }
})

vi.mock(import('node:fs/promises'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    mkdtemp: vi.fn(),
  }
})
vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
  }
})

const mockMkdtemp = vi.mocked(mkdtemp)
const mockSelect = vi.mocked(select)
const mockInput = vi.mocked(input)
const mockConfirm = vi.mocked(confirm)

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

function setupTempDir() {
  mockMkdtemp.mockResolvedValue(
    (() => {
      const tmpOutDir = path.join(process.cwd(), `tmp/sanity-backup-test-${Date.now()}`)
      mkdirSync(tmpOutDir, {recursive: true})
      return tmpOutDir
    })(),
  )
}

function mockBackupAPI({
  files,
  id = 'backup-123',
  nextCursor,
}: {
  files: {name: string; type: string; url: string}[]
  id?: string
  nextCursor?: string
}) {
  return mockApi({
    apiVersion: BACKUP_API_VERSION,
    method: 'get',
    uri: `/projects/test-project/datasets/production/backups/${id}`,
  }).reply(200, {
    createdAt: '2024-01-15T10:30:00Z',
    files,
    totalFiles: files.length,
    ...(nextCursor && {nextCursor}),
  })
}

function mockFileDownloads(files: {name: string; type: string; url: string}[]) {
  for (const file of files) {
    const urlPath = new URL(file.url).pathname
    if (file.type === 'document') {
      nock('https://api.sanity.io').get(urlPath).reply(200, '{"_id":"doc1"}')
    } else {
      nock('https://api.sanity.io')
        .get(urlPath)
        .reply(200, Buffer.from(`fake-${file.type}-data`))
    }
  }
}

describe('#backup:download', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['backup', 'download', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Download a dataset backup to a local file.

      USAGE
        $ sanity backup download [DATASET] [--backup-id <value>] [--concurrency
          <value>] [--out <value>] [--overwrite]

      ARGUMENTS
        [DATASET]  Dataset name to download backup from

      FLAGS
        --backup-id=<value>    The backup ID to download
        --concurrency=<value>  [default: 10] Concurrent number of backup item
                               downloads (max: 24)
        --out=<value>          The file or directory path the backup should download
                               to
        --overwrite            Allows overwriting of existing backup file

      DESCRIPTION
        Download a dataset backup to a local file.

      EXAMPLES
        Interactively download a backup

          $ sanity backup download

        Download a specific backup for the production dataset

          $ sanity backup download production --backup-id 2024-01-01-backup-1

        Download backup to a specific file

          $ sanity backup download production --backup-id 2024-01-01-backup-2 \\
            --out /path/to/file

        Download backup and overwrite existing file

          $ sanity backup download production --backup-id 2024-01-01-backup-3 \\
            --out /path/to/file --overwrite

      "
    `)
  })

  describe('validation', () => {
    test.each([
      [
        'concurrency value below minimum',
        ['--backup-id', 'test', '--concurrency', '0'],
        'concurrency should be in 1 to 24 range',
      ],
      [
        'concurrency value above maximum',
        ['--backup-id', 'test', '--concurrency', '25'],
        'concurrency should be in 1 to 24 range',
      ],
    ])('should reject %s', async (_, flags, expectedError) => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      const {error} = await testCommand(DownloadBackupCommand, ['production', ...flags], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain(expectedError)
    })
  })

  describe('error handling', () => {
    test.each([
      ['no datasets exist in project', [], 'No datasets found'],
      ['dataset is not found', [{name: 'staging'}], 'not found'],
    ])('should error when %s', async (_, datasets, expectedError) => {
      setupTempDir()
      mockListDatasets.mockResolvedValue(datasets)

      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error?.message).toContain(expectedError)
    })

    test('should error when no project ID is configured', async () => {
      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123'],
        {
          mocks: {
            ...defaultMocks,
            cliConfig: {api: {}},
          },
        },
      )

      expect(error?.message).toContain(NO_PROJECT_ID)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should error when no backups are available to select', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        query: {limit: '100'},
        uri: `/projects/test-project/datasets/production/backups`,
      }).reply(200, {
        backups: [],
      })

      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--out', 'backup.tar.gz'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error?.message).toContain(
        'Failed to fetch backups for dataset production: No backups found',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should error when cannot list datasets', async () => {
      mockListDatasets.mockRejectedValue(new Error('Failed to fetch datasets'))

      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should cancel operation when user rejects file overwrite', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      const out = `tmp/${Date.now()}-backup-docs/backup.tar.gz`

      await mkdir(path.dirname(out), {recursive: true})
      await writeFile(out, 'fake-data')

      mockConfirm.mockResolvedValue(false)

      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123', '--out', out],
        {
          mocks: defaultMocks,
        },
      )

      const fullPath = path.join(process.cwd(), out)

      expect(mockConfirm).toHaveBeenCalledWith({
        default: false,
        message: `File "${fullPath}" already exists, would you like to overwrite it?`,
      })

      expect(error?.message).toContain('Operation cancelled.')
      expect(error?.oclif?.exit).toBe(1)
    })

    test.each([
      [
        'document download fails',
        () => {
          const name = 'doc1.json'
          const type = 'document'
          mockBackupAPI({
            files: [{name, type, url: `https://api.sanity.io/${BACKUP_API_VERSION}/${name}`}],
          })
          nock('https://api.sanity.io').get(`/${BACKUP_API_VERSION}/${name}`).reply(500, {
            message: 'Internal Server Error',
          })
        },
      ],
      [
        'asset download fails',
        () => {
          const name = 'image1.jpg'
          const type = 'asset'
          mockBackupAPI({
            files: [{name, type, url: `https://api.sanity.io/${BACKUP_API_VERSION}/${name}`}],
          })
          nock('https://api.sanity.io').get(`/${BACKUP_API_VERSION}/${name}`).reply(500, {
            message: 'Internal Server Error',
          })
        },
      ],
      [
        'initial backup API call fails',
        () => {
          mockApi({
            apiVersion: BACKUP_API_VERSION,
            method: 'get',
            uri: `/projects/test-project/datasets/production/backups/backup-123`,
          }).reply(500, {
            message: 'Backup API error',
          })
        },
      ],
      [
        'backup API fails on subsequent pages',
        () => {
          // First page succeeds
          mockApi({
            apiVersion: BACKUP_API_VERSION,
            method: 'get',
            uri: `/projects/test-project/datasets/production/backups/backup-123`,
          }).reply(200, {
            createdAt: '2024-01-15T10:30:00Z',
            files: [
              {
                name: 'doc1.json',
                type: 'document',
                url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
              },
            ],
            nextCursor: 'page2',
            totalFiles: 2,
          })

          // Second page fails
          mockApi({
            apiVersion: BACKUP_API_VERSION,
            method: 'get',
            query: {nextCursor: 'page2'},
            uri: `/projects/test-project/datasets/production/backups/backup-123`,
          }).reply(500, {
            message: 'Second page error',
          })
        },
      ],
    ])('should error when %s', async (description, setupMock) => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])
      setupMock()

      const out = `tmp/${Date.now()}-backup-error/backup.tar.gz`
      const {error} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123', '--out', out],
        {
          mocks: defaultMocks,
        },
      )

      expect(error?.message).toContain('Downloading dataset backup failed')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('successful downloads', () => {
    test('should download backup with all flags specified', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        uri: `/projects/test-project/datasets/production/backups/backup-123`,
      }).reply(200, {
        createdAt: '2024-01-15T10:30:00Z',
        files: [
          {
            name: 'doc1.json',
            type: 'document',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
          },
          {
            name: 'image1.jpg',
            type: 'image',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/image1`,
          },
          {
            name: 'file1.pdf',
            type: 'file',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/file1`,
          },
        ],
        totalFiles: 3,
      })

      nock('https://api.sanity.io')
        .get(`/${BACKUP_API_VERSION}/doc1`)
        .reply(200, '{"_id":"doc1","title":"Document 1"}')
        .get(`/${BACKUP_API_VERSION}/image1`)
        .reply(200, Buffer.from('fake-image-data'), {'content-type': 'image/jpeg'})
        .get(`/${BACKUP_API_VERSION}/file1`)
        .reply(200, Buffer.from('fake-file-data'))

      const out = `tmp/${Date.now()}-backup/backup.tar.gz`
      const {error, stderr, stdout} = await testCommand(
        DownloadBackupCommand,
        [
          'production',
          '--backup-id',
          'backup-123',
          '--out',
          out,
          '--overwrite',
          '--concurrency',
          '5',
        ],
        {
          mocks: defaultMocks,
        },
      )

      expect(error).toBeUndefined()

      expect(stdout).toContain('Downloading backup for:')
      expect(stdout).toContain('projectId')
      expect(stdout).toContain('dataset')
      expect(stdout).toContain('backupId')

      expect(stderr).toContain('Backup download complete')
      expect(existsSync(out)).toBe(true)
    })

    test.each([
      [
        'documents only',
        [
          {
            name: 'doc1.json',
            type: 'document',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
          },
        ],
      ],
      [
        'mixed file types',
        [
          {
            name: 'doc1.json',
            type: 'document',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
          },
          {
            name: 'image1.jpg',
            type: 'image',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/image1`,
          },
          {
            name: 'file1.pdf',
            type: 'file',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/file1`,
          },
        ],
      ],
    ])('should download backup with %s', async (description, files) => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      mockBackupAPI({files})
      mockFileDownloads(files)

      const out = `tmp/${Date.now()}-backup-${description.replaceAll(/\s+/g, '-')}/backup.tar.gz`
      const {error, stderr} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123', '--out', out, '--overwrite'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error).toBeUndefined()
      expect(stderr).toContain('Backup download complete')
      expect(existsSync(out)).toBe(true)
    })

    test('should overwrite existing file when user confirms', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      const files = [
        {
          name: 'doc1.json',
          type: 'document',
          url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
        },
      ]

      mockBackupAPI({files})
      mockFileDownloads(files)

      const out = `tmp/${Date.now()}-backup-confirm/backup.tar.gz`

      await mkdir(path.dirname(out), {recursive: true})
      await writeFile(out, 'fake-data')

      mockConfirm.mockResolvedValue(true)

      const {error, stderr} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123', '--out', out],
        {
          mocks: defaultMocks,
        },
      )

      const fullPath = path.join(process.cwd(), out)

      expect(mockConfirm).toHaveBeenCalledWith({
        default: false,
        message: `File "${fullPath}" already exists, would you like to overwrite it?`,
      })
      expect(error).toBeUndefined()
      expect(stderr).toContain('Backup download complete')
      expect(existsSync(out)).toBe(true)
    })

    test('should download backup with paginated API response', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      // First page
      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        uri: `/projects/test-project/datasets/production/backups/backup-123`,
      }).reply(200, {
        createdAt: '2024-01-15T10:30:00Z',
        files: [
          {
            name: 'doc1.json',
            type: 'document',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
          },
          {
            name: 'image1.jpg',
            type: 'image',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/image1`,
          },
        ],
        nextCursor: 'page2',
        totalFiles: 3,
      })

      // Second page
      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        query: {nextCursor: 'page2'},
        uri: `/projects/test-project/datasets/production/backups/backup-123`,
      }).reply(200, {
        createdAt: '2024-01-15T10:30:00Z',
        files: [
          {
            name: 'file1.pdf',
            type: 'file',
            url: `https://api.sanity.io/${BACKUP_API_VERSION}/file1`,
          },
        ],
        totalFiles: 3,
      })

      // Mock file downloads
      nock('https://api.sanity.io')
        .get(`/${BACKUP_API_VERSION}/doc1`)
        .reply(200, '{"_id":"doc1","title":"Document 1"}')
        .get(`/${BACKUP_API_VERSION}/image1`)
        .reply(200, Buffer.from('fake-image-data'))
        .get(`/${BACKUP_API_VERSION}/file1`)
        .reply(200, Buffer.from('fake-file-data'))

      const out = `tmp/${Date.now()}-backup-paginated/backup.tar.gz`
      const {error, stderr} = await testCommand(
        DownloadBackupCommand,
        ['production', '--backup-id', 'backup-123', '--out', out, '--overwrite'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error).toBeUndefined()
      expect(stderr).toContain('Backup download complete')
      expect(existsSync(out)).toBe(true)
    })
  })

  describe('interactive prompts', () => {
    test('should prompt for backup selection when backup-id is not provided', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        query: {limit: '100'},
        uri: `/projects/test-project/datasets/production/backups`,
      }).reply(200, {
        backups: [
          {createdAt: '2024-01-01T00:00:00Z', id: 'backup-1'},
          {createdAt: '2024-01-02T00:00:00Z', id: 'backup-2'},
        ],
      })

      mockSelect.mockResolvedValue('backup-1')

      const files = [
        {
          name: 'doc1.json',
          type: 'document',
          url: `https://api.sanity.io/${BACKUP_API_VERSION}/doc1`,
        },
      ]
      mockApi({
        apiVersion: BACKUP_API_VERSION,
        method: 'get',
        uri: `/projects/test-project/datasets/production/backups/backup-1`,
      }).reply(200, {
        createdAt: '2024-01-15T10:30:00Z',
        files,
        totalFiles: files.length,
      })
      mockFileDownloads(files)

      const out = `tmp/${Date.now()}-backup-prompt/backup.tar.gz`

      const {error, stderr} = await testCommand(
        DownloadBackupCommand,
        ['production', '--out', out, '--overwrite'],
        {
          mocks: defaultMocks,
        },
      )

      expect(error).toBeUndefined()
      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            {name: 'backup-1', value: 'backup-1'},
            {name: 'backup-2', value: 'backup-2'},
          ]),
          message: expect.stringContaining('Select backup ID'),
        }),
      )
      expect(stderr).toContain('Backup download complete')
      expect(existsSync(out)).toBe(true)
    })

    test('should prompt for dataset selection when no dataset is specified', async () => {
      setupTempDir()
      mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

      mockBackupAPI({files: []})
      mockSelect.mockResolvedValue('production')
      const out = `tmp/${Date.now()}-backup-dataset-prompt/backup.tar.gz`
      mockInput.mockResolvedValue(out)

      const {stdout} = await testCommand(DownloadBackupCommand, ['--backup-id', 'backup-123'], {
        mocks: defaultMocks,
      })

      expect(mockSelect).toHaveBeenCalledWith({
        choices: [
          {name: 'production', value: 'production'},
          {name: 'staging', value: 'staging'},
        ],
        message: 'Select the dataset name:',
      })
      expect(stdout).toContain('Downloading backup for:')
      expect(stdout).toContain('projectId')
      expect(stdout).toContain('dataset')
      expect(stdout).toContain('backupId')
      expect(stdout).toContain('Downloading backup to')
      expect(existsSync(out)).toBe(true)
    })
  })
})
