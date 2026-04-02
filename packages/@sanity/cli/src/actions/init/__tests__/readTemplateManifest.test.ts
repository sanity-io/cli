import path from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {readTemplateManifest, removeTemplateManifestFromOutput} from '../readTemplateManifest.js'

const MANIFEST_PATH = path.join('/tmp/project', 'sanity-template.json')

const mocks = vi.hoisted(() => ({
  noop: () => {},
  readFile: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  unlink: mocks.unlink,
}))

vi.mock('@sanity/cli-core', () => ({
  subdebug: () => mocks.noop,
}))

describe('readTemplateManifest', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('returns manifest when sanity-template.json exists with postInitMessage', async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({postInitMessage: 'Run npx skills add sanity-io/agent-context --all'}),
    )

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toEqual({
      postInitMessage: 'Run npx skills add sanity-io/agent-context --all',
    })
    expect(mocks.readFile).toHaveBeenCalledWith(MANIFEST_PATH, 'utf8')
  })

  test('returns manifest when postInitMessage is a string array', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({postInitMessage: ['Line one', 'Line two']}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toEqual({postInitMessage: ['Line one', 'Line two']})
  })

  test('strips unknown keys from manifest', async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({
        postInitMessage: 'ok',
        unknownField: 'ignored',
      }),
    )

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toEqual({postInitMessage: 'ok'})
  })

  test('returns manifest when file has no postInitMessage field', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toEqual({})
  })

  test('returns null when sanity-template.json does not exist', async () => {
    mocks.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toBeNull()
  })

  test('returns null when sanity-template.json contains invalid JSON', async () => {
    mocks.readFile.mockResolvedValue('not valid json {{{')

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toBeNull()
  })

  test('returns null when postInitMessage has invalid type', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({postInitMessage: 42}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toBeNull()
  })

  test('returns null when postInitMessage array contains non-strings', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({postInitMessage: ['ok', 1]}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toBeNull()
  })

  test('returns null when postInitMessage exceeds schema size limits', async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({postInitMessage: 'x'.repeat(2001)}))

    const manifest = await readTemplateManifest('/tmp/project')

    expect(manifest).toBeNull()
  })
})

describe('removeTemplateManifestFromOutput', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('unlinks sanity-template.json under output path', async () => {
    mocks.unlink.mockResolvedValue(undefined)

    await removeTemplateManifestFromOutput('/tmp/project')

    expect(mocks.unlink).toHaveBeenCalledWith(MANIFEST_PATH)
  })

  test('does not throw when file is already missing', async () => {
    mocks.unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

    await expect(removeTemplateManifestFromOutput('/tmp/project')).resolves.toBeUndefined()
  })

  test('does not throw when unlink fails for another reason', async () => {
    mocks.unlink.mockRejectedValue(Object.assign(new Error('EACCES'), {code: 'EACCES'}))

    await expect(removeTemplateManifestFromOutput('/tmp/project')).resolves.toBeUndefined()
  })
})
