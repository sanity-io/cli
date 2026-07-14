import {resolve} from 'node:path'

import {getCliConfig} from '@sanity/cli-core/config'
import {type CliConfig} from '@sanity/cli-core/types'
import {testCommand, testFixture} from '@sanity/cli-test'
import * as apiMocks from '@sanity/cli-test/mocks/cli-core/apiClient'
import * as uxMocks from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeAll, beforeEach, describe, expect, test, vi} from 'vitest'

import {ValidateDocumentsCommand} from '../../../../src/commands/documents/validate.js'

const VALID_DOCS_PATH = resolve(import.meta.dirname, '../../../__fixtures__/valid-documents.ndjson')
const INVALID_DOCS_PATH = resolve(
  import.meta.dirname,
  '../../../__fixtures__/invalid-documents.ndjson',
)

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))
vi.mock('@sanity/cli-core/apiClient', () => import('@sanity/cli-test/mocks/cli-core/apiClient'))

function setupMocksFromConfig(cliConfig: CliConfig) {
  apiMocks.getGlobalCliClient.mockResolvedValue({
    config: () => ({
      dataset: cliConfig.api?.dataset,
      projectId: cliConfig.api?.projectId,
      token: 'test-token',
    }),
  })
}

describe('#documents:validate', {timeout: 60 * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
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

    test('validates documents without markers and outputs empty NDJSON', async () => {
      uxMocks.confirm.mockResolvedValue(true)

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
      expect(uxMocks.confirm).toHaveBeenCalledWith({
        default: true,
        message: 'Are you sure you want to continue?',
      })
    })

    test('shows file-specific warning when using --file flag', async () => {
      uxMocks.confirm.mockResolvedValue(true)

      const {stdout} = await testCommand(ValidateDocumentsCommand, [
        '--file',
        VALID_DOCS_PATH,
        '--format',
        'ndjson',
      ])

      expect(stdout).toContain('reads all documents from your input file')
      expect(stdout).toContain('Checks for missing document references')
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
