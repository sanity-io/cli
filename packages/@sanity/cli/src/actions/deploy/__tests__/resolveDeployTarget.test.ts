import {
  findApplicationBySlug,
  getApplication,
  isStudioSlugAvailable,
} from '@sanity/workbench-cli/deploy'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
  resolveAppDeployTarget,
  resolveStudioDeployTarget,
  resolveWorkbenchApp,
  resolveWorkbenchStudio,
} from '../resolveDeployTarget.js'

vi.mock(import('@sanity/workbench-cli/deploy'), async (importOriginal) => ({
  ...(await importOriginal()),
  findApplicationBySlug: vi.fn(),
  getApplication: vi.fn(),
  isStudioSlugAvailable: vi.fn(),
}))

const mockGetApplication = vi.mocked(getApplication)
const mockFindApplicationBySlug = vi.mocked(findApplicationBySlug)
const mockIsStudioSlugAvailable = vi.mocked(isStudioSlugAvailable)

beforeEach(() => {
  vi.clearAllMocks()
  mockIsStudioSlugAvailable.mockResolvedValue(true)
})

// These cases all short-circuit before any user-application lookup — they cover
// the host/URL validation and the missing-config guards, no API access needed.
// The verdicts that do hit the API (found / would-create / needs-input) are
// exercised end-to-end by the deploy integration tests.

const studioBase = {
  appId: undefined,
  isExternal: false,
  projectId: 'project-1',
  studioHost: undefined,
  urlFlag: undefined,
}

describe('resolveStudioDeployTarget', () => {
  test('internal --url that looks like a URL → invalid, suggests --external', async () => {
    const result = await resolveStudioDeployTarget({...studioBase, urlFlag: 'my-studio.com'})

    expect(result).toMatchObject({reason: 'invalid-host', type: 'invalid'})
    expect(result).toHaveProperty(
      'message',
      expect.stringContaining('Did you mean to use --external'),
    )
  })

  test('internal --url with illegal hostname characters → invalid', async () => {
    const result = await resolveStudioDeployTarget({...studioBase, urlFlag: 'bad_host'})

    expect(result).toMatchObject({reason: 'invalid-host', type: 'invalid'})
    expect(result).toHaveProperty('message', expect.stringContaining('Invalid studio hostname'))
  })

  test('external --url that is not a URL → invalid', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      isExternal: true,
      urlFlag: 'not a url',
    })

    expect(result).toMatchObject({reason: 'invalid-host', type: 'invalid'})
  })

  test('external --url with a non-http protocol → invalid', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      isExternal: true,
      urlFlag: 'ftp://example.com',
    })

    expect(result).toMatchObject({reason: 'invalid-host', type: 'invalid'})
    expect(result).toHaveProperty('message', expect.stringContaining('http or https'))
  })

  test('an invalid external studioHost from config is still validated → invalid', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      isExternal: true,
      studioHost: 'bad url',
    })

    expect(result).toMatchObject({reason: 'invalid-host', type: 'invalid'})
  })

  test('appId without a projectId → blocked', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      appId: 'app-1',
      projectId: undefined,
    })

    expect(result).toEqual({message: 'api.projectId is missing', type: 'blocked'})
  })

  test('a configured appId is resolved before an invalid external studioHost', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      appId: 'app-1',
      isExternal: true,
      projectId: undefined,
      studioHost: 'not a url',
    })

    // appId wins: we hit the missing-projectId guard, not host validation
    expect(result).toEqual({message: 'api.projectId is missing', type: 'blocked'})
  })

  test('a configured studioHost without a projectId → blocked', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      projectId: undefined,
      studioHost: 'my-studio',
    })

    expect(result).toEqual({message: 'api.projectId is missing', type: 'blocked'})
  })

  test('a valid external studioHost still needs a projectId → blocked', async () => {
    const result = await resolveStudioDeployTarget({
      ...studioBase,
      isExternal: true,
      projectId: undefined,
      studioHost: 'https://studio.example.com',
    })

    expect(result).toEqual({message: 'api.projectId is missing', type: 'blocked'})
  })
})

describe('resolveAppDeployTarget', () => {
  test('no appId and no organizationId → blocked', async () => {
    const result = await resolveAppDeployTarget({appId: undefined, organizationId: undefined})

    expect(result).toEqual({message: 'app.organizationId is missing', type: 'blocked'})
  })
})

