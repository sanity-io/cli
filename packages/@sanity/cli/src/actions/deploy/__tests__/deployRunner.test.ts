import {type Output} from '@sanity/cli-core'
import {describe, expect, test, vi} from 'vitest'

import {type DeploySpec, runDeploy} from '../deployRunner.js'
import {type DeployAppOptions} from '../types.js'

const mockOutput = () => ({error: vi.fn(), log: vi.fn(), warn: vi.fn()}) as unknown as Output

const dryRunOptions = (output: Output): DeployAppOptions =>
  ({
    cliConfig: {},
    flags: {'dry-run': true},
    output,
    projectRoot: {directory: '/root', path: '/root/sanity.cli.ts'},
    sourceDir: '/root/dist',
  }) as unknown as DeployAppOptions

describe('runDeploy dry run', () => {
  test('exits with the first failing check exit code, like a real deploy', async () => {
    const output = mockOutput()
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async (_options, reporter) =>
        reporter.report({exitCode: 2, message: 'boom', status: 'fail'}),
      type: 'studio',
    }

    await runDeploy(dryRunOptions(output), spec)

    expect(output.error).toHaveBeenCalledWith('Deploy blocked by failing checks.', {exit: 2})
  })

  test('a blocked plan lists no files, even when listFiles would return some', async () => {
    const output = mockOutput()
    const listFiles = vi.fn(async () => [{path: 'dist/index.html', size: 10}])
    const spec: DeploySpec = {
      listFiles,
      run: async (_options, reporter) =>
        reporter.report({exitCode: 2, message: 'boom', status: 'fail'}),
      type: 'studio',
    }

    await runDeploy(dryRunOptions(output), spec)

    expect(listFiles).not.toHaveBeenCalled()
    expect(output.log).not.toHaveBeenCalledWith(expect.stringContaining('Files to deploy'))
  })

  test('a deployable dry run renders the plan without erroring', async () => {
    const output = mockOutput()
    const spec: DeploySpec = {
      listFiles: async () => [{path: 'dist/index.html', size: 10}],
      run: async (_options, reporter) => reporter.report({message: 'Project: p1', status: 'pass'}),
      type: 'studio',
    }

    await runDeploy(dryRunOptions(output), spec)

    expect(output.error).not.toHaveBeenCalled()
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('This studio can be deployed.'))
  })
})
