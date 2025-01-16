import {DocumentsIcon} from '@sanity/icons'
import {ListItemBuilder} from 'sanity/structure'
import defineStructure from '../utils/defineStructure.js'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Pages')
    .icon(DocumentsIcon)
    .schemaType('page')
    .child(S.documentTypeList('page')),
)
