import {findBlueprintFile, readBlueprint} from '@sanity/blueprints/resolve'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createCollectingReporter} from '../../../util/checks.js'
import {checkBlueprintManaged} from '../blueprintManaged.js'
import {type DeployCheck} from '../deployChecks.js'

vi.mock(import('@sanity/blueprints/resolve'), async () => ({
  findBlueprintFile: vi.fn(),
  readBlueprint: vi.fn(),
}))

const mockFindBlueprintFile = vi.mocked(findBlueprintFile)
const mockReadBlueprint = vi.mocked(readBlueprint)

type BlueprintInfo = Awaited<ReturnType<typeof readBlueprint>>

/**
 * A blueprint found at `/root/sanity.blueprint.ts`, declaring `resources`.
 * A resource's `root` is resolved relative to that file, so `'.'` is the
 * `/root` directory the deploys below target.
 */
function mockBlueprint(resources: Record<string, unknown>[]) {
  mockFindBlueprintFile.mockReturnValue('/root/sanity.blueprint.ts')
  mockReadBlueprint.mockResolvedValue({resources} as unknown as BlueprintInfo)
}

async function check(kind: 'coreApp' | 'studio'): Promise<DeployCheck[]> {
  const reporter = createCollectingReporter<DeployCheck>()
  await checkBlueprintManaged(reporter, {kind, projectRootDir: '/root'})
  return reporter.results
}

beforeEach(() => {
  mockFindBlueprintFile.mockReset().mockReturnValue(undefined)
  mockReadBlueprint.mockReset()
})

describe('checkBlueprintManaged', () => {
  test('no blueprint next to the deploy reports nothing and reads no blueprint', async () => {
    expect(await check('studio')).toEqual([])
    expect(mockReadBlueprint).not.toHaveBeenCalled()
  })

  test('an app declared at the deploy root fails with the blueprints deploy fix', async () => {
    mockBlueprint([{name: 'app', root: '.', type: 'sanity.application'}])

    expect(await check('coreApp')).toEqual([
      {
        message:
          'Using the `deploy` command for an app that is referenced by a blueprint is not allowed',
        solution: 'Deploy the app using the `blueprints deploy` command',
        status: 'fail',
      },
    ])
  })

  test('a studio declared at the deploy root fails and names the studio', async () => {
    mockBlueprint([{name: 'studio', root: '.', type: 'sanity.studio'}])

    expect(await check('studio')).toEqual([
      {
        message:
          'Using the `deploy` command for a studio that is referenced by a blueprint is not allowed',
        solution: 'Deploy the studio using the `blueprints deploy` command',
        status: 'fail',
      },
    ])
  })

  test('a nested `root` resolves against the blueprint file, not the deploy', async () => {
    mockBlueprint([{name: 'app', root: './packages/app', type: 'sanity.application'}])

    expect(await check('coreApp')).toEqual([])
  })

  test('a resource of the other kind at the same root does not block the deploy', async () => {
    mockBlueprint([{name: 'studio', root: '.', type: 'sanity.studio'}])

    expect(await check('coreApp')).toEqual([])
  })

  test('resources without a `root` are ignored', async () => {
    mockBlueprint([
      {name: 'fn', src: './functions/fn.ts', type: 'sanity.function.document'},
      {name: 'app', root: 42, type: 'sanity.application'},
    ])

    expect(await check('coreApp')).toEqual([])
  })

  test('the match is found among several resources', async () => {
    mockBlueprint([
      {name: 'other', root: './other', type: 'sanity.application'},
      {name: 'app', root: '.', type: 'sanity.application'},
    ])

    expect(await check('coreApp')).toHaveLength(1)
  })

  test('an unreadable blueprint fails open rather than blocking the deploy', async () => {
    mockFindBlueprintFile.mockReturnValue('/root/sanity.blueprint.ts')
    mockReadBlueprint.mockRejectedValue(new Error('cannot parse blueprint'))

    expect(await check('coreApp')).toEqual([])
  })
})
