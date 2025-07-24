import {runCommand} from '@oclif/test'
import getLatestVersion from 'get-latest-version'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testCommand} from '~test/helpers/testCommand.js'

import {Versions} from '../../commands/versions.js'
import {getCliVersion} from '../../util/getCliVersion.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {readPackageJson} from '../../util/readPackageJson.js'

vi.mock('../../../../core/src/config/findProjectRoot.js', async () => {
  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../util/getCliVersion.js'))
vi.mock(import('../../util/readPackageJson.js'))
vi.mock(import('../../util/getLocalPackageVersion.js'))
vi.mock(import('get-latest-version'))

afterEach(() => {
  vi.clearAllMocks()
})

describe('#versions', () => {
  test('--help works', async () => {
    const {stdout} = await runCommand(['versions', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Shows installed versions of Sanity Studio and components

      USAGE
        $ sanity versions

      DESCRIPTION
        Shows installed versions of Sanity Studio and components

      EXAMPLES
        $ sanity versions

      "
    `)
  })

  test('displays versions correctly when modules are up to date', async () => {
    vi.mocked(getCliVersion).mockResolvedValueOnce('3.0.0')
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      dependencies: {
        '@sanity/cli': '3.0.0',
        sanity: '3.0.0',
      },
      name: 'test',
      version: '1.0.0',
    })
    vi.mocked(getLatestVersion).mockResolvedValue('3.0.0' as never)
    vi.mocked(getLocalPackageVersion).mockResolvedValue('3.0.0')

    const {stdout} = await testCommand(Versions)

    expect(stdout).toMatchInlineSnapshot(`
      "@sanity/cli (global)  3.0.0 (up to date)
      @sanity/cli           3.0.0 (up to date)
      sanity                3.0.0 (up to date)
      "
    `)
  })

  test('displays versions correctly when modules need update', async () => {
    vi.mocked(getCliVersion).mockResolvedValueOnce('2.0.0')
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      dependencies: {
        '@sanity/cli': '2.0.0',
        sanity: '2.0.0',
      },
      name: 'test',
      version: '1.0.0',
    })
    vi.mocked(getLatestVersion).mockResolvedValue('3.0.0' as never)
    vi.mocked(getLocalPackageVersion).mockResolvedValue('2.0.0')

    const {stdout} = await testCommand(Versions)

    expect(stdout).toMatchInlineSnapshot(`
      "@sanity/cli (global)  2.0.0 (latest: 3.0.0)
      @sanity/cli           2.0.0 (latest: 3.0.0)
      sanity                2.0.0 (latest: 3.0.0)
      "
    `)
  })

  test('displays versions correctly when a module is missing', async () => {
    vi.mocked(getCliVersion).mockResolvedValueOnce('3.0.0')
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      dependencies: {
        sanity: '3.0.0',
      },
      name: 'test',
      version: '1.0.0',
    })
    vi.mocked(getLocalPackageVersion).mockReturnValueOnce(Promise.resolve(undefined))
    vi.mocked(getLatestVersion).mockResolvedValue('3.0.0' as never)

    const {stdout} = await testCommand(Versions)

    expect(stdout).toMatchInlineSnapshot(`
      "@sanity/cli (global)      3.0.0 (up to date)
      sanity                <missing> (latest: 3.0.0)
      "
    `)
  })

  test("doesn't show anything if no sanity packages", async () => {
    vi.mocked(getCliVersion).mockResolvedValueOnce('3.0.0')
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      dependencies: {
        'something-random': '3.0.0',
      },
      name: 'test',
      version: '1.0.0',
    })
    vi.mocked(getLatestVersion).mockResolvedValue('3.0.0' as never)

    const {stdout} = await testCommand(Versions)
    expect(stdout).toMatchInlineSnapshot(`
      "@sanity/cli (global)  3.0.0 (up to date)
      "
    `)
  })

  test('shows error if no sanity packages are found', async () => {
    vi.mocked(getCliVersion).mockResolvedValueOnce('3.0.0')
    vi.mocked(readPackageJson).mockResolvedValueOnce({
      dependencies: {},
      name: 'test',
      version: '1.0.0',
    })
    vi.mocked(getLatestVersion).mockRejectedValueOnce(new Error('No sanity packages found'))

    const {error} = await testCommand(Versions)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual('Cannot find version for @sanity/cli')
  })
})
