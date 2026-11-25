import {existsSync} from 'node:fs'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type InitOptions} from '../types.js'
import {writeOrOverwrite, writeSourceFiles} from '../writeFiles.js'

const mockConfirm = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/ux', () => ({
  confirm: mockConfirm,
}))

function initOptions(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    autoUpdates: true,
    bare: false,
    datasetDefault: false,
    fromCreate: false,
    install: false,
    mcpMode: 'skip',
    skillsMode: 'skip',
    template: 'clean',
    typescript: true,
    unattended: true,
    ...overrides,
  }
}

describe('writeFiles', () => {
  let workDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    workDir = await mkdtemp(join(tmpdir(), 'init-write-files-'))
  })

  afterEach(async () => {
    await rm(workDir, {force: true, recursive: true})
  })

  describe('writeOrOverwrite', () => {
    test('creates missing folders and writes a new file', async () => {
      const filePath = join(workDir, 'nested', 'deeper', 'file.ts')

      await writeOrOverwrite(filePath, 'export {}', workDir, initOptions())

      expect(await readFile(filePath, 'utf8')).toBe('export {}')
      expect(mockConfirm).not.toHaveBeenCalled()
    })

    test('keeps an existing file when unattended without the overwrite flag', async () => {
      const filePath = join(workDir, 'file.ts')
      await writeFile(filePath, 'original')

      await writeOrOverwrite(filePath, 'replaced', workDir, initOptions({unattended: true}))

      expect(await readFile(filePath, 'utf8')).toBe('original')
      expect(mockConfirm).not.toHaveBeenCalled()
    })

    test('overwrites an existing file when the overwrite flag is set', async () => {
      const filePath = join(workDir, 'file.ts')
      await writeFile(filePath, 'original')

      await writeOrOverwrite(
        filePath,
        'replaced',
        workDir,
        initOptions({overwriteFiles: true, unattended: true}),
      )

      expect(await readFile(filePath, 'utf8')).toBe('replaced')
      expect(mockConfirm).not.toHaveBeenCalled()
    })

    test('asks before overwriting when interactive and the user confirms', async () => {
      const filePath = join(workDir, 'file.ts')
      await writeFile(filePath, 'original')
      mockConfirm.mockResolvedValueOnce(true)

      await writeOrOverwrite(filePath, 'replaced', workDir, initOptions({unattended: false}))

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({default: false, message: expect.stringContaining('file.ts')}),
      )
      expect(await readFile(filePath, 'utf8')).toBe('replaced')
    })

    test('keeps the existing file when interactive and the user declines', async () => {
      const filePath = join(workDir, 'file.ts')
      await writeFile(filePath, 'original')
      mockConfirm.mockResolvedValueOnce(false)

      await writeOrOverwrite(filePath, 'replaced', workDir, initOptions({unattended: false}))

      expect(await readFile(filePath, 'utf8')).toBe('original')
    })
  })

  describe('writeSourceFiles', () => {
    test('writes nested files under sanity/ without the src prefix', async () => {
      await writeSourceFiles({
        fileExtension: 'ts',
        files: {
          schemaTypes: {
            'index.': 'export const schemaTypes = []',
          },
          'structure.': 'export const structure = {}',
        },
        options: initOptions(),
        workDir,
      })

      expect(existsSync(join(workDir, 'sanity', 'schemaTypes', 'index.ts'))).toBe(true)
      expect(existsSync(join(workDir, 'sanity', 'structure.ts'))).toBe(true)
    })

    test('writes under src/sanity when srcFolderPrefix is set', async () => {
      await writeSourceFiles({
        fileExtension: 'js',
        files: {
          lib: {
            'client.': 'export const client = null',
          },
        },
        options: initOptions(),
        srcFolderPrefix: true,
        workDir,
      })

      expect(existsSync(join(workDir, 'src', 'sanity', 'lib', 'client.js'))).toBe(true)
    })

    test('creates an empty directory for a nested object without string files', async () => {
      await writeSourceFiles({
        fileExtension: 'ts',
        files: {
          empty: {},
        },
        options: initOptions(),
        workDir,
      })

      expect(existsSync(join(workDir, 'sanity', 'empty'))).toBe(true)
    })
  })
})
