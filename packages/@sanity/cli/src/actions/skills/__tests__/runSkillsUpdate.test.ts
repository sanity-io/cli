import fs from 'node:fs/promises'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {isSanityOwnedSource, runSkillsUpdate} from '../runSkillsUpdate.js'
import {SKILLS_BIN_PATH} from '../setupSkills.js'

const mockExeca = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock('execa', () => ({
  execa: mockExeca,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return {
    ...actual,
    default: {
      ...actual,
      readFile: mockReadFile,
    },
  }
})

const CWD = '/tmp/project'

function lockfile(skills: Record<string, {source: string; sourceType?: string}>): string {
  return JSON.stringify({
    skills: Object.fromEntries(
      Object.entries(skills).map(([name, info]) => [
        name,
        {source: info.source, sourceType: info.sourceType ?? 'github'},
      ]),
    ),
    version: 1,
  })
}

describe('isSanityOwnedSource', () => {
  test.each([
    ['sanity-io/agent-toolkit', true],
    ['sanity-io/next-sanity', true],
    ['sanity-labs/internal-skills', true],
    ['git@github.com:sanity-labs/internal-skills.git', true],
    ['git@github.com:sanity-io/agent-toolkit.git', true],
    ['SANITY-IO/agent-toolkit', true],
    ['  sanity-io/agent-toolkit  ', true],

    ['vercel-labs/skills', false],
    ['mattpocock/skills', false],
    ['avdlee/swiftui-agent-skill', false],
    ['not-sanity-io/foo', false],
    ['sanity-io-fake/foo', false],
    ['', false],
    [undefined, false],
  ])('isSanityOwnedSource(%j) === %j', (input, expected) => {
    expect(isSanityOwnedSource(input)).toBe(expected)
  })
})

describe('runSkillsUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('invokes `skills update --project -y` with every Sanity-owned skill from the lockfile', async () => {
    mockReadFile.mockResolvedValue(
      lockfile({
        'foreign-skill': {source: 'mattpocock/skills'},
        'internal-skill': {
          source: 'git@github.com:sanity-labs/internal-skills.git',
          sourceType: 'git',
        },
        'sanity-best-practices': {source: 'sanity-io/agent-toolkit'},
        'seo-aeo-best-practices': {source: 'sanity-io/agent-toolkit'},
      }),
    )
    mockExeca.mockResolvedValue({exitCode: 0, stdout: 'updated 3 skills'})

    const result = await runSkillsUpdate({cwd: CWD})

    expect(mockExeca).toHaveBeenCalledWith(
      process.execPath,
      [
        SKILLS_BIN_PATH,
        'update',
        '--project',
        '-y',
        'internal-skill',
        'sanity-best-practices',
        'seo-aeo-best-practices',
      ],
      expect.objectContaining({cwd: CWD, stdio: 'pipe'}),
    )
    expect(result.succeeded).toBe(true)
    expect(result.noOp).toBe(false)
    expect(result.updatedSkills).toEqual([
      'internal-skill',
      'sanity-best-practices',
      'seo-aeo-best-practices',
    ])
    expect(result.error).toBeUndefined()
  })

  test('does not invoke execa when no Sanity skills are present in the lockfile', async () => {
    mockReadFile.mockResolvedValue(lockfile({'foreign-skill': {source: 'mattpocock/skills'}}))

    const result = await runSkillsUpdate({cwd: CWD})

    expect(mockExeca).not.toHaveBeenCalled()
    expect(result.noOp).toBe(true)
    expect(result.succeeded).toBe(true)
    expect(result.updatedSkills).toEqual([])
  })

  test('treats a missing lockfile as a no-op', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), {code: 'ENOENT'}))

    const result = await runSkillsUpdate({cwd: CWD})

    expect(mockExeca).not.toHaveBeenCalled()
    expect(result.noOp).toBe(true)
    expect(result.succeeded).toBe(true)
  })

  test('treats an unparseable lockfile as a no-op', async () => {
    mockReadFile.mockResolvedValue('{not valid json')

    const result = await runSkillsUpdate({cwd: CWD})

    expect(mockExeca).not.toHaveBeenCalled()
    expect(result.noOp).toBe(true)
    expect(result.succeeded).toBe(true)
  })

  test('returns an error result when the skills CLI fails (does not throw)', async () => {
    mockReadFile.mockResolvedValue(
      lockfile({'sanity-best-practices': {source: 'sanity-io/agent-toolkit'}}),
    )
    const installErr = new Error('skills exited 1')
    mockExeca.mockRejectedValue(installErr)

    const result = await runSkillsUpdate({cwd: CWD})

    expect(result.succeeded).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('skills exited 1')
  })
})
