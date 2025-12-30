import {uniqBy} from '../../../util/uniqBy.js'
import {type ManifestWorkspaceFile} from '../../manifest/types'

export function uniqByProjectIdDataset(workspaces: ManifestWorkspaceFile[]) {
  return uniqBy(
    workspaces.map((w) => ({
      ...w,
      key: `${w.projectId}-${w.dataset}`,
    })),
    'key',
  )
}
