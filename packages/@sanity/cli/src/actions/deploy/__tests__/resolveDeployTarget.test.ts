import {describe, expect, test} from 'vitest'

import {resolveAppDeployTarget, resolveStudioDeployTarget} from '../resolveDeployTarget.js'

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
