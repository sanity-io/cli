import uniqBy from 'lodash-es/uniqBy.js'
import {type Workspace} from 'sanity'

export function uniqByProjectIdDataset(workspaces: Workspace[]) {
  return uniqBy<Workspace & {key: string}>(
    workspaces.map((w) => ({
      ...w,
      key: `${w.projectId}-${w.dataset}`,
    })),
    'key',
  )
}
