import {resolve} from 'node:path'

import {type CliConfig, getCliConfig} from '@sanity/cli-core'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {ValidateDocumentsCommand} from '../validate.js'

const VALID_DOCS_PATH = resolve(
  import.meta.dirname,
  '../../../../test/__fixtures__/valid-documents.ndjson',
)
const INVALID_DOCS_PATH = resolve(
  import.meta.dirname,
  '../../../../test/__fixtures__/invalid-documents.ndjson',
)

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  getGlobalCliClient: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: mocks.getGlobalCliClient,
  }
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    confirm: mocks.confirm,
  }
})

function setupMocksFromConfig(cliConfig: CliConfig) {
  mocks.getGlobalCliClient.mockResolvedValue({
    config: () => ({
      dataset: cliConfig.api?.dataset,
      projectId: cliConfig.api?.projectId,
      token: 'test-token',
    }),
  })
}

const defaultMocks = {
  cliConfig: {api: {dataset: 'test-dataset', projectId: 'test-project'}},
  globalApiClient: {
    config: vi.fn(() => ({
      dataset: 'test-dataset',
      projectId: 'test-project',
    })),
  } as never,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#documents:validate', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test.each([
    {
      args: ['--level', 'critical'],
      description: 'unsupported level flag',
      expectedError: 'Expected --level=critical to be one of: error, warning, info',
    },
    {
      args: ['--max-custom-validation-concurrency', 'abc'],
      description: 'non-integer max-custom-validation-concurrency',
      expectedError: 'Expected an integer but received: abc',
    },
    {
      args: ['--max-fetch-concurrency', 'xyz'],
      description: 'non-integer max-fetch-concurrency',
      expectedError: 'Expected an integer but received: xyz',
    },
  ])('throws error for $description', async ({args, expectedError}) => {
    const {error} = await testCommand(ValidateDocumentsCommand, args, {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(expectedError)
    expect(error?.oclif?.exit).toBe(2)
  })

  describe('basic-studio', () => {
    let cwd: string
    let cliConfig: CliConfig

    beforeAll(async () => {
      cwd = await testFixture('basic-studio')
      cliConfig = await getCliConfig(cwd)
    })

    beforeEach(() => {
      process.chdir(cwd)
      setupMocksFromConfig(cliConfig)
    })

    test('exits if format is incorrect value', async () => {
      const {error} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'xml',
      ])

      expect(error?.message).toContain(
        "Did not recognize format 'xml'. Available formats are 'json', 'ndjson', and 'pretty'",
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('validates documents without markers and outputs empty NDJSON', async () => {
      mocks.confirm.mockResolvedValue(true)

      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'ndjson',
      ])

      if (error) throw error
      expect(stdout).toContain('Warning:')
      expect(stdout).toContain('reads all documents from your input file')
      expect(stdout).toContain('Potential pitfalls:')
      expect(stdout).toContain('processes them through your local schema')
      expect(stdout).toContain('Checks for missing document references')
      expect(mocks.confirm).toHaveBeenCalledWith({
        default: true,
        message: 'Are you sure you want to continue?',
      })
    })

    test('aborts when user declines confirmation', async () => {
      mocks.confirm.mockResolvedValue(false)

      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'ndjson',
      ])

      expect(error?.message).toBe('User aborted')
      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain('Warning:')
      expect(mocks.confirm).toHaveBeenCalledWith({
        default: true,
        message: 'Are you sure you want to continue?',
      })
    })

    test('shows file-specific warning when using --file flag', async () => {
      mocks.confirm.mockResolvedValue(true)

      const {stdout} = await testCommand(ValidateDocumentsCommand, [
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'ndjson',
      ])

      expect(stdout).toContain('reads all documents from your input file')
      expect(stdout).toContain('Checks for missing document references')
    })

    test('errors when --file points to a directory', async () => {
      mocks.confirm.mockResolvedValue(true)

      const {error} = await testCommand(ValidateDocumentsCommand, [
        '--file',
        '.',
        '--format',
        'ndjson',
      ])

      expect(error?.message).toBe("'--file' must point to a valid ndjson file or tarball")
      expect(error?.oclif?.exit).toBe(1)
    })

    test('validates documents without markers and outputs empty JSON array', async () => {
      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'json',
      ])

      if (error) throw error
      const parsed = JSON.parse(stdout)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(0)
    })

    test('accepts --project-id flag and passes it through to validation', async () => {
      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'json',
        '--project-id',
        'override-project',
      ])

      if (error) throw error
      const parsed = JSON.parse(stdout)
      expect(Array.isArray(parsed)).toBe(true)
    })

    test('reports validation errors for documents with type mismatches', async () => {
      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        INVALID_DOCS_PATH,
        '--format',
        'ndjson',
      ])

      expect(error?.oclif?.exit).toBe(1)
      expect(stdout).toContain('post-invalid-type')

      const lines = stdout.trim().split('\n').filter(Boolean)
      const invalidPost = lines.find((line) => {
        const parsed = JSON.parse(line)
        return parsed.documentId === 'post-invalid-type'
      })
      expect(invalidPost).toBeDefined()

      const parsed = JSON.parse(invalidPost!)
      expect(parsed.markers.length).toBeGreaterThan(0)
      expect(parsed.markers.some((m: {level: string}) => m.level === 'error')).toBe(true)
    })

    test('filters markers by level correctly', async () => {
      const {stdout} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        INVALID_DOCS_PATH,
        '--format',
        'ndjson',
        '--level',
        'error',
      ])

      const lines = stdout.trim().split('\n').filter(Boolean)
      expect(lines.length).toBeGreaterThan(0)

      for (const line of lines) {
        const parsed = JSON.parse(line)
        expect(parsed.markers.length).toBeGreaterThan(0)
        for (const marker of parsed.markers) {
          expect(marker.level).toBe('error')
        }
      }
    })
  })

  describe('multi-workspace-studio', () => {
    let cwd: string
    let cliConfig: CliConfig

    beforeAll(async () => {
      cwd = await testFixture('multi-workspace-studio')
      cliConfig = await getCliConfig(cwd)
    })

    beforeEach(() => {
      process.chdir(cwd)
      setupMocksFromConfig(cliConfig)
    })

    test('works with multi-workspace studio using workspace flag', async () => {
      const {error, stdout} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'json',
        '--workspace',
        'production',
      ])

      if (error) throw error
      const parsed = JSON.parse(stdout)
      expect(Array.isArray(parsed)).toBe(true)
    })

    test('fails when multiple workspaces exist and no workspace flag provided', async () => {
      const {error} = await testCommand(ValidateDocumentsCommand, [
        '--yes',
        '--file',
        VALID_DOCS_PATH,
      ])

      expect(error?.message).toContain('Multiple workspaces found')
      expect(error?.message).toContain('--workspace')
      expect(error?.oclif?.exit).toBe(1)
    })
  })
})
