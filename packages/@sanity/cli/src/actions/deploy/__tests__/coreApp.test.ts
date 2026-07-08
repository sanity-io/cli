import {type CliConfig, type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {logAppDeployed} from '../coreApp.js'

const mockOutput = () => ({log: vi.fn()}) as unknown as Output

describe('logAppDeployed', () => {
  test("prints the dashboard URL from the deployed app's organization", () => {
    const output = mockOutput()

    logAppDeployed({
      applicationId: 'app-1',
      cliConfig: {app: {organizationId: 'config-org'}, deployment: {appId: 'app-1'}} as CliConfig,
      organizationId: 'org-1',
      output,
      title: 'My App',
    })

    expect(output.log).toHaveBeenCalledWith(
      expect.stringContaining('Success! Application deployed to'),
    )
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('/@org-1/application/app-1'))
  })
})
