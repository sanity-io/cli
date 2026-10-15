import {of} from 'rxjs'
import {expect, test, vi} from 'vitest'

import {doImport} from '../../../util/doImport.js'
import {resolveLocalPackage} from '../../../util/resolveLocalPackage.js'
import {getStudioWorkspaces} from '../getStudioWorkspaces.js'

vi.mock('node:worker_threads', () => ({isMainThread: false}))
vi.mock('node:fs/promises', () => ({stat: vi.fn().mockResolvedValue({isDirectory: () => false})}))
vi.mock('../../../util/doImport.js', () => ({doImport: vi.fn()}))
vi.mock('../../../util/resolveLocalPackage.js', () => ({resolveLocalPackage: vi.fn()}))

test('uses the default export when the module also has projectId and dataset named exports', async () => {
  const studioConfig = {
    dataset: 'production',
    projectId: 'abc123',
    schema: {types: [{name: 'page'}]},
  }
  vi.mocked(doImport).mockResolvedValue({
    dataset: 'production',
    default: studioConfig,
    projectId: 'abc123',
  })
  const resolveConfig = vi.fn((workspaces) => of(workspaces))
  vi.mocked(resolveLocalPackage).mockResolvedValue({resolveConfig})

  const [workspace] = await getStudioWorkspaces('/studio/sanity.config.ts')

  expect(workspace).toMatchObject({name: 'default', schema: studioConfig.schema})
})
