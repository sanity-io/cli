import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {BuildCommand} from '../build.js'

vi.mock('../../actions/build/buildApp.js')
vi.mock('../../actions/build/buildStudio.js')
vi.mock('../../actions/build/shouldAutoUpdate.js', () => ({
  shouldAutoUpdate: vi.fn().mockReturnValue(false),
}))
vi.mock('../../util/determineIsApp.js', () => ({
  determineIsApp: vi.fn().mockReturnValue(false),
}))

vi.mock(import('../../config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({}),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#build', () => {
  test('command runs', async () => {
    const {stdout} = await testCommand(BuildCommand)

    expect(stdout).toContain(
      JSON.stringify({
        minify: true,
        'source-maps': false,
        yes: false,
      }),
    )
  })

  test('takes minify flag', async () => {
    const {stdout} = await testCommand(BuildCommand, ['--no-minify'])

    expect(stdout).toContain(
      JSON.stringify({
        minify: false,
        'source-maps': false,
        yes: false,
      }),
    )
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(BuildCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })
})
