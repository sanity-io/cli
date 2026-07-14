import {type CliConfig} from '@sanity/cli-core'
import {createMockOutput} from '@sanity/cli-test/test/util'
import {describe, expect, test, vi} from 'vitest'

import {logAppDeployed} from '../deployApp.js'

describe('logAppDeployed', () => {
  test("updating prints the dashboard URL from the deployed app's organization", () => {
    const output = createMockOutput()

    logAppDeployed({
      applicationId: 'app-1',
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      created: false,
      organizationId: 'org-1',
      output,
      title: 'My App',
    })

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Success! Application deployed to'),
    )
    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Updated the existing application.'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('/@org-1/application/app-1'))
  })

  test('creating without an appId warns that a redeploy creates another application', () => {
    const output = createMockOutput()

    logAppDeployed({
      applicationId: 'app-2',
      cliConfig: {app: {organizationId: 'org-1'}} as CliConfig,
      created: true,
      organizationId: 'org-1',
      output,
      title: 'New App',
    })

    const logged = vi
      .mocked(output.log)
      .mock.calls.map((call) => call[0])
      .join('\n')
    expect(logged).toContain('Created a new application.')
    expect(logged).toContain('creates another new application')
    expect(logged).toContain("appId: 'app-2'")
  })
})