describe('resolveWorkbenchApp', () => {
  const app = {
    id: 'app-1',
    organizationId: 'org-1',
    slug: 'agent',
    title: 'Agent',
    type: 'coreApp' as const,
  }

  test('a configured appId is looked up by id, no slug lookup', async () => {
    mockGetApplication.mockResolvedValue(app)

    const result = await resolveWorkbenchApp({
      appId: 'app-1',
      organizationId: 'org-1',
      slug: 'agent',
    })

    expect(result).toMatchObject({application: {id: 'app-1'}, type: 'found'})
    expect(mockFindApplicationBySlug).not.toHaveBeenCalled()
  })

  test('no appId, slug free in the org → would-create carrying the slug', async () => {
    mockFindApplicationBySlug.mockResolvedValue(null)

    const result = await resolveWorkbenchApp({
      appId: undefined,
      organizationId: 'org-1',
      slug: 'agent',
    })

    expect(result).toEqual({appHost: 'agent', type: 'would-create'})
  })

  test('no appId, slug already taken → slug-taken carries the existing app id', async () => {
    mockFindApplicationBySlug.mockResolvedValue({
      ...app,
      url: 'https://org-1.sanity.run/application/app-1',
    })

    const result = await resolveWorkbenchApp({
      appId: undefined,
      organizationId: 'org-1',
      slug: 'agent',
    })

    expect(result).toEqual({
      appHost: 'agent',
      existing: {
        appHost: 'agent',
        id: 'app-1',
        organizationId: 'org-1',
        title: 'Agent',
        url: 'https://org-1.sanity.run/application/app-1',
      },
      type: 'slug-taken',
    })
  })

  test('no appId and no org → would-create without a slug lookup', async () => {
    const result = await resolveWorkbenchApp({appId: undefined, slug: 'agent'})

    expect(result).toEqual({appHost: 'agent', type: 'would-create'})
    expect(mockFindApplicationBySlug).not.toHaveBeenCalled()
  })

  test('slug free in the org but taken globally → slug-taken with no holder', async () => {
    mockFindApplicationBySlug.mockResolvedValue(null)
    mockIsStudioSlugAvailable.mockResolvedValue(false)

    const result = await resolveWorkbenchApp({
      appId: undefined,
      organizationId: 'org-1',
      slug: 'agent',
    })

    expect(result).toEqual({appHost: 'agent', type: 'slug-taken'})
  })

  test('a holder in this org wins, so the id is offered without a global check', async () => {
    mockFindApplicationBySlug.mockResolvedValue({
      id: 'app-1',
      organizationId: 'org-1',
      slug: 'agent',
      title: 'Agent',
      type: 'coreApp',
      url: 'https://org-1.sanity.run/application/app-1',
    })

    expect(
      await resolveWorkbenchApp({appId: undefined, organizationId: 'org-1', slug: 'agent'}),
    ).toMatchObject({type: 'slug-taken'})
    expect(mockIsStudioSlugAvailable).not.toHaveBeenCalled()
  })

  test('no slug at all → would-create without one, since the API generates it', async () => {
    const result = await resolveWorkbenchApp({appId: undefined, organizationId: 'org-1'})

    expect(result).toEqual({type: 'would-create'})
    expect(mockFindApplicationBySlug).not.toHaveBeenCalled()
  })
})

// Only narrows resolveWorkbenchApp's `would-create` — the other verdicts, and
// the lookups behind them, are covered above.
describe('resolveWorkbenchStudio', () => {
  test('a studio always configures a slug, so would-create carries it', async () => {
    mockFindApplicationBySlug.mockResolvedValue(null)

    const result = await resolveWorkbenchStudio({
      appId: undefined,
      organizationId: 'org-1',
      slug: 'my-studio',
    })

    expect(result).toEqual({appHost: 'my-studio', type: 'would-create'})
  })

  test('every other verdict passes through unchanged', async () => {
    mockGetApplication.mockResolvedValue({
      id: 'studio-1',
      organizationId: 'org-1',
      slug: 'my-studio',
      title: 'My Studio',
      type: 'studio',
    })

    const result = await resolveWorkbenchStudio({appId: 'studio-1', slug: 'my-studio'})

    expect(result).toMatchObject({application: {id: 'studio-1'}, type: 'found'})
    expect(mockFindApplicationBySlug).not.toHaveBeenCalled()
  })
})
