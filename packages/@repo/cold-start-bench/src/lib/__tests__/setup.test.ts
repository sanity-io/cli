import {readdir, readFile} from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {filesGenerated, projectCli, setupArgs, templateFiles} from '../setup.ts'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}))
vi.mock('node:child_process', () => ({spawn: vi.fn()}))
vi.mock('../apiFixture.ts', () => ({FIXTURE_TOKEN: 'fixture-token'}))
vi.mock('../measure.ts', () => ({cleanEnv: vi.fn(), entryCommand: vi.fn()}))
vi.mock('../output.ts', () => ({visibleText: vi.fn()}))

const options = {dataset: 'production', project: 'bench123', template: 'clean' as const}

afterEach(() => vi.resetAllMocks())

describe('setupArgs', () => {
  test('supplies every choice without prompting or importing sample data', () => {
    expect(setupArgs(options, '/tmp/project with spaces')).toEqual([
      '--yes',
      '--project',
      'bench123',
      '--dataset',
      'production',
      '--output-path',
      '/tmp/project with spaces',
      '--template',
      'clean',
      '--typescript',
      '--package-manager',
      'npm',
      '--install',
      '--no-import-dataset',
      '--no-git',
      '--no-mcp',
      '--no-skills',
      '--no-auto-updates',
    ])
  })
})

describe('filesGenerated', () => {
  const files = ['package.json', 'sanity.config.ts', 'schemaTypes/index.ts']
  // Each call queues a fresh set of file reads.
  // eslint-disable-next-line unicorn/consistent-function-scoping
  function complete() {
    vi.mocked(readFile)
      .mockResolvedValueOnce('{"dependencies":{"sanity":"^6"},"scripts":{"dev":"sanity dev"}}')
      .mockResolvedValueOnce("projectId: 'bench123', dataset: 'production'")
      .mockResolvedValueOnce('export const schemaTypes = []')
  }
  test('requires the manifest, configured project/dataset, and every template asset', async () => {
    complete()
    expect(await filesGenerated('/tmp/studio', files, options)).toBe(true)
    expect(readFile).toHaveBeenCalledWith('/tmp/studio/schemaTypes/index.ts', 'utf8')
  })
  test('does not count a partial or incorrect configuration', async () => {
    complete()
    expect(await filesGenerated('/tmp/studio', files, {...options, dataset: 'staging'})).toBe(false)
  })
  test.each(['', '{', '{}'])('does not count an incomplete manifest: %s', async (manifest) => {
    vi.mocked(readFile)
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce('bench123 production')
      .mockResolvedValueOnce('schema')
    expect(await filesGenerated('/tmp/studio', files, options)).toBe(false)
  })
  test('waits for files to exist', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('not found'), {code: 'ENOENT'}))
    expect(await filesGenerated('/tmp/studio', files, options)).toBe(false)
  })
  test('surfaces permission errors', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('permission'), {code: 'EACCES'}))
    await expect(filesGenerated('/tmp/studio', files, options)).rejects.toThrow('permission')
  })
})

describe('projectCli', () => {
  test.each([{sanity: './bin/sanity.js'}, './bin/sanity.js'])(
    'resolves the installed bin: %j',
    async (bin) => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({bin}))
      expect(await projectCli('/tmp/studio')).toBe('/tmp/studio/node_modules/sanity/bin/sanity.js')
    },
  )
  test.each([undefined, {another: 'bin.js'}, '../../global.js'])(
    'rejects a missing or escaping bin: %j',
    async (bin) => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({bin}))
      await expect(projectCli('/tmp/studio')).rejects.toThrow()
    },
  )
})

test('templateFiles includes copied schemas and every generated configuration file', async () => {
  vi.mocked(readdir).mockResolvedValue([
    {
      isFile: () => true,
      name: 'index.js',
      parentPath: '/repo/packages/@sanity/cli/templates/clean/schemaTypes',
    },
    {
      isFile: () => false,
      name: 'schemaTypes',
      parentPath: '/repo/packages/@sanity/cli/templates/clean',
    },
  ] as unknown as Awaited<ReturnType<typeof readdir>>)
  expect(await templateFiles('/repo', 'clean')).toEqual([
    'schemaTypes/index.ts',
    'package.json',
    'sanity.config.ts',
    'sanity.cli.ts',
    'tsconfig.json',
    'eslint.config.mjs',
    '.gitignore',
  ])
})
