import {uniqBy} from '../../../util/uniqBy.js'
import {CreateManifest} from '../../manifest/types'

export function uniqByProjectIdDataset(workspaces: CreateManifest['workspaces']) {
  return uniqBy(
    workspaces.map((w) => ({
      dataset: w.dataset,
      key: `${w.projectId}-${w.dataset}`,
      projectId: w.projectId,
    })),
    'key',
  )
}
