import {testCommand} from '@sanity/cli-test'
import stringWidth from 'string-width'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {List} from '../list.js'

const mockListProjects = vi.hoisted(() => vi.fn())

vi.mock('../../../services/projects.js', () => ({
  listProjects: mockListProjects,
}))

const projects = [
  {
    createdAt: '2026-08-01T12:34:56.789Z',
    displayName: 'A deliberately overlong project name 日本語の折り返し確認用 🎉',
    id: 'project-a',
    members: [{id: 'member-1'}, {id: 'member-2'}],
  },
  {
    createdAt: '2026-07-01T12:34:56.789Z',
    displayName: 'Short project',
    id: 'project-b',
    members: [{id: 'member-1'}],
  },
]

describe('#projects:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(process.stdout, 'columns')
  })

  test('lists projects in a responsive table without truncating values', async () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 80})
    mockListProjects.mockResolvedValue(projects)

    const {error, stdout} = await testCommand(List, [])

    expect(error).toBeUndefined()
    expect(stdout).toContain('ID')
    expect(stdout).toContain('Members')
    expect(stdout).toContain('Name')
    expect(stdout).toContain('URL')
    expect(stdout).toContain('Created')
    expect(stdout).toContain('project-a')
    expect(stdout).toContain('deliberately')
    expect(stdout).toContain('日本語')
    expect(stdout).toContain('2026-08-01')
    expect(stdout).not.toContain('12:34:56.789Z')
    const urls = stdout
      .split('\n')
      .filter((line) => line.startsWith('│'))
      .map((line) => line.split('│')[4]?.trim() ?? '')
      .join('')
    expect(urls).toContain('https://www.sanity.io/manage/project/project-a')
    expect(stdout).not.toContain('...')
    expect(stdout.split('\n').filter((line) => line.startsWith('├')).length).toBeGreaterThan(1)
    for (const line of stdout.trim().split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(80)
    }
  })

  test('preserves project sorting flags', async () => {
    mockListProjects.mockResolvedValue(projects)

    const {stdout} = await testCommand(List, ['--sort=members', '--order=asc'])

    expect(stdout.indexOf('project-b')).toBeLessThan(stdout.indexOf('project-a'))
  })

  test('reports project list failures', async () => {
    mockListProjects.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(List, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('Failed to list projects')
  })
})
