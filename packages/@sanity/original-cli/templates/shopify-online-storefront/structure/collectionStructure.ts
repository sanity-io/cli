import {ListItemBuilder} from 'sanity/structure'
import defineStructure from '../utils/defineStructure.js'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Collections')
    .schemaType('collection')
    .child(S.documentTypeList('collection')),
)
