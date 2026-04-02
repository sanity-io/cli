import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {ListOrganizationsCommand} from '../list.js'

const mockList = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getGlobalCliClient: vi.fn().mockResolvedValue({
      request: mockList,
    }),
  }
})

const organizations = [
  {id: 'org-aaa', name: 'Acme Corp', slug: 'acme'},
  {id: 'org-bbb', name: 'Globex', slug: null},
]

describe('organizations list', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists organizations in a table', async () => {
    mockList.mockResolvedValue(organizations)

    const {error, stdout} = await testCommand(ListOrganizationsCommand, [])

    if (error) throw error
    expect(stdout).toContain('org-aaa')
    expect(stdout).toContain('Acme Corp')
    expect(stdout).toContain('acme')
    expect(stdout).toContain('org-bbb')
    expect(stdout).toContain('Globex')
    // The null slug should render as '-'
    const lines = stdout.split('\n')
    const globexLine = lines.find((l) => l.includes('Globex'))
    expect(globexLine).toBeDefined()
    expect(globexLine).toContain('-')
  })

  test('shows empty message when no organizations', async () => {
    mockList.mockResolvedValue([])

    const {error, stdout} = await testCommand(ListOrganizationsCommand, [])

    if (error) throw error
    expect(stdout).toContain('No organizations found')
  })

  test('errors when API call fails', async () => {
    mockList.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(ListOrganizationsCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list organizations')
    expect(error?.oclif?.exit).toBe(1)
  })
})
