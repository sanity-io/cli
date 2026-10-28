import {select} from '@sanity/cli-core/ux'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type Application, listApplications} from '../../../services/applications.js'
import {selectWorkbenchAppId} from '../selectWorkbenchAppId.js'

vi.mock('@sanity/cli-core/ux', () => ({select: vi.fn(), Separator: class {}}))
vi.mock(import('../../../services/applications.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  listApplications: vi.fn(),
}))

const mockSelect = vi.mocked(select)
const mockListApplications = vi.mocked(listApplications)

const app: Application = {
  id: 'app-1',
  organizationId: 'org-1',
  slug: 'my-app',
  title: 'My App',
  type: 'coreApp',
}
const interactive = {
  appId: undefined,
  flags: {build: true, yes: false},
  organizationId: 'org-1',
  type: 'coreApp' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListApplications.mockResolvedValue([
    app,
    {id: 'studio-1', organizationId: 'org-1', slug: 'a-studio', title: 'A Studio', type: 'studio'},
  ])
})

describe('selectWorkbenchAppId', () => {
  test("offers the organization's applications of the deployed type and returns the pick", async () => {
    mockSelect.mockResolvedValue('app-1')

    await expect(selectWorkbenchAppId(interactive)).resolves.toBe('app-1')

    expect(mockListApplications).toHaveBeenCalledWith('org-1')
    expect(mockSelect.mock.calls[0][0].choices).toEqual([
      {name: 'New application deployment', value: 'NEW_APP'},
      expect.anything(),
      {name: 'My App', value: 'app-1'},
    ])
  })

  test('picking a new deployment returns undefined, so the deploy creates one', async () => {
    mockSelect.mockResolvedValue('NEW_APP')

    await expect(selectWorkbenchAppId(interactive)).resolves.toBeUndefined()
  })

  test('skips the prompt when no application of the deployed type exists', async () => {
    mockListApplications.mockResolvedValue([app])

    await expect(selectWorkbenchAppId({...interactive, type: 'studio'})).resolves.toBeUndefined()
    expect(mockSelect).not.toHaveBeenCalled()
  })

  test.each([
    {label: 'a configured appId', options: {appId: 'configured'}, returns: 'configured'},
    {label: '--yes (dry runs, CI, --json)', options: {flags: {build: true, yes: true}}},
    {label: '--no-build', options: {flags: {build: false, yes: false}}},
    {label: 'a missing organizationId', options: {organizationId: undefined}},
  ])('$label skips the lookup and the prompt', async ({options, returns}) => {
    await expect(selectWorkbenchAppId({...interactive, ...options})).resolves.toBe(returns)

    expect(mockListApplications).not.toHaveBeenCalled()
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
