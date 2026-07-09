import {CLIError} from '@oclif/core/errors'
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

  test('the JSON plan reports the version the run resolved, not a separate lookup', async () => {
    const output = mockOutput()
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async (_options, reporter) =>
        reporter.report({message: 'Using sanity 9.9.9', status: 'pass', version: '9.9.9'}),
      type: 'studio',
    }

    await runDeploy(
      {...dryRunOptions(output), flags: {'dry-run': true, json: true}} as DeployAppOptions,
      spec,
    )

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload.applicationVersion).toBe('9.9.9')
  })

  test('a blocked --json dry run prints the plan only, never a deploy envelope', async () => {
    const output = mockOutput()
    // A real run's output.error throws to abort; the plan JSON is already out.
    vi.mocked(output.error).mockImplementation(() => {
      throw new CLIError('blocked')
    })
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async (_options, reporter) =>
        reporter.report({exitCode: 2, message: 'boom', status: 'fail'}),
      type: 'studio',
    }

    await expect(
      runDeploy(
        {...dryRunOptions(output), flags: {'dry-run': true, json: true}} as DeployAppOptions,
        spec,
      ),
    ).rejects.toThrow()

    const logged = vi.mocked(output.log).mock.calls.map((call) => call[0] as string)
    expect(logged).toHaveLength(1)
    expect(logged[0]).not.toContain('"deployed"')
  })
})

describe('runDeploy real deploy', () => {
  test('emits the deploy result as JSON, marked deployed', async () => {
    const output = mockOutput()
    const result = {
      applicationType: 'studio' as const,
      applicationVersion: '3.99.0',
      target: {applicationId: 'app-1', title: 'My Studio', url: 'https://my-studio.sanity.studio'},
    }
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async () => result,
      type: 'studio',
    }

    await runDeploy({...dryRunOptions(output), flags: {json: true}} as DeployAppOptions, spec)

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload).toEqual({deployed: true, ...result})
  })

  test('a failed deploy emits a {deployed: false} envelope and still errors on stderr', async () => {
    const output = mockOutput()
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async () => {
        throw new Error('boom')
      },
      type: 'studio',
    }

    await runDeploy({...dryRunOptions(output), flags: {json: true}} as DeployAppOptions, spec)

    const payload = JSON.parse(vi.mocked(output.log).mock.calls.at(-1)![0] as string)
    expect(payload.deployed).toBe(false)
    expect(payload.error.message).toContain('boom')
    // The envelope and the stderr message are the same diagnosis
    expect(output.error).toHaveBeenCalledWith(payload.error.message, {exit: 1})
  })

  test('without --json a failed deploy stays on stderr, with no envelope', async () => {
    const output = mockOutput()
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async () => {
        throw new Error('boom')
      },
      type: 'studio',
    }

    await runDeploy({...dryRunOptions(output), flags: {}} as DeployAppOptions, spec)

    expect(output.log).not.toHaveBeenCalled()
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('boom'), {exit: 1})
  })

  test('surfaces the server message on a rejected deploy, not a raw error dump', async () => {
    const output = mockOutput()
    const err = Object.assign(new Error('HTTP 403'), {
      response: {
        body: {message: 'You are not allowed to deploy this application as a singleton'},
        headers: {},
        method: 'POST',
        statusCode: 403,
        statusMessage: null,
        url: 'https://api.sanity.io/vX/applications',
      },
      statusCode: 403,
    })
    const spec: DeploySpec = {
      listFiles: async () => [],
      run: async () => {
        throw err
      },
      type: 'coreApp',
    }

    await runDeploy({...dryRunOptions(output), flags: {}} as DeployAppOptions, spec)

    expect(output.error).toHaveBeenCalledWith(
      'Error deploying application: You are not allowed to deploy this application as a singleton',
      {exit: 1},
    )
  })
})
