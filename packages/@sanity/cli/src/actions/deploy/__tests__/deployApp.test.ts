import {type CliConfig, type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {type UserApplication} from '../../../services/userApplications.js'
import {logAppDeployed} from '../deployApp.js'

const mockOutput = () => ({log: vi.fn()}) as unknown as Output

function application(overrides: Partial<UserApplication> = {}): UserApplication {
  return {
    appHost: 'app-host',
    createdAt: '2024-01-01T00:00:00Z',
    id: 'app-1',
    organizationId: 'org-1',
    projectId: null,
    title: 'My App',
    type: 'coreApp',
    updatedAt: '2024-01-01T00:00:00Z',
    urlType: 'internal',
    ...overrides,
  }
}

describe('logAppDeployed', () => {
  test("prints the dashboard URL from the app's own organization, not the config", () => {
    const output = mockOutput()

    logAppDeployed({
      application: application(),
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      output,
    })

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Success! Application deployed to'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('/@org-1/application/app-1'))
  })

  test('omits the URL when the application has no organization', () => {
    const output = mockOutput()

    logAppDeployed({
      application: application({organizationId: null}),
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      output,
    })

    expect(output.log).toHaveBeenCalledWith('\nSuccess! Application deployed')
  })
})
